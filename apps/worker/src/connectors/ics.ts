/**
 * Minimal RFC 5545 reader for the calendar widget (plan §6.1). Handles what
 * family calendars actually contain: VEVENT with DTSTART/DTEND (date or
 * date-time, UTC or floating or TZID — TZID treated as local), SUMMARY,
 * LOCATION, all-day events, and the common RRULE shapes (DAILY / WEEKLY with
 * BYDAY / MONTHLY / YEARLY, INTERVAL, COUNT, UNTIL) expanded within a window.
 * Everything else is ignored rather than crashing. ICS text is attacker-
 * influenced (CLAUDE.md): output is plain strings, capped, never HTML.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  location: string | null;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
};

const MAX_VEVENTS = 2000;
const MAX_EXPANSION_STEPS = 50_000;
// Doubled alongside the sync window, which now reaches back to the 1st of the
// month for the month grid: at 200 a busy shared calendar could spend the
// whole budget on days already gone and leave the week ahead empty.
const MAX_EVENTS = 400;
const MAX_TEXT = 200;

/** Unfold continuation lines (CRLF + single space/tab). */
function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").slice(0, MAX_TEXT);
}

type Prop = { name: string; params: Record<string, string>; value: string };

function parseLine(line: string): Prop | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...paramParts] = left.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value };
}

/** Parses an ICS date/date-time into a Date and an all-day flag. */
export function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const v = value.trim();
  if (params["VALUE"] === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  // Z → UTC; TZID or floating → treat as server-local (family scale; one household, one zone).
  const date = m[7] === "Z" ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s);
  return { date, allDay: false };
}

type Rule = { freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; interval: number; count: number | null; until: Date | null; byDay: number[] | null };

function parseRrule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts["FREQ"];
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  const dayIdx: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const byDay = parts["BYDAY"]
    ? parts["BYDAY"].split(",").map((d) => dayIdx[d.replace(/^[-+]?\d+/, "")] ?? -1).filter((n) => n >= 0)
    : null;
  const until = parts["UNTIL"] ? parseIcsDate(parts["UNTIL"], {})?.date ?? null : null;
  return {
    freq,
    interval: Math.max(1, Number(parts["INTERVAL"] ?? 1) || 1),
    count: parts["COUNT"] ? Number(parts["COUNT"]) : null,
    until,
    byDay: byDay && byDay.length ? byDay : null,
  };
}

function addFreq(d: Date, rule: Rule, n: number): Date {
  const r = new Date(d);
  if (rule.freq === "DAILY") r.setDate(r.getDate() + n * rule.interval);
  else if (rule.freq === "WEEKLY") r.setDate(r.getDate() + n * 7 * rule.interval);
  else if (rule.freq === "MONTHLY") r.setMonth(r.getMonth() + n * rule.interval);
  else r.setFullYear(r.getFullYear() + n * rule.interval);
  return r;
}

/** Events overlapping [from, to], recurrences expanded. */
export function parseIcs(text: string, from: Date, to: Date): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let cur: Record<string, Prop> | null = null;
  // Hostile-feed budget: the parser is synchronous, so bound total work across
  // the whole document, not per event (a feed of 20k daily-recurring events
  // would otherwise pin the loop for a minute).
  let vevents = 0;
  let expansionBudget = MAX_EXPANSION_STEPS;
  // Depth of nested components inside a VEVENT (VALARM etc.) whose
  // properties must not overwrite the event's own.
  let nested = 0;

  const emit = (uid: string, title: string, location: string | null, start: Date, end: Date, allDay: boolean) => {
    if (end <= from || start >= to) return;
    if (events.length >= MAX_EVENTS) return;
    events.push({ uid, title, location, start: start.toISOString(), end: end.toISOString(), allDay });
  };

  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") {
      if (++vevents > MAX_VEVENTS || events.length >= MAX_EVENTS) break;
      cur = {};
      nested = 0;
      continue;
    }
    if (cur && raw.startsWith("BEGIN:")) {
      nested++;
      continue;
    }
    if (cur && nested > 0) {
      if (raw.startsWith("END:")) nested--;
      continue;
    }
    if (raw === "END:VEVENT" && cur) {
      const p = cur;
      cur = null;
      const ds = p["DTSTART"] ? parseIcsDate(p["DTSTART"].value, p["DTSTART"].params) : null;
      if (!ds) continue;
      let de = p["DTEND"] ? parseIcsDate(p["DTEND"].value, p["DTEND"].params) : null;
      if (!de) {
        // No DTEND: all-day → one day; timed → one hour.
        const e = new Date(ds.date);
        if (ds.allDay) e.setDate(e.getDate() + 1);
        else e.setHours(e.getHours() + 1);
        de = { date: e, allDay: ds.allDay };
      }
      const durationMs = de.date.getTime() - ds.date.getTime();
      const uid = (p["UID"]?.value ?? `${ds.date.getTime()}`).slice(0, 200);
      const title = unescapeText(p["SUMMARY"]?.value ?? "(untitled)");
      const location = p["LOCATION"] ? unescapeText(p["LOCATION"].value) : null;
      const rule = p["RRULE"] ? parseRrule(p["RRULE"].value) : null;
      const exdates = new Set<number>();
      for (const key of Object.keys(p)) {
        if (key.startsWith("EXDATE")) {
          for (const v of p[key]!.value.split(",")) {
            const x = parseIcsDate(v, p[key]!.params);
            if (x) exdates.add(x.date.getTime());
          }
        }
      }

      if (!rule) {
        emit(uid, title, location, ds.date, de.date, ds.allDay);
        continue;
      }
      // Expand: walk occurrences from DTSTART until past the window / UNTIL / COUNT.
      let produced = 0;
      for (let n = 0; n < 1000; n++) {
        if (--expansionBudget < 0 || events.length >= MAX_EVENTS) break;
        const base = addFreq(ds.date, rule, n);
        if (rule.until && base > rule.until) break;
        if (base > to) break;
        const candidates: Date[] = [];
        if (rule.freq === "WEEKLY" && rule.byDay) {
          // Each listed weekday within the week of `base`.
          const weekStart = new Date(base);
          weekStart.setDate(base.getDate() - base.getDay());
          for (const dow of rule.byDay) {
            const c = new Date(weekStart);
            c.setDate(weekStart.getDate() + dow);
            c.setHours(ds.date.getHours(), ds.date.getMinutes(), ds.date.getSeconds(), 0);
            if (c >= ds.date) candidates.push(c);
          }
        } else {
          candidates.push(base);
        }
        for (const c of candidates.sort((a, b) => a.getTime() - b.getTime())) {
          if (rule.until && c > rule.until) continue;
          if (rule.count !== null && produced >= rule.count) break;
          produced++;
          if (exdates.has(c.getTime())) continue;
          emit(`${uid}:${c.getTime()}`, title, location, c, new Date(c.getTime() + durationMs), ds.allDay);
        }
        if (rule.count !== null && produced >= rule.count) break;
      }
      continue;
    }
    if (cur) {
      const prop = parseLine(raw);
      if (prop) cur[prop.name.startsWith("EXDATE") ? `EXDATE${Object.keys(cur).length}` : prop.name] = prop;
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

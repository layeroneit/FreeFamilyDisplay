/**
 * Minimal RFC 5545 reader for the calendar widget (plan §6.1). Handles what
 * family calendars actually contain: VEVENT with DTSTART/DTEND (date or
 * date-time, UTC, floating, or TZID — IANA names, the common Windows names
 * Outlook writes, and unknown zones fall back to server-local), SUMMARY,
 * LOCATION, all-day events, STATUS:CANCELLED, moved/cancelled single
 * occurrences (RECURRENCE-ID), and the RRULE shapes family feeds use (DAILY /
 * WEEKLY / MONTHLY / YEARLY with INTERVAL, COUNT, UNTIL, BYDAY incl. "2TU" /
 * "-1FR", BYMONTHDAY, BYMONTH, BYSETPOS) expanded within a window. Rule parts
 * this reader cannot honour (BYWEEKNO, BYYEARDAY, BYHOUR…) make it skip and
 * count the series rather than draw it on wrong dates. Everything else is
 * ignored rather than crashing. ICS text is attacker-influenced (CLAUDE.md):
 * output is plain strings, capped, never HTML.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  location: string | null;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
};

export type IcsParseResult = {
  events: IcsEvent[];
  /** True when a hostile-feed limit cut the work short, so some events may be missing. */
  truncated: boolean;
  /** Recurring series skipped because their rule uses parts this reader does not support. */
  skippedSeries: number;
};

const MAX_VEVENTS = 2000;
const MAX_EXPANSION_STEPS = 50_000;
// Doubled alongside the sync window, which now reaches back to the 1st of the
// month for the month grid. The cap is applied by distance from "now" (not in
// file order), so a busy feed keeps the week ahead rather than the month behind.
const MAX_EVENTS = 400;
// How many in-window events are collected before the nearest-to-now trim.
const MAX_COLLECTED = 5000;
const MAX_TEXT = 200;
const DAY = 86_400_000;

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

// ---------------------------------------------------------------------------
// Time zones. Wall-clock times are carried as "wall ms": Date.UTC() of the
// time exactly as written. All calendar arithmetic happens in that space (no
// DST surprises) and each occurrence converts to a real instant through its
// zone at the end.
// ---------------------------------------------------------------------------

type Zone = { kind: "utc" } | { kind: "local" } | { kind: "tz"; tz: string };
const UTC: Zone = { kind: "utc" };
const LOCAL: Zone = { kind: "local" };

/** Outlook/Exchange publish Windows zone names; map the ones households use. */
const WINDOWS_ZONES: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "AUS Eastern Standard Time": "Australia/Sydney",
};

// TZIDs come from the feed, so the cache is bounded.
const formatters = new Map<string, Intl.DateTimeFormat | null>();
function formatterFor(tz: string): Intl.DateTimeFormat | null {
  const hit = formatters.get(tz);
  if (hit !== undefined) return hit;
  let f: Intl.DateTimeFormat | null;
  try {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    f = null;
  }
  if (formatters.size < 256) formatters.set(tz, f);
  return f;
}

function resolveZone(tzid: string | undefined): Zone {
  if (!tzid) return LOCAL;
  const raw = tzid.trim().slice(0, 100);
  const tries = [WINDOWS_ZONES[raw] ?? raw];
  // "/mozilla.org/20050126_1/America/New_York" and similar prefixed forms.
  const segs = raw.split("/");
  for (let i = 1; i < segs.length - 1; i++) tries.push(segs.slice(i).join("/"));
  for (const t of tries) if (t && formatterFor(t)) return { kind: "tz", tz: t };
  return LOCAL;
}

/** Offset (wall - instant) of `tz` at `instant`, in ms. */
function tzOffset(instant: number, f: Intl.DateTimeFormat): number {
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(instant))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asWall = Date.UTC(p["year"] ?? 1970, (p["month"] ?? 1) - 1, p["day"] ?? 1, (p["hour"] ?? 0) % 24, p["minute"] ?? 0, p["second"] ?? 0);
  return asWall - (instant - (((instant % 1000) + 1000) % 1000));
}

function wallToInstant(wall: number, zone: Zone): number {
  if (zone.kind === "utc") return wall;
  if (zone.kind === "local") {
    const d = new Date(wall);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
  }
  const f = formatterFor(zone.tz);
  if (!f) return wallToInstant(wall, LOCAL);
  const guess = wall - tzOffset(wall, f);
  return wall - tzOffset(guess, f);
}

type Stamp = { wall: number; allDay: boolean; zone: Zone };

function parseStamp(value: string, params: Record<string, string>): Stamp | null {
  const v = value.trim();
  if (params["VALUE"] === "DATE" || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    return { wall: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])), allDay: true, zone: LOCAL };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  // Z → UTC; TZID → that zone; floating (or an unknown TZID) → server-local.
  return { wall, allDay: false, zone: m[7] === "Z" ? UTC : resolveZone(params["TZID"]) };
}

/** Parses an ICS date/date-time into a Date and an all-day flag. */
export function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const s = parseStamp(value, params);
  return s ? { date: new Date(wallToInstant(s.wall, s.zone)), allDay: s.allDay } : null;
}

// ---------------------------------------------------------------------------
// Recurrence rules.
// ---------------------------------------------------------------------------

type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type ByDay = { dow: number; nth: number }; // nth 0 = every such weekday
type Rule = {
  freq: Freq;
  interval: number;
  count: number | null;
  until: Stamp | null;
  byDay: ByDay[] | null;
  byMonthDay: number[] | null;
  byMonth: number[] | null; // 0-based
  bySetPos: number[] | null;
  /** The rule uses parts this reader cannot honour; skip rather than guess. */
  unsupported: boolean;
};

const DAY_IDX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const UNSUPPORTED_PARTS = ["BYWEEKNO", "BYYEARDAY", "BYHOUR", "BYMINUTE", "BYSECOND"];

function intList(raw: string | undefined, min: number, max: number): number[] | null {
  if (!raw) return null;
  const out = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n !== 0 && n >= min && n <= max);
  return out.length ? out : null;
}

function parseRrule(value: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts["FREQ"];
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  let unsupported = UNSUPPORTED_PARTS.some((k) => parts[k] !== undefined);

  let byDay: ByDay[] | null = null;
  if (parts["BYDAY"]) {
    byDay = [];
    for (const tok of parts["BYDAY"].split(",")) {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(tok.trim().toUpperCase());
      if (!m) continue;
      const nth = m[1] ? Number(m[1]) : 0;
      if (Math.abs(nth) > 53) continue;
      byDay.push({ dow: DAY_IDX[m[2]!]!, nth });
    }
    if (byDay.length === 0) unsupported = true;
  }
  const byMonth = intList(parts["BYMONTH"], 1, 12)?.map((m) => m - 1) ?? null;
  // "Every Monday of the year" / "20th Monday of the year" needs week-of-year
  // logic this reader does not have.
  if (freq === "YEARLY" && byDay && !byMonth) unsupported = true;

  const count = parts["COUNT"] ? Number(parts["COUNT"]) : null;
  return {
    freq,
    interval: Math.max(1, Number(parts["INTERVAL"] ?? 1) || 1),
    count: count !== null && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null,
    until: parts["UNTIL"] ? parseStamp(parts["UNTIL"], {}) : null,
    byDay: byDay && byDay.length ? byDay : null,
    byMonthDay: intList(parts["BYMONTHDAY"], -31, 31),
    byMonth,
    bySetPos: intList(parts["BYSETPOS"], -366, 366),
    unsupported,
  };
}

const ymd = (wall: number) => {
  const d = new Date(wall);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
};
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const dayStart = (wall: number) => wall - (((wall % DAY) + DAY) % DAY);

/** Day-of-month numbers in (y, m) that the rule selects. */
function monthDays(y: number, m: number, rule: Rule, defaultDay: number): number[] {
  const dim = daysInMonth(y, m);
  let days: number[];
  if (rule.byMonthDay) {
    days = rule.byMonthDay.map((d) => (d > 0 ? d : dim + d + 1)).filter((d) => d >= 1 && d <= dim);
    if (rule.byDay) {
      const dows = new Set(rule.byDay.map((b) => b.dow));
      days = days.filter((d) => dows.has(new Date(Date.UTC(y, m, d)).getUTCDay()));
    }
  } else if (rule.byDay) {
    days = [];
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    for (const b of rule.byDay) {
      const all: number[] = [];
      for (let d = 1 + ((b.dow - firstDow + 7) % 7); d <= dim; d += 7) all.push(d);
      if (b.nth === 0) days.push(...all);
      else {
        const pick = b.nth > 0 ? all[b.nth - 1] : all[all.length + b.nth];
        if (pick !== undefined) days.push(pick);
      }
    }
  } else {
    // RFC 5545: a month without that day (Feb 30, Apr 31) is skipped, not rolled over.
    days = defaultDay <= dim ? [defaultDay] : [];
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Wall-ms candidates of period `n`, sorted, plus the period's first wall ms. */
function periodCandidates(rule: Rule, dt: number, n: number): { periodStart: number; cands: number[] } {
  const tod = dt - dayStart(dt);
  const s = ymd(dt);
  let periodStart: number;
  let cands: number[];
  if (rule.freq === "DAILY") {
    periodStart = dayStart(dt) + n * rule.interval * DAY;
    cands = [periodStart + tod];
    const c = ymd(periodStart);
    if (rule.byDay && !rule.byDay.some((b) => b.dow === c.dow)) cands = [];
    if (rule.byMonthDay && !monthDays(c.y, c.m, { ...rule, byDay: null }, c.d).includes(c.d)) cands = [];
  } else if (rule.freq === "WEEKLY") {
    // Weeks start on Sunday here, as they always have in this reader.
    periodStart = dayStart(dt) - s.dow * DAY + n * rule.interval * 7 * DAY;
    const dows = rule.byDay ? [...new Set(rule.byDay.map((b) => b.dow))] : [s.dow];
    cands = dows.map((dow) => periodStart + dow * DAY + tod);
  } else if (rule.freq === "MONTHLY") {
    const mi = s.m + n * rule.interval;
    const y = s.y + Math.floor(mi / 12);
    const m = ((mi % 12) + 12) % 12;
    periodStart = Date.UTC(y, m, 1);
    cands = monthDays(y, m, rule, s.d).map((d) => Date.UTC(y, m, d) + tod);
  } else {
    const y = s.y + n * rule.interval;
    periodStart = Date.UTC(y, 0, 1);
    cands = [];
    for (const m of rule.byMonth ?? [s.m]) cands.push(...monthDays(y, m, rule, s.d).map((d) => Date.UTC(y, m, d) + tod));
  }
  if (rule.byMonth && rule.freq !== "YEARLY") cands = cands.filter((c) => rule.byMonth!.includes(ymd(c).m));
  cands.sort((a, b) => a - b);
  if (rule.bySetPos) {
    const picked = rule.bySetPos.map((p) => (p > 0 ? cands[p - 1] : cands[cands.length + p])).filter((c): c is number => c !== undefined);
    cands = [...new Set(picked)].sort((a, b) => a - b);
  }
  return { periodStart, cands };
}

/** First period index worth walking from, so an old series doesn't spend its budget on the past. */
function firstPeriod(rule: Rule, dt: number, fromWall: number): number {
  const diff = fromWall - dayStart(dt);
  if (diff <= 0) return 0;
  const s = ymd(dt);
  const f = ymd(fromWall);
  switch (rule.freq) {
    case "DAILY":
      return Math.floor(diff / DAY / rule.interval);
    case "WEEKLY":
      return Math.max(0, Math.floor(diff / (7 * DAY * rule.interval)) - 1);
    case "MONTHLY":
      return Math.max(0, Math.floor(((f.y - s.y) * 12 + (f.m - s.m)) / rule.interval) - 1);
    default:
      return Math.max(0, Math.floor((f.y - s.y) / rule.interval) - 1);
  }
}

// ---------------------------------------------------------------------------

type VEvent = Record<string, Prop>;

/** Events overlapping [from, to], recurrences expanded, plus what was skipped. */
export function parseIcsFeed(text: string, from: Date, to: Date, now: Date = new Date()): IcsParseResult {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  let truncated = false;
  let skippedSeries = 0;

  // Pass 1: collect VEVENTs. Depth of nested components inside a VEVENT
  // (VALARM etc.) whose properties must not overwrite the event's own.
  const vevents: VEvent[] = [];
  let cur: VEvent | null = null;
  let nested = 0;
  for (const raw of unfold(text)) {
    if (raw === "BEGIN:VEVENT") {
      if (vevents.length >= MAX_VEVENTS) {
        truncated = true;
        break;
      }
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
      vevents.push(cur);
      cur = null;
      continue;
    }
    if (cur) {
      const prop = parseLine(raw);
      if (prop) cur[prop.name.startsWith("EXDATE") ? `EXDATE${Object.keys(cur).length}` : prop.name] = prop;
    }
  }

  const instantOf = (p: Prop | undefined): number | null => {
    const s = p ? parseStamp(p.value, p.params) : null;
    return s ? wallToInstant(s.wall, s.zone) : null;
  };
  const uidOf = (p: VEvent, fallback: number) => (p["UID"]?.value.trim() || `${fallback}`).slice(0, 200);
  const cancelled = (p: VEvent) => (p["STATUS"]?.value.trim().toUpperCase() ?? "") === "CANCELLED";

  // Pass 2: overrides (moved or cancelled single occurrences) per series. The
  // master must not also draw the occurrence an override replaces.
  const overridden = new Map<string, Set<number>>();
  for (const p of vevents) {
    if (!p["RECURRENCE-ID"]) continue;
    const rid = instantOf(p["RECURRENCE-ID"]);
    if (rid === null) continue;
    const uid = uidOf(p, rid);
    let set = overridden.get(uid);
    if (!set) overridden.set(uid, (set = new Set()));
    set.add(rid);
  }

  const collected: IcsEvent[] = [];
  const emit = (uid: string, title: string, location: string | null, start: number, end: number, allDay: boolean): boolean => {
    if (end <= fromMs || start >= toMs) return true;
    if (collected.length >= MAX_COLLECTED) {
      truncated = true;
      return false;
    }
    collected.push({ uid, title, location, start: new Date(start).toISOString(), end: new Date(end).toISOString(), allDay });
    return true;
  };

  // Hostile-feed budget: the parser is synchronous, so bound total work across
  // the whole document, not per event (a feed of 20k daily-recurring events
  // would otherwise pin the loop for a minute). Expansion starts at the
  // window, so the budget is spent on occurrences that can actually show.
  let budget = MAX_EXPANSION_STEPS;

  // Pass 3: emit.
  for (const p of vevents) {
    if (truncated && collected.length >= MAX_COLLECTED) break;
    if (cancelled(p)) continue;
    const ds = p["DTSTART"] ? parseStamp(p["DTSTART"].value, p["DTSTART"].params) : null;
    if (!ds) continue;
    const dsInstant = wallToInstant(ds.wall, ds.zone);
    let de = p["DTEND"] ? parseStamp(p["DTEND"].value, p["DTEND"].params) : null;
    if (!de) {
      // No DTEND: all-day → one day; timed → one hour.
      de = ds.allDay ? { ...ds, wall: ds.wall + DAY } : { ...ds, wall: ds.wall + 3_600_000 };
    }
    const deInstant = wallToInstant(de.wall, de.zone);
    const durationMs = deInstant - dsInstant;
    const durationWall = de.wall - ds.wall;
    const uid = uidOf(p, dsInstant);
    const title = unescapeText(p["SUMMARY"]?.value ?? "(untitled)");
    const location = p["LOCATION"] ? unescapeText(p["LOCATION"].value) : null;

    if (p["RECURRENCE-ID"]) {
      // An override is an ordinary event that stands in for one occurrence.
      const rid = instantOf(p["RECURRENCE-ID"]) ?? dsInstant;
      emit(`${uid}:${rid}`, title, location, dsInstant, deInstant, ds.allDay);
      continue;
    }

    const rule = p["RRULE"] ? parseRrule(p["RRULE"].value) : null;
    if (!rule) {
      emit(uid, title, location, dsInstant, deInstant, ds.allDay);
      continue;
    }
    if (rule.unsupported) {
      skippedSeries++;
      continue;
    }
    if (budget <= 0) {
      truncated = true;
      continue;
    }

    const skip = new Set<number>(overridden.get(uid) ?? []);
    for (const key of Object.keys(p)) {
      if (!key.startsWith("EXDATE")) continue;
      for (const v of p[key]!.value.split(",")) {
        const x = parseStamp(v, p[key]!.params);
        if (x) skip.add(wallToInstant(x.wall, x.zone));
      }
    }
    // UNTIL is inclusive. A date-only UNTIL means "through the end of that day".
    let until: number | null = null;
    if (rule.until) {
      if (rule.until.allDay) until = wallToInstant(rule.until.wall + DAY - 1000, ds.zone);
      else if (rule.until.zone.kind === "utc") until = rule.until.wall;
      else until = wallToInstant(rule.until.wall, ds.zone);
    }
    const reachFrom = fromMs - Math.max(0, durationMs);
    if (until !== null && until < reachFrom) continue; // finished before the window
    // Wall ms and instants differ by at most ~14 h; two days of slack is safe.
    const fromWall = reachFrom - 2 * DAY;
    const toWall = toMs + 2 * DAY;
    const untilWall = until === null ? null : until + 2 * DAY;

    // COUNT needs the running total, so only a COUNT-less series may jump ahead.
    let n = rule.count === null ? firstPeriod(rule, ds.wall, fromWall) : 0;
    let produced = 0;
    let done = false;
    while (!done) {
      if (--budget < 0) {
        truncated = true;
        break;
      }
      const { periodStart, cands } = periodCandidates(rule, ds.wall, n++);
      if (periodStart > toWall || (untilWall !== null && periodStart > untilWall)) break;
      for (const c of cands) {
        if (c < ds.wall) continue;
        const start = wallToInstant(c, ds.zone);
        if (until !== null && start > until) {
          done = true;
          break;
        }
        if (rule.count !== null && produced >= rule.count) {
          done = true;
          break;
        }
        produced++;
        if (skip.has(start)) continue;
        const end = ds.allDay ? wallToInstant(c + durationWall, ds.zone) : start + durationMs;
        if (!emit(`${uid}:${start}`, title, location, start, end, ds.allDay)) {
          done = true;
          break;
        }
      }
      if (rule.count !== null && produced >= rule.count) break;
    }
  }

  let events = collected;
  if (events.length > MAX_EVENTS) {
    const nowMs = now.getTime();
    events = [...events]
      .sort((a, b) => Math.abs(new Date(a.start).getTime() - nowMs) - Math.abs(new Date(b.start).getTime() - nowMs))
      .slice(0, MAX_EVENTS);
  }
  return { events: events.sort((a, b) => a.start.localeCompare(b.start)), truncated, skippedSeries };
}

/** Events overlapping [from, to], recurrences expanded. */
export function parseIcs(text: string, from: Date, to: Date, now: Date = new Date()): IcsEvent[] {
  return parseIcsFeed(text, from, to, now).events;
}

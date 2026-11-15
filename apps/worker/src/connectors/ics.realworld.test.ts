/**
 * Regression tests for the 2026-11-14 audit (H1, H2, M1-M3, M5, L1-L3), driven
 * by fixtures shaped like what Google, Outlook/Exchange and iCloud actually
 * publish. Fixture UIDs and hosts are fake; nothing in them is a real link.
 *
 * Floating times are local to whatever zone the test runs in, so expectations
 * for them are built with the local Date constructor; TZID and UTC times are
 * asserted as exact instants.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseIcs, parseIcsFeed } from "./ics.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), "utf8");
const localIso = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

const NOV_FROM = new Date(2026, 10, 1);
const NOV_TO = new Date(2026, 11, 1);

test("H1: a moved occurrence (RECURRENCE-ID) replaces the original, not adds to it", () => {
  const ev = parseIcs(fixture("google-moved-and-cancelled.ics"), NOV_FROM, NOV_TO);
  const soccer = ev.filter((e) => e.uid.startsWith("soccer-series@example.test"));
  // Tuesdays 17:00 Chicago (CST = UTC-6) on Nov 3, 10, 17, 24; Nov 10 moved to Wed 11; Nov 24 cancelled.
  assert.deepEqual(
    soccer.map((e) => [e.title, e.start]),
    [
      ["Soccer", "2026-11-03T23:00:00.000Z"],
      ["Soccer (moved)", "2026-11-11T23:00:00.000Z"],
      ["Soccer", "2026-11-17T23:00:00.000Z"],
    ],
  );
  assert.equal(new Set(soccer.map((e) => e.uid)).size, soccer.length, "uids stay unique");
});

test("H1: an override with no master in the feed is still shown", () => {
  const ev = parseIcs(fixture("google-moved-and-cancelled.ics"), NOV_FROM, NOV_TO);
  const one = ev.filter((e) => e.uid.startsWith("only-instance@example.test"));
  assert.equal(one.length, 1);
  assert.equal(one[0]!.start, "2026-11-16T15:00:00.000Z");
});

test("M5: STATUS:CANCELLED events are not shown", () => {
  const g = parseIcs(fixture("google-moved-and-cancelled.ics"), NOV_FROM, NOV_TO);
  assert.equal(g.some((e) => e.uid.startsWith("cancelled-game@")), false);
  const o = parseIcs(fixture("outlook-monthly-bysetpos.ics"), NOV_FROM, NOV_TO);
  assert.equal(o.some((e) => e.title.includes("Team lunch")), false);
});

test("H2: MONTHLY BYDAY with an ordinal lands on the Nth weekday", () => {
  const ev = parseIcs(fixture("icloud-nth-weekday.ics"), NOV_FROM, new Date(2027, 0, 1));
  const starts = (prefix: string) => ev.filter((e) => e.title.startsWith(prefix)).map((e) => e.start);
  assert.deepEqual(starts("PTA"), [localIso(2026, 11, 10, 19), localIso(2026, 12, 8, 19)]);
  assert.deepEqual(starts("First Monday"), [localIso(2026, 11, 2, 7, 30), localIso(2026, 12, 7, 7, 30)]);
  assert.deepEqual(starts("Last Friday"), [localIso(2026, 11, 27, 18), localIso(2026, 12, 25, 18)]);
});

test("H2: YEARLY BYMONTH + BYDAY (Thanksgiving, 4th Thursday)", () => {
  const ev = parseIcs(fixture("icloud-nth-weekday.ics"), NOV_FROM, new Date(2027, 11, 31));
  const tg = ev.filter((e) => e.title === "Thanksgiving");
  // DTSTART is Nov 26 2020; 2027's 4th Thursday is the 25th, not the 26th.
  assert.deepEqual(tg.map((e) => e.start), [localIso(2026, 11, 26), localIso(2027, 11, 25)]);
  assert.equal(tg[0]!.allDay, true);
});

test("H2: DAILY with BYDAY skips the weekend", () => {
  const ev = parseIcs(fixture("icloud-nth-weekday.ics"), NOV_FROM, NOV_TO).filter((e) => e.title === "School drop-off");
  assert.equal(ev.length, 21, "weekdays in November 2026");
  for (const e of ev) {
    const d = new Date(e.start).getDay();
    assert.ok(d >= 1 && d <= 5, `weekend occurrence ${e.start}`);
  }
});

test("H2 + L3: Outlook BYSETPOS form and a Windows TZID", () => {
  const ev = parseIcs(fixture("outlook-monthly-bysetpos.ics"), NOV_FROM, new Date(2027, 0, 1));
  const pta = ev.filter((e) => e.title === "PTA meeting");
  // 2nd Tuesday 19:00 Central Standard Time (UTC-6).
  assert.deepEqual(pta.map((e) => e.start), ["2026-11-11T01:00:00.000Z", "2026-12-09T01:00:00.000Z"]);
  const rent = ev.filter((e) => e.title === "Pay rent");
  // Last weekday of the month: Mon Nov 30, Thu Dec 31.
  assert.deepEqual(rent.map((e) => e.start), [localIso(2026, 11, 30), localIso(2026, 12, 31)]);
});

test("L3: an IANA TZID is honoured", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:school@x",
    "DTSTART;TZID=America/New_York:20261120T090000",
    "DTEND;TZID=America/New_York:20261120T100000",
    "SUMMARY:Assembly",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:summer@x",
    "DTSTART;TZID=\"America/New_York\":20260701T090000",
    "SUMMARY:Summer (EDT)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:unknown@x",
    "DTSTART;TZID=Nowhere/Special:20261120T090000",
    "SUMMARY:Unknown zone",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const ev = parseIcs(ics, new Date(2026, 5, 1), NOV_TO);
  assert.equal(ev.find((e) => e.uid === "school@x")!.start, "2026-11-20T14:00:00.000Z");
  assert.equal(ev.find((e) => e.uid === "summer@x")!.start, "2026-07-01T13:00:00.000Z");
  assert.equal(ev.find((e) => e.uid === "unknown@x")!.start, localIso(2026, 11, 20, 9), "unknown TZID falls back to local");
});

test("M1: long-running daily and weekly series still reach today's window", () => {
  const ev = parseIcs(fixture("long-running-series.ics"), NOV_FROM, NOV_TO);
  assert.equal(ev.filter((e) => e.title === "Meds").length, 30);
  assert.equal(ev.find((e) => e.title === "Meds" && e.start === localIso(2026, 11, 14, 8)) !== undefined, true);
  const bins = ev.filter((e) => e.title === "Bins out");
  assert.equal(bins.length, 4, "Wednesdays Nov 4, 11, 18, 25");
  for (const b of bins) assert.equal(new Date(b.start).getDay(), 3);
});

test("L1: monthly on the 31st skips months without one", () => {
  const ev = parseIcs(fixture("long-running-series.ics"), new Date(2026, 0, 1), new Date(2026, 5, 1)).filter((e) => e.title === "Month end");
  assert.deepEqual(ev.map((e) => e.start), [localIso(2026, 1, 31), localIso(2026, 3, 31), localIso(2026, 5, 31)]);
});

test("L2: a date-only UNTIL includes that day", () => {
  const ev = parseIcs(fixture("long-running-series.ics"), NOV_FROM, NOV_TO).filter((e) => e.title === "Camp pickup");
  assert.deepEqual(ev.map((e) => e.start), [localIso(2026, 11, 2, 17), localIso(2026, 11, 3, 17), localIso(2026, 11, 4, 17)]);
});

test("M2: finished old series do not eat the budget of later events", () => {
  const parts = ["BEGIN:VCALENDAR"];
  for (let i = 0; i < 52; i++) {
    parts.push("BEGIN:VEVENT", `UID:routine${i}@x`, "SUMMARY:Routine", "DTSTART:20240301T070000", "RRULE:FREQ=DAILY;UNTIL=20261031T235959Z", "END:VEVENT");
  }
  parts.push("BEGIN:VEVENT", "UID:dentist@x", "SUMMARY:Dentist", "DTSTART:20260105T100000", "DTEND:20260105T110000", "RRULE:FREQ=WEEKLY", "END:VEVENT");
  parts.push("END:VCALENDAR");
  const out = parseIcsFeed(parts.join("\r\n"), NOV_FROM, NOV_TO);
  assert.equal(out.events.filter((e) => e.title === "Dentist").length, 5, "Mondays Nov 2, 9, 16, 23, 30");
  assert.equal(out.events.some((e) => e.title === "Routine"), false);
  assert.equal(out.truncated, false);
});

test("M2: running out of budget is reported, not silent", () => {
  const parts = ["BEGIN:VCALENDAR"];
  for (let i = 0; i < 20000; i++) parts.push("BEGIN:VEVENT", `UID:u${i}`, "SUMMARY:x", "DTSTART:19900101T100000Z", "RRULE:FREQ=DAILY", "END:VEVENT");
  parts.push("END:VCALENDAR");
  const out = parseIcsFeed(parts.join("\r\n"), new Date("2026-08-31T00:00:00Z"), new Date("2026-09-07T00:00:00Z"));
  assert.equal(out.truncated, true);
  assert.ok(out.events.length <= 400);
});

test("M3: the 400-event cap keeps the events nearest to now, not the first in the file", () => {
  const parts = ["BEGIN:VCALENDAR"];
  for (let i = 0; i < 450; i++) parts.push("BEGIN:VEVENT", `UID:early${i}`, "SUMMARY:Earlier", "DTSTART:20261102T100000", "END:VEVENT");
  parts.push("BEGIN:VEVENT", "UID:thisweek", "SUMMARY:This week", "DTSTART:20261116T100000", "END:VEVENT");
  parts.push("END:VCALENDAR");
  const ev = parseIcs(parts.join("\r\n"), NOV_FROM, NOV_TO, new Date(2026, 10, 15, 12));
  assert.equal(ev.length, 400);
  assert.equal(ev.some((e) => e.uid === "thisweek"), true);
  assert.deepEqual([...ev].sort((a, b) => a.start.localeCompare(b.start)), ev, "still sorted by start");
});

test("unsupported rule shapes are skipped and counted rather than drawn on wrong dates", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:weekno@x",
    "DTSTART:20260105T100000",
    "RRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO",
    "SUMMARY:Odd rule",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const out = parseIcsFeed(ics, new Date(2026, 0, 1), new Date(2027, 0, 1));
  assert.equal(out.events.length, 0);
  assert.equal(out.skippedSeries, 1);
});

test("COUNT is still honoured on monthly Nth-weekday rules", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:count@x",
    "DTSTART:20260908T190000",
    "RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3",
    "SUMMARY:Three meetings",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const ev = parseIcs(ics, new Date(2026, 8, 1), new Date(2027, 2, 1));
  assert.deepEqual(ev.map((e) => e.start), [localIso(2026, 9, 8, 19), localIso(2026, 10, 13, 19), localIso(2026, 11, 10, 19)]);
});

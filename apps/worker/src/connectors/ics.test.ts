import assert from "node:assert/strict";
import test from "node:test";
import { parseIcs, parseIcsDate } from "./ics.ts";

const from = new Date(2026, 8, 1); // Sep 1 2026 local
const to = new Date(2026, 8, 30);

const CAL = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one@x",
  "DTSTART;VALUE=DATE:20260905",
  "DTEND;VALUE=DATE:20260906",
  "SUMMARY:Grandma visits\\, bring pie",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:two@x",
  "DTSTART:20260910T180000Z",
  "DTEND:20260910T190000Z",
  "SUMMARY:Soccer practice",
  "LOCATION:Field 3",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:weekly@x",
  "DTSTART:20260902T160000",
  "DTEND:20260902T170000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6",
  "SUMMARY:Piano",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:old@x",
  "DTSTART;VALUE=DATE:20250101",
  "DTEND;VALUE=DATE:20250102",
  "SUMMARY:Last year",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:folded@x",
  "DTSTART:20260920T090000",
  "SUMMARY:A very long title that the exporter folded across",
  "  two physical lines",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("parses dates, all-day, UTC, and TEXT escaping", () => {
  const ev = parseIcs(CAL, from, to);
  const pie = ev.find((e) => e.uid === "one@x")!;
  assert.equal(pie.allDay, true);
  assert.equal(pie.title, "Grandma visits, bring pie");
  const soccer = ev.find((e) => e.uid === "two@x")!;
  assert.equal(soccer.allDay, false);
  assert.equal(soccer.location, "Field 3");
  assert.equal(new Date(soccer.start).toISOString(), "2026-09-10T18:00:00.000Z");
});

test("events outside the window are dropped; folded lines are unfolded; missing DTEND defaults", () => {
  const ev = parseIcs(CAL, from, to);
  assert.equal(ev.some((e) => e.uid === "old@x"), false);
  const folded = ev.find((e) => e.uid === "folded@x")!;
  assert.equal(folded.title, "A very long title that the exporter folded across two physical lines");
  assert.equal(new Date(folded.end).getTime() - new Date(folded.start).getTime(), 3_600_000);
});

test("weekly BYDAY recurrence expands with COUNT", () => {
  const ev = parseIcs(CAL, from, to).filter((e) => e.uid.startsWith("weekly@x"));
  assert.equal(ev.length, 6);
  for (const e of ev) {
    const d = new Date(e.start).getDay();
    assert.ok(d === 1 || d === 3, `expected Mon/Wed, got ${d}`);
  }
});

test("hostile input never throws and output is bounded", () => {
  assert.deepEqual(parseIcs("", from, to), []);
  assert.deepEqual(parseIcs("BEGIN:VEVENT\nDTSTART:garbage\nEND:VEVENT", from, to), []);
  const big = ["BEGIN:VCALENDAR"];
  for (let i = 0; i < 900; i++) big.push("BEGIN:VEVENT", `UID:${i}`, "DTSTART;VALUE=DATE:20260915", `SUMMARY:${"x".repeat(5000)}<script>`, "END:VEVENT");
  big.push("END:VCALENDAR");
  const ev = parseIcs(big.join("\n"), from, to);
  assert.equal(ev.length, 400);
  assert.ok(ev[0]!.title.length <= 200);
});

test("parseIcsDate handles both forms", () => {
  assert.equal(parseIcsDate("20260101", {})?.allDay, true);
  assert.equal(parseIcsDate("20260101T120000Z", {})?.date.toISOString(), "2026-01-01T12:00:00.000Z");
  assert.equal(parseIcsDate("nope", {}), null);
});

test("VALARM properties never overwrite the event's own", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:a",
    "SUMMARY:Dentist",
    "DTSTART:20260901T100000Z",
    "DTEND:20260901T110000Z",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "SUMMARY:Reminder ping",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const out = parseIcs(ics, new Date("2026-08-31T00:00:00Z"), new Date("2026-09-30T00:00:00Z"));
  assert.equal(out.length, 1);
  assert.equal(out[0]!.title, "Dentist");
});

test("a feed of thousands of endless recurrences is bounded in time", () => {
  const parts = ["BEGIN:VCALENDAR"];
  for (let i = 0; i < 20000; i++) {
    parts.push("BEGIN:VEVENT", `UID:u${i}`, "SUMMARY:x", "DTSTART:19900101T100000Z", "RRULE:FREQ=DAILY", "END:VEVENT");
  }
  parts.push("END:VCALENDAR");
  const t0 = performance.now();
  const out = parseIcs(parts.join("\r\n"), new Date("2026-08-31T00:00:00Z"), new Date("2026-09-07T00:00:00Z"));
  const ms = performance.now() - t0;
  assert.ok(out.length <= 400);
  assert.ok(ms < 2000, `parse took ${Math.round(ms)}ms`);
});

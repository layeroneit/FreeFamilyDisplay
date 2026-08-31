import assert from "node:assert/strict";
import test from "node:test";
import { birthdayGreeting, birthdayNameFromTitle, birthdaysOn, isCelebrationHour } from "./birthdays";

test("reads the name out of the shapes calendars actually produce", () => {
  const cases: [string, string][] = [
    ["Ella's birthday", "Ella"],
    ["Ella Rose’s Birthday", "Ella Rose"],
    ["Birthday: Sam", "Sam"],
    ["Birthday - Sam", "Sam"],
    ["Happy Birthday Grandma", "Grandma"],
    ["Happy birthday, Ben!", "Ben"],
    ["Birthday of Uncle Ray", "Uncle Ray"],
    ["Ella bday", "Ella"],
    ["Dad B-Day", "Dad"],
    ["🎂 Ella's birthday 🎉", "Ella"],
    ["  Mom's   Birthday  ", "Mom"],
  ];
  for (const [title, want] of cases) assert.equal(birthdayNameFromTitle(title), want, title);
});

test("an errand about a birthday is not a birthday", () => {
  for (const title of [
    "Buy birthday card at Target",
    "Order cake for the birthday party",
    "Birthday party planning meeting",
    "Call Ella about her birthday",
    "Plan Ella's birthday",
    "Remember birthday gifts",
    "birthdays this month",
    "The birthday",
    "my birthday list for the weekend and also groceries",
    // The audit's probes: group calendars and phrases, not people.
    "staff birthdays",
    "Happy Birthday to you",
    "Team offsite birthday",
    "Grandma's 80th birthday",
    "Ella turns 7 birthday",
  ]) {
    assert.equal(birthdayNameFromTitle(title), null, title);
  }
});

test("nothing at all is read out of a title that never says birthday", () => {
  for (const title of ["Dentist", "Soccer practice", "Ella", "", "   ", "🎉🎉🎉"]) {
    assert.equal(birthdayNameFromTitle(title), null, JSON.stringify(title));
  }
});

test("a hostile title cannot become a giant string on the wall", () => {
  assert.equal(birthdayNameFromTitle(`${"A".repeat(60)}'s birthday`), null);
  assert.equal(birthdayNameFromTitle(`${"word ".repeat(30)}birthday`), null);
});

test("only events overlapping the day count, de-duplicated and capped", () => {
  const day = new Date(2026, 9, 3);
  const at = (y: number, m: number, d: number) => ({
    start: new Date(y, m, d).toISOString(),
    end: new Date(y, m, d + 1).toISOString(),
  });
  const events = [
    { title: "Ella's birthday", ...at(2026, 9, 3) },
    { title: "ELLA's Birthday", ...at(2026, 9, 3) }, // same person, duplicate feed row
    { title: "Sam's birthday", ...at(2026, 9, 3) },
    { title: "Ben's birthday", ...at(2026, 9, 3) },
    { title: "Ray's birthday", ...at(2026, 9, 3) }, // over the cap
    { title: "Nia's birthday", ...at(2026, 9, 4) }, // tomorrow
    { title: "Dentist", ...at(2026, 9, 3) },
  ];
  assert.deepEqual(birthdaysOn(events, day), ["Ella", "Sam", "Ben"]);
  assert.deepEqual(birthdaysOn(events, new Date(2026, 9, 4)), ["Nia"]);
  assert.deepEqual(birthdaysOn(events, new Date(2026, 9, 5)), []);
});

test("a timed birthday event still counts on its day", () => {
  const day = new Date(2026, 9, 3);
  const events = [{ title: "Ella's birthday", start: new Date(2026, 9, 3, 18, 30).toISOString(), end: new Date(2026, 9, 3, 19, 30).toISOString() }];
  assert.deepEqual(birthdaysOn(events, day), ["Ella"]);
});

test("names read as a sentence", () => {
  assert.equal(birthdayGreeting([]), "");
  assert.equal(birthdayGreeting(["Ella"]), "Ella");
  assert.equal(birthdayGreeting(["Ella", "Sam"]), "Ella & Sam");
  assert.equal(birthdayGreeting(["Ella", "Sam", "Ben"]), "Ella, Sam & Ben");
});

test("the celebration sleeps overnight", () => {
  for (const h of [7, 12, 21, 22]) assert.equal(isCelebrationHour(h), true, String(h));
  for (const h of [0, 3, 6, 23]) assert.equal(isCelebrationHour(h), false, String(h));
});

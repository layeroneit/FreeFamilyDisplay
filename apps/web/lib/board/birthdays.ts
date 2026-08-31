/**
 * Finds today's birthdays in the calendar feed so the board can celebrate
 * them. Nobody types a birthday into a settings screen twice — it is already
 * in the calendar the display is reading, usually as an all-day yearly event
 * from a contacts calendar ("Ella Rose's birthday").
 *
 * Titles come from an attacker-influenced ICS feed (CLAUDE.md), so this is
 * pure string work over plain text: no HTML, everything capped, and a wrong
 * guess must fail closed. Silence is a much better failure than the wall
 * screen shouting "Happy Birthday, Order Cake For" at the kitchen.
 */

export type BirthdaySource = { title: string; start: string; end: string };

/** Longest name we will put on screen. Beyond this it isn't a name. */
const MAX_NAME = 40;
/** Most people we celebrate at once before it stops being readable. */
export const MAX_BIRTHDAYS = 3;

/**
 * Every pattern is anchored at BOTH ends, so a title that merely mentions a
 * birthday ("Buy birthday card at Target") matches nothing at all.
 */
const PATTERNS: RegExp[] = [
  /^(.+?)['’]s\s+(?:birthdays?|bdays?|b-days?|b'days?)$/i, // Ella's birthday
  /^(?:birthdays?|bdays?|b-days?|b'days?)\s*[:\-–—]\s*(.+)$/i, // Birthday: Ella
  /^happy\s+(?:birthdays?|bdays?|b-days?|b'days?)[,!\s]+(.+)$/i, // Happy birthday Ella
  /^(?:birthdays?|bdays?|b-days?|b'days?)\s+(?:of\s+)?(.+)$/i, // Birthday of Ella
  /^(.+?)\s+(?:birthdays?|bdays?|b-days?|b'days?)$/i, // Ella birthday
];

/**
 * Words that disqualify a capture outright. No child is called "planning",
 * so one of these anywhere in the name means the pattern matched a phrase
 * about a birthday rather than the person having one.
 */
const NEVER_A_NAME = new Set([
  "this", "that", "these", "those", "next", "last", "upcoming",
  "today", "tomorrow", "yesterday", "day", "days", "week", "weeks", "weekend",
  "month", "months", "year", "years",
  "party", "parties", "cake", "cakes", "gift", "gifts", "present", "presents",
  "card", "cards", "reminder", "reminders", "list", "lists", "shopping",
  "lunch", "dinner", "brunch", "meeting", "meetings", "appointment",
  "planning", "plans", "celebration", "bash", "invite", "invites", "rsvp",
  // Group words: "staff birthdays" and "team offsite birthday" are calendars
  // talking about birthdays, not people having one.
  "staff", "team", "teams", "everyone", "all", "office", "work", "school", "class",
]);

/** Grammatical filler. Harmless beside a name, not a name on its own. */
const ONLY_FILLER = new Set(["my", "our", "your", "his", "her", "their", "its", "the", "a", "an", "and", "of", "for", "in", "on", "at"]);

/** A title that opens with one of these is an errand about a birthday. */
const TASK_VERB = /^(?:buy|get|order|call|text|send|mail|ship|post|wrap|plan|book|make|bake|pick|collect|remember|remind|prep|prepare|confirm|rsvp)\b/i;

/** Strip emoji, decorations and stray punctuation down to plain words. */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—*.,!]+|[\s\-–—*.,!]+$/g, "")
    .trim();
}

/** Cleans a captured name, or returns null if it isn't one. */
function cleanName(captured: string): string | null {
  let n = captured.replace(/\s+/g, " ").trim().replace(/[!.,;:]+$/g, "").trim();
  // "Order cake for Ella" -> "Ella". Recovers the one shape where a task
  // title still names the right person unambiguously.
  const forIdx = n.toLowerCase().lastIndexOf(" for ");
  if (forIdx >= 0) n = n.slice(forIdx + 5).trim();
  if (!n || n.length > MAX_NAME) return null;
  if (TASK_VERB.test(n)) return null;
  // "Happy Birthday to you" is a song, not a person.
  if (/^to\b/i.test(n)) return null;
  // Digits and ordinals mean the capture kept part of the event, not a name:
  // "Grandma's 80th", "Ella turns 7".
  if (/\d/.test(n)) return null;
  // A trailing possessive is a fragment of a larger phrase ("Grandma's").
  n = n.replace(/['\u2019]s$/i, "").trim();
  if (!n) return null;
  const words = n.split(" ");
  // A real name is a word or a few. Four is "Mary Anne van Doren".
  if (words.length > 4) return null;
  const lower = words.map((w) => w.toLowerCase());
  // One phrase word ("party planning meeting") disqualifies the whole capture...
  if (lower.some((w) => NEVER_A_NAME.has(w))) return null;
  // ...and nothing but filler ("the", "my") was never a person either.
  if (lower.every((w) => ONLY_FILLER.has(w))) return null;
  // Nothing but digits and punctuation is not a person.
  if (!/\p{L}/u.test(n)) return null;
  return n;
}

/** The name being wished a happy birthday by this title, if any. */
export function birthdayNameFromTitle(title: string): string | null {
  const t = normalizeTitle(title);
  if (!t || t.length > 120) return null;
  // An errand never becomes a celebration, whichever pattern it happens to fit.
  if (TASK_VERB.test(t)) return null;
  for (const re of PATTERNS) {
    const m = re.exec(t);
    const name = m?.[1] ? cleanName(m[1]) : null;
    if (name) return name;
  }
  return null;
}

/** Names with a birthday on `day`, de-duplicated, at most MAX_BIRTHDAYS. */
export function birthdaysOn(events: readonly BirthdaySource[], day: Date): string[] {
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  // End of the LOCAL day - a DST day is 23 or 25 hours, and +86,400,000ms
  // would misfile a birthday party in the odd hour.
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const e of events) {
    if (names.length >= MAX_BIRTHDAYS) break;
    const s = new Date(e.start);
    const en = new Date(e.end);
    if (!(s < to && en > from)) continue;
    const name = birthdayNameFromTitle(e.title);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** "Ella" · "Ella & Sam" · "Ella, Sam & Ben" */
export function birthdayGreeting(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** The board celebrates on the hour through the part of the day people are up. */
export const CELEBRATION_FROM_HOUR = 7;
export const CELEBRATION_TO_HOUR = 22;

export function isCelebrationHour(h: number): boolean {
  return h >= CELEBRATION_FROM_HOUR && h <= CELEBRATION_TO_HOUR;
}

/** Public-domain lines, one per day. Rotates on the day number. */
const QUOTES: ReadonlyArray<{ text: string; by: string }> = [
  { text: "The best way out is always through.", by: "Robert Frost" },
  { text: "Where there is love there is life.", by: "Mahatma Gandhi" },
  { text: "Rest is not idleness.", by: "John Lubbock" },
  { text: "Happiness is not a station you arrive at, but a manner of traveling.", by: "Margaret Lee Runbeck" },
  { text: "Little by little, one travels far.", by: "Proverb" },
  { text: "Kind words can be short and easy to speak, but their echoes are truly endless.", by: "Mother Teresa" },
  { text: "The secret of getting ahead is getting started.", by: "Mark Twain" },
  { text: "Home is the nicest word there is.", by: "Laura Ingalls Wilder" },
  { text: "A day without laughter is a day wasted.", by: "Charlie Chaplin" },
  { text: "Every day may not be good, but there is something good in every day.", by: "Alice Morse Earle" },
  { text: "Do what you can, with what you have, where you are.", by: "Theodore Roosevelt" },
  { text: "The family is one of nature’s masterpieces.", by: "George Santayana" },
];

export function quoteForDay(dayIndex = Math.floor(Date.now() / 86_400_000)): { text: string; by: string } {
  return QUOTES[dayIndex % QUOTES.length] ?? QUOTES[0]!;
}

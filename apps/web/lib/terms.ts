/**
 * End-user agreement. Shown once at first sign-in; acceptance is recorded on
 * the account with the version that was accepted, so a future change to this
 * text re-prompts. Plain language on purpose — this is read by family.
 */

export const TERMS_VERSION = "2026-08-30.3";

export const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What this is",
    body:
      "Free Family Display is free software, developed by Layer One IT Consultants and given away. One household downloads it and runs it on its own machine; this copy belongs to whoever set it up. Layer One IT Consultants does not host it, does not operate it, and has no access to it or to anything in it. There is no hosted version, no subscription, no support desk, and no account anywhere but this box. It is free, and it always will be.",
  },
  {
    heading: "Use at your own risk",
    body:
      "You use this software entirely at your own risk. It may have bugs, it may show information that is out of date or wrong, and it may be unavailable at any time. Do not rely on it for anything where a mistake or an outage would cause harm — medical timing, travel, safety, or money.",
  },
  {
    heading: "No warranty",
    body:
      "The software is provided \"as is\" and \"as available\", without warranty of any kind — express or implied — including any warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement. To the fullest extent the law allows, neither Layer One IT Consultants nor anyone else involved in making, distributing, or running this software is liable for any loss, damage, or expense arising from using it or being unable to use it. Because you run your own copy, keeping it patched, backed up, and reachable is yours to do.",
  },
  {
    heading: "Your data",
    body:
      "Calendar links, photo links, and anything you type stay on this household's own machine, encrypted where they are credentials. There is no analytics, no telemetry, and no reporting home — nothing is sold or shared, and no data reaches the people who wrote this software, because it never leaves the box. The only outbound requests are to the calendar, photo, and weather sources somebody here chose to connect, and those services have their own terms. Whoever runs this copy can create, disable, and delete accounts but cannot read your calendar contents.",
  },
  {
    heading: "Good neighbours",
    body:
      "Don't paste links that aren't yours to share, don't upload images you don't have the right to use, and don't use a display to show anything unlawful. The operator may disable an account that does.",
  },
  {
    heading: "Copyright",
    body:
      "Free Family Display © 2026 Layer One IT Consultants. The Layer One name and mark belong to Layer One IT Consultants and are not covered by the software licence. Photographs shipped with the app stay under their own licences and are credited on screen; anything you add stays yours.",
  },
  {
    heading: "Changes",
    body:
      "If this agreement changes, you'll be asked to read and accept it again the next time you sign in.",
  },
];

/** True when the user has accepted the CURRENT agreement version. */
export function termsCurrent(user: { termsAcceptedVersion: string | null }): boolean {
  return user.termsAcceptedVersion === TERMS_VERSION;
}

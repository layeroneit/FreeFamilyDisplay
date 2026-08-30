/**
 * End-user agreement. Shown once at first sign-in; acceptance is recorded on
 * the account with the version that was accepted, so a future change to this
 * text re-prompts. Plain language on purpose — this is read by family.
 */

export const TERMS_VERSION = "2026-08-30";

export const TERMS_SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "What this is",
    body:
      "Free Family Display is a private, self-hosted family dashboard run by the person who invited you. It is free, and it always will be. There is no company behind it, no subscription, and no support desk.",
  },
  {
    heading: "Use at your own risk",
    body:
      "You use this software entirely at your own risk. It may have bugs, it may show information that is out of date or wrong, and it may be unavailable at any time. Do not rely on it for anything where a mistake or an outage would cause harm — medical timing, travel, safety, or money.",
  },
  {
    heading: "No warranty",
    body:
      "The software is provided \"as is\" and \"as available\", without warranty of any kind — express or implied — including any warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement. Nobody involved in making or running it is liable for any loss, damage, or expense that arises from using it or being unable to use it.",
  },
  {
    heading: "Your data",
    body:
      "Calendar links, photo links, and anything you type are stored on the operator's own machine, encrypted where they are credentials. Nothing is sold, shared, or sent to third parties for analytics. The operator can create, disable, and delete accounts but cannot read your calendar contents. Third-party services you connect (a calendar provider, a photo album) have their own terms.",
  },
  {
    heading: "Good neighbours",
    body:
      "Don't paste links that aren't yours to share, don't upload images you don't have the right to use, and don't use a display to show anything unlawful. The operator may disable an account that does.",
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

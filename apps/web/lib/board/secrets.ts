/**
 * User-pasted links are credentials (CLAUDE.md): a Google Calendar "secret
 * address", an iCloud public calendar, a shared photo album. This module is
 * the only place they are handled in `web`: validate the shape, encrypt,
 * store the ciphertext plus a host-only mask, and never let the plaintext
 * reach a log, a response, or a client prop. The worker decrypts to fetch.
 */

import "server-only";
import { encryptSecret, maskUrl } from "@ffd/crypto";

export class BadLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadLinkError";
  }
}

/** Light shape check — the worker's SSRF guard is the real control at fetch time. */
function checkLink(raw: string): string {
  const text = raw.trim();
  if (text.length > 2048) throw new BadLinkError("That link is too long.");
  const normalized = text.replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    throw new BadLinkError("That doesn't look like a valid link.");
  }
  if (u.protocol !== "https:") throw new BadLinkError("Only https:// (or webcal://) links are allowed.");
  if (u.username || u.password) throw new BadLinkError("Links with embedded passwords are not allowed.");
  return normalized;
}

/**
 * Applies incoming plaintext link fields to a widget config, replacing them
 * with encrypted + masked fields. `""` clears the link. Keys handled:
 *   icsUrl  → icsSecret / icsMask        (calendar)
 *   linkUrl → linkSecret / linkMask / source ("link")   (photos)
 */
export function sealLinkFields(widgetId: string, type: string, incoming: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...incoming };

  const handle = (plainKey: string, secretKey: string, maskKey: string, context: string) => {
    if (!(plainKey in out)) return;
    const raw = out[plainKey];
    delete out[plainKey];
    if (typeof raw !== "string") return;
    if (raw.trim() === "") {
      out[secretKey] = undefined;
      out[maskKey] = undefined;
      return;
    }
    const url = checkLink(raw);
    out[secretKey] = encryptSecret(url, `${context}:${widgetId}`);
    out[maskKey] = maskUrl(url);
  };

  if (type === "calendar") handle("icsUrl", "icsSecret", "icsMask", "widget:ics");
  if (type === "photos") {
    handle("linkUrl", "linkSecret", "linkMask", "widget:photos");
    if ("linkSecret" in out) out["source"] = out["linkSecret"] ? "link" : "sample";
  }
  return out;
}

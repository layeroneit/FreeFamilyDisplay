/**
 * Connector cycle — the Phase 2 shape, arriving with the first two real
 * sources: ICS calendars and Google photo links. Every 15 minutes: find
 * widgets holding an encrypted link, decrypt (worker only), fetch under the
 * SSRF guard, normalize, write CachedPayload. The render path reads only
 * Postgres (plan §4.2). Failures are recorded as actionable text and the
 * previous good payload stays — stale-but-labeled beats blank.
 */

import { decryptSecret } from "@ffd/crypto";
import { prisma } from "@ffd/db";
import { createLogger } from "@ffd/log";
import { safeFetch, UnsafeUrlError } from "../net/ssrf.js";
import { parseIcs } from "./ics.js";
import { syncPhotoLink } from "./google-photos.js";
import { syncCustomCollections } from "./custom-collections.js";

const log = createLogger("worker.connectors");
const MEDIA_DIR = process.env.MEDIA_DIR ?? "/app/media";
const ICS_MAX_BYTES = 10 * 1024 * 1024;

function failureText(err: unknown): string {
  const m = err instanceof Error ? err.message : "unknown error";
  // Never let a URL (a credential) ride along in an error string.
  return m.replace(/https?:\/\/\S+/g, "[link]").slice(0, 255);
}

async function record(kind: string, key: string, payload: unknown | null, error: string | null): Promise<void> {
  const now = new Date();
  if (payload !== null) {
    await prisma.cachedPayload.upsert({
      where: { kind_key: { kind, key } },
      create: { kind, key, payload: payload as object, fetchedAt: now },
      update: { payload: payload as object, fetchedAt: now, lastError: null, lastErrorAt: null },
    });
  } else {
    await prisma.cachedPayload.upsert({
      where: { kind_key: { kind, key } },
      create: { kind, key, payload: {}, fetchedAt: new Date(0), lastError: error, lastErrorAt: now },
      update: { lastError: error, lastErrorAt: now },
    });
  }
}

/**
 * https://calendar.google.com/calendar/embed?src=<id>… or ?cid=<base64 id>
 * → https://calendar.google.com/calendar/ical/<id>/public/basic.ics
 * Only works for calendars whose owner made them public; the caller falls
 * back to a helpful error otherwise.
 */
export function googleEmbedToIcs(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hostname !== "calendar.google.com") return null;
  if (/\/calendar\/ical\//.test(u.pathname)) return null; // already an ICS address
  let id = u.searchParams.get("src");
  if (!id) {
    const cid = u.searchParams.get("cid");
    if (cid) {
      try {
        id = Buffer.from(cid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      } catch {
        id = null;
      }
    }
  }
  if (!id || !/^[\w.@%+-]{3,200}$/.test(id)) return null;
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
}

async function syncCalendars(): Promise<void> {
  const rows = await prisma.boardWidget.findMany({ where: { type: "calendar" }, select: { id: true, config: true } });
  for (const r of rows) {
    const cfg = (r.config ?? {}) as { icsSecret?: unknown };
    if (typeof cfg.icsSecret !== "string") continue;
    try {
      const url = decryptSecret(cfg.icsSecret, `widget:ics:${r.id}`);
      const res = await safeFetch(url, { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5", maxBytes: ICS_MAX_BYTES });
      if (res.status === 404) throw new Error("Calendar feed returned 404 — check the link");
      if (res.status !== 200) throw new Error(`Calendar feed returned HTTP ${res.status}`);
      let text = res.body.toString("utf8");
      if (!text.includes("BEGIN:VCALENDAR")) {
        // Google's "embed" / share page instead of the iCal address. If the
        // calendar is public, its .ics lives at a predictable URL — try that.
        const alt = googleEmbedToIcs(url);
        const altText = alt ? (await safeFetch(alt, { accept: "text/calendar", maxBytes: ICS_MAX_BYTES }).catch(() => null))?.body.toString("utf8") : null;
        if (altText && altText.includes("BEGIN:VCALENDAR")) {
          text = altText;
        } else {
          throw new Error(
            alt
              ? "That is Google's share/embed link and the calendar isn't public. In Google Calendar → Settings → your calendar → Integrate calendar, copy the “Secret address in iCal format” instead."
              : "That link didn't return a calendar (.ics) file. Use the calendar's iCal/ICS address.",
          );
        }
      }
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 31);
      const events = parseIcs(text, from, to);
      await record("ics", r.id, { events, syncedAt: new Date().toISOString() }, null);
      log.info("calendar synced", { widgetId: r.id, events: events.length });
    } catch (err) {
      const text = failureText(err);
      await record("ics", r.id, null, text).catch(() => undefined);
      log.warn("calendar sync failed", { widgetId: r.id, error: text, unsafe: err instanceof UnsafeUrlError });
    }
  }
}

async function syncPhotos(): Promise<void> {
  const rows = await prisma.boardWidget.findMany({ where: { type: "photos" }, select: { id: true, config: true } });
  for (const r of rows) {
    const cfg = (r.config ?? {}) as { linkSecret?: unknown; source?: unknown };
    if (cfg.source !== "link" || typeof cfg.linkSecret !== "string") continue;
    try {
      const link = decryptSecret(cfg.linkSecret, `widget:photos:${r.id}`);
      const files = await syncPhotoLink(link, r.id, MEDIA_DIR);
      await record("photos", r.id, { files, syncedAt: new Date().toISOString() }, null);
      log.info("photos synced", { widgetId: r.id, files: files.length });
    } catch (err) {
      const text = failureText(err);
      await record("photos", r.id, null, text).catch(() => undefined);
      log.warn("photo sync failed", { widgetId: r.id, error: text, unsafe: err instanceof UnsafeUrlError });
    }
  }
}

let inFlight: Promise<void> | null = null;

export function runConnectorCycle(): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      await syncCalendars();
      await syncPhotos();
      await syncCustomCollections(MEDIA_DIR);
    })()
      .catch((err: unknown) => log.error("connector cycle crashed", { error: err instanceof Error ? err.message : "unknown" }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

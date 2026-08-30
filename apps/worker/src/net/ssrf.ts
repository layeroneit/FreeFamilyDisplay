/**
 * SSRF guard (CLAUDE.md "SSRF guard specifics"; plan §8.3).
 *
 * The worker fetches URLs typed by users. Every one goes through here:
 * - https (and webcal, rewritten to https) only
 * - DNS is resolved and EVERY resolved address is validated against private,
 *   loopback, link-local, and reserved ranges — at connect time, via a custom
 *   lookup on the HTTP agent, so a DNS-rebinding race between "check" and
 *   "connect" is not possible
 * - at most 3 redirects, each hop re-validated the same way
 * - 10 MB response ceiling, 15 s timeout
 *
 * Hostname checks alone are not a control and are not used as one.
 */

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent, request, type Dispatcher } from "undici";

export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 10 * 1024 * 1024;
export const TIMEOUT_MS = 15_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Parses dotted IPv4 into a number; null if not 4 in-range octets. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((b & mask) >>> 0);
}

/**
 * True only for globally routable unicast addresses. Everything that could
 * reach a metadata service, a loopback listener, or a LAN neighbor is false.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const n = ipv4ToInt(address);
    if (n === null) return false;
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], // "this" network
      ["10.0.0.0", 8], // private
      ["100.64.0.0", 10], // CGNAT
      ["127.0.0.0", 8], // loopback
      ["169.254.0.0", 16], // link-local, incl. 169.254.169.254
      ["172.16.0.0", 12], // private
      ["192.0.0.0", 24], // IETF protocol assignments
      ["192.0.2.0", 24], // TEST-NET-1
      ["192.88.99.0", 24], // 6to4 relay (deprecated)
      ["192.168.0.0", 16], // private
      ["198.18.0.0", 15], // benchmarking
      ["198.51.100.0", 24], // TEST-NET-2
      ["203.0.113.0", 24], // TEST-NET-3
      ["224.0.0.0", 4], // multicast
      ["240.0.0.0", 4], // reserved + broadcast
    ];
    return !blocked.some(([base, bits]) => inCidr4(n, base, bits));
  }
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === "::" || a === "::1") return false; // unspecified, loopback
    // IPv4-mapped / compatible: validate the embedded v4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped?.[1]) return isPublicAddress(mapped[1]);
    // Hex-form mapped (::ffff:7f00:1)
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1]!, 16);
      const lo = parseInt(hexMapped[2]!, 16);
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) return false; // link-local fe80::/10
    if (a.startsWith("fc") || a.startsWith("fd")) return false; // unique local fc00::/7
    if (a.startsWith("ff")) return false; // multicast
    if (a.startsWith("2001:db8:")) return false; // documentation
    if (a.startsWith("64:ff9b:")) return false; // NAT64 — could map to private v4
    return true;
  }
  return false;
}

/** Normalizes and validates the scheme. webcal → https. Never http. */
export function normalizeUserUrl(raw: string): URL {
  // WHATWG URL refuses to switch a non-special scheme (webcal:) to a special
  // one via `.protocol`, so rewrite the text before parsing.
  const text = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid link.");
  }
  if (u.protocol !== "https:") {
    throw new UnsafeUrlError("Only https:// (or webcal://) links are allowed.");
  }
  if (u.username || u.password) throw new UnsafeUrlError("Links with embedded passwords are not allowed.");
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(u.hostname.replace(/^\[|\]$/g, ""))) {
    throw new UnsafeUrlError("That address points inside a private network.");
  }
  return u;
}

/**
 * dns.lookup replacement that refuses to hand the socket layer a non-public
 * address. Runs at CONNECT time on every attempt, so a DNS answer that changes
 * between "check" and "connect" (rebinding) is still caught.
 */
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, [], 0);
    const list: LookupAddress[] = Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: 4 }];
    for (const a of list) {
      if (!isPublicAddress(a.address)) {
        const e = new UnsafeUrlError(`"${hostname}" resolves to a private address`) as NodeJS.ErrnoException;
        return callback(e, [], 0);
      }
    }
    if (options.all) return callback(null, list, 0);
    const first = list[0]!;
    callback(null, first.address, first.family);
  });
}

const dispatcher: Dispatcher = new Agent({
  // undici's lookup option is typed against node:net's LookupFunction; the
  // node:dns signature above is the same call shape.
  connect: { lookup: guardedLookup as unknown as NonNullable<NonNullable<ConstructorParameters<typeof Agent>[0]>["connect"]> extends infer C ? (C extends { lookup?: infer L } ? L : never) : never, timeout: TIMEOUT_MS },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

export type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer };

/**
 * Fetches a user-supplied URL under the guard. Follows up to MAX_REDIRECTS,
 * re-validating each hop, and caps the body at MAX_BYTES.
 */
export async function safeFetch(rawUrl: string, opts: { accept?: string; maxBytes?: number } = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  let url = normalizeUserUrl(rawUrl);
  // One deadline for the whole redirect chain, not per hop.
  const deadline = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await request(url, {
      method: "GET",
      dispatcher,
      headers: {
        "user-agent": "FreeFamilyDisplay/0.1 (self-hosted family dashboard)",
        accept: opts.accept ?? "*/*",
      },
      signal: deadline,
    });

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const loc = res.headers["location"];
      await res.body.dump();
      if (typeof loc !== "string") throw new UnsafeUrlError("Redirect without a destination.");
      if (hop === MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects.");
      url = normalizeUserUrl(new URL(loc, url).toString());
      continue;
    }

    const declared = Number(res.headers["content-length"] ?? 0);
    if (declared > maxBytes) {
      await res.body.dump();
      throw new UnsafeUrlError("That file is too large.");
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        res.body.destroy();
        throw new UnsafeUrlError("That file is too large.");
      }
      chunks.push(buf);
    }
    const ct = res.headers["content-type"];
    return {
      url: url.toString(),
      status: res.statusCode,
      contentType: typeof ct === "string" ? ct : "",
      body: Buffer.concat(chunks),
    };
  }
  throw new UnsafeUrlError("Too many redirects.");
}

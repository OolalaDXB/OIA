import { lookup } from "node:dns/promises";
import { INGESTION_LIMITS, FETCH_CONTENT_TYPE_ALLOWLIST } from "@oia/config";
import type { LiveFetchAttempt } from "./models";

/**
 * SSRF-safe fetching (spec §6). URL-shape validation is pure and unit-tested;
 * DNS resolution + private-address blocking guard the live path. In this
 * environment external egress is denied, so live attempts return BLOCKED — which
 * is a valid, honestly-recorded result. We never retry or bypass a denial.
 */

export interface UrlPolicy {
  allowlist?: string[]; // if non-empty, host must match one
  denylist?: string[];
}

export interface UrlShapeResult {
  ok: boolean;
  reason?: string;
  host?: string;
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));
}

/** Parse an IPv4 string to octets, or null. */
function ipv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  // IPv6 loopback / link-local / unique-local.
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::" ) return true;
  if (low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("::ffff:")) return isPrivateOrReservedIp(low.slice(7)); // IPv4-mapped

  const o = ipv4(ip);
  if (!o) return false;
  const [a, b] = o as [number, number, number, number];
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** Pure URL-shape validation (no network). */
export function validateUrlShape(rawUrl: string, policy: UrlPolicy = {}): UrlShapeResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `disallowed protocol: ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in URL are not allowed" };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "empty host" };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost is blocked" };
  }
  // IP literals must not be private/reserved. IPv6 hostnames keep their brackets.
  const bareIp = host.replace(/^\[/, "").replace(/\]$/, "");
  if (ipv4(bareIp) || bareIp.includes(":")) {
    if (isPrivateOrReservedIp(bareIp)) return { ok: false, reason: `private/reserved IP: ${bareIp}` };
  }
  if (policy.denylist && hostMatches(host, policy.denylist)) {
    return { ok: false, reason: `host on denylist: ${host}` };
  }
  if (policy.allowlist && policy.allowlist.length > 0 && !hostMatches(host, policy.allowlist)) {
    return { ok: false, reason: `host not on allowlist: ${host}` };
  }
  return { ok: true, host };
}

export interface SafeFetchResult {
  attempt: LiveFetchAttempt;
  body?: Buffer;
  contentType?: string;
  finalUrl?: string;
}

export interface SafeFetchDeps {
  policy?: UrlPolicy;
  userAgent: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  /** Injectable DNS for tests; defaults to node lookup. */
  dnsLookup?: (host: string) => Promise<Array<{ address: string }>>;
  now?: () => number;
}

function classifyFetchError(err: unknown): { status: LiveFetchAttempt["fetchStatus"]; egressDenied: boolean; proxyCode?: number; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: unknown })?.cause;
  const causeStr = cause instanceof Error ? cause.message : String(cause ?? "");
  const blob = `${message} ${causeStr}`.toLowerCase();
  if (err instanceof Error && err.name === "AbortError") {
    return { status: "TIMEOUT", egressDenied: false, message };
  }
  if (blob.includes("403") || blob.includes("tunnel") || blob.includes("proxy") || blob.includes("egress")) {
    return { status: "BLOCKED", egressDenied: true, proxyCode: 403, message };
  }
  if (blob.includes("enotfound") || blob.includes("econnrefused") || blob.includes("dns")) {
    return { status: "SOURCE_UNAVAILABLE", egressDenied: false, message };
  }
  return { status: "ERROR", egressDenied: false, message };
}

/**
 * Attempt a real, safe fetch. Returns a fully-populated LiveFetchAttempt even on
 * failure. Enforces: http(s) only, SSRF/private-IP blocking, redirect limit,
 * timeout, size limit, content-type allowlist. Never executes downloaded bytes.
 */
export async function safeFetch(rawUrl: string, deps: SafeFetchDeps): Promise<SafeFetchResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const timeoutMs = deps.timeoutMs ?? INGESTION_LIMITS.timeoutMs;
  const maxRedirects = deps.maxRedirects ?? INGESTION_LIMITS.maxRedirects;
  const maxBytes = deps.maxBytes ?? INGESTION_LIMITS.maxResponseBytes;
  const doFetch = deps.fetchImpl ?? fetch;
  const dns = deps.dnsLookup ?? (async (h: string) => (await lookup(h, { all: true })).map((r) => ({ address: r.address })));

  const attemptBase = (over: Partial<LiveFetchAttempt>): LiveFetchAttempt => ({
    attemptedUrl: rawUrl,
    fetchStatus: "ERROR",
    egressDenied: false,
    fetchedAt: new Date(started).toISOString(),
    durationMs: now() - started,
    ...over,
  });

  const shape = validateUrlShape(rawUrl, deps.policy);
  if (!shape.ok) {
    return { attempt: attemptBase({ fetchStatus: "SSRF_BLOCKED", error: shape.reason }) };
  }

  // DNS resolution + private-address block.
  try {
    const addrs = await dns(shape.host!);
    if (addrs.length === 0) {
      return { attempt: attemptBase({ fetchStatus: "SOURCE_UNAVAILABLE", error: "no DNS records" }) };
    }
    for (const { address } of addrs) {
      if (isPrivateOrReservedIp(address)) {
        return { attempt: attemptBase({ fetchStatus: "SSRF_BLOCKED", error: `resolves to private IP ${address}` }) };
      }
    }
  } catch (err) {
    // DNS failure in a blocked environment is common; record honestly.
    const c = classifyFetchError(err);
    return { attempt: attemptBase({ fetchStatus: c.status, egressDenied: c.egressDenied, proxyCode: c.proxyCode, error: c.message }) };
  }

  let currentUrl = rawUrl;
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": deps.userAgent, accept: "text/html,application/pdf,text/plain,*/*" },
        signal: controller.signal,
      });

      // Manual redirect handling with re-validation of each hop.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { attempt: attemptBase({ fetchStatus: "ERROR", httpCode: res.status, error: "redirect without Location" }) };
        const next = new URL(loc, currentUrl).toString();
        const nextShape = validateUrlShape(next, deps.policy);
        if (!nextShape.ok) {
          return { attempt: attemptBase({ fetchStatus: "SSRF_BLOCKED", error: `redirect blocked: ${nextShape.reason}` }) };
        }
        currentUrl = next;
        continue;
      }

      const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!res.ok) {
        return { attempt: attemptBase({ fetchStatus: "SOURCE_UNAVAILABLE", httpCode: res.status, error: `HTTP ${res.status}` }), finalUrl: currentUrl, contentType };
      }
      if (contentType && !(FETCH_CONTENT_TYPE_ALLOWLIST as readonly string[]).includes(contentType)) {
        return { attempt: attemptBase({ fetchStatus: "UNSUPPORTED_CONTENT_TYPE", httpCode: res.status, error: `content-type ${contentType}` }), finalUrl: currentUrl, contentType };
      }

      // Size-capped read (decompression handled by fetch; cap the result).
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared && declared > maxBytes) {
        return { attempt: attemptBase({ fetchStatus: "TOO_LARGE", httpCode: res.status, error: `content-length ${declared}` }), finalUrl: currentUrl, contentType };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        return { attempt: attemptBase({ fetchStatus: "TOO_LARGE", httpCode: res.status, error: `body ${buf.byteLength} bytes` }), finalUrl: currentUrl, contentType };
      }

      return {
        attempt: attemptBase({ fetchStatus: "OK", httpCode: res.status }),
        body: buf,
        contentType,
        finalUrl: currentUrl,
      };
    } catch (err) {
      const c = classifyFetchError(err);
      return { attempt: attemptBase({ fetchStatus: c.status, egressDenied: c.egressDenied, proxyCode: c.proxyCode, error: c.message }) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { attempt: attemptBase({ fetchStatus: "ERROR", error: "too many redirects" }) };
}

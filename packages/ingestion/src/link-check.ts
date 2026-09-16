/**
 * Does this link actually work?
 *
 * Written after a plain complaint: too many published links 404. A URL sitting
 * in a YAML file or a card proves only that somebody typed it. This module is
 * how a URL stops being a claim and becomes a checked fact — and, like every
 * other fact here, it carries when it was checked, because a link verified in
 * March says nothing about today.
 *
 * Deliberately conservative about what counts as broken. A 403 or a 429 means
 * the server refused US, not that the page is gone; calling that a dead link
 * would send someone to fix something that is not broken.
 */

export const LINK_STATUSES = [
  /** Resolved, 2xx. */
  "OK",
  /** Resolved after a redirect — worth knowing, not a fault. */
  "REDIRECTED",
  /** 404 or 410: the page is genuinely gone. */
  "DEAD",
  /** 401/403/429: the server refused us. The link may be perfectly fine. */
  "REFUSED",
  /** 5xx: the server is broken, not the link. */
  "SERVER_ERROR",
  /** DNS failure, TLS failure, timeout. */
  "UNREACHABLE",
  /** Our own egress policy blocked it — says nothing about the URL. */
  "BLOCKED_BY_POLICY",
  /** Not a URL we are willing to fetch (scheme, private address). */
  "REFUSED_TO_FETCH",
] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export interface LinkCheckResult {
  url: string;
  status: LinkStatus;
  httpCode: number | null;
  /** Where it ended up, when that differs from where it started. */
  finalUrl: string | null;
  checkedAt: string;
  durationMs: number;
  note: string;
}

/** Only these statuses mean "this link is broken and someone must fix it". */
export function isBroken(status: LinkStatus): boolean {
  return status === "DEAD" || status === "UNREACHABLE" || status === "REFUSED_TO_FETCH";
}

/** Whether the check told us anything at all about the URL. */
export function isConclusive(status: LinkStatus): boolean {
  return status !== "BLOCKED_BY_POLICY" && status !== "SERVER_ERROR";
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|0\.0\.0\.0)/i;

export function classify(httpCode: number, redirected: boolean): { status: LinkStatus; note: string } {
  if (httpCode >= 200 && httpCode < 300) {
    return redirected
      ? { status: "REDIRECTED", note: "resolves, after a redirect" }
      : { status: "OK", note: "resolves" };
  }
  if (httpCode === 404 || httpCode === 410) return { status: "DEAD", note: `HTTP ${httpCode} — the page is gone` };
  if (httpCode === 401 || httpCode === 403 || httpCode === 429) {
    return {
      status: "REFUSED",
      note: `HTTP ${httpCode} — the server refused us, which is not the same as the link being broken`,
    };
  }
  if (httpCode >= 500) return { status: "SERVER_ERROR", note: `HTTP ${httpCode} — the server is failing, not the link` };
  return { status: "REFUSED", note: `HTTP ${httpCode}` };
}

export interface LinkCheckOptions {
  userAgent: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

/**
 * Check one URL. HEAD first — it is the polite request for "does this exist" —
 * falling back to GET, because a surprising number of servers reject HEAD.
 */
export async function checkLink(url: string, opts: LinkCheckOptions): Promise<LinkCheckResult> {
  const started = Date.now();
  const now = opts.now ?? (() => new Date().toISOString());
  const base = { url, checkedAt: now(), durationMs: 0, finalUrl: null as string | null };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ...base, status: "REFUSED_TO_FETCH", httpCode: null, note: "not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ...base, status: "REFUSED_TO_FETCH", httpCode: null, note: `unsupported scheme ${parsed.protocol}` };
  }
  if (PRIVATE_HOST.test(parsed.hostname)) {
    return { ...base, status: "REFUSED_TO_FETCH", httpCode: null, note: "private or loopback address" };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const attempt = async (method: "HEAD" | "GET"): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      return await doFetch(url, {
        method,
        redirect: "follow",
        headers: { "user-agent": opts.userAgent, accept: "*/*" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await attempt("HEAD");
    // Some servers answer HEAD with 405/501 and are perfectly alive on GET.
    if (res.status === 405 || res.status === 501 || res.status === 403) res = await attempt("GET");

    const finalUrl = res.url && res.url !== url ? res.url : null;
    const { status, note } = classify(res.status, !!finalUrl);
    return { ...base, status, httpCode: res.status, finalUrl, note, durationMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const policyBlocked = /403|egress|tunnel|proxy|CONNECT/i.test(message);
    return {
      ...base,
      status: policyBlocked ? "BLOCKED_BY_POLICY" : "UNREACHABLE",
      httpCode: null,
      note: policyBlocked
        ? `our own egress policy blocked the request — this says nothing about the URL: ${message}`
        : message,
      durationMs: Date.now() - started,
    };
  }
}

/** Check many URLs with a small concurrency, politely. */
export async function checkLinks(
  urls: readonly string[],
  opts: LinkCheckOptions & { concurrency?: number },
): Promise<LinkCheckResult[]> {
  const unique = [...new Set(urls.filter(Boolean))];
  const results: LinkCheckResult[] = [];
  const concurrency = Math.max(1, opts.concurrency ?? 4);

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map((u) => checkLink(u, opts)))));
  }
  return results;
}

/**
 * Before believing anything a link check says, establish that this machine can
 * reach the open web at all.
 *
 * Without this the checker is dangerous rather than merely useless: run from a
 * restricted network it reported 45 perfectly good URLs as "the server refused
 * us" and two as unreachable — attributing our own egress policy to other
 * people's websites, which is precisely the mistake a verification tool must
 * never make. A canary turns that into "the check did not happen", which is
 * true and actionable.
 *
 * The canaries are deliberately dull, stable and unrelated to anything OIA
 * watches: if THEY cannot be reached, nothing else about this run means
 * anything.
 */
export const EGRESS_CANARIES = ["https://example.com", "https://www.iana.org"] as const;

export interface EgressProbe {
  reachable: boolean;
  evidence: string;
}

export async function probeEgress(opts: LinkCheckOptions): Promise<EgressProbe> {
  const results = await Promise.all(EGRESS_CANARIES.map((url) => checkLink(url, opts)));
  const reachable = results.some((r) => r.status === "OK" || r.status === "REDIRECTED");
  return {
    reachable,
    evidence: results.map((r) => `${r.url} → ${r.status}${r.httpCode ? ` (${r.httpCode})` : ""}`).join("; "),
  };
}

export interface LinkReport {
  checked: number;
  ok: number;
  broken: LinkCheckResult[];
  refused: LinkCheckResult[];
  inconclusive: LinkCheckResult[];
}

export function summarise(results: readonly LinkCheckResult[]): LinkReport {
  return {
    checked: results.length,
    ok: results.filter((r) => r.status === "OK" || r.status === "REDIRECTED").length,
    broken: results.filter((r) => isBroken(r.status)),
    refused: results.filter((r) => r.status === "REFUSED"),
    inconclusive: results.filter((r) => !isConclusive(r.status)),
  };
}

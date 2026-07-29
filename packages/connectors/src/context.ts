import { createHash } from "node:crypto";
import type { PolicyHooks } from "@oia/audit";
import type { ConnectorContext, FetchedEvidence } from "./types";

export class PolicyDeniedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`fetch denied by policy: ${url} (${reason})`);
    this.name = "PolicyDeniedError";
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Minimal HTML→text normalization for V0. Sufficient for corroborating that a
 * deadline/status string appears in the source. A maintained extractor
 * (Readability/turndown) is a P2 upgrade — see docs/architecture/01.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ContextDeps {
  policy: PolicyHooks;
  log?: (event: string, data?: unknown) => void;
  env: ConnectorContext["env"];
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Build a ConnectorContext with a polite, policy-checked, hash-pinning fetcher.
 * Callers that catch PolicyDeniedError should record a `policy_denied` audit event.
 */
export function createConnectorContext(deps: ContextDeps): ConnectorContext {
  const log = deps.log ?? (() => {});
  const doFetch = deps.fetchImpl ?? fetch;

  const fetchText = async (url: string): Promise<FetchedEvidence> => {
    const decision = await deps.policy.canFetch(url);
    if (!decision.allowed) {
      throw new PolicyDeniedError(url, decision.reason ?? "denied");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.env.timeoutMs);
    let fetchedAtIso: string;
    try {
      const res = await doFetch(url, {
        headers: { "user-agent": deps.env.userAgent, accept: "text/html,*/*" },
        signal: controller.signal,
      });
      const contentType = res.headers.get("content-type") ?? undefined;
      const body = await res.text();
      const text = contentType?.includes("text/html") ? htmlToText(body) : body.trim();
      fetchedAtIso = new Date().toISOString();
      log("source_fetched", { url, status: res.status });
      return {
        url,
        httpStatus: res.status,
        fetchedAt: fetchedAtIso,
        contentType,
        text,
        contentHash: sha256(text),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  return { fetchText, policy: deps.policy, log, env: deps.env };
}

import type { PolicyHooks, PolicyDecision } from "./types";

export interface PolicyConfig {
  /** Hostnames (or suffixes) allowed for automated fetching. Fail-closed: empty = deny all. */
  fetchAllowlist: string[];
  /**
   * Actions the pipeline may set autonomously. PURSUE is intentionally excluded
   * by default in V0 — it requires human sign-off (OD-6).
   */
  autoRecommendActions: string[];
}

export const DEFAULT_POLICY: PolicyConfig = {
  fetchAllowlist: [
    "api.tech.ec.europa.eu", // EU Funding & Tenders SEDIA API
    "ec.europa.eu",
    "europa.eu",
  ],
  autoRecommendActions: ["CONSIDER", "MONITOR", "DISCARD"], // NOT "PURSUE"
};

function hostAllowed(host: string, allowlist: string[]): boolean {
  return allowlist.some((a) => host === a || host.endsWith(`.${a}`));
}

/**
 * Fail-closed policy. Anything not explicitly permitted is denied, and denials
 * are meant to be recorded by the caller as a `policy_denied` audit event.
 */
export function createPolicy(config: PolicyConfig = DEFAULT_POLICY): PolicyHooks {
  return {
    async canFetch(url: string): Promise<PolicyDecision> {
      let host: string;
      try {
        host = new URL(url).host;
      } catch {
        return { allowed: false, reason: `invalid url: ${url}` };
      }
      if (!hostAllowed(host, config.fetchAllowlist)) {
        return { allowed: false, reason: `host not in fetch allow-list: ${host}` };
      }
      return { allowed: true };
    },

    async canAutoRecommend(action: string): Promise<PolicyDecision> {
      if (!config.autoRecommendActions.includes(action)) {
        return {
          allowed: false,
          reason: `action "${action}" requires human sign-off`,
        };
      }
      return { allowed: true };
    },
  };
}

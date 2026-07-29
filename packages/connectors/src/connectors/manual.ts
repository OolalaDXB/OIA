import type {
  ConnectorContext,
  FetchedEvidence,
  RawOpportunity,
  SourceConnector,
} from "../types";

export const MANUAL_KEY = "manual";

/**
 * Manual connector: opportunities are entered by an operator (e.g. a URL an
 * analyst found). `discover` returns nothing; the operator seeds RawOpportunity
 * rows directly. `fetch` still hash-pins the primary source so corroboration and
 * the PURSUE gate work identically to automated sources.
 */
export const manualConnector: SourceConnector = {
  key: MANUAL_KEY,
  kind: "manual",
  async discover(): Promise<RawOpportunity[]> {
    return [];
  },
  async fetch(ctx: ConnectorContext, url: string): Promise<FetchedEvidence> {
    return ctx.fetchText(url);
  },
};

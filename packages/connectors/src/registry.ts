import type { SourceConnector } from "./types";
import { euFundingTendersConnector } from "./connectors/eu-funding-tenders";
import { manualConnector } from "./connectors/manual";

/** All connectors available in V0, keyed by their `key`. */
const CONNECTORS: SourceConnector[] = [euFundingTendersConnector, manualConnector];

const registry = new Map<string, SourceConnector>(CONNECTORS.map((c) => [c.key, c]));

export function getConnector(key: string): SourceConnector | undefined {
  return registry.get(key);
}

export function listConnectors(): SourceConnector[] {
  return [...registry.values()];
}

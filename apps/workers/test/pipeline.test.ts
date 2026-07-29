import { describe, it, expect } from "vitest";
import { createFakeProvider } from "@oia/providers";
import { createPolicy, createMemoryAuditSink } from "@oia/audit";
import type { ProjectProfile } from "@oia/database";
import type {
  ConnectorContext,
  FetchedEvidence,
  RawOpportunity,
  SourceConnector,
} from "@oia/connectors";
import { runPipeline } from "../src/pipeline";
import { createMemoryPersistence } from "../src/persistence.memory";

const project: ProjectProfile = {
  slug: "bawaba",
  name: "BAWABA",
  legalEntities: [{ name: "Oolala France SAS", jurisdiction: "FR", role: "applicant" }],
  sectors: ["creative industries", "AI"],
  geographies: ["EU", "FR"],
  stage: "growth",
  fundingTypes: ["grant"],
  keywords: ["creative", "AI"],
  exclusions: ["defence"],
};

const openOpp: RawOpportunity = {
  sourceKey: "fake",
  externalId: "CALL-1",
  title: "AI for Creative Industries",
  url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/call-1",
  discoveredAt: "2026-07-29T00:00:00.000Z",
  hints: {
    programmeName: "Horizon Europe",
    funder: "European Commission",
    deadlineAt: "2026-09-15T17:00:00+02:00",
    status: "open",
    summary: "AI creative industries.",
    currency: "EUR",
  },
  raw: {},
};

const evidence: FetchedEvidence = {
  url: openOpp.url,
  httpStatus: 200,
  fetchedAt: "2026-07-29T00:00:00.000Z",
  contentType: "text/html",
  text: "This call is open for submission. Deadline: 2026-09-15. AI for creative industries in the EU.",
  contentHash: "hash-1",
};

const fakeConnector: SourceConnector = {
  key: "fake",
  kind: "official_programme",
  async discover(): Promise<RawOpportunity[]> {
    return [openOpp];
  },
  async fetch(_ctx: ConnectorContext, _url: string): Promise<FetchedEvidence> {
    return evidence;
  },
};

const provider = createFakeProvider({
  assess_eligibility: () => ({
    verdict: "eligible",
    criteria: [{ criterion: "EU applicant", met: true }],
  }),
});

const ctx: ConnectorContext = {
  fetchText: async () => evidence,
  policy: createPolicy(),
  log: () => {},
  env: { euFtApiKey: "SEDIA", euFtBaseUrl: "https://x", userAgent: "t", timeoutMs: 1000 },
};

describe("runPipeline (end-to-end, in-memory)", () => {
  it("produces a shortlist and persists a qualified opportunity with a recommendation", async () => {
    const persistence = createMemoryPersistence();
    const audit = createMemoryAuditSink();

    const summary = await runPipeline({
      project,
      projectId: "proj-1",
      sources: [{ id: "src-1", connectorKey: "fake", kind: "official_programme" }],
      ctx,
      provider,
      policy: createPolicy(),
      audit,
      persistence,
      confidenceFloor: 70,
      getConnector: (key) => (key === "fake" ? fakeConnector : undefined),
    });

    expect(summary.discovered).toBe(1);
    expect(summary.qualified).toBe(1);
    expect(summary.errors).toBe(0);

    // Gate passes → policy downgrades PURSUE to CONSIDER (human sign-off, OD-6).
    expect(summary.byAction["CONSIDER"]).toBe(1);

    const record = persistence.records[0]!;
    expect(record.result.gate.passed).toBe(true);
    // Every confirmed fact cites evidence.
    for (const c of record.result.claims.filter((x) => x.claimType === "confirmed_official_fact")) {
      expect(c.citesEvidence).toBe(true);
    }
    // Audit trail recorded the fetch and the recommendation.
    expect(audit.events.map((e) => e.eventType)).toContain("recommendation_set");
    expect(audit.events.map((e) => e.eventType)).toContain("source_fetched");
  });
});

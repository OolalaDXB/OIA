# 6. Interfaces

**Proposed TypeScript contracts — not implemented.** These define the seams that
keep vendors and pipeline stages swappable. Concrete types (`Zod`-derived) live
in the noted packages once approved. Shown here as reference signatures.

Convention: every boundary type has a matching Zod schema; the TS type is
`z.infer<typeof Schema>`. External input is parsed, never trusted.

---

## 6.1 Source connectors — `packages/connectors`

A connector knows how to *discover* candidate opportunities from one family of
sources and *fetch* a single item's primary evidence. It does **not** score,
classify, or call an LLM.

```ts
export interface RawOpportunity {
  sourceKey: string;            // which connector produced it
  externalId: string;          // stable id within the source (for dedup)
  title: string;
  url: string;                 // canonical primary link
  discoveredAt: string;        // ISO timestamp
  raw: unknown;                // untyped source payload, Zod-parsed downstream
}

export interface FetchedEvidence {
  url: string;
  httpStatus: number;
  fetchedAt: string;
  contentType?: string;
  text: string;                // extracted, normalized text/markdown
  contentHash: string;         // sha256 of `text`
}

export interface SourceConnector {
  readonly key: string;                 // e.g. 'eu-funding-tenders', 'gcc-programmes'
  readonly kind: 'official_programme' | 'aggregator' | 'manual';

  /** Discover candidate opportunities for a project profile. */
  discover(ctx: ConnectorContext, project: ProjectProfile): Promise<RawOpportunity[]>;

  /** Fetch and normalize the primary source for one opportunity. */
  fetch(ctx: ConnectorContext, url: string): Promise<FetchedEvidence>;

  /** Optional: check whether a known opportunity is still open. */
  checkStatus?(ctx: ConnectorContext, url: string): Promise<{
    status: 'open' | 'upcoming' | 'closed' | 'unknown';
    deadlineAt?: string;
  }>;
}

export interface ConnectorContext {
  fetchText(url: string): Promise<FetchedEvidence>;   // shared polite fetcher
  policy: PolicyHooks;                                 // may this URL be fetched?
  log: (event: string, data?: unknown) => void;
}
```

**Registry:** connectors self-register under `key`; `sources.connector_key`
selects one. Adding a source family = adding one file, no pipeline change.

---

## 6.2 LLM providers — `packages/providers`

Provider-neutral. The pipeline asks for *structured extraction against a Zod
schema*; the provider adapter handles model-specific JSON/tool calling. One
default provider in V0; **no multi-model routing.**

```ts
export interface LLMProvider {
  readonly name: string;                // 'anthropic' | 'openai' | ... (neutral)
  readonly defaultModel: string;

  /** Extract a value matching `schema`. Returns parsed data + run metadata. */
  extract<T>(req: {
    schema: ZodType<T>;
    system: string;
    input: string;                      // source text / context
    model?: string;
    purpose: string;                    // logged to llm_runs.purpose
  }): Promise<LLMResult<T>>;
}

export interface LLMResult<T> {
  data: T;
  run: {
    provider: string;
    model: string;
    promptHash: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
}
```

Every call produces an `llm_runs` row (via the audit hook). The provider is
chosen once by config; swapping it is a one-line change and never touches
pipeline logic. The model **extracts and proposes only** — it cannot mark a
claim as `confirmed_official_fact` (that is decided by deterministic
corroboration).

---

## 6.3 Project profiles — `packages/intelligence` (types) / `packages/database`

The structured description of a project (BAWABA) used for relevance and
eligibility matching. Stored in `projects.profile` (jsonb), validated by Zod.

```ts
export interface ProjectProfile {
  slug: string;                 // 'bawaba'
  name: string;
  legalEntities: Array<{
    name: string;               // e.g. 'Oolala France SAS'
    jurisdiction: string;       // 'FR' | 'AE' | ...
    role: 'applicant' | 'partner' | 'beneficiary';
  }>;
  sectors: string[];
  geographies: string[];        // eligible/target regions: EU, FR, GCC, AE...
  stage: string;                // 'seed' | 'growth' | 'r&d' | ...
  fundingTypes: string[];       // 'grant' | 'equity' | 'prize' | 'loan' ...
  amountRange?: { min?: number; max?: number; currency: string };
  keywords: string[];           // positive relevance signals
  exclusions: string[];         // hard disqualifiers
}
```

BAWABA's concrete values are an input to Milestone 1 (see assumptions doc).
EU/FR programmes (via Oolala France SAS) and GCC programmes (via Oolala Next
FZ-LLC) are the expected primary source families.

---

## 6.4 Opportunity qualification — `packages/intelligence`

The orchestration that turns a `RawOpportunity` + `FetchedEvidence` into typed
claims, an eligibility assessment, scores and a gated recommendation. Pure
orchestration; delegates scoring to `packages/scoring` and facts to
deterministic corroboration.

```ts
export interface Claim {
  claimType:
    | 'confirmed_official_fact'
    | 'extracted'
    | 'inference'
    | 'recommendation'
    | 'unresolved_uncertainty';
  field: string;                // 'deadline' | 'eligibility.geography' | ...
  valueText?: string;
  valueJson?: unknown;
  evidenceId?: string;          // REQUIRED when claimType === 'confirmed_official_fact'
  confidence: number;           // 0..1
  producedBy: string;           // 'pipeline' | 'llm:<provider>' | 'human:<id>'
}

export interface QualificationResult {
  claims: Claim[];
  eligibility: {
    verdict: 'eligible' | 'likely' | 'ineligible' | 'unknown';
    criteria: Array<{ criterion: string; met: boolean | null; note?: string; evidenceId?: string }>;
    rationale?: string;
  };
  scores: OpportunityScores;    // see scoring doc
  recommendation: {
    action: 'PURSUE' | 'CONSIDER' | 'MONITOR' | 'DISCARD';
    nextAction?: string;        // REQUIRED for PURSUE
    gatePassed: boolean;
    gateReport: GateReport;     // per-precondition pass/fail
    rationale?: string;
  };
}

export interface Qualifier {
  qualify(input: {
    project: ProjectProfile;
    opportunity: RawOpportunity;
    evidence: FetchedEvidence;
    provider: LLMProvider;
    policy: PolicyHooks;
    audit: AuditSink;
  }): Promise<QualificationResult>;
}
```

Fact corroboration is deterministic: e.g. a `deadline` becomes a
`confirmed_official_fact` only if the parsed date string is present in the
evidence text and the page is reachable; otherwise it stays `extracted` or
`unresolved_uncertainty`.

---

## 6.5 Scoring — `packages/scoring`

See `05-scoring-model.md`. Pure functions, no I/O.

```ts
export interface OpportunityScores {
  relevance: number;        // 0..100
  eligibility: number;      // 0..100
  winPotential: number;     // 0..100
  infoConfidence: number;   // 0..100
  modelVersion: string;
  breakdown: Record<string, number>;
}

export function scoreOpportunity(ctx: ScoringInput): OpportunityScores;
export function evaluateGate(ctx: GateInput): GateReport;   // the PURSUE gate
```

---

## 6.6 Policy & audit hooks — `packages/audit`

Cross-cutting. Policy hooks are **fail-closed** gates on side effects; the audit
sink is append-only.

```ts
export interface PolicyHooks {
  /** May this URL be fetched? (robots, allow-list, rate policy) */
  canFetch(url: string): Promise<{ allowed: boolean; reason?: string }>;
  /** May this opportunity be auto-set to PURSUE without human sign-off? */
  canAutoRecommend(action: string, ctx: unknown): Promise<{ allowed: boolean; reason?: string }>;
}

export interface AuditSink {
  record(event: {
    eventType:
      | 'source_fetched' | 'opportunity_created' | 'opportunity_scored'
      | 'gate_evaluated' | 'recommendation_set' | 'human_override'
      | 'policy_denied' | 'llm_call';
    actor: string;                 // 'pipeline' | 'human:<uid>' | 'policy'
    opportunityId?: string;
    projectId?: string;
    payload?: unknown;
  }): Promise<void>;
}
```

Every gate evaluation, recommendation, LLM call, and human override is recorded.
A denied policy check stops the side effect and writes a `policy_denied` audit
event — it never silently proceeds.

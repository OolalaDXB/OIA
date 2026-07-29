# 7. Initial Scoring Model

Four **independent** scores (0–100), plus a separate **hard gate** for `PURSUE`.
Scores rank; the gate decides actionability. A high score can **never** override
a failed gate.

All scoring is **pure functions** in `packages/scoring` (`model_version` stored
with each result so scores are reproducible and comparable over time).

## The four scores

### 1. Relevance — "is this the right kind of opportunity for this project?"
Match between the opportunity and the `ProjectProfile`.

| Factor | Weight |
|--------|-------:|
| Sector / theme overlap (keywords, sector list) | 0.35 |
| Geography eligibility overlap (EU/FR/GCC…) | 0.25 |
| Funding type match (grant/equity/prize…) | 0.20 |
| Amount within project's usable range | 0.10 |
| Stage fit | 0.10 |
| **Hard penalty:** any `exclusions` term present | → clamp to ≤ 20 |

### 2. Eligibility — "can this project actually apply and qualify?"
Derived from `eligibility_assessments`.

| Verdict | Base |
|---------|-----:|
| `eligible` (all key criteria met) | 90–100 |
| `likely` (met, minor unknowns) | 60–85 |
| `unknown` (criteria unresolved) | 30–50 |
| `ineligible` (any hard criterion failed) | 0–15 |

Each unresolved criterion lowers the score and is surfaced as an
`unresolved_uncertainty` claim.

### 3. Win potential — "if we apply, how likely to succeed?"
Softer, judgement-heavy; explicitly the least certain score.

| Factor | Weight |
|--------|-------:|
| Fit strength beyond bare eligibility (mission alignment) | 0.30 |
| Competition / selectivity signal (if known) | 0.20 |
| Amount vs effort ratio | 0.20 |
| Track-record / precedent fit for the entity | 0.20 |
| Timing headroom before deadline | 0.10 |

Where inputs are unknown, the factor contributes a neutral mid value **and** the
uncertainty is reflected in score #4 — win potential does not silently invent
confidence.

### 4. Information confidence — "how much do we trust what we know?"
A meta-score over the **claims**, independent of the other three.

| Factor | Effect |
|--------|--------|
| Share of key fields backed by `confirmed_official_fact` (with evidence) | primary driver ↑ |
| Presence & reachability of `primary_evidence` | ↑ |
| Recency of evidence (`fetched_at`) | ↑ |
| Count of `inference` / `unresolved_uncertainty` on key fields | ↓ |
| Source `kind` (`official_programme` > `aggregator` > `manual`) | weighting |

Key fields = { deadline, open status, eligibility, funder, amount, primary_url }.

## The `PURSUE` gate (hard, boolean, audited)

`evaluateGate()` returns a `GateReport` — a per-precondition pass/fail. `PURSUE`
requires **every** precondition to pass. This is also enforced as a DB constraint.

```ts
interface GateReport {
  accessiblePrimarySource: boolean;   // reachable, hash-pinned evidence exists
  verifiedDeadline: boolean;          // deadline_at set AND corroborated in evidence
  confirmedOpen: boolean;             // deadline_status === 'open'
  eligibilityAssessed: boolean;       // verdict ∈ {eligible, likely} with criteria
  exactNextAction: boolean;           // non-empty, concrete next_action present
  sufficientConfidence: boolean;      // infoConfidence >= CONFIDENCE_FLOOR
  passed: boolean;                    // AND of all the above
  failedReasons: string[];
}
```

Default `CONFIDENCE_FLOOR = 70` (tunable; stored in `packages/config`).

## Mapping to recommendation actions

| Condition | Action |
|-----------|--------|
| Gate `passed === true` | **`PURSUE`** |
| Relevant + eligible/likely, but gate fails on evidence/confidence/deadline | **`CONSIDER`** (with the exact missing precondition surfaced) |
| Relevant but not currently open, or eligibility unknown pending a future window | **`MONITOR`** |
| Irrelevant or `ineligible`, or hard exclusion hit | **`DISCARD`** |

## Ranking

Shortlist ordering (operator-facing) is **not** a single blended number by
default; it is a lexicographic sort that respects the trust rule:

1. `PURSUE` before `CONSIDER` before `MONITOR` (DISCARD hidden by default),
2. then by `eligibility` desc,
3. then by `relevance` desc,
4. then by `winPotential` desc,
5. tie-break `infoConfidence` desc, nearer deadline first.

A blended composite is available as a secondary view but is never what promotes
an item to `PURSUE`.

## Why four separate scores instead of one

Collapsing them hides *why* an opportunity ranks where it does. An operator must
be able to see "highly relevant but we can't verify it's open" (high relevance,
low info-confidence → `CONSIDER`, not `PURSUE`). Separation is the mechanism that
keeps the shortlist honest.

## Tuning & versioning

Weights and the confidence floor live in `packages/config` and are stamped into
`opportunity_scores.model_version`. Changing them creates a new version; old
scores remain comparable to their own version. V0 ships v1 defaults above;
calibration against real BAWABA results is a Milestone-1 exit activity.

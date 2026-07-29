# ADR 0002 — Milestone 0: Real Sources + evidence-first ingestion

- **Status:** Proposed (feature branch `milestone-0-real-sources`; not merged)
- **Date:** 2026-07-29
- **Supersedes/extends:** ADR 0001 (V0 architecture)

## Context

Milestone 0 must prove OIA Funding can process **real, messy, official** funding
sources from ingestion to evidence-backed human review. Fixture-based tests are
explicitly **not** evidence that the live pipeline works. Two environmental
realities shape this ADR:

1. **Egress is blocked.** Every external official domain (Hub71, Bpifrance,
   ec.europa.eu, QDB, NSF) returns a proxy `403` (organizational egress denial).
   Live fetching is impossible here; only honest `BLOCKED` results are produced.
2. **Seed dataset is authoritative-looking but untrusted.** Seed `expected_*`
   fields are hypotheses to test, not facts.

## Decisions

### D1 — Real official content enters as local files, live fetch is still attempted
Official PDFs / saved HTML are supplied via a manifest and processed as
`OFFICIAL_PDF` / `MANUAL_DOCUMENT`. For each, the pipeline **also attempts the
live `originalUrl`** and records the (BLOCKED) result **separately**. A local
file is never presented as a successful live fetch (spec §3).

### D2 — Verification is deterministic and caps at MANUAL_REVIEW_REQUIRED
A source is never `VERIFIED` because a name resembles a domain. Automated
verification ceilings at `MANUAL_REVIEW_REQUIRED`; only an explicit human
confirmation of the issuer↔domain relationship reaches `VERIFIED`. Aggregators /
blogs / newsletters can create a lead but never independently produce `VERIFIED`
or `PURSUE` (spec §7).

### D3 — Provenance is fact-level, not a single summary
Every material fact carries: field, normalized value, original source text,
classification (`CONFIRMED_OFFICIAL` / `EXTRACTED_FROM_OFFICIAL_SOURCE` /
`INFERRED` / `USER_PROVIDED` / `UNKNOWN`), source artifact id, **source locator**
(HTML heading / CSS selector / PDF page / …), extraction method, provider+model,
confidence, validation result, reviewer correction, audit id. Inferred values
never overwrite official ones; conflicting official values are preserved as
conflicts (spec §8).

### D4 — Application eligibility and award eligibility are separate axes
`ApplicationEligibility` (can we apply today?) and `AwardEligibility` (what must
exist before onboarding/payment?) are assessed independently; `StrategicRoute` is
a **derived** convenience that never hides the two inputs. The engine returns
`UNKNOWN` rather than guessing (spec §3).

### D5 — Corrected entity inventory; PLANNED/HYPOTHETICAL are never active
Only Oolala Next FZ-LLC and Oolala France SAS are `ACTIVE`. The dedicated BAWABA
entity is `PLANNED` (jurisdiction UNDECIDED — no hard-coded ADGM). An EU/FR
opportunity is not auto-routed to "new entity" because Oolala France SAS already
exists (spec §2).

### D6 — Deterministic deadline & gate rules; PURSUE needs a human
"confirm/TBC" deadlines can't be verified; expired/closed can't be PURSUE;
missing deadline blocks PURSUE unless the source states rolling; conflicts force
review. `PURSUE` is unreachable without a human-`VERIFIED` source, so the
automated run ceilings at `INVESTIGATE`. Human `APPROVE` can promote to PURSUE
**only** when every hard gate already passes — it never bypasses a failed
condition (spec §9, §15).

### D7 — SEDIA reclassified EXPERIMENTAL_UNVERIFIED
See `docs/connectors/sedia-experimental-status.md`. Not used for Milestone 0.

### D8 — No headless browser (stop-for-review)
Adding Chromium would materially change the deployment (size, base image,
security surface). SPAs are represented by official saved pages/PDFs and detected
+ logged explicitly; we never silently render (spec §6).

### D9 — Local persistence only; no production Supabase
Outputs are written to `outputs/milestone-0/*` (json + markdown). The review
console (built only after the first real run) reads these directly (spec §17).

## Consequences

- Trustworthy by construction: evidence, locators, and the human-only path to
  VERIFIED/PURSUE are structural.
- In this environment the acceptance criterion "≥1 live static source processed
  **by fetch**" is satisfied via **local official artifacts**, with live fetch
  honestly recorded as BLOCKED. A true live fetch requires an egress-permitted
  environment.
- More packages/models than a scraper, by design.

## Status of acceptance criteria in this environment

Deferred until the seed + official artifacts are supplied: the ten-record
validation, the real artifact run, discrepancy reports, and the console. The
unblocked spine, models, security, verification, provenance, eligibility model,
and gate are implemented and tested now.

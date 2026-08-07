# Sprint 1 — TED discovery plan (interface, mapping, tests, risks)

Plan-only. No worker code until Mickaël validates. See ADR 0003 and
`docs/connectors/ted-api-contract.md`.

---

## 3. Connector interface (reuse, don't redefine)

We **reuse the existing** `SourceConnector` from `@oia/connectors` — it already
is "a discovery method returning raw candidates":

```ts
interface SourceConnector {
  readonly key: string;                 // "ted"
  readonly kind: SourceKind;            // "official_programme"
  discover(ctx: ConnectorContext, project: ProjectProfile): Promise<RawOpportunity[]>;
  fetch(ctx: ConnectorContext, url: string): Promise<FetchedEvidence>;
  checkStatus?(...): Promise<StatusResult>;
}
```

- **TED is a new implementation** `tedConnector: SourceConnector` (`key: "ted"`).
- Candidates are the **existing `RawOpportunity`** — no new DTO.
- SAM/UK/SEDIA (Sprint 2) implement the **same** interface; nothing is redefined.

**One design point (not a schema change):** TED discovery is driven by a
**query** (CPV codes + countries + date window), not by free-text keywords alone.
Options that avoid touching the interface:
- derive the query from `ProjectProfile` (BAWABA sectors → CPV codes via a small
  lookup table in the connector), and/or
- pass a per-run query via `ConnectorContext` config.

Recommended: a **sector→CPV lookup** inside the TED connector, seeded from the
BAWABA profile. This is connector-local data, not a schema change.

---

## 4. Mapping — TED notice → existing candidate (`RawOpportunity`)

| RawOpportunity field | TED source | Provenance locator |
|---|---|---|
| `sourceKey` | `"ted"` | — |
| `externalId` | `publication-number` | `JSON_PATH: publication-number` |
| `title` | `notice-title` | `JSON_PATH: notice-title` |
| `url` (**primary source**) | `https://ted.europa.eu/en/notice/{publication-number}/html` | derived from `publication-number` |
| `discoveredAt` | run timestamp | — |
| `hints.funder` | `buyer-name` | `JSON_PATH: buyer-name` |
| `hints.deadlineAt` | `deadline` (ISO) | `JSON_PATH: deadline` |
| `hints.programmeName` | `notice-type` (e.g. "Contract notice") | `JSON_PATH: notice-type` |
| `hints.summary` | short title/desc if present | `JSON_PATH: …` |
| `raw` | the **full TED notice JSON** (retained verbatim) | — |
| **dedup key** | `ted:{publication-number}` | — |

### Two honest schema gaps (flagged, not bent)

`RawOpportunity.hints` has **no first-class slot for `country` or `CPV`**.
Rather than bend the model:
- both are **retained in `raw`** (nothing is lost), and
- both are **emitted as provenance-typed material facts** during verification
  (`field: "buyer_country"` / `field: "cpv"`, classification
  `EXTRACTED_FROM_OFFICIAL_SOURCE`, `JSON_PATH` locator) — which the existing
  `MaterialFact` model supports.

If you later want `country`/`cpv` as first-class hints, that's a **small,
additive** `RawOpportunity.hints` extension — **flagged for approval**, not done
unilaterally.

### Verification path (reuses M0 engine unchanged)

For each candidate: synthesize an in-memory manifest entry (`originalUrl` = the
canonical notice URL, `issuingOrganization` = `buyer-name`,
`officialDomain` = `ted.europa.eu`, `contentType` = `text/html`,
`sourceFormat` = `STATIC_HTML`, `expectedDocumentTitle` = `notice-title`) →
fetch the notice page → `ingestOfficialArtifact` → `verifySuppliedArtifact`.
`ted.europa.eu` is recognized as a government/supranational domain → status
**`MANUAL_REVIEW_REQUIRED`** (never `VERIFIED` without a human).

---

## 5. Test plan (categories kept separate)

- **FIXTURE_CONTRACT** — parse a **recorded, real** TED Search response
  (`packages/connectors/test/fixtures/ted-search-response.json`, captured
  verbatim from the first live call — never invented): assert
  `mapTedNotices()` yields the right candidates with correct fields + `JSON_PATH`
  provenance.
- **UNIT** — (a) dedup by `publication-number`; (b) the expert-query builder
  (sectors/CPV/country/date → query string); (c) canonical-URL construction.
- **LOCAL_INTEGRATION** — one mapped candidate + a **recorded notice-page HTML
  fixture** → existing engine → assert `verificationStatus ===
  MANUAL_REVIEW_REQUIRED`, facts carry provenance, **no `VERIFIED`**, and the
  official URL is preserved.
- **LIVE_SOURCE_SPIKE** (runs only with egress, not in sandbox) — the real run:
  query TED, discover ≥1 relevant notice **not hand-supplied**, normalize, run
  through the engine, store with provenance.

The status report will state counts **separately** (retrieved / retained /
qualified), and never merge fixture counts with live results.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **Quotas / rate limits** (undocumented) | small pages (≤100), `ITERATION` mode, polite backoff, cap total; honor any documented Swagger limit once confirmed. |
| **Total cap (15,000) / query too broad** | constrain by CPV + country + a recent `publication-date` window; `scope: ACTIVE`. |
| **Format / field-name changes** (eForms migration) | request explicit `fields`; **Zod-validate** the response; missing/renamed field → recorded as a gap, **never invented**. |
| **Notice languages** (multilingual) | Sprint 1 uses **structured API metadata + the official page** only; deep multilingual extraction is Sprint 4. |
| **Egress where the worker runs** | if the deploy target lacks egress, the run reports `ERROR`/`BLOCKED` honestly; live proof requires a real network target (Fly / your machine). |
| **Fixture authenticity** | the contract fixture is a **real recorded response**, captured from the first live call (or pasted by you) — **not fabricated**. |
| **Verification over-reach** | hard cap at `MANUAL_REVIEW_REQUIRED`; `ted.europa.eu` recognized as official domain but a human still closes `VERIFIED`. |

---

## Files this sprint WOULD create (after validation — not yet)

```
packages/connectors/src/connectors/ted.ts            # tedConnector (SourceConnector)
packages/connectors/src/ted/query.ts                 # expert-query builder (CPV/country/date)
packages/connectors/src/ted/map.ts                   # mapTedNotices() (pure)
packages/connectors/test/fixtures/ted-search-response.json   # REAL recorded response
packages/connectors/test/ted.contract.test.ts        # FIXTURE_CONTRACT + UNIT
apps/workers/src/discover-ted.ts                     # live worker CLI (egress) → outputs/sprint-1/*
apps/workers/test/ted-discovery.integration.test.ts  # LOCAL_INTEGRATION (recorded fixtures)
docs/... (this set)
outputs/sprint-1/{run-report.md,candidates.json}     # produced by the live run
```

No `apps/web` change. No business-schema change. Commits go directly to `main`.

**STOP — awaiting Mickaël's validation before writing the worker.**

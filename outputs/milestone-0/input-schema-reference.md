# Milestone 0 — Input schema reference

Authoritative description of the **exact** input formats required to unblock
Milestone 0. The Zod schemas below are copied verbatim from the repository, which
is the technical source of truth:

- Artifact manifest: `packages/ingestion/src/manifest.ts`
- Seed dataset: `packages/ingestion/src/seed-manifest.ts`

Draft research produced outside the repo may not match these; **these schemas
win**. Do not add fields the schemas do not define.

---

## Exact file locations

| Purpose | Path |
|---|---|
| Artifact manifest (you create) | `data/artifacts/manifest.json` |
| Supplied official files | `data/artifacts/<localFilename>` (next to the manifest) |
| Artifact manifest template | `data/artifacts/manifest.template.json` |
| Seed dataset (you create) | `data/seeds/bawaba-funding-opportunities.json` |
| Seed companion narrative | `data/seeds/bawaba-funding-opportunities.md` |
| Seed template | `data/seeds/bawaba-funding-opportunities.template.json` |
| Generated run outputs | `outputs/milestone-0/{opportunities.json,shortlist.md,rejections.md,discrepancies.md,run-report.md}` |
| Seed validation report | `outputs/milestone-0/seed-validation.md` |

`data/artifacts/manifest.json`, the supplied files, and
`data/seeds/bawaba-funding-opportunities.{json,md}` are git-ignored by default.

---

## 1. Artifact-manifest schema (verbatim)

```ts
export const ArtifactManifestEntrySchema = z.object({
  originalUrl: z.string().url(),
  issuingOrganization: z.string().min(1),
  officialDomain: z.string().min(1).optional(),
  retrievalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  localFilename: z.string().min(1),
  contentType: z.string().min(1),
  sourceFormat: z.enum(["STATIC_HTML", "CLIENT_RENDERED_SPA", "PDF"]),
  expectedDocumentTitle: z.string().min(1),
  applicationUrl: z.string().url().optional(),
});

export const ArtifactManifestSchema = z.object({
  version: z.literal(1),
  artifacts: z.array(ArtifactManifestEntrySchema).min(1),
});
```

Cross-field rule enforced by `validateManifest`: **duplicate `localFilename` is
an error**.

### Field definitions

| Field | Required | Meaning |
|---|---|---|
| `originalUrl` | yes | Official issuer URL the file was downloaded from; linked to the (BLOCKED) live-fetch attempt. |
| `issuingOrganization` | yes | Issuer name. |
| `officialDomain` | no | Issuer domain; if omitted, derived from `originalUrl` host. |
| `retrievalDate` | yes | `YYYY-MM-DD` you downloaded it. |
| `localFilename` | yes | File name relative to the manifest directory; unique. |
| `contentType` | yes | MIME type (see accepted values). |
| `sourceFormat` | yes | Your claim; classifier re-derives; mismatch → discrepancy. |
| `expectedDocumentTitle` | yes | Hypothesis used for content-consistency check. |
| `applicationUrl` | no | Application portal; host → `applicationDomain`. |

### Enums / accepted values

- `sourceFormat`: `STATIC_HTML` · `CLIENT_RENDERED_SPA` · `PDF`
- `contentType` accepted by the fetcher/classifier
  (`FETCH_CONTENT_TYPE_ALLOWLIST`): `text/html` · `application/xhtml+xml` ·
  `application/pdf` · `text/plain`

### Format representation

- **HTML** → `contentType: text/html`, `sourceFormat: STATIC_HTML`.
- **PDF** → `contentType: application/pdf`, `sourceFormat: PDF` (per-page
  extraction; PDF facts keep `PDF_PAGE` locators).
- **SPA captured as PDF** → the file is a PDF, so `contentType: application/pdf`,
  `sourceFormat: PDF`; SPA provenance is preserved via `originalUrl`. (Setting
  `sourceFormat: CLIENT_RENDERED_SPA` on a PDF file would trigger the
  classifier-vs-manifest mismatch warning.)

### Domain / URL linkage

- Issuer domain = `officialDomain` or host of `originalUrl`.
- Application domain = host of `applicationUrl`.
- Live linkage: ingestion attempts `originalUrl`, stores the result as
  `liveFetch` (BLOCKED here), and reports `live fetch` and
  `artifact processing` on separate lines.

---

## 2. Seed-dataset schema (verbatim)

```ts
export const SeedRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    issuer: z.string().min(1),
    officialUrl: z.string().url().optional(),
    discoveryUrl: z.string().url().optional(),
    applicationUrl: z.string().url().optional(),
    localArtifact: z.string().optional(),
    isAggregatorOnly: z.boolean().optional(),
    isClosedCall: z.boolean().optional(),
    expectedSourceFormat: z.enum(SOURCE_FORMAT).optional(),
    expectedVerificationStatus: z.enum(VERIFICATION).optional(),
    expectedApplicationEligibility: z.enum(APP_ELIG).optional(),
    expectedAwardEligibility: z.enum(AWARD_ELIG).optional(),
    expectedStrategicRoute: z.enum(STRATEGIC).optional(),
    expectedRecommendation: z.enum(RECOMMENDATION).optional(),
    expectedExtractedFacts: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional(),
  })
  .passthrough()
  .refine((r) => r.officialUrl || r.discoveryUrl || r.applicationUrl || r.localArtifact, {
    message: "record needs at least one of officialUrl / discoveryUrl / applicationUrl / localArtifact",
  });

export const SeedDatasetSchema = z.object({
  version: z.literal(1),
  records: z.array(SeedRecordSchema).min(1),
});
```

Cross-record rule enforced by `validateSeedDataset`: **duplicate `id` is an
error**. Records also pass through deterministic inconsistency checks (see
below).

### Field definitions

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable unique record id. |
| `title` | yes | Programme / lead title. |
| `issuer` | yes | Issuing organisation (or aggregator, for leads). |
| `officialUrl` | one of* | Issuer's primary source URL. |
| `discoveryUrl` | one of* | Where the lead was spotted (aggregator/search/social). |
| `applicationUrl` | one of* | Application portal URL. |
| `localArtifact` | one of* | `localFilename` in `data/artifacts/manifest.json`. |
| `isAggregatorOnly` | no | `true` → no confirmed facts, never VERIFIED/PURSUE. |
| `isClosedCall` | no | `true` → REJECT the call; downstream lead is separate. |
| `expected*` | no | **Hypotheses** to test (see enums). Omit or `UNKNOWN` = no assertion. |
| `expectedExtractedFacts` | no | Object of hypothesised facts (never confirmed). |
| `notes` | no | Free text; record open questions / uncertainties here. |

\* at least one of `officialUrl` / `discoveryUrl` / `applicationUrl` /
`localArtifact` is required.

### Enums / accepted values (verbatim)

- `expectedApplicationEligibility` (`APP_ELIG`): `ELIGIBLE_TO_APPLY_NOW` ·
  `ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY` · `ELIGIBLE_TO_APPLY_VIA_PARTNER` ·
  `ELIGIBLE_TO_APPLY_VIA_CONSORTIUM` · `NOT_CURRENTLY_ELIGIBLE_TO_APPLY` · `UNKNOWN`
- `expectedAwardEligibility` (`AWARD_ELIG`): `READY_FOR_AWARD` ·
  `REQUIRES_EXISTING_ENTITY_VALIDATION` · `REQUIRES_NEW_ENTITY` ·
  `REQUIRES_RELOCATION` · `REQUIRES_LOCAL_PARTNER` · `REQUIRES_CONSORTIUM` ·
  `STRUCTURALLY_INELIGIBLE` · `UNKNOWN`
- `expectedStrategicRoute` (`STRATEGIC`): `ELIGIBLE_NOW` ·
  `ELIGIBLE_VIA_EXISTING_ENTITY` · `ELIGIBLE_VIA_PARTNER` ·
  `ELIGIBLE_VIA_CONSORTIUM` · `ELIGIBLE_AFTER_NEW_ENTITY` ·
  `ELIGIBLE_AFTER_RELOCATION` · `STRUCTURALLY_INELIGIBLE` · `UNKNOWN`
- `expectedRecommendation` (`RECOMMENDATION`): `PURSUE` · `PARTNER` ·
  `INVESTIGATE` · `MONITOR` · `REJECT`
- `expectedVerificationStatus` (`VERIFICATION`): `DISCOVERED_UNVERIFIED` ·
  `OFFICIAL_SOURCE_FOUND` · `VERIFIED` · `VERIFICATION_FAILED` ·
  `SOURCE_UNAVAILABLE` · `MANUAL_REVIEW_REQUIRED` · `REJECTED`
- `expectedSourceFormat` (`SOURCE_FORMAT`): `STATIC_HTML` ·
  `CLIENT_RENDERED_SPA` · `PDF` · `AUTHENTICATED` · `BLOCKED` · `UNSUPPORTED` ·
  `UNKNOWN`

### Confirmed vs expected vs uncertain

- **Confirmed facts:** never in the seed. Produced only by ingestion as
  `CONFIRMED_OFFICIAL` / `EXTRACTED_FROM_OFFICIAL_SOURCE` material facts with a
  source locator.
- **Expected (hypotheses):** the `expected*` fields.
- **Official vs discovery source:** `officialUrl` vs `discoveryUrl`, preserved
  separately; `applicationUrl` distinct again.
- **Unresolved uncertainty:** leave `expected*` = `UNKNOWN`/omit; describe in
  `notes`.

### Seed inconsistency rules (run by the validator)

`pursue-requires-verified`, `pursue-requires-primary-source`,
`strategic-route-mismatch` (seed route ≠ deterministic derivation),
`structural-ineligible-not-rejected`, `aggregator-cannot-pursue`,
`aggregator-cannot-verify`, `aggregator-no-confirmed-facts`,
`closed-call-not-partner`, `new-entity-vs-existing-fr`.

---

## <a id="ten-coverage-case-encoding"></a>3. Ten coverage-case encoding

How each spec-§10 case must be encoded. **Suggested `id`s only** — supply the
real URLs/values yourself; leave `expected*` = `UNKNOWN` wherever evidence is
insufficient (the pipeline resolves them). This is guidance, **not** invented data.

| # | Suggested `id` | Source | Flags | `expected*` guidance | Must verify (hypotheses to confirm) |
|---|---|---|---|---|---|
| 1 | `hub71-access-cohort-20` | official (`hub71.com`) + `localArtifact` | — | app/award **UNKNOWN**; rec `INVESTIGATE` | Do **not** assert VERIFIED / exact deadline / PURSUE / ELIGIBLE_NOW without the live Hub71 source. Distinguish ability-to-apply from incorporation/onboarding. |
| 2 | `bpifrance-<specific-programme>` | official (`bpifrance.fr`) | — | app/award **UNKNOWN** | Point at a **specific programme/application route**, not a generic category page. Verify programme, rolling?, applicant reqs, eligible entity, amount/mechanism. |
| 3 | `eic-accelerator` | official (`eic.ec.europa.eu`) | — | route **UNKNOWN** (do **not** set `ELIGIBLE_AFTER_NEW_ENTITY`) | Oolala France SAS already exists — determine if it can be applicant, IP ownership/control, relocation/establishment rules, stage fit. Return UNKNOWN if unclear. |
| 4 | `digital-2026-ai-data-10-compliance` | official **PDF** (`localArtifact`) | — | `expectedExtractedFacts: {}` | Verify exact call title, topic id, deadline, consortium reqs, eligible participants, budget, realistic BAWABA role. Don't copy aggregator values. |
| 5 | `digital-2026-ai-09-genai-pa` | official | `isClosedCall: true` | rec `REJECT` (not `PARTNER`) | If closed, classify the **call** as CLOSED/ineligible for PURSUE. Only create a **separate** derived lead with official evidence of a downstream route. |
| 6 | `startup-qatar-qdb-start` | official (`qdb.qa`) | — | app/award **UNKNOWN** | Verify from QDB/official issuer: title, status, instrument, max support, incorporation requirement + timing, rolling/fixed. |
| 7 | `nsf-sbir` | official (`seedfund.nsf.gov`) | — | award **UNKNOWN** (not `STRUCTURALLY_INELIGIBLE`) | Verify ownership/establishment/operational reqs. Do **not** infer structural ineligibility from nationality alone. |
| 8 | `unesco-ungm-<ref>` | official (`ungm.org`/`unesco.org`) | `isClosedCall: true` (expired) | rec `REJECT`; note relevance separately | Separate expired status vs applicant eligibility vs product relevance. Do **not** label structurally ineligible merely because expired. |
| 9 | `aggregator-only-<slug>` | `discoveryUrl` only | `isAggregatorOnly: true` | `expectedVerificationStatus: DISCOVERED_UNVERIFIED`; `expectedExtractedFacts: {}`; rec `INVESTIGATE`/`REJECT` | No confirmed financial facts. Never scored as a real opportunity; never VERIFIED/PURSUE from this source alone. |
| 10 | `pdf-fixture-<slug>` | official **PDF** (`localArtifact`) | — | `expectedExtractedFacts: {}` | Require exact official title, issuing authority, official document URL, page-level extraction targets, exact topic + deadline. Reject vague labels like "DEP call-fiche PDF". |

---

## 4. Commands (run later, once files are supplied)

> Do **not** run ingestion until real files exist. These are the exact commands.

**Validate the seed dataset**
```bash
pnpm --filter @oia/workers run validate:seed -- \
  --seed data/seeds/bawaba-funding-opportunities.json
```

**Validate the artifact manifest** — there is no standalone manifest validator
CLI yet; the manifest is validated (schema + duplicate-filename check) as the
**first step of `ingest:artifact`**, which aborts before processing if invalid.
A dry `--validate-only` flag is a proposed addition (see "Schema observations").
For now, a syntax+schema check is:
```bash
pnpm --filter @oia/workers run ingest:artifact -- \
  --manifest data/artifacts/manifest.json --entry __nonexistent__
# → prints manifest validation errors if invalid; otherwise "No manifest entry matches".
```

**Ingest one saved HTML artifact**
```bash
pnpm --filter @oia/workers run ingest:artifact -- \
  --manifest data/artifacts/manifest.json \
  --entry hub71-access-cohort-20.html
```

**Ingest one official PDF**
```bash
pnpm --filter @oia/workers run ingest:artifact -- \
  --manifest data/artifacts/manifest.json \
  --entry digital-2026-ai-data-10-compliance.pdf
```

**Ingest all supplied artifacts**
```bash
pnpm --filter @oia/workers run ingest:artifact -- \
  --manifest data/artifacts/manifest.json
```

**Generate the Milestone-0 reports** — the reports are written automatically by
`ingest:artifact` to `outputs/milestone-0/` (`opportunities.json`,
`shortlist.md`, `rejections.md`, `discrepancies.md`, `run-report.md`). There is
no separate report command; running any ingest command above regenerates them.

---

## Schema observations (NOT changed — flagged for your approval)

Genuine, minor gaps identified while documenting. **No schema was modified.**

1. **No standalone manifest validator / `--validate-only`.** Manifest validation
   only runs inside `ingest:artifact`. A dedicated `validate:manifest` command (or
   a dry flag) would let you check a manifest without touching files.
2. **No explicit "captured-from-SPA" marker on a PDF entry.** A SPA saved as PDF
   is represented as `sourceFormat: PDF`; the SPA origin is only implicit in
   `originalUrl`. An optional `capturedFrom: "CLIENT_RENDERED_SPA"` field would
   make this explicit.
3. **`contentType` is a free string** (`z.string().min(1)`), not an enum, while
   the fetcher enforces an allowlist elsewhere. Tightening it to an enum would
   fail-fast at manifest validation.
4. **Manifest entries have no `notes` field** (unlike seed records). Minor.

If you approve any of these, they are small, additive changes — but per your
instruction I will not modify the schema without explicit approval.

# Seed dataset

Two files (to be supplied by you — **never invented** by the pipeline):

- `bawaba-funding-opportunities.json` — the ten records, validated against the
  Zod schema in `@oia/ingestion` (`SeedDatasetSchema`, source of truth:
  `packages/ingestion/src/seed-manifest.ts`).
- `bawaba-funding-opportunities.md` — the companion narrative.

**Template:** [`bawaba-funding-opportunities.template.json`](bawaba-funding-opportunities.template.json)
**Full reference (schema, enums, ten-case encoding):**
[`outputs/milestone-0/input-schema-reference.md`](../../outputs/milestone-0/input-schema-reference.md)

## Core principle

`expected_*` fields are **hypotheses to test**, never ground truth. The seed
carries **no confirmed facts and no scores** — those are produced only by
ingesting a real official artifact. The pipeline compares each hypothesis against
the observed result and records every disagreement as a discrepancy (spec §1).

## Dataset shape

```jsonc
{ "version": 1, "records": [ /* the ten records */ ] }
```

Each record requires `id`, `title`, `issuer`, and **at least one** of
`officialUrl` / `discoveryUrl` / `applicationUrl` / `localArtifact`.

## Confirmed vs expected vs uncertain

- **Confirmed facts:** not represented in the seed at all. They only exist after
  ingestion, as `CONFIRMED_OFFICIAL` / `EXTRACTED_FROM_OFFICIAL_SOURCE` material
  facts with a source locator.
- **Expected classifications (hypotheses):** the `expected*` fields
  (`expectedVerificationStatus`, `expectedApplicationEligibility`,
  `expectedAwardEligibility`, `expectedStrategicRoute`, `expectedRecommendation`,
  `expectedSourceFormat`, `expectedExtractedFacts`). Set to `UNKNOWN`/omit when
  you do not want to assert one.
- **Official vs discovery source:** `officialUrl` = the issuer's primary source;
  `discoveryUrl` = where the lead was spotted (aggregator/search/social).
  `applicationUrl` = the application portal. All are preserved separately.
- **Unresolved uncertainty:** encode by leaving `expected*` = `UNKNOWN` (or
  omitting it) and describing the open question in `notes`.

## Linking to a supplied official artifact

Set `localArtifact` to the `localFilename` of an entry in
`data/artifacts/manifest.json`. That connects the seed hypothesis to the real
file the pipeline will ingest.

## The ten coverage cases

Encode all ten cases from spec §10. The **encoding recipe for each** (flags,
which `expected*` to leave `UNKNOWN`, what must be verified) is in the reference
doc: [`outputs/milestone-0/input-schema-reference.md`](../../outputs/milestone-0/input-schema-reference.md#ten-coverage-case-encoding).

## Companion Markdown (`bawaba-funding-opportunities.md`)

Free-form narrative that accompanies the JSON. Expected structure (one section
per record, same `id`):

```markdown
# BAWABA funding opportunities — seed narrative

## <record id>  (e.g. hub71-access-cohort-20)
- Issuer: <name>
- Official source: <url or "to supply as local artifact">
- Discovery source: <url, if different>
- Hypotheses: <what you expect and why — plainly labelled as hypotheses>
- Open questions / uncertainties: <what the pipeline must resolve>
- Coverage case: <which of the ten §10 cases this is>
```

The `.md` is documentation only; it is **not** parsed or validated by the
pipeline (the `.json` is the machine input).

## Validate

```bash
pnpm --filter @oia/workers run validate:seed
```

Until the real `.json` is present, the ten-record execution is **paused** (spec §6).

# Seed dataset

Two files (to be supplied — **not invented** by the pipeline):

- `bawaba-funding-opportunities.json` — the ten records, validated against the
  Zod schema in `@oia/ingestion` (`SeedDatasetSchema`).
- `bawaba-funding-opportunities.md` — the companion narrative.

`expected_*` fields are **hypotheses to test**, never ground truth. The pipeline
compares them against real official-source output and records every disagreement
as a discrepancy (spec §1).

Validate with:

```bash
pnpm --filter @oia/workers run validate:seed
```

A documented empty template is in `bawaba-funding-opportunities.template.json`.
Until the real file is present, the ten-record execution is **paused** (spec §6).

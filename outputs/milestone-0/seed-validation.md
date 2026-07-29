# Seed validation — NOT RUN

Seed file not found: `/home/user/OIA/data/seeds/bawaba-funding-opportunities.json`

The ten-record dataset has not been supplied yet. Per instruction §6 the
ten-record execution is PAUSED until both files exist:

- `data/seeds/bawaba-funding-opportunities.json`
- `data/seeds/bawaba-funding-opportunities.md`

The schema + validator + inconsistency checks are implemented and tested
(`@oia/ingestion` seed.unit.test) and will run automatically once the file
is provided. A documented empty template is at
`data/seeds/bawaba-funding-opportunities.template.json`.

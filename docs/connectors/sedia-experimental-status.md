# SEDIA connector — EXPERIMENTAL_UNVERIFIED

**Status:** `EXPERIMENTAL_UNVERIFIED` (see `EU_FT_CONNECTOR_STATUS` in
`packages/connectors/src/connectors/eu-funding-tenders.ts`). **Not delivered,
not production-ready.**

## Why this classification

- **No successful live contract test has ever occurred.** Every attempt to reach
  `api.tech.ec.europa.eu` from this execution environment returns a proxy/egress
  **403** (organizational policy denial). We do not retry or bypass it.
- All connector tests use **recorded fixtures**
  (`packages/connectors/test/fixtures/sedia-response.json`).

## Fixture provenance

The fixture is a **hand-authored** representative shape based on the *assumed*
SEDIA response contract (a `results[]` array whose `metadata` values are arrays
of strings). It was **not** captured from a live call. It therefore proves
compatibility with itself only.

## Assumed endpoint & contract (unverified)

- Endpoint: `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=<q>`
- Body: `multipart/form-data` with JSON `query`, `languages`, `page`, `pageSize`.
- Status codes assumed: `31094501` forthcoming, `31094502` open, `31094503` closed.

## A fixture test does NOT prove

- endpoint availability;
- endpoint stability;
- live schema compatibility;
- authentication / permitted-use conditions;
- production usability.

## Unresolved

- **Endpoint stability** — the SEDIA API is undocumented/semi-public; shape may change.
- **Permitted-use conditions** — terms for automated querying are unconfirmed.

## Activation requirements (before any reliance)

1. Run in an environment whose network policy permits `api.tech.ec.europa.eu`.
2. Capture a **live** response and add a real (dated, sourced) fixture.
3. Add a `LIVE_SOURCE_SPIKE` test that asserts the live schema.
4. Confirm permitted-use / rate limits.
5. Only then consider re-labelling above `EXPERIMENTAL_UNVERIFIED`.

Until then, the EU/FR path for Milestone 0 uses **locally supplied official
artifacts** (OFFICIAL_PDF / MANUAL_DOCUMENT), not this connector.

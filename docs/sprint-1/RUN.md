# Sprint 1 — running the live TED discovery worker

The connector, mapping and dedup are built and tested in the sandbox against a
recorded response; the **live run needs egress** and therefore runs on your
machine (or any host with internet), in Docker.

## One command

```bash
# from the repo root, on a machine with internet:
docker compose up --build
```

This single service:
1. POSTs one search to the TED API (`api.ted.europa.eu/v3/notices/search`);
2. **records the raw response** to `packages/connectors/test/fixtures/ted-search-response.json`
   (the real fixture — the contract test then runs green) and to
   `outputs/sprint-1/ted-search-response.raw.json`;
3. qualifies up to `TED_MAX` candidates by fetching each **official TED notice
   page** through the existing engine → **`MANUAL_REVIEW_REQUIRED`** (never
   `VERIFIED` without a human);
4. writes `outputs/sprint-1/candidates.json` and `outputs/sprint-1/run-report.md`;
5. exits.

## Configuring the query

- **Precise:** build a query on <https://ted.europa.eu/en/expert-search>, copy it,
  and set `TED_QUERY` (in a `.env` next to `docker-compose.yml`, or your shell).
- **Default:** leave `TED_QUERY` empty — the worker derives one from
  `TED_SECTORS` (BAWABA sectors) → CPV codes.

Other knobs: `TED_PAGE_SIZE` (≤250), `TED_MAX`, `FETCH_USER_AGENT`.

## After the run

- Commit the recorded fixture (`packages/connectors/test/fixtures/ted-search-response.json`)
  so the `[FIXTURE_CONTRACT]` suite runs against the real response everywhere.
- Review `outputs/sprint-1/run-report.md`: notices retrieved / processed /
  qualified, each with its official source URL.

## Honesty

If the host has no egress, the run report says **BLOCKED/ERROR** and produces no
candidates — it is never presented as a successful discovery.

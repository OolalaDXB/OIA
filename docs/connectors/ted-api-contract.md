# TED Search API — confirmed contract (Sprint 1)

Confirmed against official documentation (not from memory). Sources at the
bottom. Some exact field names are enumerable from the live API and must be
re-checked at run time (noted inline).

## Endpoint & auth

- **Endpoint:** `POST https://api.ted.europa.eu/v3/notices/search`
- **Auth:** **none** for public read. The Search API is accessible anonymously.
- **Content-Type:** `application/json`.

## Request body

```jsonc
{
  "query": "classification-cpv IN (72000000) AND buyer-country IN (FRA)",  // TED expert search syntax
  "fields": ["publication-number", "notice-title", "buyer-name", "buyer-country",
             "publication-date", "deadline", "classification-cpv", "links"],
  "limit": 100,                 // page size, MAX 250
  "scope": "ACTIVE",            // ACTIVE | LATEST | ALL
  "checkQuerySyntax": false,
  "paginationMode": "ITERATION" // ITERATION (token/scroll) | PAGE_NUMBER
  // "page": 1                  // with PAGE_NUMBER mode
}
```

- **`query`**: TED **expert search** syntax — the same language as the TED
  website's Expert Search (field operators, `IN (...)`, `AND`/`OR`, ranges on
  numeric/date fields, phrase search on text fields).
- **`fields`**: which fields to return (max 10,000 fields/page).
- **`scope`**: `ACTIVE` returns currently-active notices (best for discovery).

## Pagination & limits

- **Max page size: 250** notices per request.
- **Max total retrievable: 15,000** notices via pagination.
- Two modes:
  - **`ITERATION`**: response returns a token; pass it on the next call to get the
    next page (scroll-style). Preferred for full sweeps.
  - **`PAGE_NUMBER`**: `page` + `limit` (classic paging).
- **Rate limits:** not clearly published; the Swagger UI documents limits. Treat
  as unknown → be polite (small pages, backoff, cap total). See risks.

## Fields used by the mapping (confirmed / to re-verify)

| Purpose | TED field | Status |
|---|---|---|
| Stable notice id / dedup | `publication-number` | confirmed |
| Title | `notice-title` | confirmed |
| Buyer / issuer | `buyer-name` | confirmed |
| Country | `buyer-country` (and/or `place-of-performance`) | confirmed (exact code list re-verify) |
| Publication date | `publication-date` | to re-verify exact name |
| Deadline | `deadline` (submission deadline) | **re-verify** exact name (eForms may use a BT-specific field) |
| CPV classification | `classification-cpv` | confirmed |
| Notice type | `notice-type` | confirmed |
| Links / URLs | `links` | confirmed |

The **canonical official notice URL** (primary source of the candidate):

```
https://ted.europa.eu/{lang}/notice/{publication-number}/{format}
# e.g. https://ted.europa.eu/en/notice/123456-2026/html
```

> The exact, current field-name list is **enumerable from the API itself** and
> from the Swagger UI. The connector will request the fields above and
> Zod-validate the response; any missing/renamed field fails soft (recorded, not
> invented). We do **not** hard-code assumptions we could not confirm.

## What this API gives us (and doesn't)

- Gives: structured **metadata** per notice (id, title, buyer, country, dates,
  CPV, official URL). Enough to build a candidate + fetch the official page.
- Does **not** give (this sprint): deep multilingual body extraction — that is
  Sprint 4. Sprint 1 stays on the **structured API metadata + the official notice
  page** for verification.

## Sources

- [Search API — TED Developer Docs](https://docs.ted.europa.eu/api/latest/search.html)
- [TED API index — Developer Docs](https://docs.ted.europa.eu/api/latest/index.html)
- [Downloading notices using the Search API](https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html)
- [TED reusers Q&A (Publications Office)](https://op.europa.eu/en/web/ted-reusers-workshops/questions_and_answers_2023_12_14)
- [TED Swagger UI (API limits)](https://ted.europa.eu/api/documentation/index.html)
- [Developers' corner for reusers](https://ted.europa.eu/en/simap/developers-corner-for-reusers)

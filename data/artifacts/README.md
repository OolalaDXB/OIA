# Official-source artifacts (local files)

Because this environment's egress policy blocks all external official domains
(`403`), genuine official content is supplied here as **local files downloaded
directly from the issuing organisation's website**. These are real
official-source artifacts, processed as `OFFICIAL_PDF` / `MANUAL_DOCUMENT` —
**not** fixtures, and **not** presented as successful live URL fetches.

- **Schema (source of truth):** `packages/ingestion/src/manifest.ts`
  (`ArtifactManifestSchema`).
- **Template:** [`manifest.template.json`](manifest.template.json) ·
  **Example:** [`manifest.example.json`](manifest.example.json)
- **Full reference:** [`outputs/milestone-0/input-schema-reference.md`](../../outputs/milestone-0/input-schema-reference.md)

## Manifest shape

```jsonc
{ "version": 1, "artifacts": [ /* one entry per supplied official file */ ] }
```

`version` must be the literal `1`. `artifacts` must have **at least one** entry.

## Entry fields

| Field | Required | Type / values | Meaning |
|---|---|---|---|
| `originalUrl` | **yes** | valid URL | The official issuer URL the file was downloaded from. Preserved and linked to the (BLOCKED) live-fetch attempt. |
| `issuingOrganization` | **yes** | non-empty string | Human name of the issuer (e.g. `European Commission`). |
| `officialDomain` | no | non-empty string | Issuer's official domain. If omitted, **derived from `originalUrl`'s host** (`officialDomainFor`). |
| `retrievalDate` | **yes** | `YYYY-MM-DD` | The date you downloaded the file (becomes the artifact `retrievedAt`). |
| `localFilename` | **yes** | non-empty string | File name **relative to the manifest's own directory**. Must be unique within the manifest. |
| `contentType` | **yes** | string | MIME type. Accepted by the fetcher/classifier: `text/html`, `application/xhtml+xml`, `application/pdf`, `text/plain`. |
| `sourceFormat` | **yes** | `STATIC_HTML` \| `CLIENT_RENDERED_SPA` \| `PDF` | Your **claim** of the format. The classifier re-derives it; a mismatch is reported as a discrepancy warning (not a hard failure). |
| `expectedDocumentTitle` | **yes** | non-empty string | What the document should be about — a hypothesis used for a content-consistency check. |
| `applicationUrl` | no | valid URL | The application portal, if separate from `originalUrl`. Its host becomes the `applicationDomain`. |

No other fields are part of the contract — do not add fields the schema does not
define.

## How local filenames are resolved

`localFilename` is resolved **relative to the directory containing the manifest**.
If the manifest is `data/artifacts/manifest.json`, then
`"localFilename": "hub71-access-cohort-20.html"` resolves to
`data/artifacts/hub71-access-cohort-20.html`. Keep the files next to the manifest.

## How each format is represented

- **Saved HTML page** → `contentType: "text/html"`, `sourceFormat: "STATIC_HTML"`.
  Visible text is extracted (scripts/styles stripped); facts get HTML heading /
  CSS-selector locators.
- **Official PDF** → `contentType: "application/pdf"`, `sourceFormat: "PDF"`.
  Extracted **per page**; every PDF fact retains a `PDF_PAGE` locator.
- **A SPA captured as PDF** → the artifact IS a PDF, so
  `contentType: "application/pdf"`, `sourceFormat: "PDF"`. The SPA provenance is
  preserved by `originalUrl` (the client-rendered page). Do **not** set
  `sourceFormat: "CLIENT_RENDERED_SPA"` for a PDF file — that would trip the
  classifier-vs-manifest discrepancy check. (If you instead save the SPA's raw
  HTML shell, use `STATIC_HTML`/`CLIENT_RENDERED_SPA`; the classifier will most
  likely tag it `CLIENT_RENDERED_SPA` and flag it as an empty shell.)

## How the original URL links to the local artifact

During ingestion, each artifact triggers a **live-fetch attempt of `originalUrl`**
via the SSRF-safe fetcher. In this environment that returns `BLOCKED`
(`egressDenied: true`, `proxyCode: 403`) and is stored on the artifact as
`liveFetch`. The run report shows two separate lines — `live fetch: BLOCKED` and
`artifact processing: SUCCESS|FAILURE`. A local file is never counted as a live
fetch.

## How issuer / application domains are represented

- **Issuer domain** = `officialDomain` if given, else the host of `originalUrl`
  (lower-cased). Used by verification (gov/supranational recognition,
  aggregator detection).
- **Application domain** = the host of `applicationUrl` when present.

## Verification ceiling

Deterministic verification caps at `MANUAL_REVIEW_REQUIRED`. Only an explicit
human confirmation of the issuer↔domain relationship reaches `VERIFIED`. An
aggregator/blog/newsletter/social host can never be an official primary source.

`manifest.json` and the downloaded files are git-ignored by default (they may be
large / rights-restricted); commit them deliberately if they should be retained.

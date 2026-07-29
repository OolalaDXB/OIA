# Official-source artifacts (local files)

Because this environment's egress policy blocks all external official domains
(403), genuine official content is supplied here as **local files downloaded
directly from the issuing organisation's website**. These are real
official-source artifacts, processed as `OFFICIAL_PDF` / `MANUAL_DOCUMENT` —
**not** fixtures, and **not** presented as successful live URL fetches.

## How to add an artifact

1. Download the official PDF or save the official HTML page from the issuer.
2. Drop the file in this directory.
3. Add an entry to `manifest.json` (copy `manifest.example.json`) with:
   `originalUrl, issuingOrganization, retrievalDate, localFilename, contentType,
   sourceFormat, expectedDocumentTitle, applicationUrl?`.
4. Run:

   ```bash
   pnpm --filter @oia/workers run ingest:artifact -- \
     --manifest data/artifacts/manifest.json --entry <localFilename>
   ```

## What the pipeline does with each file

- hashes the bytes (sha256) and retains page / CSS / heading locators;
- classifies the source format (re-checking your claim);
- extracts fact-level claims **with provenance**;
- **attempts the live `originalUrl`** and records the result separately
  (`BLOCKED` here) — the local file is never counted as a live fetch;
- runs deterministic verification, which caps at `MANUAL_REVIEW_REQUIRED` until a
  human confirms the issuer↔domain relationship (only a human reaches `VERIFIED`).

`manifest.json` and the downloaded files are git-ignored by default (they may be
large / rights-restricted); commit them deliberately if they should be retained.

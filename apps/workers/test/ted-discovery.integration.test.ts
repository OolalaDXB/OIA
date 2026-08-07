import { describe, it, expect } from "vitest";
import { ingestOfficialArtifact, type ArtifactManifestEntry, type LiveFetchAttempt } from "@oia/ingestion";
import { mapTedNotices } from "@oia/connectors";

/**
 * [LOCAL_INTEGRATION] Proves a discovered TED candidate flows through the EXISTING
 * M0 engine and comes out MANUAL_REVIEW_REQUIRED — never VERIFIED without a human.
 * No network: the TED response shape drives the candidate; the notice page is a
 * synthetic HTML string used only to exercise the engine (same pattern as the M0
 * ingestion test). The real recorded TED response is asserted in ted.contract.test.
 */

const okFetch =
  (url: string): (() => Promise<LiveFetchAttempt>) =>
  async () => ({
    attemptedUrl: url,
    fetchStatus: "OK",
    egressDenied: false,
    fetchedAt: "2026-08-05T00:00:00.000Z",
    durationMs: 5,
  });

const NOTICE_HTML = `<!doctype html><html><head><title>Contract notice — AI data platform</title></head>
<body><h1>Contract notice — AI data platform</h1>
<p>${"Official TED notice for AI data platform services, buyer Ministry X. ".repeat(12)}</p>
<h2>Deadline</h2><p>Submission deadline: 2026-09-30.</p></body></html>`;

describe("[LOCAL_INTEGRATION] TED candidate → existing engine → MANUAL_REVIEW_REQUIRED", () => {
  it("qualifies a TED candidate at MANUAL_REVIEW_REQUIRED, never VERIFIED", async () => {
    const [candidate] = mapTedNotices(
      {
        notices: [
          {
            "publication-number": "222222-2026",
            "notice-title": { eng: "AI data platform services" },
            "buyer-name": { eng: "Ministry X" },
            deadline: "2026-09-30",
            "classification-cpv": ["72000000"],
          },
        ],
      },
      "2026-08-05T00:00:00.000Z",
    );
    expect(candidate!.sourceKey).toBe("ted");
    expect(candidate!.url).toBe("https://ted.europa.eu/en/notice/222222-2026/html");

    const entry: ArtifactManifestEntry = {
      originalUrl: candidate!.url,
      issuingOrganization: candidate!.hints.funder ?? "European Union — TED",
      officialDomain: "ted.europa.eu",
      retrievalDate: "2026-08-05",
      localFilename: `${candidate!.externalId}.html`,
      contentType: "text/html",
      sourceFormat: "STATIC_HTML",
      expectedDocumentTitle: candidate!.title,
    };
    const ing = await ingestOfficialArtifact(entry, Buffer.from(NOTICE_HTML), { liveFetch: okFetch(candidate!.url) });

    expect(ing.artifact.processing).toBe("SUCCESS");
    expect(ing.artifact.sourceFormat).toBe("STATIC_HTML");
    expect(ing.verification.verificationStatus).toBe("MANUAL_REVIEW_REQUIRED");
    expect(ing.verification.verificationStatus).not.toBe("VERIFIED");
    // ted.europa.eu recognised as a government/supranational official domain.
    expect(ing.verification.verificationEvidence.join(" ")).toMatch(/government\/supranational|europa\.eu/);
  });
});

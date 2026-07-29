import { describe, it, expect } from "vitest";
import { ingestOfficialArtifact } from "../src/ingest";
import type { ArtifactManifestEntry } from "../src/manifest";
import type { LiveFetchAttempt } from "../src/models";

// A BLOCKED live-fetch, exactly as this environment produces (spec §3).
const blockedFetch = async (url: string): Promise<LiveFetchAttempt> => ({
  attemptedUrl: url,
  fetchStatus: "BLOCKED",
  egressDenied: true,
  proxyCode: 403,
  fetchedAt: "2026-07-29T00:00:00.000Z",
  durationMs: 5,
  error: "gateway answered 403 to CONNECT (organizational egress denial)",
});

const HTML = `<!doctype html><html><head><title>Access Cohort 20</title></head>
<body><h1>Access Cohort 20</h1>
<p>${"Applications are open for the Access programme cohort. ".repeat(20)}</p>
<h2>Deadline</h2><p>The application deadline is 2026-09-15.</p></body></html>`;

const htmlEntry: ArtifactManifestEntry = {
  originalUrl: "https://hub71.com/programs/access",
  issuingOrganization: "Hub71",
  retrievalDate: "2026-07-29",
  localFilename: "hub71-access.html",
  contentType: "text/html",
  sourceFormat: "STATIC_HTML",
  expectedDocumentTitle: "Access Cohort 20",
};

describe("[LOCAL_INTEGRATION] ingest a supplied official artifact", () => {
  it("processes saved HTML, links the BLOCKED live-fetch, and caps verification at review", async () => {
    const res = await ingestOfficialArtifact(htmlEntry, Buffer.from(HTML), { liveFetch: blockedFetch });

    // Artifact processing SUCCESS is reported separately from the BLOCKED live fetch.
    expect(res.artifact.processing).toBe("SUCCESS");
    expect(res.artifact.sourceFormat).toBe("STATIC_HTML");
    expect(res.artifact.liveFetch?.fetchStatus).toBe("BLOCKED");
    expect(res.artifact.liveFetch?.egressDenied).toBe(true);
    expect(res.artifact.renderMethod).toBe("LOCAL_FILE"); // NOT presented as a URL fetch

    // Verification never auto-VERIFIED.
    expect(res.verification.verificationStatus).toBe("MANUAL_REVIEW_REQUIRED");

    // Facts have provenance + locators; a deadline was extracted.
    expect(res.facts.some((f) => f.field === "title")).toBe(true);
    expect(res.deadlines.some((d) => d.normalized === "2026-09-15")).toBe(true);
    expect(res.artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("processes an official PDF (injected extractor) and keeps page locators", async () => {
    const pdfEntry: ArtifactManifestEntry = {
      ...htmlEntry,
      originalUrl: "https://ec.europa.eu/info/funding-tenders/x",
      issuingOrganization: "European Commission",
      localFilename: "digital.pdf",
      contentType: "application/pdf",
      sourceFormat: "PDF",
      expectedDocumentTitle: "DIGITAL AI Data compliance",
    };
    const res = await ingestOfficialArtifact(pdfEntry, Buffer.from("%PDF-1.4 fake"), {
      liveFetch: blockedFetch,
      extractPdf: async () => [
        { pageNumber: 1, text: "Topic DIGITAL-2026-AI-DATA-10-COMPLIANCE. Application deadline is 2026-11-12." },
        { pageNumber: 2, text: "Indicative budget EUR 5 000 000." },
      ],
    });
    expect(res.artifact.sourceFormat).toBe("PDF");
    expect(res.artifact.pageCount).toBe(2);
    const topic = res.facts.find((f) => f.field === "topic_identifier");
    expect(topic?.locator.type).toBe("PDF_PAGE");
    expect(topic?.locator.page).toBe(1);
    const deadline = res.deadlines.find((d) => d.normalized === "2026-11-12");
    expect(deadline?.locator.page).toBe(1);
    expect(res.artifact.liveFetch?.fetchStatus).toBe("BLOCKED");
  });

  it("flags an SPA shell explicitly instead of silently rendering it", async () => {
    const spaEntry: ArtifactManifestEntry = { ...htmlEntry, localFilename: "spa.html", sourceFormat: "CLIENT_RENDERED_SPA" };
    const spaHtml = `<!doctype html><html><head><title>App</title><script src=a></script><script src=b></script><script src=c></script></head><body><div id="root"></div></body></html>`;
    const res = await ingestOfficialArtifact(spaEntry, Buffer.from(spaHtml), { liveFetch: blockedFetch });
    expect(res.artifact.sourceFormat).toBe("CLIENT_RENDERED_SPA");
    expect(res.warnings.join(" ")).toMatch(/SPA|empty-shell/i);
  });
});

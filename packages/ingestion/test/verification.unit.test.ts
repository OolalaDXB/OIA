import { describe, it, expect } from "vitest";
import { verifySuppliedArtifact, discoveredLead, applyHumanVerification, isGovOrSupranationalDomain } from "../src/verification";
import type { ArtifactManifestEntry } from "../src/manifest";
import type { SourceArtifact } from "../src/models";

const entry: ArtifactManifestEntry = {
  originalUrl: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/x",
  issuingOrganization: "European Commission",
  retrievalDate: "2026-07-29",
  localFilename: "digital.pdf",
  contentType: "application/pdf",
  sourceFormat: "PDF",
  expectedDocumentTitle: "DIGITAL Europe AI Data compliance call",
};

const artifact: SourceArtifact = {
  id: "art_1", ingestionMode: "OFFICIAL_PDF", sourceFormat: "PDF",
  originalUrl: entry.originalUrl, issuingOrganization: entry.issuingOrganization,
  contentType: "application/pdf", byteSize: 1000, contentHash: "hash",
  retrievedAt: "2026-07-29T00:00:00.000Z", renderMethod: "LOCAL_FILE",
  text: "DIGITAL Europe programme AI data compliance call for the topic.", processing: "SUCCESS",
};

describe("[UNIT] primary-source verification (spec §7)", () => {
  it("a supplied official artifact caps at MANUAL_REVIEW_REQUIRED (never auto-VERIFIED)", () => {
    const v = verifySuppliedArtifact(entry, artifact);
    expect(v.verificationStatus).toBe("MANUAL_REVIEW_REQUIRED");
    expect(v.verificationEvidence.join(" ")).toMatch(/government\/supranational/);
  });

  it("does not verify merely because the org name resembles the domain", () => {
    const v = verifySuppliedArtifact(entry, artifact);
    expect(v.verificationStatus).not.toBe("VERIFIED");
  });

  it("an aggregator/social host can never be an official primary source", () => {
    const aggEntry = { ...entry, originalUrl: "https://medium.com/@x/post", issuingOrganization: "Some Blog" };
    const v = verifySuppliedArtifact(aggEntry, { ...artifact, originalUrl: aggEntry.originalUrl });
    expect(v.verificationStatus).toBe("DISCOVERED_UNVERIFIED");
  });

  it("discovered aggregator lead stays DISCOVERED_UNVERIFIED with no confirmed facts", () => {
    const v = discoveredLead("https://newsletter.example/list", "Aggregator");
    expect(v.verificationStatus).toBe("DISCOVERED_UNVERIFIED");
  });

  it("only an explicit human confirmation reaches VERIFIED", () => {
    const v = verifySuppliedArtifact(entry, artifact);
    const verified = applyHumanVerification(v, "mickael", "2026-07-30T10:00:00.000Z", true);
    expect(verified.verificationStatus).toBe("VERIFIED");
    expect(verified.manualReviewer).toBe("mickael");
    // Cannot verify an aggregator lead even with approval.
    const agg = discoveredLead("https://medium.com/x", "Blog");
    expect(applyHumanVerification(agg, "mickael", "t", true).verificationStatus).not.toBe("VERIFIED");
  });

  it("recognises gov/supranational domains", () => {
    expect(isGovOrSupranationalDomain("ec.europa.eu")).toBe(true);
    expect(isGovOrSupranationalDomain("seedfund.nsf.gov")).toBe(true);
    expect(isGovOrSupranationalDomain("randomstartup.io")).toBe(false);
  });
});

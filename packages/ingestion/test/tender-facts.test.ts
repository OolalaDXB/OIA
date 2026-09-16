import { describe, expect, it } from "vitest";
import { extractTenderFacts, matchableTextLength, SCOPE_MAX } from "../src/tender-facts";

/**
 * Synthetic notice HTML, following the structure of a TED contract notice —
 * the same approach the existing ingestion tests take. It exercises the
 * extractor; the real recorded TED response is asserted in the connector's
 * fixture contract test. No claim is made here about real notice content.
 */
const NOTICE = `<!doctype html><html><head><title>France-Lorient: Software development services</title></head>
<body>
<h1>France-Lorient: Software development services</h1>
<h2>Section II: Object</h2>
<h3>Short description</h3>
<p>The contracting authority seeks a supplier for the design, development and maintenance of a
multi-tenant web platform for cultural distribution, including a point-of-sale module, electronic
invoicing compliant with national requirements, and a professional portal for partner labels.
The platform must support role-based access and provide an auditable trail of every transaction.</p>
<h3>Estimated value</h3>
<p>Estimated total value excluding VAT: EUR 480 000</p>
<h3>Place of performance</h3>
<p>Place of performance: Lorient, Bretagne. NUTS code: FRH04</p>
<h2>Section III: Legal information</h2>
<h3>Selection criteria</h3>
<p>Economic operators must demonstrate at least three comparable references in the last five
years and hold professional liability insurance of at least EUR 1 000 000.</p>
<h2>Section IV: Procedure</h2>
<p>Type of procedure: Open procedure. CPV: 72230000, additional CPV 48000000.</p>
<p>Lot 1: platform build. Lot 2: maintenance. Lot 3: training.</p>
</body></html>`;

const opts = { artifactId: "art-1" };

describe("tender fact extraction — what the notice actually says", () => {
  const facts = extractTenderFacts(NOTICE, opts);
  const byField = (f: string) => facts.find((x) => x.field === f);

  it("pulls the scope out of the description section, with its locator", () => {
    const scope = byField("scope")!;
    expect(scope.normalizedValue).toContain("multi-tenant web platform for cultural distribution");
    expect(scope.locator.type).toBe("HTML_HEADING");
    expect(scope.classification).toBe("EXTRACTED_FROM_OFFICIAL_SOURCE");
    // Never CONFIRMED_OFFICIAL: a human still has to verify, here as everywhere.
    expect(scope.extractingProvider).toBe("deterministic");
  });

  it("reads the estimated value, the procedure, the place and the lots", () => {
    expect(byField("estimated_value")!.normalizedValue).toBe("EUR 480 000");
    expect(byField("procedure")!.normalizedValue).toBe("open procedure");
    expect(byField("place_of_performance")!.normalizedValue).toContain("Lorient");
    expect(byField("nuts_code")!.normalizedValue).toBe("FRH04");
    expect(byField("lots")!.normalizedValue).toBe("3");
  });

  it("keeps the eligibility section — the gate's most common blocker", () => {
    expect(byField("eligibility")!.normalizedValue).toContain("three comparable references");
  });

  it("claims a CPV code only when the text says CPV, not for any 8-digit number", () => {
    const cpv = byField("cpv_additional")!;
    expect(cpv.normalizedValue).toContain("72230000");
    // "1 000 000" and "480 000" are not CPV codes and must not be reported as such.
    expect(cpv.normalizedValue).not.toContain("1000000");
  });

  it("does not re-report a code the search API already gave us", () => {
    const facts2 = extractTenderFacts(NOTICE, { ...opts, knownCpv: ["72230000"] });
    expect(facts2.find((f) => f.field === "cpv_additional")!.normalizedValue).not.toContain("72230000");
  });

  it("invents nothing when a section is absent", () => {
    const bare = `<html><body><h1>A title</h1><p>${"Nothing useful here. ".repeat(20)}</p></body></html>`;
    const out = extractTenderFacts(bare, opts);
    expect(out.find((f) => f.field === "estimated_value")).toBeUndefined();
    expect(out.find((f) => f.field === "procedure")).toBeUndefined();
    expect(out.find((f) => f.field === "lots")).toBeUndefined();
  });

  it("falls back to the opening text, and says in the locator that it did", () => {
    const bare = `<html><body><h1>A title</h1><p>${"Substantive prose about the contract. ".repeat(10)}</p></body></html>`;
    const scope = extractTenderFacts(bare, opts).find((f) => f.field === "scope")!;
    expect(scope.locator.value).toContain("no description heading found");
    // Lower confidence than a labelled section, because it is a weaker claim.
    expect(scope.extractionConfidence).toBeLessThan(0.7);
  });

  it("caps the scope so one verbose notice cannot bloat the dataset", () => {
    const long = `<html><body><h2>Description</h2><p>${"word ".repeat(2000)}</p></body></html>`;
    const scope = extractTenderFacts(long, opts).find((f) => f.field === "scope")!;
    expect(scope.normalizedValue.length).toBeLessThanOrEqual(SCOPE_MAX);
  });
});

describe("the S2 measure", () => {
  it("turns a 54-character title into a corpus the matcher can reason about", () => {
    const title = "France-Lorient: Software development services";
    const issuer = "Ville de Lorient";
    const before = matchableTextLength([], title, issuer);
    const after = matchableTextLength(extractTenderFacts(NOTICE, opts), title, issuer);

    // On this notice: 61 characters before, 796 after — thirteen times more for
    // the matcher to reason about, and all of it from a page already fetched.
    expect(before).toBeLessThan(80);
    expect(after).toBeGreaterThan(10 * before);
  });
});

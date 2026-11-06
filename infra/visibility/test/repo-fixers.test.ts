import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFakeVisibilityLLM } from "../src/llm";
import {
  fixJsonLdOrganization,
  fixJsonLdProduct,
  fixLlmsTxt,
  fixMetaDescription,
  fixNoindexRemoval,
  fixPriceSsrPlaceholder,
  fixRobotsTxt,
  fixSitemapXml,
  fixTitle,
  unifiedDiff,
  type ValidatedFact,
} from "../src/repo/fixers";
import { readRepo } from "../src/repo/reader";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "repos");
const site = { siteUrl: "https://fictive-site.example.test/", brand: "Fictive Brand (donnée fictive)" };

describe("fixers — deterministic", () => {
  it("fixRobotsTxt emits a valid robots.txt and lands in /public for Next.js", () => {
    const m = readRepo(join(fixtures, "nextjs-fictive"));
    const f = fixRobotsTxt(m, site);
    expect(f.kind).toBe("robots-txt");
    expect(f.path).toBe("public/robots.txt");
    expect(f.after).toMatch(/User-agent: \*/);
    expect(f.after).toMatch(/Sitemap: https:\/\/fictive-site\.example\.test\/sitemap\.xml/);
    expect(f.risk).toBe("low");
  });

  it("fixSitemapXml writes a valid XML with the given URLs", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const f = fixSitemapXml(m, site, ["https://fictive-site.example.test/", "https://fictive-site.example.test/about"]);
    expect(f.after).toMatch(/<\?xml version="1\.0"/);
    expect(f.after).toMatch(/<loc>https:\/\/fictive-site\.example\.test\/<\/loc>/);
    expect(f.after).toMatch(/<loc>https:\/\/fictive-site\.example\.test\/about<\/loc>/);
  });

  it("fixLlmsTxt falls back to the plain summary without an LLM, uses it when provided", async () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const plain = await fixLlmsTxt(m, site, "Fictive summary for the fictive site.");
    expect(plain.after).toMatch(/Fictive summary for the fictive site\./);

    const llm = createFakeVisibilityLLM({
      "content.write": () => ({ text: "[fictive LLM-written llms.txt body]" }),
    });
    const withLlm = await fixLlmsTxt(m, site, "Short summary", { llm });
    expect(withLlm.after).toMatch(/\[fictive LLM-written llms\.txt body\]/);
  });

  it("fixJsonLdProduct leaves __TO_FILL__ when the price fact is missing (rule 12)", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const noPrice: ValidatedFact[] = [{ category: "offer", statement: "fictive offer", value: { name: "Fictive Offer", description: "Fictive description." } }];
    const f = fixJsonLdProduct(m, site, noPrice);
    expect(f.after).toMatch(/"price": "__TO_FILL__"/);
    expect(f.risk).toBe("medium");
  });

  it("fixJsonLdProduct uses a validated price when provided (no invention)", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const withPrice: ValidatedFact[] = [
      { category: "offer", statement: "fictive offer", value: { name: "Fictive Offer", description: "Fictive description." } },
      { category: "price", statement: "42 EUR", value: { amount: "42.00", currency: "EUR", availability: "https://schema.org/InStock" } },
    ];
    const f = fixJsonLdProduct(m, site, withPrice);
    expect(f.after).toMatch(/"price": "42\.00"/);
    expect(f.after).toMatch(/"priceCurrency": "EUR"/);
    expect(f.risk).toBe("low");
  });

  it("fixTitle replaces the existing <title> on an HTML page", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const f = fixTitle(m, "index.html", "Fictive Business · nouveau titre");
    expect(f.after).toMatch(/<title>Fictive Business · nouveau titre<\/title>/);
    expect(f.before).toMatch(/<title>/);
  });

  it("fixMetaDescription inserts or replaces the meta description tag", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const f = fixMetaDescription(m, "index.html", "Nouvelle description fictive.");
    expect(f.after).toMatch(/<meta name="description" content="Nouvelle description fictive\." \/>/);
  });

  it("fixPriceSsrPlaceholder writes a human-review note next to the page", () => {
    const m = readRepo(join(fixtures, "nextjs-fictive"));
    const f = fixPriceSsrPlaceholder(m, "app/page.tsx", "Prix lu depuis fetch() côté client.");
    expect(f.path).toBe("app/page.tsx.oia-price-ssr.md");
    expect(f.after).toMatch(/Prix lu depuis fetch\(\) côté client\./);
    expect(f.risk).toBe("medium");
  });

  it("fixNoindexRemoval is flagged high risk", () => {
    // We don't apply it to a real page; a hand-crafted fixture would do.
    // Here we just verify the risk level and that it would compile.
    const m = readRepo(join(fixtures, "html-fictive"));
    const f = fixNoindexRemoval(m, "index.html");
    expect(f.risk).toBe("high");
  });

  it("unifiedDiff produces plausible headers and +/- markers", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const f = fixRobotsTxt(m, site);
    const diff = unifiedDiff(f);
    expect(diff).toMatch(/^--- a\/robots\.txt$/m);
    expect(diff).toMatch(/^\+\+\+ b\/robots\.txt$/m);
    expect(diff).toMatch(/^\+Sitemap:/m);
  });

  it("the Fix id is deterministic", () => {
    const m = readRepo(join(fixtures, "html-fictive"));
    const a = fixRobotsTxt(m, site);
    const b = fixRobotsTxt(m, site);
    expect(a.id).toBe(b.id);
  });
});

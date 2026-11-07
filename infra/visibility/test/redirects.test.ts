import { describe, expect, it } from "vitest";
import { applyRedirects, isRedirectLink, resolveRedirects } from "../src/redirects.js";
import { compareCrawlie, renderCrawlieDiff, type CrawlieReport } from "../src/crawlie-compare.js";

const R = (id: string) => `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${id}`;

describe("liens de redirection de Gemini (sans réseau dans les tests)", () => {
  it("ne reconnaît que les liens du service de redirection", () => {
    expect(isRedirectLink(R("abc"))).toBe(true);
    expect(isRedirectLink("https://vertexaisearch.cloud.google.com/other")).toBe(false);
    expect(isRedirectLink("https://example.org/grounding-api-redirect/x")).toBe(false);
  });

  it("résout chaque lien une fois, garde le cache, ne met pas un échec réseau en cache", async () => {
    const calls: string[] = [];
    const resolver = async (u: string) => {
      calls.push(u);
      if (u.endsWith("boom")) throw new Error("réseau");
      return u.endsWith("none") ? null : `https://site-${u.slice(-1)}.example/page`;
    };
    const urls = [R("a"), R("a"), R("b"), R("none"), R("boom"), "https://direct.example/"];
    const first = await resolveRedirects(urls, {}, resolver, 2);
    expect(first).toMatchObject({ resolved: 2, failed: 2, cached: 0 });
    expect(calls.sort()).toEqual([R("a"), R("b"), R("boom"), R("none")].sort());
    expect(first.cache[R("none")]).toBeNull();
    expect(R("boom") in first.cache).toBe(false);
    calls.length = 0;
    const second = await resolveRedirects(urls, first.cache, resolver, 2);
    expect(calls).toEqual([R("boom")]);
    expect(second.cached).toBe(3);
    expect(applyRedirects(R("a"), first.cache)).toBe("https://site-a.example/page");
    expect(applyRedirects(R("none"), first.cache)).toBe(R("none"));
    expect(applyRedirects("https://direct.example/", first.cache)).toBe("https://direct.example/");
  });
});

describe("comparaison de deux audits Crawlie", () => {
  const rep = (pages: string[], rules: string[], health: number): CrawlieReport => ({
    summary: { totalPages: pages.length, indexablePages: pages.length - 1, healthScore: health, geoScore: 30, a11yScore: 99, warnings: rules.length, notices: 0, errors: 0 },
    pages: pages.map((p) => ({ url: `https://demo.example${p}`, status: 200 })),
    issues: rules.map((rule) => ({ rule, severity: "warning", url: "https://demo.example/" })),
  });
  it("donne les écarts de scores, les pages ajoutées ou disparues et les règles qui changent", () => {
    const d = compareCrawlie(rep(["/", "/a"], ["noindex", "noindex", "image-missing-alt"], 57), rep(["/", "/b", "/c"], ["image-missing-alt"], 70));
    expect(d.pagesAdded).toEqual(["/b", "/c"]);
    expect(d.pagesRemoved).toEqual(["/a"]);
    expect(d.rules).toEqual([{ rule: "noindex", before: 2, after: 0 }]);
    const md = renderCrawlieDiff(d, "2026-11-07", "2026-11-12");
    expect(md).toMatch(/\| Score santé \| 57 \| 70 \| \+13 \|/);
  });
});

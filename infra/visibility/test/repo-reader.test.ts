import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixTargets, readRepo, summarizeRepoMap } from "../src/repo/reader";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "repos");

describe("readRepo on fictive repositories", () => {
  it("detects a Next.js repo and lists its surfaces", () => {
    const map = readRepo(join(fixtures, "nextjs-fictive"));
    expect(map.framework).toBe("nextjs");
    expect(map.headSources).toContain("app/layout.tsx");
    expect(map.pageFiles).toContain("app/page.tsx");
    expect(map.robotsTxt).toBe("public/robots.txt");
    expect(map.sitemapXml).toBeUndefined();
    expect(map.priceClientSide).toContain("app/page.tsx");
  });

  it("detects a Vite + React repo", () => {
    const map = readRepo(join(fixtures, "vite-fictive"));
    expect(map.framework).toBe("vite-react");
    expect(map.headSources).toContain("index.html");
  });

  it("detects a static HTML repo and finds JSON-LD", () => {
    const map = readRepo(join(fixtures, "html-fictive"));
    expect(map.framework).toBe("html-static");
    expect(map.robotsTxt).toBe("robots.txt");
    expect(map.sitemapXml).toBe("sitemap.xml");
    expect(map.jsonLdFiles).toContain("index.html");
    expect(map.pageFiles).toContain("index.html");
  });

  it("fixTargets routes writes to the expected default path per framework", () => {
    const next = readRepo(join(fixtures, "nextjs-fictive"));
    const html = readRepo(join(fixtures, "html-fictive"));
    const vite = readRepo(join(fixtures, "vite-fictive"));

    expect(fixTargets(next, "sitemap-xml")).toEqual({ path: "public/sitemap.xml", create: true });
    expect(fixTargets(html, "sitemap-xml")).toEqual({ path: "sitemap.xml", create: false });
    expect(fixTargets(vite, "robots-txt").path).toBe("robots.txt");
  });

  it("summarizeRepoMap renders human-readable output", () => {
    const map = readRepo(join(fixtures, "html-fictive"));
    const out = summarizeRepoMap(map);
    expect(out).toMatch(/framework\s+html-static/);
    expect(out).toMatch(/robots\.txt\s+robots\.txt/);
  });

  it("throws when the root does not exist", () => {
    expect(() => readRepo(join(fixtures, "does-not-exist"))).toThrow(/does not exist/);
  });
});

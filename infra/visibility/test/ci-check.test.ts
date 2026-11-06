import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failsWith, runChecks } from "../ci/check";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "repos");

let workRoot = "";
beforeEach(() => {
  workRoot = mkdtempSync(join(tmpdir(), "oia-vis-ci-"));
});
afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

function copyFixture(name: string) {
  const dest = join(workRoot, name);
  cpSync(join(fixtures, name), dest, { recursive: true });
  return dest;
}

describe("SEO guardrail CI (D5)", () => {
  it("passes on the html-fictive repo (clean baseline)", () => {
    const repo = copyFixture("html-fictive");
    const findings = runChecks(repo, "https://fictive-html.example.test/");
    const blocking = findings.filter((f) => f.severity !== "low");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  it("flags a missing robots.txt and an empty sitemap", () => {
    const repo = copyFixture("html-fictive");
    rmSync(join(repo, "robots.txt"));
    writeFileSync(
      join(repo, "sitemap.xml"),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
    );
    const findings = runChecks(repo, "https://fictive-html.example.test/");
    expect(findings.some((f) => f.rule === "robots-missing")).toBe(true);
    expect(findings.some((f) => f.rule === "sitemap-empty")).toBe(true);
    expect(failsWith(findings, "medium")).toBe(true);
  });

  it("flags invalid JSON-LD", () => {
    const repo = copyFixture("html-fictive");
    writeFileSync(
      join(repo, "index.html"),
      '<html><head><title>x</title><script type="application/ld+json">{ "invalid": </script></head><body></body></html>',
    );
    const findings = runChecks(repo, "https://fictive-html.example.test/");
    expect(findings.some((f) => f.rule === "jsonld-invalid")).toBe(true);
    expect(failsWith(findings, "medium")).toBe(true);
  });

  it("flags a client-side-only price on an HTML page", () => {
    const repo = copyFixture("html-fictive");
    mkdirSync(join(repo, "pricing"), { recursive: true });
    writeFileSync(
      join(repo, "pricing", "index.html"),
      // Donnée fictive : price mentionné mais aucun nombre, fetch client-side
      '<!DOCTYPE html><html><head><title>Pricing</title></head><body>' +
        '<h1>Our price</h1>' +
        '<div id="p"></div>' +
        '<script>fetch("/api/price").then(r=>r.text()).then(t=>document.getElementById("p").innerText=t)</script>' +
        '</body></html>',
    );
    const findings = runChecks(repo, "https://fictive-html.example.test/");
    expect(findings.some((f) => f.rule === "price-client-side")).toBe(true);
  });

  it("does not flag noindex as a hard failure (just low)", () => {
    const repo = copyFixture("html-fictive");
    writeFileSync(
      join(repo, "brouillon.html"),
      '<!DOCTYPE html><html><head><meta name="robots" content="noindex, nofollow"><title>Brouillon</title></head><body><p>vide</p></body></html>',
    );
    const findings = runChecks(repo, "https://fictive-html.example.test/");
    const noindex = findings.filter((f) => f.rule === "noindex-present");
    expect(noindex.length).toBeGreaterThan(0);
    // low severity: does not break a medium-threshold run.
    expect(failsWith(findings, "medium")).toBe(false);
  });

  it("flags a sitemap hosted on the wrong hostname", () => {
    const repo = copyFixture("html-fictive");
    const findings = runChecks(repo, "https://another-host.example.test/");
    expect(findings.some((f) => f.rule === "sitemap-wrong-host")).toBe(true);
    expect(failsWith(findings, "medium")).toBe(true);
  });
});

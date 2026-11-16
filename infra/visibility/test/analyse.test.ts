import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { constatsCrawl, constatsLighthouse, sansLiens, summarizeLighthouse } from "../src/analyse/lighthouse";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine, type EngineOptions } from "../src/engine/run";
import { noJudge } from "../src/judge";
import { summarizeCrawlie } from "../src/site/audit";

/** Rapport Lighthouse fictif, réduit aux champs lus. */
function lhr(perf = 0.42) {
  return {
    lighthouseVersion: "12.6.0",
    finalDisplayedUrl: "https://exemple-fictif.example/",
    categories: {
      performance: { score: perf, auditRefs: [{ id: "largest-contentful-paint", weight: 25 }, { id: "render-blocking-resources", weight: 0 }, { id: "cumulative-layout-shift", weight: 25 }] },
      accessibility: { score: 0.88, auditRefs: [{ id: "image-alt", weight: 10 }] },
      "best-practices": { score: 1, auditRefs: [] },
      seo: { score: 0.7, auditRefs: [{ id: "meta-description", weight: 1 }, { id: "is-crawlable", weight: 4.6 }] },
    },
    audits: {
      "largest-contentful-paint": { id: "largest-contentful-paint", title: "Largest Contentful Paint", description: "Le LCP mesure le temps d'affichage du plus grand élément. [En savoir plus](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint/)", score: 0.1, scoreDisplayMode: "numeric", numericValue: 6200, displayValue: "6,2 s" },
      "cumulative-layout-shift": { id: "cumulative-layout-shift", title: "Cumulative Layout Shift", description: "Stabilité visuelle de la page lors du chargement.", score: 0.95, scoreDisplayMode: "numeric", numericValue: 0.02 },
      "render-blocking-resources": { id: "render-blocking-resources", title: "Éliminez les ressources qui bloquent le rendu", description: "Des ressources bloquent le premier affichage de la page.", score: 0.3, scoreDisplayMode: "metricSavings", details: { type: "opportunity", overallSavingsMs: 1800, overallSavingsBytes: 40960 } },
      "image-alt": { id: "image-alt", title: "Les images n'ont pas d'attribut alt", description: "Les éléments informatifs doivent avoir un texte de remplacement court et descriptif.", score: 0, scoreDisplayMode: "binary" },
      "meta-description": { id: "meta-description", title: "Le document n'a pas de méta-description", description: "Les méta-descriptions peuvent être incluses dans les résultats de recherche.", score: 0, scoreDisplayMode: "binary" },
      "is-crawlable": { id: "is-crawlable", title: "La page est bloquée pour l'indexation", description: "Les moteurs ne peuvent pas inclure vos pages si elles ne peuvent pas être explorées.", score: 0, scoreDisplayMode: "binary" },
      "total-byte-weight": { id: "total-byte-weight", score: 1, numericValue: 2_048_000 },
      "network-requests": { id: "network-requests", score: null, details: { items: [1, 2, 3] } },
    },
  };
}

describe("analyse Lighthouse", () => {
  it("résume scores et métriques", () => {
    const r = summarizeLighthouse(lhr(), "mobile", "https://exemple-fictif.example");
    expect(r.statut).toBe("fait");
    expect(r.scores).toMatchObject({ performance: 0.42, accessibilite: 0.88, bonnes_pratiques: 1, seo: 0.7 });
    expect(r.metriques).toMatchObject({ lcp_ms: 6200, cls: 0.02, poids_ko: 2000, requetes: 3 });
    expect((r.resultat.opportunites as { id: string; gain_ms: number }[])[0]).toMatchObject({ id: "render-blocking-resources", gain_ms: 1800 });
  });

  it("une erreur d'exécution de Lighthouse est un échec, sans score inventé", () => {
    const r = summarizeLighthouse({ lighthouseVersion: "12.6.0", runtimeError: { code: "ERRORED_DOCUMENT_REQUEST", message: "403" } }, "ordinateur", "https://x.example");
    expect(r.statut).toBe("echec");
    expect(r.scores).toEqual({});
  });

  it("transforme les audits en échec en constats expliqués, les plus graves d'abord", () => {
    const c = constatsLighthouse(lhr(), "mobile");
    const ids = c.map((x) => x.preuve.audit);
    expect(ids).toContain("largest-contentful-paint");
    expect(ids).toContain("render-blocking-resources"); // poids nul mais gain de temps
    expect(ids).not.toContain("cumulative-layout-shift"); // réussi
    const lcp = c.find((x) => x.preuve.audit === "largest-contentful-paint")!;
    expect(lcp.gravite).toBe("critique");
    expect(lcp.cle).toBe("lighthouse:largest-contentful-paint:mobile");
    expect(lcp.correction).not.toContain("](");
    expect(lcp.preuve.documentation).toMatch(/^https:/);
    expect(c.find((x) => x.preuve.audit === "is-crawlable")!.gravite).toBe("critique");
    expect(c.find((x) => x.preuve.audit === "render-blocking-resources")!.impact).toContain("1,8 s");
    expect(c[0]!.gravite).toBe("critique");
    expect(c.every((x) => x.explication.length >= 10 && x.correction.length >= 10)).toBe(true);
  });

  it("retire les liens markdown en gardant le texte", () => {
    expect(sansLiens("Voir [la doc](https://exemple.example/a).")).toEqual({ texte: "Voir la doc.", liens: ["https://exemple.example/a"] });
  });

  it("tire des constats de l'audit de lecture", () => {
    const s = summarizeCrawlie({ config: { render: false }, summary: { totalPages: 2, indexablePages: 1 }, pages: [{ url: "https://x.example/", status: 200, text: "Bienvenue", schemaTypes: [] }, { url: "https://x.example/a", status: 200, metaRobots: "noindex" }], robotsFound: true, sitemapFound: false, llmsTxtFound: false });
    const cles = constatsCrawl(s, "https://x.example").map((c) => c.cle);
    expect(cles).toEqual(expect.arrayContaining(["crawl:noindex", "crawl:sitemap-absent", "crawl:jsonld-absent", "crawl:prix-invisibles-sans-js", "crawl:llms-txt-absent"]));
  });
});

describe("moteur : demande ANALYSE", () => {
  it("lance Lighthouse mobile et ordinateur, l'audit, écrit analyses et constats, sans appel payant", async () => {
    const root = mkdtempSync(join(tmpdir(), "oia-analyse-"));
    const db = new MemoryEngineDb(() => new Date("2026-11-16T16:00:00Z"));
    const d = db.demander({ type: "ANALYSE", client_id: "client-fictif", subject_id: "exemple-fictif-example", charge: { url: "https://exemple-fictif.example", strategies: ["mobile", "ordinateur"] } });
    const lances: string[] = [];
    const opts: EngineOptions = {
      db, dir: join(root, "moteur"), hote: "test", version: "v", env: {}, now: () => new Date("2026-11-16T16:00:00Z"),
      fetch: async () => { throw new Error("aucune lecture attendue"); },
      crawlie: ["faux"],
      collector: () => { throw new Error("aucun appel payant attendu"); },
      judge: () => noJudge(),
      runLighthouse: async (_c, _u, s) => { lances.push(s); return s === "ordinateur" ? lhr(0.95) : lhr(0.42); },
      runCrawlie: async (_c, _u, out) => { writeFileSync(out, JSON.stringify({ config: { render: false }, pages: [{ url: "https://exemple-fictif.example/", status: 200, text: "Cours à 120 €", schemaTypes: ["Organization"] }], robotsFound: true, sitemapFound: true, llmsTxtFound: true })); },
    };
    const r = await runEngine(opts);
    expect(r.traitees).toEqual([expect.objectContaining({ id: d.id, type: "ANALYSE", statut: "DONE" })]);
    expect(lances).toEqual(["mobile", "ordinateur"]);
    expect(db.analyses.map((a) => `${a.nature}:${a.strategie ?? ""}:${a.statut}`)).toEqual(["lighthouse:mobile:fait", "lighthouse:ordinateur:fait", "crawl::fait"]);
    expect(db.constats.length).toBeGreaterThan(3);
    expect(db.constats.every((c) => c.demande === d.id)).toBe(true);
  });

  it("Lighthouse en échec sur une stratégie : consigné « echec », le reste continue", async () => {
    const root = mkdtempSync(join(tmpdir(), "oia-analyse-"));
    const db = new MemoryEngineDb();
    db.demander({ type: "ANALYSE", client_id: "c", subject_id: "s-fictif", charge: { url: "https://s-fictif.example" } });
    const r = await runEngine({
      db, dir: join(root, "m"), hote: "t", version: "v", env: {}, fetch: async () => { throw new Error("x"); }, crawlie: ["faux"],
      collector: () => { throw new Error("x"); }, judge: () => noJudge(),
      runLighthouse: async (_c, _u, s) => { if (s === "mobile") throw new Error("Chrome introuvable"); return lhr(0.9); },
      runCrawlie: async () => { throw new Error("Crawlie absent"); },
    });
    expect(r.traitees[0]!.statut).toBe("DONE");
    expect(db.analyses.map((a) => a.statut)).toEqual(["echec", "fait", "echec"]);
    expect(String(db.analyses[0]!.erreur)).toContain("Chrome introuvable");
  });
});

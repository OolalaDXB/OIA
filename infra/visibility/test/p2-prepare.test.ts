import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSubject } from "../src/load.js";
import { addOfferPricePlaceholders, addSameAs, agentFindings, computeP2Fixes, runP2Mission } from "../src/p2-prepare.js";
import { readRepo } from "../src/repo/reader.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const bundle = () => {
  const b = loadSubject(join(here, "fixtures", "demo-subject"));
  b.facts.facts.push({ id: "f-ig", statement: "Profil officiel : https://www.instagram.com/demo_coach.", language: "fr", category: "contact", sourceId: "owner", status: "validated" });
  return b;
};
const LD = (offers: string) => `<html><head><title>Demo Subject · coaching en ligne et en salle</title>
<meta name="description" content="Coaching en ligne et en salle à Demo City, programmes, séances en direct et suivi de nutrition pour tous niveaux.">
<script type="application/ld+json">{"@graph":[{"@type":"Person","sameAs":["https://www.tiktok.com/@demo_coach"]},${offers}]}</script>
</head><body><h1>Demo</h1><p>Sans prix affiché.</p></body></html>`;

describe("D2 · transformations au plus juste du JSON-LD", () => {
  it("ajoute un profil manquant à sameAs, sans doublon", () => {
    const html = '"sameAs": ["https://a.example"]';
    expect(addSameAs(html, ["https://b.example"])).toBe('"sameAs": ["https://a.example", "https://b.example"]');
    expect(addSameAs(html, ["https://a.example"])).toBe(html);
  });

  it("pose prix et devise à remplir sur une Offer qui n'en a pas, jamais une valeur inventée", () => {
    const out = addOfferPricePlaceholders('{"@type": "Offer", "itemOffered": {}} {"@type": "Offer", "price": "10", "priceCurrency": "EUR"}');
    expect(out.match(/__TO_FILL__/g)).toHaveLength(2);
    expect(out).toContain('"price": "10"');
  });
});

describe("D1 · mission SEO Command en mode manuel", () => {
  const inputs = {
    crawlie: {
      issues: [
        { rule: "schema-missing-required", title: "Données structurées incomplètes", url: "https://demo.example/", detail: "Offer: missing price" },
        { rule: "description-missing", title: "Description absente", url: "https://demo.example/a" },
        { rule: "geo-no-llms-txt", title: "Pas de llms.txt", url: "https://demo.example/" },
      ],
    },
    crawlieRef: "audits/demo/crawlie.json",
    recommendations: [{ id: "rec-demo-offer-price", title: "Offer sans price", type: "TECH_FIX" }],
  };

  it("chaque agent ne rapporte que ses constats, rattachés à un contrôle du modèle", () => {
    const b = bundle();
    expect(agentFindings(b, inputs, "technique").map((f) => f.checkId)).toEqual(["E03"]);
    const seo = agentFindings(b, inputs, "seo");
    expect(seo.map((f) => [f.checkId, f.needsWriting])).toEqual([["D02", true]]);
    expect(agentFindings(b, inputs, "aeo").map((f) => f.checkId).sort()).toEqual(["E02", "H07"]);
    expect(agentFindings(b, inputs, "conversion").map((f) => f.checkId)).toEqual(["C02"]);
  });

  it("cinq missions manuelles, à 0 $, en attente de validation humaine", async () => {
    const r = await runP2Mission(bundle(), inputs, "2026-11-07");
    expect(r.missions.map((m) => m.agents[0])).toEqual(["technique", "seo", "contenu", "aeo", "conversion"]);
    for (const m of r.missions) {
      expect(m.actualCostUsd).toBe(0);
      expect(m.trigger).toBe("manual");
    }
    expect(r.missions.find((m) => m.agents[0] === "technique")?.state).toBe("waiting-validation");
    // L'agent contenu n'a aucun constat ici : mission terminée sans proposition d'écriture.
    expect(r.missions.find((m) => m.agents[0] === "contenu")?.state).toBe("done");
  });
});

describe("D2 · correctifs sur une copie locale, sans remote, rien de poussé", () => {
  function copy() {
    const dir = mkdtempSync(join(tmpdir(), "p2-"));
    const repo = join(dir, "site");
    mkdirSync(join(repo, "admin"), { recursive: true });
    writeFileSync(join(repo, "index.html"), LD('{"@type": "Offer", "itemOffered": {"name": "Coaching"}}'));
    writeFileSync(join(repo, "admin", "index.html"), '<meta name="robots" content="noindex"><title>Admin</title>');
    execFileSync("git", ["init", "-q", "-b", "main", repo]);
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
    execFileSync("git", ["-C", repo, "branch", "oia-p2-base"]);
    return { dir, repo };
  }

  it("calcule les correctifs sur les seules pages publiques déclarées", () => {
    const { repo } = copy();
    const { fixes, notes } = computeP2Fixes(bundle(), readRepo(repo), ["index.html"]);
    expect(fixes.map((f) => f.slug)).toEqual(["sameas-profils", "offres-prix", "prix-sans-js"]);
    expect(fixes.find((f) => f.slug === "offres-prix")?.blockedBy).toMatch(/prix validés/);
    // La page d'administration en noindex n'est pas une page publique : pas de correctif.
    expect(notes.join("\n")).toMatch(/levée du noindex est sans objet/);
  });

  it("produit fiche de décision et demandes de fusion simulées, et refuse une copie avec un remote", () => {
    const { dir, repo } = copy();
    const subjects = join(dir, "subjects");
    cpSync(join(here, "fixtures", "demo-subject"), join(subjects, "demo-subject"), { recursive: true });
    const audit = join(subjects, "demo-subject", "audits", "2026-11-01");
    mkdirSync(audit, { recursive: true });
    writeFileSync(join(audit, "crawlie.json"), JSON.stringify({ issues: [] }));
    writeFileSync(join(subjects, "demo-subject", "freeze-surface.yaml"), "publicFiles: [index.html]\n");
    const out = join(dir, "p2");
    const env = { ...process.env, OIA_VIS_SUBJECTS_DIR: subjects };
    const ok = spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "src/p2-prepare.ts"), "demo-subject", repo, out], { encoding: "utf8", env });
    expect(ok.status, ok.stderr).toBe(0);
    const decisions = readFileSync(join(out, "decisions.md"), "utf8");
    expect(decisions).toMatch(/Rien n'est poussé/);
    expect(decisions).toMatch(/\[ \] valider/);
    const pr = readFileSync(join(out, "prs", "01-offres-prix.md"), "utf8");
    expect(pr).toMatch(/en attente de validation par Mickaël/);
    expect(pr).toMatch(/\+.*"price": "__TO_FILL__"/);
    // Le diff réel ne recopie pas le fichier entier.
    expect(pr.split("\n").length).toBeLessThan(60);
    execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://example.invalid/site.git"]);
    const refused = spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "src/p2-prepare.ts"), "demo-subject", repo, out], { encoding: "utf8", env });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/a un remote/);
  });
});

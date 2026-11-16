import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { renderClientPage, writeClientPage, type Comparison, type EngineComparison } from "../src/client-page";
import type { Presence, ReportFigures } from "../src/j0-report";
import { identifyingTerms, loadSubject, loadSubjects } from "../src/load";
import { RecommendationSchema, type Recommendation } from "../src/recommendation";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const FIXTURE = join(here, "fixtures", "demo-subject");

/** Copie temporaire du sujet fictif, avec des champs de subject.yaml remplacés. */
function demo(patch: Record<string, unknown> = {}, recs?: unknown[]) {
  const root = mkdtempSync(join(tmpdir(), "oia-vis-page-"));
  const dir = join(root, "demo-subject");
  cpSync(FIXTURE, dir, { recursive: true });
  const subject = readFileSync(join(dir, "subject.yaml"), "utf8");
  const extra = Object.entries(patch).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
  writeFileSync(join(dir, "subject.yaml"), `${subject.replace(/^displayName: .*$/m, patch.displayName ? "" : "$&")}\n${extra}\n`);
  if (recs) writeFileSync(join(dir, "recommendations.yaml"), stringify({ schemaVersion: 1, recommendations: recs }));
  return { root, dir, b: loadSubject(dir) };
}

const presence = (judged: number, mentioned: number, presencePct: number): Presence => ({
  responses: judged + 1,
  unmeasured: 1,
  judged,
  mentioned,
  presencePct,
  daily: [{ day: 1, pct: presencePct }],
  minPct: presencePct,
  maxPct: presencePct,
});
const prov = { evidenceCount: 23, digest: "a".repeat(64) };

function figures(unbrandedPct = 12.5): ReportFigures {
  return {
    reportFormat: 2,
    subjectId: "demo-subject",
    windowId: "j0",
    status: "à valider par Mickaël",
    window: { startedAt: "2026-03-14T09:30:00.000Z", days: 7, daysWithResponses: [1, 2, 3, 4, 5, 6, 7], missingDays: [], failedRuns: 0 },
    scope: {
      prompts: [
        { id: "en-01", version: 1, family: "unbranded" },
        { id: "en-02", version: 1, family: "branded" },
      ],
      excludedPromptIds: [],
    },
    perEngine: [
      {
        engine: "chatgpt",
        versions: ["gpt-x"],
        responses: 23,
        unmeasured: 2,
        unmeasuredDaily: [{ day: 1, n: 2 }],
        unbranded: presence(16, 2, unbrandedPct),
        branded: presence(4, 3, 75),
        estimatedCostUsd: 0.4321,
        provenance: prov,
      },
    ],
    total: { responses: 23, unmeasured: 2, unbranded: presence(16, 2, unbrandedPct), branded: presence(4, 3, 75), provenance: prov },
    sources: { brandSite: 6, brandProfiles: 9, topDomains: [{ domain: "directory.example", n: 41 }, { domain: "reviews.example", n: 17 }], provenance: prov },
    competitorsInstead: [
      { name: "Rival Co", runs: 13, rejectedByOia: false },
      { name: "Noise Ltd", runs: 8, rejectedByOia: true },
    ],
    factCheck: [],
    spend: { estimatedUsd: 0.4321, worstCaseRuns: 0, realUsd: null, realNote: "", provenance: prov },
  };
}

const rec = (id: string, title: string, extra: Partial<Recommendation> = {}): Recommendation =>
  RecommendationSchema.parse({
    id,
    schemaVersion: 1,
    type: "TECH_FIX",
    clientId: "fictive-client",
    subjectId: "demo-subject",
    title,
    statement: "Donnée fictive pour le test de la page client.",
    evidence: [{ kind: "other", ref: "fixture" }],
    impact: { level: "medium" },
    effort: { level: "S" },
    risk: "low",
    confidence: "medium",
    decision: { status: "pending" },
    createdBy: "test",
    createdAt: "2026-03-20",
    ...extra,
  });
const accepted = { status: "accepted" as const, by: "Owner", at: "2026-03-22" };
const RECS = [
  rec("rec-pending-one", "Pending idea never shown", {}),
  rec("rec-client-profile", "Claim the directory profile", { owner: "client", decision: accepted, blockedBy: "opening hours to confirm" }),
  rec("rec-team-sitemap", "Publish the sitemap", { owner: "team", decision: accepted, execution: { executedAt: "2026-03-25", proof: { kind: "url", ref: "https://demo.example/sitemap.xml" }, declaredBy: "Owner" } }),
];

/** Texte visible de la page : sans style, sans balises, entités décodées. */
const visibleText = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

const nextWindow = { id: "j1", kind: "follow-up" as const, comparesWith: "j0", days: 7, panelVersion: 1, status: "planned" as const, missingDays: [] };

describe("page client (bloc E)", () => {
  it("en : ne contient que les données du sujet fictif, chaque chiffre vient des entrées", () => {
    const { b } = demo();
    const f = figures();
    const html = renderClientPage(b, f, { recommendations: RECS, nextWindow });
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain("Demo Subject appears in 12.5% of AI assistants");
    expect(html).toContain("Which demo tools are best?");
    expect(html).toContain("What does Demo Subject offer?");
    expect(html).toContain("demo.example");
    expect(html).toContain("Rival Co");
    expect(html).not.toContain("Noise Ltd");
    expect(html).toContain("date to be set");
    // Aucun chiffre inventé : chaque nombre visible est une valeur des entrées, ou le nombre de questions ou d'assistants.
    const allowed = new Set([
      ...numbers(JSON.stringify(f)),
      ...numbers(JSON.stringify(nextWindow)),
      ...numbers(JSON.stringify(RECS.map((r) => r.execution?.executedAt ?? ""))),
      f.scope.prompts.length,
      f.perEngine.length,
    ]);
    const stray = numbers(visibleText(html)).filter((n) => !allowed.has(n));
    expect(stray).toEqual([]);
    // Aucune chaîne d'un autre sujet : ni nom, ni domaine, ni alias des sujets définis dans subjects/.
    const others = loadSubjects(join(ROOT, "subjects")).flatMap(identifyingTerms);
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter((t) => html.toLowerCase().includes(t.toLowerCase()))).toEqual([]);
  });

  it("fr : langue du client (clientLanguage), textes et nombres à la française", () => {
    const { b } = demo({ clientLanguage: "fr" });
    const html = renderClientPage(b, figures(), { recommendations: RECS, nextWindow: { ...nextWindow, start: "2026-04-20" } });
    expect(html).toMatch(/<html lang="fr">/);
    expect(html).toContain("Demo Subject apparaît dans 12,5 % des réponses");
    expect(html).toContain("Votre part");
    expect(html).toContain("Ce dont nous nous occupons");
    expect(html).toContain("commence le 20 avril 2026");
    expect(html).toContain("« Which demo tools are best? »");
  });

  it("0 % : le sujet n'apparaît pas encore", () => {
    const { b } = demo({ clientLanguage: "fr" });
    const html = renderClientPage(b, figures(0), { recommendations: [] });
    expect(html).toContain("Demo Subject n'apparaît pas encore");
    expect(html).toContain("La prochaine mesure n'est pas encore planifiée.");
  });

  it("actions : seules les validées, client et équipe à leur place, bloquée et faite signalées", () => {
    const { b } = demo();
    const html = renderClientPage(b, figures(), { recommendations: RECS });
    expect(html).not.toContain("Pending idea never shown");
    const client = html.slice(html.indexOf("<h2>Your part</h2>"), html.indexOf("<h2>What we take care of</h2>"));
    const team = html.slice(html.indexOf("<h2>What we take care of</h2>"));
    expect(client).toContain("Claim the directory profile");
    expect(client).toContain("waiting for: opening hours to confirm");
    expect(client).not.toContain("Publish the sitemap");
    expect(team).toContain("Publish the sitemap");
    expect(team).toContain("done on 25 March 2026");
    expect(team).not.toContain("Claim the directory profile");
  });

  it("aucune recommandation validée : une phrase dit qu'elles sont en cours de validation, pas de liste vide", () => {
    const { b } = demo({ clientLanguage: "fr" });
    const html = renderClientPage(b, figures(), { recommendations: [RECS[0]!] });
    expect(html).not.toContain("Pending idea never shown");
    expect(html.match(/Les actions sont en cours de validation\./g)).toHaveLength(2);
    expect(html).not.toContain('<ul class="actions"></ul>');
  });

  it("échappe tout texte issu des données (nom piégé)", () => {
    const { b } = demo({ displayName: "<script>alert(1)</script> Demo Subject" });
    const html = renderClientPage(b, figures(), { recommendations: [rec("rec-trap-title", `Fix "this" & <b>that</b>`, { decision: accepted })] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Demo Subject");
    expect(html).toContain("Fix &quot;this&quot; &amp; &lt;b&gt;that&lt;/b&gt;");
  });

  it("refuse une langue non gérée", () => {
    const { b } = demo({ clientLanguage: "de" });
    expect(() => renderClientPage(b, figures(), { recommendations: [] })).toThrow(/langue "de" non gérée/);
  });

  it("section de comparaison seulement si elle est fournie ; verdict rendu tel quel, fragilité signalée", () => {
    const { b } = demo({ clientLanguage: "fr" });
    const without = renderClientPage(b, figures(), { recommendations: [] });
    expect(without).not.toContain("Par rapport à");
    const rate = (mean: number, lo: number, hi: number) => ({ mean, ci95: [lo, hi] as [number, number], days: 7, dailyRates: [] });
    const eng = (engine: string, fragile: boolean): EngineComparison => ({
      engine,
      reference: rate(10, 4.2, 15.8),
      current: rate(12.5, 6.1, 18.9),
      verdict: "pas de changement démontrable",
      fragile,
      fragileReason: fragile ? "version servie différente" : undefined,
      versions: { reference: ["gpt-x"], current: ["gpt-y"] },
      unmeasured: { reference: 0, current: 2 },
    });
    const c: Comparison = {
      comparisonFormat: 1,
      subjectId: "demo-subject",
      windowId: "j0",
      referenceId: "j-ref",
      unbranded: { perEngine: [eng("chatgpt", true)], total: eng("total", false) },
      branded: { perEngine: [], total: eng("total", false) },
      executedRecommendations: [{ id: "rec-team-sitemap", title: "Publish the sitemap", executedAt: "2026-03-25", proof: "url" }],
    };
    const html = renderClientPage(b, figures(), { recommendations: [], comparison: c });
    expect(html).toContain("<h2>Par rapport à J-REF</h2>");
    expect(html).toContain("Demo Subject : pas de changement démontrable depuis J-REF");
    expect(html.match(/<td>pas de changement démontrable/g)).toHaveLength(2);
    expect(html).toContain("fragile</span> <span class=\"muted\">version servie différente");
    expect(html).toContain("10 % <span class=\"muted\">[4,2 – 15,8 %]");
    expect(html).toContain("Aucune évolution n'est affirmée sans intervalles disjoints");
    expect(html).toContain("contexte, pas une cause prouvée");
    expect(html).toContain("Publish the sitemap");
  });

  it("page autonome et lisible sur téléphone : pas de script, mode sombre, tableaux défilants", () => {
    const { b } = demo();
    const html = renderClientPage(b, figures(), { recommendations: [] });
    expect(html).not.toMatch(/<script|<link|@import|https?:\/\/(?!demo\.example)/);
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])');
    expect(html).toContain(':root[data-theme="dark"]');
    expect(html).toMatch(/body\{[^}]*background:var\(--bg\)/);
    expect(html).toContain('<div class="table-wrap"><table>');
  });

  it("CLI : écrit page-client.html, sujet cherché dans OIA_VIS_SUBJECTS_DIR, recommandations du dossier du sujet", () => {
    const { root, dir } = demo({}, RECS);
    const out = join(root, "out");
    const fig = join(root, "figures.json");
    writeFileSync(fig, JSON.stringify(figures()));
    const r = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "src/client-page.ts"), "demo-subject", "j0", fig, out], {
      encoding: "utf8",
      env: { ...process.env, OIA_VIS_SUBJECTS_DIR: root },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(join(out, "page-client.html"));
    const html = readFileSync(join(out, "page-client.html"), "utf8");
    expect(html).toContain("Claim the directory profile");
    expect(html).not.toContain("Pending idea never shown");
    expect(dir).toContain("demo-subject");
    expect(writeClientPage(join(root, "out2"), "x")).toBe(join(root, "out2", "page-client.html"));
  });
});

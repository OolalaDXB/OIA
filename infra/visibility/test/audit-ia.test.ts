import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classementConcurrents, noterReponse, scores, type LigneMatrice } from "../src/audit-ia/express";
import type { Collector } from "../src/collector";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine } from "../src/engine/run";
import { noJudge } from "../src/judge";
import type { FetchedPage } from "../src/site/pages";

const config = { brand: { name: "Studio Fictif", aliases: [], domains: ["https://studio-fictif.example", "studio-fictif.example"] }, competitors: [] };

describe("notation d'une réponse (déterministe)", () => {
  it("3 si la marque est citée avec son site en source, 2 citée, 1 citée car nommée, 0 absente", () => {
    expect(noterReponse("Try **Studio Fictif** for padel.", [{ url: "https://studio-fictif.example/padel" }], config, false).score).toBe(3);
    expect(noterReponse("Try **Studio Fictif** for padel.", [{ url: "https://autre.example" }], config, false).score).toBe(2);
    expect(noterReponse("Studio Fictif is a coach.", [], config, true).score).toBe(1);
    const n = noterReponse("The best are **Alpha Padel** and **Beta Club**.", [{ url: "https://www.annuaire.example/x" }], config, false);
    expect(n.score).toBe(0);
    expect(n.concurrents).toEqual(["Alpha Padel", "Beta Club"]);
    expect(n.domaines).toEqual(["annuaire.example"]);
  });

  it("scores par moteur et global, barème sur 3 points", () => {
    const m: LigneMatrice[] = [
      { id: "K01", sujet: "a", question: "q", marquee: false, scores: { chatgpt: 0, gemini: 3 }, concurrents: { chatgpt: ["X"], gemini: ["X", "Y"] }, domaines: {} },
      { id: "K02", sujet: "b", question: "q", marquee: true, scores: { chatgpt: 1, gemini: 1 }, concurrents: {}, domaines: {} },
    ];
    const s = scores(m, ["chatgpt", "gemini"]);
    expect(s.parMoteur).toEqual({ chatgpt: 17, gemini: 67 });
    expect(s.global).toBe(42);
    expect(s.sansNom).toEqual({ citees: 1, total: 2 });
    expect(classementConcurrents(m)[0]).toEqual({ nom: "X", reponses: 2, moteurs: 2 });
  });
});

describe("moteur : demande AUDIT_IA", () => {
  const page = (url: string, body: string): FetchedPage => ({ url, finalUrl: url, status: 200, contentType: "text/html", body } as unknown as FetchedPage);
  const site = async (url: string) =>
    url.endsWith("/robots.txt") ? page(url, "User-agent: *\nAllow: /") : page(url, "<html><head><title>Studio Fictif · padel</title></head><body><h1>Padel coaching</h1><p>Cours de padel à Exempleville.</p></body></html>");
  const fauxLlm = () => {
    let calls = 0;
    return {
      name: "faux",
      defaultModel: "faux",
      usage: () => ({ inputTokens: 1000 * calls, outputTokens: 500 * calls }),
      async extract(req: { schemaName: string; schema: { parse: (x: unknown) => unknown } }) {
        calls++;
        const data =
          req.schemaName === "AuditQuestions"
            ? { questions: Array.from({ length: 5 }, (_, i) => ({ sujet: `sujet ${i}`, question: `Best padel coach number ${i} in Exempleville?`, ...(i === 0 ? {} : { langue: "en" }), marquee: i === 4, source: null })) }
            : { resume: "Résumé fictif de l'audit, marque peu citée.", actions: [1, 2, 3].map((i) => ({ priorite: "P0", type: "SOURCE_TARGET", titre: `Action fictive ${i}`, action: "Faire une action fictive précise et vérifiable.", pourquoi: "Parce que les IA citent cet annuaire.", questions: ["K01"], impact: "high", effort: "S" })), entites: [{ nom: "Alpha Padel", nature: "Plateforme" }, { nom: "Inventé", nature: "concurrent" }] };
        return { data: req.schema.parse(data), run: { provider: "faux", model: "faux", promptHash: "x" } };
      },
    };
  };
  const fauxCollecteur = (appels: string[], cout = 0.01): Collector => ({
    name: "oia-direct",
    async collect(req) {
      appels.push(`${req.promptId}:${req.engine}`);
      const cite = req.engine === "gemini" && req.promptId === "audit-k01";
      return { collectorName: "oia-direct", collectorRunId: "r", rawText: cite ? "Try **Studio Fictif**." : "Try **Alpha Padel**.", structured: {}, citations: cite ? [{ url: "https://studio-fictif.example" }] : [{ url: "https://annuaire.example" }], costUsd: cout, receivedAt: "2026-11-16T20:00:00Z" };
    },
  });

  function preparer(go = true) {
    const db = new MemoryEngineDb(() => new Date("2026-11-16T20:00:00Z"));
    db.sujets.set("studio-fictif", { subject_id: "studio-fictif", client_id: "client-fictif", client_nom: "Client fictif", site_url: "https://studio-fictif.example", nom: "Studio Fictif", langues: ["en"], marches: ["AE"], panel_version: null, executions: [], plafond_usd: 50, plafond_global_usd: 100 });
    if (go) db.auditsGo.add("audit-1");
    const d = db.demander({ type: "AUDIT_IA", client_id: "client-fictif", subject_id: "studio-fictif", charge: { audit_id: "audit-1", url: "https://studio-fictif.example", nom: "Studio Fictif", questions: 5, cibles: ["chatgpt:openai-api:gpt-6-luna:online", "gemini:openrouter:google/gemini-3-flash-preview:online"], langues: ["en"], cout_max_usd: 5 } });
    return { db, d };
  }
  const opts = (db: MemoryEngineDb, appels: string[], cout = 0.01) => ({
    db, dir: join(mkdtempSync(join(tmpdir(), "oia-audit-")), "m"), hote: "t", version: "v", env: {}, now: () => new Date("2026-11-16T20:00:00Z"),
    fetch: site, crawlie: ["faux"], allowedLocal: ["studio-fictif.example"],
    collector: () => fauxCollecteur(appels, cout), judge: () => noJudge(), auditLlm: fauxLlm,
  });

  it("collecte une passe par question et par moteur, note, rend le résultat et le plan en recommandations", async () => {
    const { db, d } = preparer();
    const appels: string[] = [];
    const r = await runEngine(opts(db, appels) as never);
    expect(r.traitees[0]).toMatchObject({ id: d.id, type: "AUDIT_IA", statut: "DONE" });
    expect(appels).toHaveLength(10);
    expect(db.evidence.size).toBe(10);
    const a = db.audits[0]!;
    expect(a.moteurs).toEqual(["chatgpt", "gemini"]);
    expect((a.matrice as { scores: Record<string, number> }[])[0]!.scores).toEqual({ chatgpt: 0, gemini: 3 });
    expect(String(a.rapport_md)).toContain("Plan d'action");
    expect(db.recos.size).toBe(3);
    // Nature des entités : seulement celles relevées dans les réponses ; le rapport les sépare.
    expect(db.entites).toEqual([{ subject_id: "studio-fictif", entite: "Alpha Padel", nature: "plateforme" }]);
    expect(String(a.rapport_md)).toContain("Plateformes, applications et annuaires");
    expect(r.traitees[0]!.resultat).toMatchObject({ questions: 5, reponses: 10, echecs: 0, recommandations: 3 });
  });

  it("sans GO en base : refusée, aucun appel payant", async () => {
    const { db } = preparer(false);
    const appels: string[] = [];
    const r = await runEngine(opts(db, appels) as never);
    expect(r.traitees[0]!.statut).toBe("FAILED");
    expect(appels).toHaveLength(0);
  });

  it("réponse vide : gardée non mesurée, jamais notée ; écriture en échec : résultat calculé quand même", async () => {
    const { db } = preparer();
    const vide: Collector = {
      name: "oia-direct",
      async collect(req) {
        return { collectorName: "oia-direct", collectorRunId: "r", rawText: req.engine === "chatgpt" ? "" : "Try **Alpha Padel**.", structured: {}, citations: [], costUsd: 0.01, receivedAt: "2026-11-16T20:00:00Z" };
      },
    };
    db.preuves = async () => { throw new Error("violation de contrainte (23514)"); };
    const r = await runEngine({ ...opts(db, []), collector: () => vide } as never);
    expect(r.traitees[0]!.statut).toBe("DONE");
    expect(r.traitees[0]!.resultat).toMatchObject({ vides: 5, preuves_erreur: "violation de contrainte (23514)" });
    expect((db.audits[0]!.matrice as { scores: Record<string, number> }[])[0]!.scores).toEqual({ gemini: 0 });
  });

  it("s'arrête au coût engagé", async () => {
    const { db } = preparer();
    const appels: string[] = [];
    const r = await runEngine(opts(db, appels, 2) as never);
    expect(r.traitees[0]!.resultat).toMatchObject({ arret_plafond: true });
    expect(appels.length).toBeLessThan(10);
  });
});

describe("forme des réponses du modèle", () => {
  it("replace le tableau attendu sous sa clé, sans toucher au contenu", async () => {
    const { enveloppe } = await import("../src/llm-forme");
    const e = enveloppe("questions");
    expect(e([1, 2])).toEqual({ questions: [1, 2] });
    expect(e({ AuditQuestions: [1] })).toEqual({ AuditQuestions: [1], questions: [1] });
    expect(e({ questions: [3], autres: [4] })).toEqual({ questions: [3], autres: [4] });
    expect(e({ a: [1], b: [2] })).toEqual({ a: [1], b: [2] });
  });
});

describe("moteur : demande EXTRAIRE_PLAN", () => {
  const rapport = "# Audit externe fictif\n\n" + "Le site Studio Fictif n'est pas relié depuis l'accueil vers ses pages d'offre. ".repeat(6);
  const fauxLlm = () => ({
    name: "faux", defaultModel: "faux", usage: () => ({ inputTokens: 5000, outputTokens: 800 }),
    async extract(req: { schema: { parse: (x: unknown) => unknown } }) {
      return { data: req.schema.parse([{ priorite: "p0", type: "tech_fix", titre: "Relier les offres depuis l'accueil", action: "Ajouter un lien vers chaque page d'offre dans l'accueil.", pourquoi: "Le rapport note des pages orphelines.", impact: "High", effort: "xs" }, { priorite: "P1", type: "SOURCE_TARGET", titre: "Être dans les annuaires cités", action: "Créer une fiche dans les annuaires cités par le rapport.", pourquoi: "Les concurrents y figurent.", impact: "high", effort: "M" }, { priorite: "P2", type: "CONTENT_GAP", titre: "Publier les prix en texte", action: "Afficher un prix de départ par offre, en texte.", pourquoi: "Les IA citent les prix publiés.", impact: "medium", effort: "S" }]) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
    },
  });
  function preparer(go = true) {
    const db = new MemoryEngineDb(() => new Date("2026-11-16T20:00:00Z"));
    if (go) db.plansGo.set("ex-1", { audit_externe_id: "a6513f39-0000-0000-0000-000000000000", outil: "Perplexity Computer", realise_le: "2026-11-16", resume: null, rapport_md: rapport, cout_max_usd: 0.25 });
    const d = db.demander({ type: "EXTRAIRE_PLAN", client_id: "client-fictif", subject_id: "studio-fictif", charge: { extraction_id: "ex-1", audit_externe_id: "a6513f39-0000-0000-0000-000000000000", cout_max_usd: 0.25 } });
    return { db, d };
  }
  const opts = (db: MemoryEngineDb) => ({
    db, dir: join(mkdtempSync(join(tmpdir(), "oia-plan-")), "m"), hote: "t", version: "v", env: {}, now: () => new Date("2026-11-16T20:00:00Z"),
    fetch: async () => { throw new Error("aucune lecture"); }, crawlie: ["faux"], auditLlm: fauxLlm,
    collector: () => { throw new Error("aucune collecte"); }, judge: () => noJudge(),
  });
  it("verse le plan du rapport en recommandations, avec l'origine", async () => {
    const { db, d } = preparer();
    const r = await runEngine(opts(db) as never);
    expect(r.traitees[0]!.erreur).toBeNull();
    expect(r.traitees[0]).toMatchObject({ id: d.id, type: "EXTRAIRE_PLAN", statut: "DONE" });
    expect(db.recos.size).toBe(3);
    const rec = [...db.recos.values()][0]!;
    expect(rec.createdBy).toBe("rapport-externe:perplexity-computer:2026-11-16");
    expect(rec.priorite_audit).toBe("P0");
  });
  it("sans GO : refusée", async () => {
    const { db } = preparer(false);
    const r = await runEngine(opts(db) as never);
    expect(r.traitees[0]!.statut).toBe("FAILED");
    expect(db.recos.size).toBe(0);
  });
});

describe("Grok par OpenRouter : coût de recherche borné", () => {
  it("recherche Exa plafonnée à 5 résultats pour x-ai, :online inchangé pour les autres", async () => {
    const { openrouterRequestBody } = await import("../src/collector-oia/openrouter");
    const g = openrouterRequestBody("x-ai/grok-4.7:online", "q", true);
    expect(g.model).toBe("x-ai/grok-4.7");
    expect(g.plugins).toEqual([{ id: "web", engine: "exa", max_results: 5 }]);
    const p = openrouterRequestBody("perplexity/sonar", "q", true);
    expect(p.model).toBe("perplexity/sonar:online");
    expect(p.plugins).toBeUndefined();
  });
});

describe("mesure mensuelle : mêmes questions que la mesure précédente", () => {
  it("reprend les questions fixées sans les faire réécrire par le modèle, et garde langue et marque", async () => {
    const db = new MemoryEngineDb(() => new Date("2026-12-01T08:00:00Z"));
    db.sujets.set("studio-fictif", { subject_id: "studio-fictif", client_id: "client-fictif", client_nom: "C", site_url: "https://studio-fictif.example", nom: "Studio Fictif", langues: ["en"], marches: ["AE"], panel_version: null, executions: [], plafond_usd: 5, plafond_global_usd: 20 });
    db.auditsGo.add("audit-m");
    const fixes = Array.from({ length: 5 }, (_, i) => ({ id: `K0${i + 1}`, sujet: `sujet ${i}`, question: i === 4 ? "Is Studio Fictif a good padel coach?" : `Best padel coach number ${i} in Exempleville?`, marquee: i === 4, langue: "en" }));
    db.demander({ type: "AUDIT_IA", client_id: "client-fictif", subject_id: "studio-fictif", charge: { audit_id: "audit-m", url: "https://studio-fictif.example", nom: "Studio Fictif", questions: 5, cibles: ["chatgpt:openai-api:gpt-6-luna:online"], langues: ["en"], cout_max_usd: 2, mensuelle: true, questions_fixes: fixes } });
    const schemas: string[] = [];
    const llm = () => ({
      name: "faux", defaultModel: "faux", usage: () => ({ inputTokens: 0, outputTokens: 0 }),
      async extract(req: { schemaName: string; schema: { parse: (x: unknown) => unknown } }) {
        schemas.push(req.schemaName);
        return { data: req.schema.parse({ resume: "Résumé fictif.", actions: [1, 2, 3].map((i) => ({ priorite: "P1", type: "SOURCE_TARGET", titre: `Action fictive ${i}`, action: "Faire une action fictive précise.", pourquoi: "Raison fictive donnée.", questions: [], impact: "high", effort: "S" })) }) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
      },
    });
    const collecte: string[] = [];
    const r = await runEngine({
      db, dir: join(mkdtempSync(join(tmpdir(), "oia-mens-")), "m"), hote: "t", version: "v", env: {}, now: () => new Date("2026-12-01T08:00:00Z"),
      fetch: async (url: string) => ({ url, finalUrl: url, status: 200, contentType: "text/html", body: "<html><title>Studio Fictif</title><body>Padel</body></html>" }), crawlie: ["faux"], allowedLocal: ["studio-fictif.example"],
      collector: () => ({ name: "oia-direct", async collect(req: { promptText: string; engine: string }) { collecte.push(req.promptText); return { collectorName: "oia-direct", collectorRunId: "r", rawText: "Try **Alpha Padel**.", structured: {}, citations: [], costUsd: 0.01, receivedAt: "2026-12-01T08:00:00Z" }; } }),
      judge: () => noJudge(), auditLlm: llm,
    } as never);
    expect(r.traitees[0]!.statut).toBe("DONE");
    expect(schemas).toEqual(["AuditPlan"]); // aucune question réécrite
    expect(collecte).toEqual(fixes.map((q) => q.question));
    const m = db.audits[0]!.matrice as { id: string; marquee: boolean; langue: string }[];
    expect(m.map((x) => x.id)).toEqual(["K01", "K02", "K03", "K04", "K05"]);
    expect(m[4]).toMatchObject({ marquee: true, langue: "en" });
  });
});

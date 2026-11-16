import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { EvidenceRow } from "../src/elmo-import.js";
import { sha256Hex } from "../src/evidence-store.js";
import { computeFigures, type FactKeywords } from "../src/j0-report.js";
import { loadSubject } from "../src/load.js";
import { citesPrice, generateRecommendations, neighbourNames, recommendationId, type GeneratorOptions } from "../src/reco-generators.js";
import { mergeRecommendations, mergeRecommendationsFile } from "../src/reco-merge.js";
import { RecommendationsFileSchema, type Recommendation } from "../src/recommendation.js";
import type { SubjectBundle } from "../src/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const START = "2026-11-01T09:00:00Z";

/** Sujet fictif : site, un profil officiel, un concurrent suivi, un fait de prix extrait (non validé). */
function bundle(extraFacts: SubjectBundle["facts"]["facts"] = []): SubjectBundle {
  const b = structuredClone(loadSubject(join(here, "fixtures", "demo-subject")));
  b.facts.facts.push(
    { id: "f-contact", statement: "Profil officiel : https://social.example/demosubject", language: "en", category: "contact", sourceId: "owner", status: "validated" },
    { id: "f-prices", statement: "Prix à fournir par le client", language: "en", category: "price", sourceId: "owner", status: "extracted" },
    ...extraFacts,
  );
  return b;
}

let n = 0;
function row(o: { prompt: "en-01" | "en-02"; engine?: string; text: string; citations?: string[]; mentioned?: boolean | null; day?: number }): EvidenceRow {
  n++;
  const id = `fx:${String(n).padStart(4, "0")}`;
  return {
    id,
    clientId: "client-fictif",
    siteId: null,
    subjectId: "demo-subject",
    windowId: "j0",
    promptId: o.prompt,
    promptVersion: 1,
    promptLanguage: "en",
    engine: o.engine ?? "chatgpt",
    engineVersion: "v-fictive",
    collectorName: "fixture",
    collectorRunId: id,
    receivedAt: new Date(Date.parse(START) + (o.day ?? 0) * 86_400_000 + n * 1000).toISOString(),
    rawText: o.text,
    rawSha256Hex: sha256Hex(o.text),
    structured: { brandMentioned: o.mentioned ?? null, competitorsMentioned: [], costFromUsage: true },
    citations: (o.citations ?? []).map((url) => ({ url })),
    costUsd: 0.01,
  };
}

function evidence(): EvidenceRow[] {
  n = 0;
  return [
    // Annuaire cité 3 fois sans la marque.
    row({ prompt: "en-01", text: "Try Rival Co or Nova Trainer.", citations: ["https://directory.example/a", "https://directory.example/b"], mentioned: false }),
    row({ prompt: "en-01", engine: "claude", text: "Nova Trainer is popular.", citations: ["https://directory.example/c"], mentioned: false, day: 1 }),
    // Forum cité 3 fois, mais une fois avec le profil officiel de la marque : pas une cible.
    row({ prompt: "en-01", text: "Demo Subject is good.", citations: ["https://forum.example/x", "https://social.example/demosubject"], mentioned: true }),
    row({ prompt: "en-01", text: "Nova Trainer again.", citations: ["https://forum.example/y", "https://forum.example/z", "https://rival.example/"], mentioned: false }),
    // Question marquée : la réponse parle d'un nom voisin et d'un homonyme, avec un prix.
    row({ prompt: "en-02", text: "Demo Subjekt charges 300 EUR per session. Dr Echo Lambda also coaches.", mentioned: false }),
    row({ prompt: "en-02", engine: "claude", text: "Dr Echo Lambda offers demos for $50.", mentioned: false, day: 1 }),
    // Réponse qui nomme la marque et contredit un fait.
    row({ prompt: "en-02", text: "Demo Subject is based in Lisbon.", mentioned: true, day: 1 }),
  ];
}

const KEYWORDS: FactKeywords = { facts: [{ id: "f-city", keywords: ["London"], contradictions: ["Lisbon"] }] };
const CITY = { id: "f-city", statement: "Demo Subject is based in London", language: "en" as const, category: "location" as const, sourceId: "owner", status: "validated" as const };

function setup(opts: Partial<GeneratorOptions> = {}) {
  const b = bundle([CITY]);
  const ev = evidence();
  const figures = computeFigures(b, "j0", ev, { startedAt: START, days: 2 }, [], KEYWORDS);
  const o: GeneratorOptions = {
    clientId: "client-fictif",
    today: "2026-11-16",
    figuresRef: "reports/j0/figures.json",
    homonyms: [{ name: "Dr Echo Lambda" }],
    indexAudit: { bing: "absent", google: "present", ref: "audit/indexation.json" },
    crawlie: {
      ref: "audit/crawlie.json",
      issues: [
        { rule: "price-client-side", url: "https://demo.example/tarifs" },
        { rule: "schema-missing-required", url: "https://demo.example/" },
        { rule: "structured-data-missing", url: "https://demo.example/a" },
        { rule: "title-missing", url: "https://demo.example/b" },
      ],
    },
    factKeywords: KEYWORDS,
    actors: [{ name: "Nova Trainer", type: "personne" }, { name: "Rival Co", type: "structure" }, { name: "Rare Name", type: "personne" }],
    ...opts,
  };
  return { b, ev, figures, o, recs: generateRecommendations(b, figures, ev, o) };
}

const ofType = (rs: Recommendation[], t: Recommendation["type"]) => rs.filter((r) => r.type === t);

describe("reco-generators", () => {
  it("SOURCE_TARGET : domaine cité sans la marque, seuil et nombre maximal", () => {
    const { recs } = setup();
    const st = ofType(recs, "SOURCE_TARGET");
    expect(st.map((r) => r.title)).toEqual(["Être présent sur directory.example"]);
    expect(st[0]!.owner).toBe("client");
    expect(st[0]!.evidence.filter((e) => e.kind === "evidence-row").map((e) => e.ref)).toEqual(["fx:0001", "fx:0002"]);
    expect(st[0]!.evidence[0]).toMatchObject({ ref: "reports/j0/figures.json#sources.topDomains" });
    expect(st[0]!.statement).toMatch(/Vérification à la remesure/);
    expect(ofType(setup({ sourceTarget: { minCitations: 4 } }).recs, "SOURCE_TARGET")).toEqual([]);
    expect(ofType(setup({ sourceTarget: { max: 0 } }).recs, "SOURCE_TARGET")).toEqual([]);
  });

  it("ENTITY_INCONSISTENCY : homonyme fourni et nom voisin, sur les questions marquées sans la marque", () => {
    const { recs } = setup();
    const e = ofType(recs, "ENTITY_INCONSISTENCY");
    expect(e.map((r) => r.title)).toEqual(["Désambiguïser la marque de « Dr Echo Lambda »", "Désambiguïser la marque de « Demo Subjekt »"]);
    expect(e[0]!.evidence.map((x) => x.ref)).toEqual(["fx:0005", "fx:0006"]);
    expect(e[1]!.confidence).toBe("low");
    expect(neighbourNames("Ask Demo Subjekt or Demo Subject", ["Demo Subject"])).toEqual(["Demo Subjekt"]);
    expect(ofType(setup({ homonyms: [], detectNeighbours: false }).recs, "ENTITY_INCONSISTENCY")).toEqual([]);
  });

  it("TECH_FIX : index absent, contenu sans JavaScript, données structurées ; règles hors périmètre ignorées", () => {
    const { recs } = setup();
    const t = ofType(recs, "TECH_FIX");
    expect(t.map((r) => r.title)).toEqual([
      "Faire indexer demo.example par Bing",
      "Rendre les prix lisibles sans JavaScript",
      "Ajouter les données structurées manquantes",
      "Ajouter les données structurées manquantes",
    ]);
    expect(t[0]!.evidence).toEqual([{ kind: "other", ref: "audit/indexation.json", note: "Bing : absent" }]);
    expect(t[1]!.evidence[0]).toMatchObject({ kind: "crawlie-report", ref: "audit/crawlie.json#issues[rule=price-client-side]" });
    expect(ofType(setup({ indexAudit: { bing: "non vérifiable", google: "present" }, crawlie: undefined }).recs, "TECH_FIX")).toEqual([]);
  });

  it("FIX_FACT : une preuve par réponse qui contredit ; prix à fournir quand des prix sont cités", () => {
    const { recs } = setup();
    const f = ofType(recs, "FIX_FACT");
    const city = f.find((r) => r.id === recommendationId("FIX_FACT", "f-city"))!;
    expect(city.evidence.filter((e) => e.kind === "evidence-row").map((e) => e.ref)).toEqual(["fx:0007"]);
    expect(city.evidence).toContainEqual({ kind: "fact", ref: "facts.yaml#f-city" });
    const price = f.find((r) => r.id === recommendationId("FIX_FACT", "prix-a-fournir"))!;
    expect(price.evidence.filter((e) => e.kind === "evidence-row").map((e) => e.ref)).toEqual(["fx:0005", "fx:0006"]);
    expect(price.blockedBy).toMatch(/à fournir/);
    expect(citesPrice("about 300 AED")).toBe(true);
    expect(citesPrice("in 2026, 3 sessions")).toBe(false);
    // Un prix validé : plus de recommandation « prix à fournir ».
    const b = bundle([CITY, { id: "f-p2", statement: "Session: 100 EUR", language: "en", category: "price", sourceId: "owner", status: "validated" }]);
    const ev = evidence();
    const again = generateRecommendations(b, computeFigures(b, "j0", ev, { startedAt: START, days: 2 }, [], KEYWORDS), ev, setup().o);
    expect(again.some((r) => r.id === price.id)).toBe(false);
  });

  it("WATCH : acteurs cités, absents de la liste suivie, au-dessus du seuil", () => {
    const { recs } = setup();
    const w = ofType(recs, "WATCH");
    expect(w.map((r) => r.title)).toEqual(["Suivre « Nova Trainer » (personne), cité par les assistants"]);
    expect(w[0]!.evidence.map((e) => e.ref)).toEqual(["fx:0001", "fx:0004", "fx:0002"]);
    // Identifiants fournis par l'extraction : seuls ceux de la table des preuves comptent.
    const w2 = ofType(setup({ actors: [{ name: "Rare Name", evidenceIds: ["fx:0001", "fx:0003", "inconnu"] }] }).recs, "WATCH");
    expect(w2[0]!.evidence.map((e) => e.ref)).toEqual(["fx:0001", "fx:0003"]);
  });

  it("identifiant stable : deux générations donnent le même résultat, sans doublon", () => {
    const a = setup().recs;
    const b = setup().recs;
    expect(b).toEqual(a);
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length);
    expect(recommendationId("SOURCE_TARGET", "Directory.example")).toBe(recommendationId("SOURCE_TARGET", "directory.example"));
    expect(recommendationId("SOURCE_TARGET", "a.example")).not.toBe(recommendationId("SOURCE_TARGET", "a-example"));
  });

  it("aucune recommandation sans preuve, toutes en « pending »", () => {
    const { recs } = setup();
    expect(recs.length).toBeGreaterThanOrEqual(10);
    for (const r of recs) {
      expect(r.evidence.length, r.id).toBeGreaterThan(0);
      expect(r.decision).toEqual({ status: "pending" });
      expect(r.execution).toBeUndefined();
      expect(r.owner).toBeDefined();
      expect(r.statement).toMatch(/Vérification à la remesure : /);
    }
  });
});

describe("reco-merge", () => {
  it("garde la décision et l'exécution d'une recommandation déjà présente, ajoute les nouvelles en pending", () => {
    const { recs } = setup();
    const [first, ...rest] = recs;
    const decided: Recommendation = {
      ...first!,
      title: "Titre réécrit par Mickaël",
      decision: { status: "accepted", by: "Mickaël", at: "2026-11-17" },
      execution: { executedAt: "2026-11-18", proof: { kind: "url", ref: "https://demo.example/" }, declaredBy: "Mickaël" },
    };
    const m = mergeRecommendations([decided], recs);
    expect(m.recommendations[0]).toEqual(decided);
    expect(m.kept).toEqual([first!.id]);
    expect(m.added).toEqual(rest.map((r) => r.id));
    expect(m.recommendations.slice(1).every((r) => r.decision.status === "pending")).toBe(true);
    expect(() => mergeRecommendations([], [decided])).toThrow(/pending/);
  });

  it("fichier : commentaires et décisions conservés, seconde fusion sans effet", () => {
    const { recs } = setup();
    const dir = mkdtempSync(join(tmpdir(), "oia-reco-merge-"));
    const file = join(dir, "recommendations.yaml");
    const decided = { ...recs[0]!, decision: { status: "rejected" as const, by: "Mickaël", at: "2026-11-17", reason: "hors sujet" } };
    writeFileSync(file, `# Commentaire humain\nschemaVersion: 1\nrecommendations:\n  - ${JSON.stringify(decided)}\n`);
    const r1 = mergeRecommendationsFile(file, recs);
    expect(r1.added.length).toBe(recs.length - 1);
    const text = readFileSync(file, "utf8");
    expect(text.startsWith("# Commentaire humain\n")).toBe(true);
    const parsed = RecommendationsFileSchema.parse(parse(text));
    expect(parsed.recommendations[0]!.decision).toEqual(decided.decision);
    const r2 = mergeRecommendationsFile(file, setup().recs);
    expect(r2.added).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(text);
    // Fichier absent : créé avec les seules recommandations générées.
    const fresh = join(dir, "neuf.yaml");
    expect(mergeRecommendationsFile(fresh, recs).added.length).toBe(recs.length);
    expect(RecommendationsFileSchema.parse(parse(readFileSync(fresh, "utf8"))).recommendations).toEqual(recs);
  });
});

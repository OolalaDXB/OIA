import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAlerts } from "../src/alerts";
import { evidencePath } from "../src/collect-day";
import type { CollectRequest, CollectResult, Collector } from "../src/collector";
import { readEvidence } from "../src/evidence-store";
import { noJudge } from "../src/judge";
import { loadSubject } from "../src/load";
import { dayMarkerPath, runScheduler, windowDir, type GenerateRecommendations, type SchedulerOptions } from "../src/scheduler";

const TARGETS = ["chatgpt:openai-api:gpt-6-luna:online", "perplexity:openrouter:perplexity/sonar:online"];
const KEYS = { OPENAI_API_KEY: "test-openai-0000", OPENROUTER_API_KEY: "sk-or-test-0000", OIA_VIS_MONTHLY_CAP_USD: "100" };

interface SubjectOpts {
  id: string;
  budget?: string;
  start?: string;
  days?: number;
  status?: string;
  runTimeUtc?: string;
  extraWindows?: string;
  recommendations?: string;
}

function makeSubject(subjectsDir: string, o: SubjectOpts): string {
  const dir = join(subjectsDir, o.id);
  mkdirSync(dir, { recursive: true });
  const name = o.id
    .split("-")
    .map((x) => x[0]!.toUpperCase() + x.slice(1))
    .join(" ");
  writeFileSync(
    join(dir, "subject.yaml"),
    `schemaVersion: 1
id: ${o.id}
displayName: ${name}
status: active
ownership: external
urls: { primary: https://${o.id}.example }
languages: [en]
markets:
  - { country: GB, label: United Kingdom, languages: [en], status: confirmed }
aliases:
  - { value: ${name}, kind: name, status: confirmed }
competitors:
  - { name: Rival Co, domains: [rival.example], aliases: [], category: demo rival, status: confirmed, rationale: "Fixture competitor" }
sources:
  - { id: owner, kind: owner-statement, ref: kickoff, description: Brief, addedAt: "2026-01-01" }
`,
  );
  writeFileSync(join(dir, "facts.yaml"), "schemaVersion: 1\nfacts: []\n");
  writeFileSync(
    join(dir, "panel.yaml"),
    `schemaVersion: 1
panelVersion: 1
status: validated
validatedBy: Owner
validatedAt: "2026-01-01"
limits: { maxPerLanguage: 10, minBrandedPerLanguage: 0 }
prompts:
  - { id: en-01, version: 1, family: unbranded, language: en, markets: [GB], text: "Which demo tools are best?", origin: claude, status: active, createdAt: "2026-01-01" }
  - { id: en-02, version: 1, family: branded, language: en, markets: [GB], text: "What does ${name} offer?", origin: claude, status: active, createdAt: "2026-01-01" }
`,
  );
  const w = `  - id: j0
    kind: baseline
    days: ${o.days ?? 5}
    panelVersion: 1
    status: ${o.status ?? "running"}
${o.status === "planned" ? "" : `    start: "${o.start ?? "2026-12-01"}"\n`}${o.runTimeUtc ? `    runTimeUtc: "${o.runTimeUtc}"\n` : ""}    targets:
${TARGETS.map((t) => `      - ${t}`).join("\n")}
`;
  writeFileSync(
    join(dir, "measurement.yaml"),
    `schemaVersion: 1
engines:
  - { model: chatgpt }
  - { model: perplexity }
windows:
${o.extraWindows ?? w}${o.budget ? `budget: ${o.budget}\n` : ""}`,
  );
  if (o.recommendations) writeFileSync(join(dir, "recommendations.yaml"), o.recommendations);
  return dir;
}

/** Collecteur fictif : 0,01 $ par appel, réponse qui nomme la marque pour la question marquée. */
function fakeCollector(now: () => Date, opts: { failOn?: (r: CollectRequest) => boolean; unreadable?: boolean } = {}) {
  const calls: CollectRequest[] = [];
  const c: Collector = {
    name: "oia-direct",
    async collect(req): Promise<CollectResult> {
      calls.push(req);
      if (opts.failOn?.(req)) throw new Error("erreur fictive du fournisseur");
      return {
        collectorName: "oia-direct",
        collectorRunId: `run-${calls.length}`,
        rawText: req.promptId === "en-02" ? `Answer about the brand. See Rival Co too.` : "Rival Co is a good choice.",
        structured: { cost: { usd: 0.01, readable: !opts.unreadable } },
        citations: [{ url: "https://directory.example/page" }],
        costUsd: 0.01,
        engineVersion: req.engine === "chatgpt" ? "gpt-6-luna" : "perplexity/sonar",
        receivedAt: now().toISOString(),
      };
    },
  };
  return { collector: c, calls };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "oia-scheduler-"));
  const subjectsDir = join(root, "sujets");
  const dataDir = join(root, "data");
  mkdirSync(subjectsDir, { recursive: true });
  return { root, subjectsDir, dataDir };
}

const at = (iso: string) => () => new Date(iso);

function opts(base: { subjectsDir: string; dataDir: string; root: string }, now: () => Date, extra: Partial<SchedulerOptions> = {}): SchedulerOptions {
  const fc = fakeCollector(now);
  return {
    subjectsDir: base.subjectsDir,
    dataDir: base.dataDir,
    env: { ...KEYS },
    go: true,
    now,
    collector: () => fc.collector,
    judge: () => noJudge(),
    judgeName: "aucun",
    repoRoot: join(base.root, "depot"),
    ...extra,
  };
}

describe("ordonnanceur (bloc C)", () => {
  it("sans --go : plan et coût, aucun appel, aucune écriture", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 5 }" });
    const now = at("2026-12-02T16:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { go: false, collector: () => fc.collector }));
    expect(fc.calls).toHaveLength(0);
    expect(existsSync(t.dataDir)).toBe(false);
    expect(r.lines.join("\n")).toMatch(/jour 2\/5 \(2026-12-02\) : au plus/);
    expect(r.lines.join("\n")).toMatch(/jour 1 \(2026-12-01\) manquant/);
    expect(r.lines.join("\n")).toMatch(/coût estimé/);
  });

  it("deux sujets : celui au plafond s'arrête, l'autre continue", async () => {
    const t = setup();
    // Majorant d'un appel chatgpt : 0,026 $ ; 0,03 $ ne permet qu'un seul appel.
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 0.03 }" });
    makeSubject(t.subjectsDir, { id: "beta-fictif", budget: "{ monthlyCapUsd: 10, alertUsd: 0.02 }" });
    const now = at("2026-12-01T16:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    const [a, b] = r.subjects;
    expect(a!.stopped).toBe("plafond");
    expect(b!.stopped).toBeNull();
    expect(readEvidence(evidencePath(t.dataDir, "alpha-fictif", "j0"))).toHaveLength(1);
    expect(readEvidence(evidencePath(t.dataDir, "beta-fictif", "j0"))).toHaveLength(4);
    // Jour de beta consigné complet ; celui d'alpha attend (consigné au prochain passage).
    expect(existsSync(dayMarkerPath(windowDir(t.dataDir, "beta-fictif", "j0"), "2026-12-01"))).toBe(true);
    expect(existsSync(dayMarkerPath(windowDir(t.dataDir, "alpha-fictif", "j0"), "2026-12-01"))).toBe(false);
    const alerts = readAlerts(t.dataDir);
    expect(alerts.filter((x) => x.kind === "plafond" && x.subjectId === "alpha-fictif")).toHaveLength(1);
    expect(alerts.find((x) => x.subjectId === "beta-fictif" && x.kind === "plafond")?.message).toMatch(/seuil d'alerte/);
    // Le plafond d'alpha ne vient pas du plafond global.
    expect(alerts.some((x) => x.kind === "plafond" && x.subjectId === null)).toBe(false);
    // Le lendemain, alpha au plafond ne collecte rien ; son jour 1 est consigné partiel.
    const next = at("2026-12-02T16:00:00Z");
    const fc2 = fakeCollector(next);
    const r2 = await runScheduler(opts(t, next, { collector: () => fc2.collector }));
    expect(fc2.calls.filter((c) => c.subjectId === "alpha-fictif")).toHaveLength(0);
    expect(fc2.calls.filter((c) => c.subjectId === "beta-fictif")).toHaveLength(4);
    expect(r2.subjects[0]!.stopped).toBe("plafond");
    const rec = JSON.parse(readFileSync(dayMarkerPath(windowDir(t.dataDir, "alpha-fictif", "j0"), "2026-12-01"), "utf8"));
    expect(rec).toMatchObject({ state: "partiel", collected: 1, planned: 4, settledLate: true });
  });

  it("sans budget déclaré : aucune collecte pour ce sujet", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif" });
    makeSubject(t.subjectsDir, { id: "beta-fictif", budget: "{ monthlyCapUsd: 10 }" });
    const now = at("2026-12-01T16:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(r.subjects[0]!.stopped).toBe("budget-absent");
    expect(fc.calls.every((c) => c.subjectId === "beta-fictif")).toBe(true);
    expect(fc.calls).toHaveLength(4);
  });

  it("idempotent : relancé le même jour, il ne refait rien", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }" });
    const now = at("2026-12-02T16:00:00Z");
    const fc = fakeCollector(now, { failOn: (r) => r.engine === "perplexity" && r.promptId === "en-01" });
    await runScheduler(opts(t, now, { collector: () => fc.collector }));
    const calls = fc.calls.length;
    const alerts = readAlerts(t.dataDir).length;
    const files = readdirSync(join(windowDir(t.dataDir, "alpha-fictif", "j0"), "jours")).sort();
    const r2 = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(fc.calls.length).toBe(calls);
    expect(readAlerts(t.dataDir).length).toBe(alerts);
    expect(readdirSync(join(windowDir(t.dataDir, "alpha-fictif", "j0"), "jours")).sort()).toEqual(files);
    expect(r2.lines.join("\n")).toMatch(/déjà consigné : rien à refaire/);
    expect(readEvidence(evidencePath(t.dataDir, "alpha-fictif", "j0"))).toHaveLength(3);
  });

  it("jour partiel : un échec consigné, le jour est partiel, alerte", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }" });
    const now = at("2026-12-01T16:00:00Z");
    const fc = fakeCollector(now, { failOn: (r) => r.engine === "perplexity" && r.promptId === "en-01" });
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    const rec = r.subjects[0]!.windows[0]!.days[0]!;
    expect(rec).toMatchObject({ n: 1, state: "partiel", planned: 4, collected: 3, failed: 1, settledLate: false });
    const wdir = windowDir(t.dataDir, "alpha-fictif", "j0");
    expect(readFileSync(join(wdir, "jours", "jour-1.md"), "utf8")).toMatch(/état : \*\*partiel\*\*[\s\S]*\| perplexity \| 2 \| 1 \| 1 \| 0 \|/);
    const kinds = readAlerts(t.dataDir).map((a) => a.kind);
    expect(kinds).toContain("jour-manquant");
    expect(kinds).toContain("echec");
  });

  it("pas avant l'heure de la fenêtre (runTimeUtc)", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", runTimeUtc: "15:27" });
    const now = at("2026-12-01T09:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(fc.calls).toHaveLength(0);
    expect(r.lines.join("\n")).toMatch(/pas encore l'heure/);
  });

  it("--go refuse un autre jour que le jour UTC en cours", async () => {
    const t = setup();
    await expect(runScheduler(opts(t, at("2026-12-02T16:00:00Z"), { date: "2026-12-01" }))).rejects.toThrow(/aucun jour n'est rattrapé/);
  });

  it("clôture sans Elmo : done, rapport, coût réel, page client, recommandations, alerte rapport prêt", async () => {
    const t = setup();
    const dir = makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", days: 2 });
    const seen: string[] = [];
    const gen: GenerateRecommendations = (b, figures, evidence, o) => {
      seen.push(`${b.subject.id}:${figures.windowId}:${evidence.length}:${o.today}`);
      return [];
    };
    await runScheduler(opts(t, at("2026-12-01T16:00:00Z")));
    let b = loadSubject(dir);
    expect(b.measurement.windows[0]!.status).toBe("running");
    const r = await runScheduler(opts(t, at("2026-12-02T16:00:00Z"), { generateRecommendations: gen }));
    expect(r.subjects[0]!.windows[0]!.closed).toBe(true);
    b = loadSubject(dir);
    expect(b.measurement.windows[0]).toMatchObject({ status: "done", start: "2026-12-01", end: "2026-12-03" });
    const reports = join(dir, "reports", "j0");
    const figures = JSON.parse(readFileSync(join(reports, "figures.json"), "utf8"));
    expect(figures.total.responses).toBe(8);
    expect(figures.window.daysWithResponses).toEqual([1, 2]);
    expect(existsSync(join(reports, "rapport-j0.md"))).toBe(true);
    expect(existsSync(join(reports, "page-client.html"))).toBe(true);
    expect(JSON.parse(readFileSync(join(reports, "cout-reel-j0.json"), "utf8"))).toMatchObject({ usd: 0.08, answers: 8, failures: 0 });
    expect(seen).toEqual(["alpha-fictif:j0:8:2026-12-02"]);
    expect(readAlerts(t.dataDir).filter((a) => a.kind === "rapport-pret")).toHaveLength(1);
    // Relance : rien n'est refait.
    const again = await runScheduler(opts(t, at("2026-12-02T18:00:00Z"), { generateRecommendations: gen }));
    expect(again.subjects[0]!.windows).toHaveLength(0);
    expect(seen).toHaveLength(1);
    expect(readAlerts(t.dataDir).filter((a) => a.kind === "rapport-pret")).toHaveLength(1);
  });

  it("clôture sans générateurs de recommandations : ne bloque pas", async () => {
    const t = setup();
    const dir = makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", days: 1 });
    const r = await runScheduler(opts(t, at("2026-12-01T16:00:00Z")));
    expect(r.lines.join("\n")).toMatch(/générateurs de recommandations absents/);
    expect(loadSubject(dir).measurement.windows[0]!.status).toBe("done");
    expect(existsSync(join(dir, "reports", "j0", "page-client.html"))).toBe(true);
  });

  it("fenêtre lancée avec Elmo : collecte OIA, jamais de clôture", async () => {
    const t = setup();
    const dir = makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", days: 2 });
    const wdir = windowDir(t.dataDir, "alpha-fictif", "j0");
    mkdirSync(wdir, { recursive: true });
    writeFileSync(join(wdir, "started-at.txt"), "2026-12-01T15:27:00Z\n");
    const now = at("2026-12-02T16:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(fc.calls).toHaveLength(4);
    expect(r.lines.join("\n")).toMatch(/clôture par pnpm vis close/);
    expect(loadSubject(dir).measurement.windows[0]!.status).toBe("running");
    expect(existsSync(join(dir, "reports"))).toBe(false);
  });

  it("J1 proposé 21 jours après la dernière exécution, jamais démarré", async () => {
    const t = setup();
    const windows = `  - { id: j0, kind: baseline, days: 5, panelVersion: 1, status: done, start: "2026-11-01", end: "2026-11-06", targets: [${TARGETS.join(", ")}] }
  - { id: j1, kind: follow-up, comparesWith: j0, days: 5, panelVersion: 1, status: planned, targets: [${TARGETS.join(", ")}] }
`;
    const recs = `schemaVersion: 1
recommendations:
  - id: rec-fictive-001
    schemaVersion: 1
    type: FIX_FACT
    clientId: alpha-fictif
    subjectId: alpha-fictif
    title: Corriger un fait fictif
    statement: Un fait fictif à corriger sur le site.
    evidence: [{ kind: other, ref: test }]
    impact: { level: low }
    effort: { level: S }
    risk: low
    confidence: low
    decision: { status: accepted, by: Owner, at: "2026-11-10" }
    createdBy: test
    createdAt: "2026-11-07"
    execution: { executedAt: "2026-11-20", proof: { kind: url, ref: "https://alpha-fictif.example/" }, declaredBy: Owner }
`;
    const dir = makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", extraWindows: windows, recommendations: recs });
    const r = await runScheduler(opts(t, at("2026-12-01T16:00:00Z")));
    expect(r.subjects[0]!.remeasure).toEqual([{ windowId: "j1", comparesWith: "j0", earliestStart: "2026-12-11", lastExecution: "2026-11-20", due: false }]);
    expect(JSON.parse(readFileSync(join(t.dataDir, "alpha-fictif", "remesure.json"), "utf8"))).toMatchObject({ windowId: "j1", earliestStart: "2026-12-11" });
    expect(loadSubject(dir).measurement.windows[1]!.status).toBe("planned");
    expect(readAlerts(t.dataDir).filter((a) => a.kind === "remesure-proposee")).toHaveLength(1);
    await runScheduler(opts(t, at("2026-12-01T18:00:00Z")));
    expect(readAlerts(t.dataDir).filter((a) => a.kind === "remesure-proposee")).toHaveLength(1);
  });

  it("coût illisible : arrêt de toute collecte, alerte", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }" });
    makeSubject(t.subjectsDir, { id: "beta-fictif", budget: "{ monthlyCapUsd: 10 }" });
    const ev = evidencePath(t.dataDir, "alpha-fictif", "j0");
    mkdirSync(join(t.dataDir, "alpha-fictif", "evidence"), { recursive: true });
    writeFileSync(ev, `${JSON.stringify({ id: "x", collectorName: "oia-direct", receivedAt: "2026-12-01T10:00:00Z", costUsd: 0.01, structured: { cost: { readable: false } }, rawText: "", rawSha256Hex: "" })}\n`);
    const now = at("2026-12-01T16:00:00Z");
    const fc = fakeCollector(now);
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(r.globalStop).toBe("cout-illisible");
    expect(fc.calls).toHaveLength(0);
    // Une alerte globale, et une pour le sujet dont le coût est illisible ; aucune pour l'autre.
    expect(readAlerts(t.dataDir).filter((a) => a.kind === "cout-illisible").map((a) => a.subjectId)).toEqual([null, "alpha-fictif"]);
  });

  it("coût illisible d'une réponse : le sujet s'arrête", async () => {
    const t = setup();
    makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }" });
    const now = at("2026-12-01T16:00:00Z");
    const fc = fakeCollector(now, { unreadable: true });
    const r = await runScheduler(opts(t, now, { collector: () => fc.collector }));
    expect(r.subjects[0]!.stopped).toBe("cout-illisible");
    expect(fc.calls).toHaveLength(1);
    expect(existsSync(dayMarkerPath(windowDir(t.dataDir, "alpha-fictif", "j0"), "2026-12-01"))).toBe(false);
  });

  it("aucune clôture d'un sujet sous le dépôt", async () => {
    const t = setup();
    const dir = makeSubject(t.subjectsDir, { id: "alpha-fictif", budget: "{ monthlyCapUsd: 10 }", days: 1 });
    const r = await runScheduler(opts(t, at("2026-12-01T16:00:00Z"), { repoRoot: t.root, dataDir: join(tmpdir(), `oia-sched-data-${Date.now()}`) }));
    expect(r.lines.join("\n")).toMatch(/clôture automatique refusée/);
    expect(loadSubject(dir).measurement.windows[0]!.status).toBe("running");
  });
});

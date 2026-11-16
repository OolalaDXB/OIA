import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CostUnreadableError, estimateDay, evidencePath, failuresPath, journalMonthUsd, monthSpendUsd, planDay, runDay } from "../src/collect-day";
import { MissingKeyError, createOiaDirectCollector } from "../src/collector-oia-direct";
import { readEvidence } from "../src/evidence-store";
import { loadSubject } from "../src/load";
import { fakeFetch, geminiResponse, mistralResponse, ok, perplexityResponse } from "./collector-oia-fixtures";

const URL_MISTRAL = "https://api.mistral.ai/v1/conversations";
const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const KEYS = { MISTRAL_API_KEY: "test-mistral-0000", OPENROUTER_API_KEY: "sk-or-test-0000" };
const DAY = "2026-12-02";
const now = () => new Date(`${DAY}T15:27:00Z`);

/** Sujet fictif bilingue : Mistral ne mesure que le français, Perplexity les deux langues. */
function makeSubject(opts: { status?: string; start?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "oia-collect-day-"));
  const dir = join(root, "subjects", "sujet-fictif");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "subject.yaml"),
    `schemaVersion: 1
id: sujet-fictif
displayName: Sujet Fictif
status: draft
ownership: external
urls: { primary: https://sujet-fictif.example }
languages: [en, fr]
markets:
  - { country: FR, label: France, languages: [en, fr], status: confirmed }
aliases:
  - { value: Sujet Fictif, kind: name, status: confirmed }
competitors: []
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
  - { id: en-01, version: 1, family: unbranded, language: en, markets: [FR], text: "Which demo tools are best?", origin: claude, status: active, createdAt: "2026-01-01" }
  - { id: fr-01, version: 1, family: unbranded, language: fr, markets: [FR], text: "Quels outils de démo choisir ?", origin: claude, status: active, createdAt: "2026-01-01" }
  - { id: fr-02, version: 1, family: unbranded, language: fr, markets: [FR], text: "Une question en réserve", origin: claude, status: candidate, createdAt: "2026-01-01" }
`,
  );
  writeFileSync(
    join(dir, "measurement.yaml"),
    `schemaVersion: 1
engines:
  - { model: mistral, languages: [fr] }
  - { model: perplexity }
windows:
  - id: w1
    kind: baseline
    days: 5
    panelVersion: 1
    status: ${opts.status ?? "running"}
    ${opts.start === "" ? "" : `start: "${opts.start ?? "2026-12-01"}"`}
    runTimeUtc: "15:27"
    targets:
      - mistral:mistral-api:mistral-large-4:online
      - perplexity:openrouter:perplexity/sonar:online
freezes: []
`,
  );
  const data = join(root, "data");
  mkdirSync(data);
  return { bundle: loadSubject(dir), data };
}

const fetchFor = (n = 3) =>
  fakeFetch({
    [URL_MISTRAL]: Array.from({ length: n }, () => ok(mistralResponse)),
    [URL_OPENROUTER]: Array.from({ length: n }, () => ok(perplexityResponse)),
  });

const env = { ...KEYS, OIA_VIS_MONTHLY_CAP_USD: "30" };
const run = (s: ReturnType<typeof makeSubject>, f: ReturnType<typeof fakeFetch>, extra: Partial<Parameters<typeof runDay>[0]> = {}) =>
  runDay({ bundle: s.bundle, windowId: "w1", dataDir: s.data, collector: createOiaDirectCollector({ fetch: f.fetch, env, sleep: async () => {}, now }), env, now, ...extra });

describe("choix du moteur par question", () => {
  it("une question n'est envoyée qu'aux moteurs qui mesurent sa langue ; questions non actives ignorées", () => {
    const { bundle } = makeSubject();
    const { calls, excluded } = planDay(bundle, "w1", DAY);
    expect(calls.map((c) => `${c.promptId}×${c.engine}`).sort()).toEqual(["en-01×perplexity", "fr-01×mistral", "fr-01×perplexity"]);
    expect(excluded).toEqual([expect.objectContaining({ promptId: "en-01@v1", engine: "mistral" })]);
    expect(calls[0]!.evidenceId).toMatch(/^oia-direct:sujet-fictif:w1:2026-12-02:/);
  });

  it("estimation : aucun appel, coût au majorant par moteur", () => {
    const { bundle } = makeSubject();
    const est = estimateDay(bundle, "w1", DAY);
    expect(est.worstCaseUsd).toBeGreaterThan(0);
    expect(est.lines.join("\n")).toMatch(/perplexity .* 2 appel\(s\)/);
  });
});

describe("collecte d'un jour", () => {
  it("écrit les preuves en ajout seul (oia-direct) ; une relance du même jour n'appelle rien", async () => {
    const s = makeSubject();
    const f = fetchFor();
    const sum = await run(s, f);
    expect(sum).toMatchObject({ planned: 3, collected: 3, failed: 0, stopped: null });
    const rows = readEvidence(evidencePath(s.data, "sujet-fictif", "w1"));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.collectorName))).toEqual(new Set(["oia-direct"]));
    expect(rows.every((r) => r.structured.day === DAY && r.clientId === "sujet-fictif")).toBe(true);
    const calls = f.seen.length;
    const again = await run(s, f);
    expect(again).toMatchObject({ collected: 0, alreadyDone: 3 });
    expect(f.seen.length).toBe(calls);
  });

  it("échec définitif consigné, jamais comblé à la relance", async () => {
    const s = makeSubject();
    const f = fakeFetch({
      [URL_MISTRAL]: [ok(mistralResponse)],
      [URL_OPENROUTER]: [{ status: 500, body: "x" }, { status: 500, body: "x" }, { status: 500, body: "x" }, ok(perplexityResponse)],
    });
    const sum = await run(s, f);
    expect(sum).toMatchObject({ collected: 2, failed: 1 });
    const failures = readFileSync(failuresPath(s.data, "sujet-fictif", "w1"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ engine: "perplexity", status: 500, attempts: 3, collectorName: "oia-direct" });
    expect(failures[0].worstCaseUsd).toBeGreaterThan(0);
    const before = f.seen.length;
    const again = await run(s, f);
    expect(again).toMatchObject({ collected: 0, failedBefore: 1, alreadyDone: 2 });
    expect(f.seen.length).toBe(before);
  });

  it("garde-fou : arrêt au plafond, compte tenu du coût d'Elmo dans le journal de cost-guard.sh", async () => {
    const s = makeSubject();
    const journal = join(s.data, "cost-journal.csv");
    writeFileSync(journal, "utc_time,month_utc,elmo_estimate_usd,grid_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action\n2026-12-01T10:00:00Z,2026-12,1,29.99,0,0,29.99,30,24,none\n");
    const f = fetchFor();
    const sum = await run(s, f, { journalFile: journal });
    expect(sum).toMatchObject({ stopped: "plafond", collected: 0, notRun: 3 });
    expect(f.seen).toHaveLength(0);
  });

  it("garde-fou : s'arrête net quand le coût d'un appel est illisible (modèle absent de la grille)", async () => {
    const s = makeSubject();
    const odd = { ...perplexityResponse, model: "perplexity/sonar-inconnu" };
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)], [URL_OPENROUTER]: [ok(odd), ok(odd)] });
    const sum = await run(s, f);
    expect(sum.stopped).toBe("cout-illisible");
    expect(sum.collected).toBeLessThan(3);
    // La preuve payée est gardée ; le lendemain, le mois est illisible : refus avant tout appel.
    await expect(run(s, fetchFor(), { now: () => new Date("2026-12-03T15:27:00Z") })).rejects.toBeInstanceOf(CostUnreadableError);
  });

  it("garde-fou : journal illisible = refus", () => {
    const s = makeSubject();
    const journal = join(s.data, "cost-journal.csv");
    writeFileSync(journal, "utc_time,month_utc,retained_usd\n2026-12-01T10:00:00Z,2026-12,abc\n");
    expect(() => journalMonthUsd(journal, "2026-12")).toThrow(CostUnreadableError);
    expect(() => monthSpendUsd(s.data, "2026-12", journal)).toThrow(CostUnreadableError);
  });

  it("le coût du mois additionne les preuves oia-direct de tous les sujets et les échecs au majorant", async () => {
    const s = makeSubject();
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)], [URL_OPENROUTER]: [ok(perplexityResponse), { status: 401, body: "no" }] });
    const sum = await run(s, f);
    const spend = monthSpendUsd(s.data, "2026-12", join(s.data, "absent.csv"));
    expect(spend.collectorUsd).toBeGreaterThan(0);
    expect(spend.failuresUsd).toBeGreaterThan(0);
    expect(spend.usd).toBeCloseTo(sum.monthUsdAfter, 6);
    expect(monthSpendUsd(s.data, "2027-01", join(s.data, "absent.csv")).usd).toBe(0);
  });

  it("refus : plafond non posé, clé absente, fenêtre pas en cours, jour hors fenêtre", async () => {
    const s = makeSubject();
    const f = fetchFor();
    await expect(run(s, f, { env: KEYS })).rejects.toThrow(/OIA_VIS_MONTHLY_CAP_USD/);
    await expect(run(s, f, { env: { OIA_VIS_MONTHLY_CAP_USD: "30", MISTRAL_API_KEY: "x".repeat(10) } })).rejects.toBeInstanceOf(MissingKeyError);
    await expect(run(makeSubject({ status: "planned" }), f)).rejects.toThrow(/running/);
    await expect(run(makeSubject({ start: "2026-11-01" }), f)).rejects.toThrow(/hors de la fenêtre/);
    expect(f.seen).toHaveLength(0);
    expect(existsSync(evidencePath(s.data, "sujet-fictif", "w1"))).toBe(false);
  });

  it("liens de redirection de Gemini résolus dans le cache partagé (résolveur injecté)", async () => {
    const s = makeSubject();
    const measurement = join(s.bundle.dir, "measurement.yaml");
    writeFileSync(measurement, readFileSync(measurement, "utf8").replace("perplexity:openrouter:perplexity/sonar:online", "perplexity:openrouter:google/gemini-3-flash-preview:online"));
    const bundle = loadSubject(s.bundle.dir);
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)], [URL_OPENROUTER]: [ok(geminiResponse), ok(geminiResponse)] });
    const resolved: string[] = [];
    await run({ ...s, bundle }, f, { resolver: async (u) => (resolved.push(u), `https://resolu.example/${u.slice(-3)}`) });
    const cache = JSON.parse(readFileSync(join(s.data, "sujet-fictif", "redirects-cache.json"), "utf8"));
    expect(Object.values(cache).sort()).toEqual(["https://resolu.example/AAA", "https://resolu.example/BBB"]);
    expect(resolved).toHaveLength(2);
  });
});

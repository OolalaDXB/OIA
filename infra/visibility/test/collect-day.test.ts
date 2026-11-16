import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname as dirOf } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CostUnreadableError, estimateDay, evidencePath, failuresPath, journalMonthUsd, monthSpendUsd, planDay, runDay } from "../src/collect-day";
import { MissingKeyError, createOiaDirectCollector, targetWorstCaseUsd } from "../src/collector-oia-direct";
import { readEvidence } from "../src/evidence-store";
import { createJudge, JEV_PRICE, judgeWorstCaseUsd, noJudge } from "../src/judge";
import type { FetchLike } from "../src/collector-oia/http";
import { execFileSync } from "node:child_process";
import { chmodSync } from "node:fs";
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
  runDay({ bundle: s.bundle, windowId: "w1", dataDir: s.data, collector: createOiaDirectCollector({ fetch: f.fetch, env, sleep: async () => {}, now }), env, now, judge: noJudge(), ...extra });

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

/** Jev fictif : confirme chaque entreprise demandée (neutre). */
const jevFetch = () => {
  const seen: any[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const body = JSON.parse(init.body!);
    seen.push(body);
    const answers = Object.fromEntries(Object.keys(body.questions).map((k) => [k, k.endsWith("__verdict") ? { choice: "neutral", probabilities: { neutral: 0.9, no_info: 0.1 } } : { choice: "p1", probabilities: { p1: 1 } }]));
    const text = JSON.stringify({ answers, usage: { input_tokens: 500, output_tokens: 6 } });
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => text };
  };
  return { fetch, seen };
};

describe("juge des mentions dans la collecte", () => {
  it("jev : seules les réponses qui nomment une entreprise suivie partent chez Jev ; présence au premier niveau ; coût du juge dans le mois", async () => {
    const s = makeSubject();
    const named = { ...perplexityResponse, choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Sujet Fictif is a good pick.", annotations: [] } }] };
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)], [URL_OPENROUTER]: [ok(named), ok(perplexityResponse)] });
    const j = jevFetch();
    const judge = createJudge("jev", { fetch: j.fetch, env: { TYPESAFE_API_KEY: "ts-test-key-000000" }, sleep: async () => {} });
    const sum = await run(s, f, { judge });
    expect(sum.collected).toBe(3);
    expect(j.seen).toHaveLength(1);
    const rows = readEvidence(evidencePath(s.data, "sujet-fictif", "w1"));
    const en = rows.find((r) => r.promptId === "en-01")!;
    expect(en.structured).toMatchObject({ brandMentioned: true, competitorsMentioned: [] });
    expect((en.structured.mentions as any).judge).toMatchObject({ status: "juge", kind: "extrait (Jev 1.13)" });
    const others = rows.filter((r) => r.promptId !== "en-01");
    expect(others.every((r) => r.structured.brandMentioned === false && (r.structured.mentions as any).judge.status === "non-envoye")).toBe(true);
    const spend = monthSpendUsd(s.data, "2026-12", join(s.data, "absent.csv"));
    expect(spend.judgeUsd).toBeCloseTo(JEV_PRICE.perCallUsd, 9);
    expect(spend.usd).toBeCloseTo(sum.monthUsdAfter, 6);
  });

  it("le majorant du juge compte dans le plafond", async () => {
    const s = makeSubject();
    const journal = join(s.data, "cost-journal.csv");
    // Assez pour la réponse Perplexity seule, pas pour la réponse plus le juge.
    const t0 = planDay(s.bundle, "w1", DAY).calls[0]!.target;
    const room = targetWorstCaseUsd(t0)! + JEV_PRICE.perCallUsd;
    expect(room).toBeLessThan(targetWorstCaseUsd(t0)! + judgeWorstCaseUsd("jev"));
    writeFileSync(journal, `utc_time,month_utc,retained_usd\n2026-12-01T10:00:00Z,2026-12,${30 - room}\n`);
    const j = jevFetch();
    const judge = createJudge("jev", { fetch: j.fetch, env: { TYPESAFE_API_KEY: "ts-test-key-000000" } });
    const f = fetchFor();
    const sum = await run(s, f, { judge, journalFile: journal });
    expect(sum.stopped).toBe("plafond");
    expect(f.seen).toHaveLength(0);
    // Sans juge, la même marge suffit pour le premier appel.
    const s2 = makeSubject();
    writeFileSync(join(s2.data, "cost-journal.csv"), readFileSync(journal, "utf8"));
    const f2 = fetchFor();
    const sum2 = await run(s2, f2, { journalFile: join(s2.data, "cost-journal.csv") });
    expect(sum2.collected).toBeGreaterThanOrEqual(1);
  });
});

describe("fichier de clés (scripts/load-keys.sh)", () => {
  const script = join(dirOf(fileURLToPath(import.meta.url)), "..", "scripts", "load-keys.sh");
  /** Charge le fichier puis dit, pour chaque nom, s'il est posé et sa longueur ; aucune valeur n'est imprimée. */
  const load = (file: string) =>
    execFileSync("bash", ["-c", `set -euo pipefail; source "$1"; load_keys_file "$2"; for n in OPENAI_API_KEY TYPESAFE_API_KEY OIA_VIS_MONTHLY_CAP_USD; do echo "$n=\${!n:+set:\${#n}}:\${#n}"; done`, "_", script, file], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  const write = (content: string, mode = 0o600) => {
    const dir = mkdtempSync(join(tmpdir(), "oia-keys-"));
    const file = join(dir, "visibility.env");
    writeFileSync(file, content);
    chmodSync(file, mode);
    return file;
  };
  const lengths = (out: string) => Object.fromEntries(out.trim().split("\n").map((l) => l.split("=") as [string, string]));

  it("charge un fichier 600 aux noms connus, sans rien afficher des valeurs", () => {
    const file = write('OPENAI_API_KEY=sk-fictive-0001\n\nTYPESAFE_API_KEY="ts-fictive-02"\nOIA_VIS_MONTHLY_CAP_USD=30\n');
    const out = execFileSync("bash", ["-c", `source "$1"; load_keys_file "$2"; printf '%s|%s|%s' "\${#OPENAI_API_KEY}" "\${#TYPESAFE_API_KEY}" "$OIA_VIS_MONTHLY_CAP_USD"`, "_", script, file], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    expect(out).toBe("15|13|30");
    expect(lengths(load(file)).OPENAI_API_KEY).toMatch(/^set/);
  });

  it("fichier absent : rien n'est chargé, pas d'erreur", () => {
    expect(lengths(load(join(tmpdir(), "absent-oia-keys.env"))).OPENAI_API_KEY).not.toMatch(/^set/);
  });

  it("refus : droits autres que 600, nom inconnu, ligne mal formée ; rien d'exporté, aucune valeur dans le message", () => {
    const refused = (file: string) => {
      try {
        load(file);
        return "chargé";
      } catch (e: any) {
        return String(e.stderr);
      }
    };
    const wide = refused(write("OPENAI_API_KEY=sk-fictive-0001\n", 0o644));
    expect(wide).toMatch(/droits 644, 600 exigés/);
    const unknown = refused(write("OPENAI_API_KEY=sk-fictive-0001\nPATH=/tmp/evil\n"));
    expect(unknown).toMatch(/ligne 2 : nom PATH inconnu/);
    expect(unknown).not.toContain("sk-fictive-0001");
    const bad = refused(write("export OPENAI_API_KEY=sk-fictive-0001\n"));
    expect(bad).toMatch(/ligne 1 : NOM=valeur attendu/);
    expect(bad).not.toContain("sk-fictive");
    expect(refused(write("# commentaire\n"))).toMatch(/NOM=valeur attendu/);
  });
});

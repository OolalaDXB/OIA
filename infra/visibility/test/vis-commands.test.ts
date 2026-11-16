import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { listSubjectDirs, loadSubject } from "../src/load.js";
import type { Recommendation } from "../src/recommendation.js";
import { recommendationStatus, renderRecommendationStatus } from "../src/recommendation-status.js";
import type { SubjectBundle } from "../src/schema.js";
import { gate, markWindowDone } from "../src/window-gate.js";
import { addWindowFreeze, launchChecks, renderChecks, type ElmoState } from "../src/window-launch.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const T = ["chatgpt:openai-api:gpt-6-luna:online", "gemini:openrouter:google/gemini-3-flash-preview:online"];
type Win = SubjectBundle["measurement"]["windows"][number];

/** Sujet fictif avec une référence j0 et une fenêtre de suivi j1. */
function bundle(j0: Partial<Win> = {}, j1: Partial<Win> = {}): SubjectBundle {
  const b = loadSubject(join(here, "fixtures", "demo-subject"));
  b.measurement.windows = [
    { id: "j0", kind: "baseline", days: 5, panelVersion: 1, status: "done", start: "2026-01-05", end: "2026-01-10", missingDays: [], targets: T, runTimeUtc: "15:27", ...j0 },
    { id: "j1", kind: "follow-up", comparesWith: "j0", days: 5, panelVersion: 1, status: "planned", missingDays: [], targets: T, runTimeUtc: "15:27", ...j1 },
  ];
  return b;
}

function state(over: Partial<ElmoState> = {}): ElmoState {
  return {
    now: "2026-02-01T15:27:00Z",
    brandExists: true,
    prompts: [
      { id: "p1", tags: ["oia:en-01@v1", "panel:v1"], enabled: true },
      { id: "p2", tags: ["oia:en-02@v1", "panel:v1"], enabled: true },
      { id: "p3", tags: ["panel:v1"], enabled: false },
    ],
    competitors: ["Rival Co"],
    workerRunning: false,
    pendingJobs: [{ promptId: "p1", startAfter: "2026-01-11T15:27:00Z" }, { promptId: "p3", startAfter: "2026-01-11T11:00:00Z" }],
    scrapeTargets: [...T].reverse().join(","),
    capUsd: 30,
    alertUsd: 24,
    monthSpendUsd: 0,
    monthUtc: "2026-02",
    otherWatch: null,
    ...over,
  };
}

const rec = (id: string, over: Partial<Recommendation> = {}): Recommendation => ({
  id, schemaVersion: 1, type: "TECH_FIX", clientId: "c", subjectId: "demo-subject", title: `Titre ${id}`, statement: "Énoncé assez long.",
  evidence: [{ kind: "other", ref: "x" }], impact: { level: "low" }, effort: { level: "XS" }, risk: "low", confidence: "low",
  decision: { status: "pending" }, createdBy: "t", createdAt: "2026-01-11", ...over,
});

describe("porte des commandes (window-gate)", () => {
  it("refuse une fenêtre absente, une action inconnue et un statut incompatible", () => {
    const b = bundle();
    expect(gate(b, "j9", "report")[0]).toMatch(/« j9 » absente de measurement.yaml/);
    expect(gate(b, "j1", "fly")[0]).toMatch(/action inconnue/);
    expect(gate(b, "j1", "close")[0]).toMatch(/close refusé : fenêtre j1 en statut « planned » \(attendu : running\)/);
    expect(gate(b, "j1", "report")[0]).toMatch(/attendu : done/);
    expect(gate(b, "j0", "launch")[0]).toMatch(/attendu : planned/);
    expect(gate(b, "j1", "launch")).toEqual([]);
    expect(gate(b, "j1", "status")).toEqual([]);
  });

  it("refuse compare sans référence close, et launch d'un suivi dont la référence tourne encore", () => {
    expect(gate(bundle({ status: "running" }, { status: "done" }), "j1", "compare").join()).toMatch(/référence j0 en statut « running »/);
    expect(gate(bundle({}, { status: "done", comparesWith: undefined }), "j1", "compare").join()).toMatch(/pas de référence/);
    expect(gate(bundle({}, { status: "done" }), "j1", "compare")).toEqual([]);
    expect(gate(bundle({ status: "running" }), "j1", "launch").join()).toMatch(/référence j0 en statut « running »/);
  });

  it("passe une fenêtre de running à done, en ligne ou en bloc, et refuse tout autre statut", () => {
    const inline = "windows:\n  - { id: j0, kind: baseline, days: 5, panelVersion: 1, status: running, start: \"2026-01-05\" }\n";
    expect(parse(markWindowDone(inline, "j0", "2026-01-10")).windows[0]).toMatchObject({ status: "done", end: "2026-01-10" });
    const block = "windows:\n  - id: j0\n    kind: baseline\n    status: running\n    start: \"2026-01-05\"\n    note: \"x\"\n";
    const out = markWindowDone(block, "j0", "2026-01-10");
    expect(out).toContain('    status: done\n    start: "2026-01-05"\n    end: "2026-01-10"\n');
    expect(() => markWindowDone(out, "j0", "2026-01-11")).toThrow(/pas "running"/);
    expect(() => markWindowDone(inline.replace("running", "planned"), "j0", "2026-01-10")).toThrow(/planned/);
  });
});

describe("contrôles du lancement d'une fenêtre de suivi (bloc B)", () => {
  const nogo = (b: SubjectBundle, st: ElmoState, n: number, est: number | null = 5) =>
    launchChecks(b, "j1", st, { referenceEstimatedUsd: est }).filter((c) => c.level === "nogo" && c.n === n).map((c) => c.text).join(" | ");

  it("GO quand tout est conforme, alias de modèle signalé sans bloquer", () => {
    const checks = launchChecks(bundle(), "j1", state(), { referenceEstimatedUsd: 5, referenceVersions: { gemini: ["google/gemini-3-flash-preview"] } });
    const r = renderChecks(checks);
    expect(r.go, r.text).toBe(true);
    expect(r.text).toMatch(/warn  3\. gemini : modèle sous alias/);
    expect(r.text).toMatch(/1 travail\(aux\) en retard partiront aussitôt, 1 question\(s\) sans travail/);
    expect(r.text).toMatch(/freeze-j1 sera créé/);
  });

  it("1 : question du panel désactivée, question hors panel activée, marque absente", () => {
    expect(nogo(bundle(), state({ prompts: [{ id: "p1", tags: ["oia:en-01@v1"], enabled: true }, { id: "p2", tags: ["oia:en-02@v1"], enabled: false }] }), 1)).toMatch(/non activées dans Elmo : oia:en-02@v1/);
    expect(nogo(bundle(), state({ prompts: [...state().prompts, { id: "px", tags: ["panel:v1", "family:unbranded"], enabled: true }] }), 1)).toMatch(/à désactiver dans Elmo \(jamais supprimer\) : px/);
    expect(nogo(bundle(), state({ brandExists: false }), 1)).toMatch(/marque demo-subject absente/);
  });

  it("2 et 3 : panel différent sans note, cibles d'Elmo différentes", () => {
    const b = bundle({}, { panelVersion: 2 });
    expect(nogo(b, state(), 2)).toMatch(/window j1/);
    expect(nogo(bundle(), state({ scrapeTargets: T[0]! }), 3)).toMatch(/SCRAPE_TARGETS d'Elmo différent/);
  });

  it("4 : concurrents d'Elmo différents de la liste déclarée", () => {
    expect(nogo(bundle(), state({ competitors: ["Rival Co", "Autre"] }), 4)).toMatch(/sans être déclarés : Autre/);
    expect(nogo(bundle(), state({ competitors: [] }), 4)).toMatch(/absents d'Elmo : Rival Co/);
  });

  it("5, 6, 7, 8 : worker en marche, gel de référence absent, budget dépassé, autre suivi installé", () => {
    expect(nogo(bundle(), state({ workerRunning: true }), 5)).toMatch(/worker d'Elmo tourne déjà/);
    const nofreeze = bundle();
    nofreeze.measurement.freezes = [];
    expect(nogo(nofreeze, state(), 6)).toMatch(/aucun gel de référence/);
    expect(nogo(bundle(), state({ monthSpendUsd: 25 }), 7, 23)).toMatch(/25\.00 \$ déjà retenus en 2026-02 \+ 23\.00 \$ estimés pour la fenêtre > plafond de 30 \$/);
    // Début déclaré le mois suivant : la dépense du mois en cours ne compte pas.
    expect(nogo(bundle({}, { start: "2026-03-02" }), state({ monthSpendUsd: 25 }), 7, 23)).toBe("");
    expect(nogo(bundle(), state({ capUsd: null }), 7)).toMatch(/plafond ou alerte/);
    expect(nogo(bundle(), state({ otherWatch: "com.oia.visibility.demo-subject.j0.watch" }), 8)).toMatch(/autre fenêtre encore installée/);
  });

  it("ajoute le gel de la fenêtre sur le modèle de la référence, sans toucher au reste du fichier", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    cpSync(join(here, "fixtures", "demo-subject"), join(dir, "demo-subject"), { recursive: true });
    const file = join(dir, "demo-subject", "measurement.yaml");
    const same = `targets: [${T.join(", ")}], runTimeUtc: "15:27"`;
    const text = readFileSync(file, "utf8").replace(
      "status: planned }",
      `status: done, start: "2026-01-05", end: "2026-01-10", ${same} }\n  - { id: j1, kind: follow-up, comparesWith: j0, days: 5, panelVersion: 1, status: planned, ${same} }`,
    );
    writeFileSync(file, text);
    const panel = join(dir, "demo-subject", "panel.yaml");
    writeFileSync(panel, readFileSync(panel, "utf8").replace("status: draft", "status: validated\nvalidatedBy: Owner\nvalidatedAt: \"2026-01-01\""));
    const b = loadSubject(join(dir, "demo-subject"));
    const out = addWindowFreeze(text, b, "j1", "2026-02-01");
    expect(out.slice(0, out.indexOf("freezes:"))).toBe(text.slice(0, text.indexOf("freezes:")));
    const f = parse(out).freezes.find((x: { id: string }) => x.id === "freeze-j1");
    expect(f).toMatchObject({ untilEndOfWindow: "j1", scope: ["site"], decidedBy: "Owner", decidedAt: "2026-02-01" });
    writeFileSync(file, out);
    expect(() => addWindowFreeze(out, loadSubject(join(dir, "demo-subject")), "j1", "2026-02-01")).toThrow(/existe déjà/);
  });
});

describe("recommandations et fenêtre de mesure (bloc D)", () => {
  it("rappelle les exécutées depuis la référence et les en attente, et la date au plus tôt", () => {
    const recs = [
      rec("rec-faite-1", { decision: { status: "accepted" }, execution: { executedAt: "2026-01-20", proof: { kind: "commit", ref: "abc1234" }, declaredBy: "Mickaël" } }),
      rec("rec-faite-2", { decision: { status: "accepted" }, owner: "client", execution: { executedAt: "2026-01-25", proof: { kind: "url", ref: "https://annuaire.example/x" }, declaredBy: "Mickaël", measuredBy: "j1" } }),
      rec("rec-avant", { decision: { status: "accepted" }, execution: { executedAt: "2026-01-02", proof: { kind: "commit", ref: "0000000" }, declaredBy: "Mickaël" } }),
      rec("rec-a-valider"),
      rec("rec-validee", { decision: { status: "accepted" } }),
      rec("rec-bloquee", { blockedBy: "prix à confirmer" }),
      rec("rec-rejetee", { decision: { status: "rejected" } }),
    ];
    const s = recommendationStatus(bundle({}, { start: "2026-02-10" }), "j1", recs);
    expect(s.executed.map((e) => e.id)).toEqual(["rec-faite-1", "rec-faite-2"]);
    expect(s.pending.map((p) => [p.id, p.state])).toEqual([
      ["rec-a-valider", "à valider"], ["rec-validee", "validée, non exécutée"], ["rec-bloquee", "bloquée"],
    ]);
    expect(s.earliestStart).toBe("2026-02-15");
    expect(s.startTooEarly).toBe(true);
    const md = renderRecommendationStatus(s);
    expect(md).toMatch(/2026-01-25 · Titre rec-faite-2 \(rec-faite-2\) · preuve : url https:\/\/annuaire.example\/x/);
    expect(md).toMatch(/ATTENTION : le début déclaré de j1 est antérieur/);
    expect(md).not.toMatch(/rec-rejetee|rec-avant/);
  });
});

describe("pnpm vis (scripts/vis.sh)", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "vis-"));
    const subjects = join(dir, "subjects");
    cpSync(join(here, "fixtures", "demo-subject"), join(subjects, "demo-subject"), { recursive: true });
    const env = { ...process.env, OIA_VIS_SUBJECTS_DIR: subjects, OIA_VIS_DATA: join(dir, "data"), PATH: `${join(dir, "bin")}:${process.env.PATH ?? ""}` };
    mkdirSync(join(dir, "bin"));
    // Faux docker : aucun appel ne doit l'atteindre sur un refus.
    writeFileSync(join(dir, "bin", "docker"), `#!/bin/sh\necho "$*" >> "${join(dir, "docker.log")}"\nexit 1\n`, { mode: 0o755 });
    const vis = (...args: string[]) => spawnSync("bash", [join(ROOT, "scripts/vis.sh"), ...args], { encoding: "utf8", env });
    return { dir, vis };
  }

  it("refuse usage incomplet, option inconnue, fenêtre absente et statut incompatible, sans toucher à Elmo", () => {
    const s = setup();
    expect(s.vis("report", "demo-subject").status).toBe(2);
    expect(s.vis("report", "demo-subject", "j0", "--force").stderr).toMatch(/option inconnue/);
    const absent = s.vis("report", "demo-subject", "j7");
    expect(absent.status).toBe(1);
    expect(absent.stderr).toMatch(/« j7 » absente de measurement.yaml/);
    const close = s.vis("close", "demo-subject", "j0");
    expect(close.status).toBe(1);
    expect(close.stderr).toMatch(/close refusé : fenêtre j0 en statut « planned »/);
    expect(s.vis("compare", "demo-subject", "j0").stderr).toMatch(/attendu : done/);
    expect(s.vis("fly", "demo-subject", "j0").stderr).toMatch(/action inconnue/);
    expect(s.vis("status", "autre-sujet", "j0").stderr).toMatch(/aucun sujet « autre-sujet »/);
    expect(() => readFileSync(join(s.dir, "docker.log"), "utf8")).toThrow();
  });

  it("dossier de fenêtre : <data>/<sujet>/<fenêtre>, ancien emplacement seulement s'il porte le nom du sujet", () => {
    const dir = mkdtempSync(join(tmpdir(), "wdir-"));
    const wd = (subject: string) => execFileSync("bash", ["-c", `source "${join(ROOT, "scripts/lib.sh")}"; window_dir "${dir}" ${subject} j0`], { encoding: "utf8" }).trim();
    mkdirSync(join(dir, "j0"));
    expect(wd("demo-subject")).toBe(join(dir, "demo-subject", "j0"));
    writeFileSync(join(dir, "j0", "subject.txt"), "demo-subject\n");
    expect(wd("demo-subject")).toBe(join(dir, "j0"));
    expect(wd("autre-sujet")).toBe(join(dir, "autre-sujet", "j0"));
    mkdirSync(join(dir, "demo-subject", "j0"), { recursive: true });
    expect(wd("demo-subject")).toBe(join(dir, "demo-subject", "j0"));
  });
});

describe("aller-retour complet sur un sujet fictif (pnpm vis, faux Elmo)", () => {
  const J0 = "2026-01-05T15:27:00Z";
  const J1 = "2026-02-02T15:27:00Z";
  /** Exportation de forme exacte (scripts/j0-export.sh) : 2 questions × 2 moteurs × 3 jours. */
  function fakeExport(start: string, brandOnUnbranded: boolean) {
    const runs: unknown[] = [];
    let n = start === J0 ? 0 : 100;
    for (const day of [0, 1, 2]) {
      for (const [tag, pid] of [["oia:en-01@v1", "11111111-1111-4111-8111-111111111111"], ["oia:en-02@v1", "22222222-2222-4222-8222-222222222222"]] as const) {
        for (const [model, provider, version] of [["chatgpt", "openai-api", "gpt-6-luna"], ["gemini", "openrouter", "google/gemini-3-flash-preview"]] as const) {
          n++;
          const branded = tag === "oia:en-02@v1";
          const named = branded || brandOnUnbranded;
          runs.push({
            id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, promptId: pid,
            promptTags: [tag, "panel:v1", "lang:en", branded ? "family:branded" : "family:unbranded"],
            model, provider, version, webSearch: true,
            createdAt: new Date(Date.parse(start) + day * 86_400_000 + n * 1000).toISOString().replace(".000", ""),
            text: named ? "Demo Subject is a good choice. See https://demo.example/" : "Rival Co is popular.",
            usage: { input_tokens: 1000, output_tokens: 200 }, searchItems: 1,
            citations: named ? ["https://demo.example/"] : ["https://rival.example/"],
            brandMentioned: named, competitorsMentioned: named ? [] : ["Rival Co"],
          });
        }
      }
    }
    return { exportedAt: start, subjectId: "demo-subject", startedAt: start, days: 3, runs, failed: [] };
  }

  it("clôt j0, le rapporte, contrôle j1 à blanc, clôt j1, le compare à j0 et génère la page client", () => {
    const dir = mkdtempSync(join(tmpdir(), "aller-retour-"));
    const subjects = join(dir, "subjects");
    const sd = join(subjects, "demo-subject");
    cpSync(join(here, "fixtures", "demo-subject"), sd, { recursive: true });
    const T2 = ["chatgpt:openai-api:gpt-6-luna:online", "gemini:openrouter:google/gemini-3-flash-preview:online"];
    const same = `targets: [${T2.join(", ")}], runTimeUtc: "15:27"`;
    const m = join(sd, "measurement.yaml");
    writeFileSync(m, readFileSync(m, "utf8")
      .replace("engines:\n  - { model: chatgpt }", "engines:\n  - { model: chatgpt }\n  - { model: gemini }")
      .replace("{ id: j0, kind: baseline, days: 5, panelVersion: 1, status: planned }",
        `{ id: j0, kind: baseline, days: 3, panelVersion: 1, status: running, start: "2026-01-05", ${same} }\n  - { id: j1, kind: follow-up, comparesWith: j0, days: 3, panelVersion: 1, status: planned, ${same} }`));
    const p = join(sd, "panel.yaml");
    writeFileSync(p, readFileSync(p, "utf8").replace("status: draft", "status: validated\nvalidatedBy: Owner\nvalidatedAt: \"2026-01-01\""));
    writeFileSync(join(sd, "subject.yaml"), readFileSync(join(sd, "subject.yaml"), "utf8").replace("languages: [en]", "languages: [en]\nclientLanguage: en"));
    writeFileSync(join(sd, "fact-keywords.yaml"), "facts: []\n");
    writeFileSync(join(sd, "freeze-surface.yaml"), "repoPath: unused\nbranch: main\npublicFiles: [index.html]\nnoindexFiles: []\n");
    // Dépôt du site, inchangé pendant les fenêtres.
    const remote = join(dir, "remote.git"), work = join(dir, "work");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
    execFileSync("git", ["clone", "-q", remote, work], { stdio: "ignore" });
    writeFileSync(join(work, "index.html"), "<h1>Demo</h1>");
    const genv = { ...process.env, GIT_AUTHOR_DATE: "2025-12-01T10:00:00Z", GIT_COMMITTER_DATE: "2025-12-01T10:00:00Z", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    execFileSync("git", ["add", "."], { cwd: work, env: genv });
    execFileSync("git", ["commit", "-q", "-m", "site"], { cwd: work, env: genv });
    execFileSync("git", ["push", "-q", "origin", "main"], { cwd: work, env: genv, stdio: "ignore" });

    const data = join(dir, "data");
    mkdirSync(join(data, "demo-subject", "j0"), { recursive: true });
    writeFileSync(join(data, "demo-subject", "j0", "started-at.txt"), `${J0}\n`);
    writeFileSync(join(data, "cost-journal.csv"), "utc_time,month_utc,elmo_estimate_usd,grid_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action\n");
    const exports = { j0: join(dir, "export-j0.json"), j1: join(dir, "export-j1.json") };
    writeFileSync(exports.j0, JSON.stringify(fakeExport(J0, false)));
    writeFileSync(exports.j1, JSON.stringify(fakeExport(J1, true)));
    const elmoState = join(dir, "elmo-state.json");
    writeFileSync(elmoState, JSON.stringify({
      brandExists: true,
      prompts: [{ id: "11111111-1111-4111-8111-111111111111", tags: ["oia:en-01@v1"], enabled: true }, { id: "22222222-2222-4222-8222-222222222222", tags: ["oia:en-02@v1"], enabled: true }],
      competitors: ["Rival Co"], pendingJobs: [],
    }));
    const env = join(dir, "fake.env");
    writeFileSync(env, `SCRAPE_TARGETS=${T2.join(",")}\nOIA_VIS_MONTHLY_CAP_USD=30\nOIA_VIS_MONTHLY_ALERT_USD=24\n`);
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const log = join(dir, "docker.log");
    writeFileSync(join(bin, "docker"), `#!/bin/bash
echo "$*" >> "${log}"
case "$*" in
  *"ps --status running -q worker"*) exit 0 ;;
  *"config --images"*) echo "elmohq/elmo-worker:0.7.7" ;;
  *"postgres --version"*) echo "postgres (PostgreSQL) 18" ;;
  *pg_dump*) echo "FAKEDUMP" ;;
  *"pg_restore -l"*) cat >/dev/null; echo "1; TABLE DATA public prompt_runs elmo" ;;
  *psql*) sql="$(cat)"; case "$sql" in *brandExists*) cat "${elmoState}" ;; *promptTags*) cat "${exports.j0}" ;; *) echo 0 ;; esac ;;
esac
exit 0
`, { mode: 0o755 });
    writeFileSync(join(bin, "launchctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const audit = join(bin, "audit");
    writeFileSync(audit, "#!/bin/sh\necho 'audit hors ligne'\nexit 1\n", { mode: 0o755 });
    const wd = join(dir, "wd.json");
    const base = {
      ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: join(dir, "home"), OIA_VIS_DATA: data, OIA_VIS_SUBJECTS_DIR: subjects,
      OIA_VIS_ELMO_ENV_FILE: env, OIA_VIS_WINDOW_DATA: wd, OIA_VIS_FREEZE_REPO: work, BACKUP_DIR: join(dir, "backups"),
      OIA_VIS_CRAWLIE_AUDIT: audit, OIA_VIS_NO_RESOLVE: "1",
    };
    const vis = (args: string[], extra: Record<string, string> = {}) => {
      const r = spawnSync("bash", [join(ROOT, "scripts/vis.sh"), ...args], { encoding: "utf8", env: { ...base, ...extra } });
      expect(r.status, `${args.join(" ")}\n${r.stdout}\n${r.stderr}`).toBe(0);
      return r;
    };
    const status = (w: string) => parse(readFileSync(m, "utf8")).windows.find((x: { id: string }) => x.id === w).status;

    // J0 : clôture (fenêtre passée en done), rapport, vérification.
    writeFileSync(wd, JSON.stringify({ now: "2026-01-09T10:00:00Z", startedAt: J0, days: 3, prompts: 2, engines: ["chatgpt", "gemini"], runs: [], failed: [] }));
    vis(["close", "demo-subject", "j0"]);
    expect(status("j0")).toBe("done");
    vis(["report", "demo-subject", "j0"]);
    expect(vis(["verify", "demo-subject", "j0"]).stdout).toMatch(/VÉRIFIÉ : 12 réponses/);

    // J1 : contrôle à blanc (GO), sans rien écrire.
    const before = readFileSync(m, "utf8");
    const dry = vis(["launch", "demo-subject", "j1", "--dry-run"]);
    expect(dry.stdout).toMatch(/GO \(à blanc : rien n'a été écrit\)/);
    expect(dry.stdout).toMatch(/gemini : modèle sous alias/);
    expect(readFileSync(m, "utf8")).toBe(before);

    // J1 lancé (simulé : le lancement réel exige l'heure du run), puis clos et rapporté.
    writeFileSync(m, readFileSync(m, "utf8").replace("status: planned, ", 'status: running, start: "2026-02-02", '));
    mkdirSync(join(data, "demo-subject", "j1"), { recursive: true });
    writeFileSync(join(data, "demo-subject", "j1", "started-at.txt"), `${J1}\n`);
    writeFileSync(join(bin, "docker"), readFileSync(join(bin, "docker"), "utf8").replace(exports.j0, exports.j1));
    writeFileSync(wd, JSON.stringify({ now: "2026-02-06T10:00:00Z", startedAt: J1, days: 3, prompts: 2, engines: ["chatgpt", "gemini"], runs: [], failed: [] }));
    vis(["close", "demo-subject", "j1"]);
    expect(status("j1")).toBe("done");
    vis(["report", "demo-subject", "j1"]);
    vis(["verify", "demo-subject", "j1"]);

    // Comparaison, puis page client.
    vis(["compare", "demo-subject", "j1"]);
    const c = JSON.parse(readFileSync(join(sd, "reports/j1/comparaison-j1-j0.json"), "utf8"));
    expect(c.unbranded.total.verdict).toBe("hausse");
    expect(c.unbranded.total.reference.mean).toBe(0);
    expect(c.unbranded.total.current.mean).toBe(100);
    vis(["page", "demo-subject", "j1"]);
    const html = readFileSync(join(sd, "reports/j1/page-client.html"), "utf8");
    expect(html).toContain("Demo Subject");
    // Aucun nom d'un sujet réel du dépôt dans la page du sujet fictif.
    for (const d of listSubjectDirs(join(ROOT, "subjects"))) expect(html).not.toContain(loadSubject(d).subject.displayName);
    // Données de J0 inchangées par la clôture et le rapport de J1.
    expect(vis(["verify", "demo-subject", "j0"]).stdout).toMatch(/VÉRIFIÉ : 12 réponses/);
    // Aucune action interdite sur Elmo : jamais down, rm ni suppression de volume.
    expect(readFileSync(log, "utf8")).not.toMatch(/ down| rm |volume rm/);
  });
});

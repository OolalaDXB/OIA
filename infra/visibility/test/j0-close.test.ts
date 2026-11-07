import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WindowExport } from "../src/j0-evidence.js";
import { readEvidence } from "../src/evidence-store.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const START = "2026-11-01T09:00:00Z";

/** Exportation fictive, forme exacte de scripts/j0-export.sh : 2 questions × 2 moteurs × 2 jours. */
function fakeExport(): WindowExport {
  const runs: WindowExport["runs"] = [];
  let n = 0;
  for (const day of [0, 1]) {
    for (const [p, tag] of [["What does Demo Subject offer?", "oia:en-02@v1"], ["Which demo tools are best?", "oia:en-01@v1"]] as const) {
      for (const [model, provider, version] of [["chatgpt", "openai-api", "gpt-6-luna"], ["claude", "anthropic-api", "claude-sonnet-5-5"]] as const) {
        n++;
        const branded = tag === "oia:en-02@v1";
        runs.push({
          id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
          promptTags: [tag, "panel:v1", "lang:en", branded ? "family:branded" : "family:unbranded"],
          model, provider, version, webSearch: true,
          createdAt: new Date(Date.parse(START) + day * 86_400_000 + n * 1000).toISOString().replace(".000", ""),
          text: branded ? `Demo Subject sells demos (${p}). See https://demo.example/` : "Rival Co is popular.",
          usage: provider === "openai-api" ? { input_tokens: 1000, output_tokens: 200 } : { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } },
          searchItems: provider === "openai-api" ? 1 : 0,
          citations: branded ? ["https://demo.example/", "https://reddit.com/r/x"] : ["https://rival.example/"],
          brandMentioned: branded && !(day === 1 && model === "claude"),
          competitorsMentioned: branded ? [] : ["Rival Co"],
        });
      }
    }
  }
  return { exportedAt: "2026-11-06T10:00:00Z", subjectId: "demo-subject", startedAt: START, days: 2, runs, failed: [{ model: "claude", createdAt: "2026-11-02T09:05:00Z" }] };
}

function git(cwd: string, args: string[], date?: string) {
  execFileSync("git", args, {
    cwd,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
    stdio: "ignore",
  });
}

/** Dépôt « distant » et sa copie locale : pages en noindex au début de la fenêtre. */
function siteRepo(dir: string, breakDuringWindow: boolean) {
  const remote = join(dir, "remote.git");
  const work = join(dir, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, work], { stdio: "ignore" });
  writeFileSync(join(work, "index.html"), "<h1>Demo</h1>");
  writeFileSync(join(work, "service.html"), '<meta name="robots" content="noindex">');
  git(work, ["add", "."], "2026-10-30T10:00:00Z");
  git(work, ["commit", "-q", "-m", "site"], "2026-10-30T10:00:00Z");
  if (breakDuringWindow) {
    writeFileSync(join(work, "index.html"), "<h1>Demo, nouveau texte</h1>");
    git(work, ["commit", "-q", "-am", "nouveau texte"], "2026-11-01T12:00:00Z");
  }
  git(work, ["push", "-q", "origin", "main"]);
  return work;
}

function setup(breakFreeze = false) {
  const dir = mkdtempSync(join(tmpdir(), "close-"));
  const data = join(dir, "data");
  mkdirSync(join(data, "j0"), { recursive: true });
  writeFileSync(join(data, "j0", "started-at.txt"), `${START}\n`);
  const subjects = join(dir, "subjects");
  cpSync(join(here, "fixtures", "demo-subject"), join(subjects, "demo-subject"), { recursive: true });
  writeFileSync(join(subjects, "demo-subject", "freeze-surface.yaml"), "repoPath: unused\nbranch: main\npublicFiles: [index.html, service.html]\nnoindexFiles: [service.html]\n");
  writeFileSync(join(subjects, "demo-subject", "fact-keywords.yaml"), "facts: []\n");
  const exportFile = join(dir, "export.json");
  writeFileSync(exportFile, JSON.stringify(fakeExport()));
  const windowData = join(dir, "wd.json");
  writeFileSync(windowData, JSON.stringify({ now: "2026-11-06T10:00:00Z", startedAt: START, days: 2, prompts: 2, engines: ["chatgpt", "claude"], runs: [], failed: [] }));
  const env = join(dir, "fake.env");
  writeFileSync(env, "SCRAPE_TARGETS=\n");
  // Faux docker : consigne chaque appel ; répond comme Elmo aux seules commandes de la clôture.
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "docker.log");
  writeFileSync(join(bin, "docker"), `#!/bin/bash
echo "$*" >> "${log}"
case "$*" in
  *"config --images"*) echo "elmohq/elmo-worker:0.7.7" ;;
  *"postgres --version"*) echo "postgres (PostgreSQL) 18" ;;
  *pg_dump*) echo "FAKEDUMP" ;;
  *"pg_restore -l"*) cat >/dev/null; echo "1; TABLE DATA public prompt_runs elmo" ;;
  *psql*) sql="$(cat)"; case "$sql" in *promptTags*) cat "${exportFile}" ;; *) echo 0 ;; esac ;;
esac
exit 0
`);
  chmodSync(join(bin, "docker"), 0o755);
  writeFileSync(join(bin, "launchctl"), `#!/bin/sh\necho "$*" >> "${join(dir, "launchctl.log")}"\n`);
  chmodSync(join(bin, "launchctl"), 0o755);
  const repo = siteRepo(dir, breakFreeze);
  // Audit Crawlie précédent, et faux audit du jour (forme réduite du rapport Crawlie).
  const crawl = (pages: number, rules: string[]) => JSON.stringify({
    summary: { totalPages: pages, indexablePages: pages, healthScore: 50 + pages, geoScore: 30, a11yScore: 99, warnings: rules.length, notices: 0, errors: 0 },
    pages: Array.from({ length: pages }, (_, i) => ({ url: `https://demo.example/p${i}`, status: 200 })),
    issues: rules.map((rule) => ({ rule, severity: "warning", url: "https://demo.example/" })),
  });
  mkdirSync(join(subjects, "demo-subject", "audits", "2026-10-01"), { recursive: true });
  writeFileSync(join(subjects, "demo-subject", "audits", "2026-10-01", "crawlie.json"), crawl(2, ["noindex", "noindex"]));
  const fresh = join(dir, "crawlie-new.json");
  writeFileSync(fresh, crawl(4, ["title-too-short"]));
  const fakeAudit = join(bin, "fake-crawlie-audit");
  writeFileSync(fakeAudit, `#!/bin/sh\necho "[demo-subject] crawl https://demo.example..."\necho "  -> ${fresh}"\n`);
  chmodSync(fakeAudit, 0o755);
  const vars = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: join(dir, "home"),
    OIA_VIS_DATA: data,
    OIA_VIS_SUBJECTS_DIR: subjects,
    OIA_VIS_ELMO_ENV_FILE: env,
    OIA_VIS_WINDOW_DATA: windowData,
    OIA_VIS_WINDOW_DAYS: "2",
    OIA_VIS_FREEZE_REPO: repo,
    BACKUP_DIR: join(dir, "backups"),
    OIA_VIS_CRAWLIE_AUDIT: fakeAudit,
  };
  const close = (extra: Record<string, string> = {}) =>
    spawnSync("bash", [join(ROOT, "scripts/j0-close.sh"), "demo-subject"], { encoding: "utf8", env: { ...vars, ...extra } });
  const report = (mode: "report" | "verify") =>
    spawnSync("bash", [join(ROOT, "scripts/j0-report.sh"), mode, "demo-subject"], { encoding: "utf8", env: vars });
  return { dir, data, subjects, close, report, docker: () => (existsSync(log) ? readFileSync(log, "utf8") : ""), evidence: join(data, "demo-subject/evidence/j0.jsonl") };
}

describe("vis:j0-close (reprenable, sans doublon, seul arrêt autorisé)", () => {
  it("reprend à l'étape interrompue, sans rien refaire, et sans jamais supprimer de données", () => {
    const s = setup();
    const first = s.close({ OIA_VIS_CLOSE_FAIL_AT: "backup" });
    expect(first.status).toBe(1);
    expect(first.stdout).toMatch(/> completeness[\s\S]*> freeze[\s\S]*> stop-worker[\s\S]*> backup/);
    const second = s.close();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toMatch(/= completeness : déjà fait/);
    expect(second.stdout).toMatch(/= stop-worker : déjà fait/);
    expect(second.stdout).toMatch(/sauvegarde vérifiée/);
    expect(readEvidence(s.evidence)).toHaveLength(8);
    // Audit Crawlie de clôture, comparé au précédent.
    const today = new Date().toISOString().slice(0, 10);
    const cmp = readFileSync(join(s.subjects, "demo-subject", "audits", today, "crawlie-comparaison.md"), "utf8");
    expect(cmp).toMatch(/Audit Crawlie : 2026-10-01 → /);
    expect(cmp).toMatch(/\| Pages crawlées \| 2 \| 4 \| \+2 \|/);
    expect(cmp).toMatch(/\| noindex \| 2 \| 0 \|/);
    // Troisième passage : rien n'est refait, aucune preuve dupliquée.
    const third = s.close();
    expect(third.status).toBe(0);
    expect(third.stdout).not.toMatch(/^> /m);
    expect(readEvidence(s.evidence)).toHaveLength(8);
    const calls = s.docker();
    expect(calls.match(/compose\.yaml stop worker/g)).toHaveLength(1);
    expect(calls).not.toMatch(/compose\.yaml (down|rm|kill|restart|up)\b/);
    expect(calls).not.toMatch(/volume/);
  });

  it("refuse une clôture avant la fin du dernier jour", () => {
    const s = setup();
    writeFileSync(join(s.data, "j0", "started-at.txt"), `${new Date().toISOString()}\n`);
    const r = s.close();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Trop tôt/);
    expect(s.docker()).toBe("");
  });

  it("consigne un gel rompu pendant la fenêtre sans bloquer la clôture", () => {
    const s = setup(true);
    const r = s.close();
    expect(r.status, r.stderr).toBe(0);
    const freeze = readFileSync(join(s.data, "j0/close/freeze.txt"), "utf8");
    expect(freeze).toMatch(/GEL ROMPU PENDANT LA FENÊTRE/);
    expect(freeze).toMatch(/index\.html/);
    expect(freeze).toMatch(/noindex conservé : service\.html/);
  });
});

describe("vis:j0-report et vis:j0-verify", () => {
  it("produit le rapport depuis les preuves, puis le vérifie à l'identique", () => {
    const s = setup();
    expect(s.close().status).toBe(0);
    const rep = s.report("report");
    expect(rep.status, rep.stderr).toBe(0);
    const dir = join(s.subjects, "demo-subject/reports/j0");
    const md = readFileSync(join(dir, "rapport-j0.md"), "utf8");
    expect(md).toMatch(/Statut : à valider par Mickaël/);
    expect(md).toMatch(/Indicateurs de visibilité mesurés par les API des assistants/);
    expect(md).toMatch(/ne prétend à aucune exhaustivité/);
    expect(md).toMatch(/Dépense réelle : \*\*à relever\*\*/);
    expect(readFileSync(join(dir, "rapport-j0.html"), "utf8")).toMatch(/<table>/);
    const fig = JSON.parse(readFileSync(join(dir, "figures.json"), "utf8"));
    // Questions marquées : 4 réponses jugées, 3 mentions ; non marquées : 4, 0 mention → 3/8.
    expect(fig.total).toMatchObject({ responses: 8, judged: 8, mentioned: 3, presencePct: 37.5 });
    expect(fig.perEngine.map((e: { engine: string; versions: string[] }) => [e.engine, e.versions])).toEqual([
      ["chatgpt", ["gpt-6-luna"]],
      ["claude", ["claude-sonnet-5-5"]],
    ]);
    expect(fig.window).toMatchObject({ days: 2, daysWithResponses: [1, 2], missingDays: [], failedRuns: 1 });
    expect(fig.competitorsInstead).toEqual([{ name: "Rival Co", runs: 4, rejectedByOia: false }]);
    const ok = s.report("verify");
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/VÉRIFIÉ : 8 réponses/);
  });

  it("refuse une preuve altérée et un chiffre modifié", () => {
    const s = setup();
    expect(s.close().status).toBe(0);
    expect(s.report("report").status).toBe(0);
    const lines = readFileSync(s.evidence, "utf8").trim().split("\n");
    const row = JSON.parse(lines[0]!);
    row.rawText = `${row.rawText} (modifié)`;
    lines[0] = JSON.stringify(row);
    writeFileSync(s.evidence, `${lines.join("\n")}\n`);
    const bad = s.report("verify");
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/ne correspond plus à l'empreinte/);

    const t = setup();
    expect(t.close().status).toBe(0);
    expect(t.report("report").status).toBe(0);
    const figFile = join(t.subjects, "demo-subject/reports/j0/figures.json");
    const fig = JSON.parse(readFileSync(figFile, "utf8"));
    fig.total.presencePct = 50;
    writeFileSync(figFile, JSON.stringify(fig));
    const wrong = t.report("verify");
    expect(wrong.status).toBe(1);
    expect(wrong.stdout).toMatch(/chiffres différents dans « total »/);
  });
});

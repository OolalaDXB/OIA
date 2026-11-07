import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderDay, renderStatus, type WindowData, windowState } from "../src/window-watch.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const money = { spentUsd: 4.2, alertUsd: 24, capUsd: 30 };

/** Fenêtre fictive : 2 moteurs, 2 questions, démarrée le 8 nov. à 09:00 UTC. */
function data(over: Partial<WindowData> = {}): WindowData {
  const run = (model: string, at: string, version = `${model}-v1`) => ({ model, version, createdAt: at });
  return {
    now: "2026-11-09T10:30:00Z",
    startedAt: "2026-11-08T09:00:00Z",
    days: 5,
    prompts: 2,
    engines: ["alpha", "beta"],
    runs: [
      run("alpha", "2026-11-08T09:00:10Z"), run("alpha", "2026-11-08T09:00:20Z"),
      run("beta", "2026-11-08T09:00:15Z"), run("beta", "2026-11-08T09:00:25Z"),
      run("alpha", "2026-11-09T09:00:10Z"), run("alpha", "2026-11-09T09:00:20Z"),
      run("beta", "2026-11-09T09:00:15Z"),
    ],
    failed: [{ model: "beta", createdAt: "2026-11-09T09:00:30Z" }],
    ...over,
  };
}

describe("suivi de fenêtre (bloc A)", () => {
  it("découpe la fenêtre en tranches de 24 h depuis le démarrage", () => {
    const st = windowState(data(), money);
    expect(st.currentDay).toBe(2);
    expect(st.slots.map((s) => s.state)).toEqual(["complet", "en cours", "à venir", "à venir", "à venir"]);
    expect(st.slots[1]?.perEngine).toEqual([
      { model: "alpha", ok: 2, failed: 0, versions: ["alpha-v1"] },
      { model: "beta", ok: 1, failed: 1, versions: ["beta-v1"] },
    ]);
  });

  it("signale un moteur en échec, un jour manquant, un jour incomplet et une version changée", () => {
    const d = data({ now: "2026-11-11T10:00:00Z" });
    d.runs.push({ model: "alpha", version: "alpha-v2", createdAt: "2026-11-11T09:00:00Z" });
    const p = windowState(d, money).problems.join("\n");
    expect(p).toMatch(/jour 2 incomplet : beta 1\/2/);
    expect(p).toMatch(/jour 2 : beta en échec \(1\)/);
    expect(p).toMatch(/jour 3 manquant/);
    expect(p).toMatch(/alpha : version servie changée \(alpha-v1 → alpha-v2\)/);
  });

  it("signale le seuil d'alerte de dépense, et se tait un jour sans problème", () => {
    expect(windowState(data(), { ...money, spentUsd: 25 }).problems.join()).toMatch(/seuil d'alerte 24/);
    const quiet = data({ now: "2026-11-08T12:00:00Z", failed: [] });
    expect(windowState(quiet, money).problems).toEqual([]);
  });

  it("vis:j0-status tient en dix lignes et rappelle les consoles", () => {
    const d = data();
    const out = renderStatus("Demo", "j0", d, windowState(d, money), money);
    expect(out.trim().split("\n").length).toBeLessThanOrEqual(10);
    expect(out).toMatch(/jour 2\/5/);
    expect(out).toMatch(/alpha 2 · beta 1 \(\+1 échec\)/);
    expect(out).toMatch(/OIA_VIS_MANUAL_COST_USD/);
  });

  it("la fiche du jour donne runs réussis, échoués et manquants, version et dépense", () => {
    const d = data();
    const r = renderDay("Demo", "j0", d, windowState(d, money), money)!;
    expect(r.day).toBe(2);
    expect(r.markdown).toMatch(/\| beta \| 1 \| 1 \| 1 \| beta-v1 \|/);
    expect(r.markdown).toMatch(/plafond de 30 \$/);
  });
});

/** Faux binaires en tête du PATH : chaque appel est consigné, rien n'est exécuté. */
function fakeBin(dir: string, names: string[]) {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  for (const n of names) {
    const log = join(dir, `${n}.log`);
    // docker « exec … psql » : 0 pour la somme du mois, rien pour la liste des runs ; tout est consigné.
    writeFileSync(join(bin, n), `#!/bin/sh\necho "$@" >> "${log}"\ncase "$*" in *estimated_cost_usd*) echo 0;; esac\nexit 0\n`);
    chmodSync(join(bin, n), 0o755);
  }
  return { PATH: `${bin}:${process.env.PATH ?? ""}`, calls: (n: string) => (existsSync(join(dir, `${n}.log`)) ? readFileSync(join(dir, `${n}.log`), "utf8") : "") };
}

describe("cost-guard.sh --check (tâche quotidienne)", () => {
  function run(args: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "cg-check-"));
    const env = join(dir, "fake.env");
    writeFileSync(env, "OIA_VIS_MONTHLY_CAP_USD=30\n");
    const fake = fakeBin(dir, ["docker"]);
    const r = spawnSync("bash", [join(ROOT, "scripts/cost-guard.sh"), ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: fake.PATH, OIA_VIS_ELMO_ENV_FILE: env, OIA_VIS_DATA: dir, OIA_VIS_MONTHLY_CAP_USD: "-1", OIA_VIS_MONTHLY_ALERT_USD: "0", OIA_VIS_COST_SOURCE: "max" },
    });
    return { status: r.status, docker: fake.calls("docker") };
  }

  it("plafond dépassé en mode normal : le faux docker reçoit bien l'arrêt (le test voit ce qu'il doit voir)", () => {
    const r = run([]);
    expect(r.status).toBe(3);
    expect(r.docker).toMatch(/compose\.yaml stop worker/);
  });

  it("plafond dépassé en --check : aucun arrêt du worker, seulement des lectures", () => {
    const r = run(["--check"]);
    expect(r.status).toBe(3);
    // Sous-commande de `docker compose`, juste après le fichier de composition.
    expect(r.docker).not.toMatch(/compose\.yaml (stop|start|restart|up|down|rm|kill)\b/);
    expect(r.docker).toMatch(/exec/);
  });
});

describe("tâche quotidienne launchd (j0-watch.sh, j0-watch-day.sh)", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "watch-"));
    const home = join(dir, "home");
    const dataDir = join(dir, "data");
    mkdirSync(join(dataDir, "j0"), { recursive: true });
    writeFileSync(join(dataDir, "j0", "started-at.txt"), "2026-11-08T09:00:00Z\n");
    const subjects = join(dir, "subjects");
    cpSync(join(here, "fixtures", "demo-subject"), join(subjects, "demo-subject"), { recursive: true });
    const fake = fakeBin(dir, ["launchctl", "docker"]);
    const env = { ...process.env, HOME: home, PATH: fake.PATH, OIA_VIS_DATA: dataDir, OIA_VIS_SUBJECTS_DIR: subjects };
    return { dir, home, dataDir, subjects, fake, env };
  }

  it("installe la tâche une heure après le démarrage (heure locale), puis la retire", () => {
    const s = setup();
    const i = spawnSync("bash", [join(ROOT, "scripts/j0-watch.sh"), "install", "demo-subject"], { encoding: "utf8", env: s.env });
    expect(i.status, i.stderr).toBe(0);
    const plist = join(s.home, "Library/LaunchAgents/com.oia.visibility.demo-subject.j0.watch.plist");
    const xml = readFileSync(plist, "utf8");
    const t = new Date(Date.parse("2026-11-08T09:00:00Z") + 3_600_000);
    expect(xml).toContain(`<key>Hour</key><integer>${t.getHours()}</integer>`);
    expect(xml).toContain(`<key>Minute</key><integer>${t.getMinutes()}</integer>`);
    expect(xml).toContain("j0-watch-day.sh");
    expect(s.fake.calls("launchctl")).toMatch(/bootstrap gui\/\d+ .*\.plist/);
    const r = spawnSync("bash", [join(ROOT, "scripts/j0-watch.sh"), "remove", "demo-subject"], { encoding: "utf8", env: s.env });
    expect(r.status).toBe(0);
    expect(existsSync(plist)).toBe(false);
    expect(s.fake.calls("launchctl")).toMatch(/bootout gui\/\d+\/com\.oia\.visibility\.demo-subject\.j0\.watch/);
  });

  function day(s: ReturnType<typeof setup>, d: WindowData) {
    const wd = join(s.dir, "wd.json");
    writeFileSync(wd, JSON.stringify(d));
    const notes = join(s.dir, "notify.log");
    const r = spawnSync("bash", [join(ROOT, "scripts/j0-watch-day.sh"), "demo-subject"], {
      encoding: "utf8",
      env: { ...s.env, OIA_VIS_WINDOW_DATA: wd, OIA_VIS_SKIP_EXPORT: "1", OIA_VIS_SKIP_COST: "1", OIA_VIS_NOTIFY_LOG: notes },
    });
    return { r, notes: existsSync(notes) ? readFileSync(notes, "utf8") : "" };
  }

  it("un jour sans problème : fiche écrite, aucune notification, aucun appel à Docker", () => {
    const s = setup();
    const { r, notes } = day(s, data({ now: "2026-11-08T12:00:00Z", failed: [] }));
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(s.subjects, "demo-subject/reports/j0/jour-1.md"), "utf8")).toMatch(/jour 1\/5/);
    expect(notes).toBe("");
    expect(s.fake.calls("docker")).toBe("");
  });

  it("un problème : notification ; après la fin de la fenêtre : la tâche se retire", () => {
    const s = setup();
    const { notes } = day(s, data());
    expect(notes).toMatch(/Jour 2 : .*beta en échec/);
    expect(s.fake.calls("launchctl")).toBe("");
    day(s, data({ now: "2026-11-13T12:00:00Z" }));
    expect(s.fake.calls("launchctl")).toMatch(/bootout/);
    expect(s.fake.calls("docker")).toBe("");
  });
});

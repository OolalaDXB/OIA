import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
// Sujet fictif d'OIA Visibility : aucune donnée de client dans ces tests.
const fixtures = resolve(app, "../../infra/visibility/test/fixtures");
const tsx = join(app, "node_modules/.bin/tsx");

function run(...args: string[]) {
  return spawnSync(tsx, [join(app, "src/cli.ts"), ...args], {
    encoding: "utf8",
    env: { ...process.env, OIA_VIS_SUBJECTS_DIR: fixtures },
  });
}

describe("console locale d'OIA Visibility", () => {
  it("portfolio liste les sujets du dossier configuré", () => {
    const r = run("portfolio");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/1 sujet\(s\) chargé\(s\)/);
    expect(r.stdout).toMatch(/\| demo-subject \| draft \| en \| GB \| https:\/\/demo\.example \|/);
  });

  it("costs rappelle le plafond global sans rien dépenser", () => {
    const r = run("costs");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/plafond global 30 \$/);
  });

  it("seo-command --demo exécute une mission fictive, scheduler coupé", () => {
    const r = run("seo-command", "--demo");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Scheduler globalEnabled : NON/);
    expect(r.stdout).toMatch(/Démo \(--demo\) : mission exécutée → \w+/);
  });

  it("actions et site n'affichent rien d'inventé quand il n'y a aucune recommandation", () => {
    expect(run("actions").stdout).toMatch(/0 recommandation\(s\) en attente/);
    expect(run("site", "demo-subject").stdout).toMatch(/Recommandations : 0/);
  });

  it("refuse une commande inconnue avec le code 2, et site sans sujet avec le code 1", () => {
    const unknown = run("inconnue");
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toMatch(/usage: console/);
    const site = run("site");
    expect(site.status).toBe(1);
    expect(site.stderr).toMatch(/usage: console site <subjectId>/);
  });
});

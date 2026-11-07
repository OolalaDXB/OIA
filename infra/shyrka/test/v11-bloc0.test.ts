import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resumerManquants } from "../src/executive/brief.js";
import { motifRefusService, revision } from "../src/executive/config.js";
import { estAvertissementSqlite } from "../src/node-sqlite.js";

/** Mandat v11, bloc 0 : les trois défauts de présentation signalés par v10, reproduits puis corrigés. */

describe("avertissement SQLite expérimental", () => {
  it("ne reconnaît que l'avertissement SQLite", () => {
    const sqlite = Object.assign(new Error("SQLite is an experimental feature and might change at any time"), { name: "ExperimentalWarning" });
    expect(estAvertissementSqlite(sqlite)).toBe(true);
    expect(estAvertissementSqlite("SQLite is an experimental feature and might change at any time", "ExperimentalWarning")).toBe(true);
    expect(estAvertissementSqlite("Type Stripping is an experimental feature", "ExperimentalWarning")).toBe(false);
    expect(estAvertissementSqlite("SQLite is an experimental feature", "DeprecationWarning")).toBe(false);
  });

  it("dans un vrai processus : l'avertissement SQLite disparaît, les autres restent", () => {
    const tsx = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
    const script = `import(${JSON.stringify(join(import.meta.dirname, "..", "src", "node-sqlite.ts"))}).then((m) => { new m.DatabaseSync(":memory:"); process.emitWarning("témoin autre avertissement", "ExperimentalWarning"); });`;
    const r = spawnSync(tsx, ["--eval", script], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/SQLite is an experimental feature/);
    expect(r.stderr).toMatch(/témoin autre avertissement/);
  });
});

describe("couverture du briefing", () => {
  it("deux projets Vercel sans accès : une ligne, pas deux identiques (Maisons.co)", () => {
    const l = resumerManquants([
      { controle: "supabase.sante", etat: "non_configure", cible: "gugd" },
      { controle: "vercel.deploiement", etat: "acces_manquant", cible: "maisonsmain" },
      { controle: "vercel.deploiement", etat: "acces_manquant", cible: "maisons" },
    ]);
    expect(l).toEqual(["supabase.sante (non_configure)", "vercel.deploiement ×2 [maisonsmain, maisons] (acces_manquant)"]);
    expect(new Set(l).size).toBe(l.length);
  });
});

describe("service : réinstaller seulement si le code a changé", () => {
  it("même révision, modifications locales : committer, ne pas réinstaller", () => {
    expect(motifRefusService(false, true)?.titre).toMatch(/ne pas réinstaller/);
    expect(motifRefusService(true, false)?.titre).toMatch(/réinstaller le service/);
    expect(motifRefusService(false, false)).toBeNull();
  });

  const depot = mkdtempSync(join(tmpdir(), "shyrka-rev-"));
  afterAll(() => rmSync(depot, { recursive: true, force: true }));
  it("dans un vrai dépôt git : un mandat ou un rapport non suivi n'est pas une modification du code", () => {
    const git = (...a: string[]) => execFileSync("git", ["-C", depot, ...a], { encoding: "utf8" });
    git("init", "-q");
    mkdirSync(join(depot, "infra/shyrka/src"), { recursive: true });
    writeFileSync(join(depot, "infra/shyrka/src/a.ts"), "export {};\n");
    git("add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    mkdirSync(join(depot, "infra/shyrka/mandats"), { recursive: true });
    mkdirSync(join(depot, "infra/shyrka/reports"), { recursive: true });
    writeFileSync(join(depot, "infra/shyrka/mandats/MANDAT.md"), "# mandat\n");
    writeFileSync(join(depot, "infra/shyrka/reports/r.md"), "# rapport\n");
    writeFileSync(join(depot, "infra/shyrka/NOTE.md"), "# note\n");
    expect(revision(depot).modifie).toBe(false);
    writeFileSync(join(depot, "infra/shyrka/src/b.ts"), "export const b = 1;\n");
    expect(revision(depot).modifie).toBe(true);
  });
});

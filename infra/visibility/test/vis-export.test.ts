import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildVisibility, type ElmoExport, frDate, spentFromJournal } from "../src/vis-export.js";
import { loadSubject } from "../src/load.js";
import { loadFamilies } from "../src/verification.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const fixtureDir = join(here, "fixtures", "demo-subject");
const exportFile = join(here, "fixtures", "elmo-export", "demo-subject.json");
const elmo = JSON.parse(readFileSync(exportFile, "utf8")) as ElmoExport;
const ctx = { prenom: "Mickaël", spentUsd: 1.234, capUsd: 30, families: loadFamilies() };
const build = (e: ElmoExport = elmo) => buildVisibility(loadSubject(fixtureDir), e, ctx);

describe("visibility.json à partir d'une exportation Elmo (fictive, forme exacte)", () => {
  it("a les sept clés de src/data/demo.ts", () => {
    expect(Object.keys(build())).toEqual(["utilisateur", "aDecider", "sites", "agents", "depenses", "onboarding", "vueSite"]);
  });

  it("calcule la présence sur les seules réponses jugées par Jev, par jour et par assistant", () => {
    const v = build().vueSite;
    // 4 réponses jugées (la 5e attend Jev) : 3 citent la marque. Jour 1 : 1/2, jour 2 : 2/2.
    expect(v.presence).toBe(75);
    expect([v.min, v.max, v.jours]).toEqual([50, 100, 2]);
    expect(v.parAssistant).toEqual([{ nom: "ChatGPT", v: 75 }]);
    expect(v.concurrents).toEqual([{ nom: "Rival Co", v: 50 }]);
    expect(v.historique).toEqual([{ fenetre: "8 nov. 2026 – 9 nov. 2026", v: 75, min: 50, max: 100, statut: "Mesure de départ" }]);
  });

  it("compte les sources citées une fois par réponse, les plus citées d'abord", () => {
    expect(build().vueSite.sources).toEqual([
      { nom: "reddit.com", n: 3 },
      { nom: "demo.example", n: 2 },
      { nom: "rival.example", n: 1 },
    ]);
  });

  it("signale un moteur en échec, et la dépense lue dans le journal", () => {
    const v = build();
    expect(v.sites[0]?.etat).toBe("verifier");
    expect(v.aDecider.map((d) => d.titre)).toContain("Moteur en échec · ChatGPT");
    expect(v.depenses).toEqual({ montant: 1.23, plafond: 30 });
  });

  it("n'invente rien quand Elmo est vide : présence nulle, liste vide, état bloquant", () => {
    const empty: ElmoExport = { exportedAt: elmo.exportedAt, brand: null, competitors: [], prompts: [], runs: [], failed: [] };
    const v = build(empty);
    expect(v.sites[0]).toMatchObject({ ia: null, depart: "—", etat: "bloquant", google: "Non connecté" });
    expect(v.vueSite.historique).toEqual([]);
    expect(v.vueSite.recommandations).toEqual([]);
    expect(v.aDecider[0]?.titre).toMatch(/Lancer la mesure de départ/);
  });

  it("ne garde que les questions actives du panel, avec leur famille", () => {
    const b = loadSubject(fixtureDir);
    const active = b.panel.prompts.filter((p) => p.status === "active");
    expect(build().onboarding.questions).toEqual(active.map((p) => ({ q: p.text, marque: p.family === "branded" })));
  });

  it("formate les dates à la française, et lit le dernier coût du mois dans le journal", () => {
    expect(frDate("2026-11-08")).toBe("8 nov. 2026");
    const csv = [
      "utc_time,month_utc,elmo_estimate_usd,grid_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action",
      "2026-10-31T23:00:00Z,2026-10,1,1,n/a,0,9.5,30,24,none",
      "2026-11-08T10:00:00Z,2026-11,0.2,0.4,n/a,0,0.4000,30,24,none",
      "2026-11-08T10:01:00Z,2026-11,0.3,0.6,n/a,0,0.6000,30,24,none",
    ].join("\n");
    expect(spentFromJournal(csv, "2026-11")).toBe(0.6);
    expect(spentFromJournal(csv, "2026-12")).toBeNull();
  });
});

describe("même structure que src/data/demo.ts du prototype", () => {
  // Lu sur la branche sans la modifier ; test sauté si la branche n'est pas présente localement.
  const demoSource = (() => {
    try {
      return execFileSync("git", ["show", "origin/lovable/oia-visibility-prototype:prototypes/oia-prototype/src/data/demo.ts"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  })();

  type Shape = string | Shape[] | { [k: string]: Shape };
  const shape = (v: unknown): Shape => {
    if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
    if (v === null) return "null";
    if (typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)]));
    return typeof v;
  };
  // Une liste vide de notre côté est compatible avec n'importe quelle forme d'élément.
  const compatible = (ours: Shape, theirs: Shape, path: string, errors: string[]) => {
    if (Array.isArray(ours) && Array.isArray(theirs)) {
      if (ours.length && theirs.length) compatible(ours[0]!, theirs[0]!, `${path}[]`, errors);
      return;
    }
    if (typeof ours === "object" && typeof theirs === "object" && !Array.isArray(ours) && !Array.isArray(theirs)) {
      const a = Object.keys(ours).sort().join(",");
      const b = Object.keys(theirs).sort().join(",");
      if (a !== b) errors.push(`${path} : clés ${a} ≠ ${b}`);
      for (const k of Object.keys(theirs)) if (k in ours) compatible(ours[k]!, theirs[k]!, `${path}.${k}`, errors);
      return;
    }
    if (ours !== theirs) errors.push(`${path} : ${JSON.stringify(ours)} ≠ ${JSON.stringify(theirs)}`);
  };

  it.skipIf(!demoSource)("chaque clé et chaque type correspondent (exportation fictive non vide)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-ts-"));
    const file = join(dir, "demo.ts");
    writeFileSync(file, demoSource!);
    const demo = await import(file);
    const theirs = Object.fromEntries(Object.entries(demo).filter(([, v]) => typeof v !== "function"));
    const errors: string[] = [];
    compatible(shape(build()), shape(theirs), "visibility", errors);
    expect(errors).toEqual([]);
  });
});

describe("scripts/vis-export.sh sur une exportation fournie (sans Elmo)", () => {
  it("écrit visibility.json hors du dépôt", () => {
    const data = mkdtempSync(join(tmpdir(), "vis-data-"));
    const out = join(data, "out", "visibility.json");
    const r = spawnSync("bash", [join(ROOT, "scripts/vis-export.sh"), "demo-subject", out], {
      encoding: "utf8",
      env: { ...process.env, OIA_VIS_DATA: data, OIA_VIS_ELMO_EXPORT: exportFile, OIA_VIS_SUBJECTS_DIR: join(here, "fixtures") },
    });
    expect(r.status, r.stderr).toBe(0);
    const v = JSON.parse(readFileSync(out, "utf8"));
    expect(v.vueSite.presence).toBe(75);
  });
});

describe("commande pnpm vis:j0-view (scripts/j0-view.sh)", () => {
  it("est déclarée à la racine du dépôt", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "../../package.json"), "utf8"));
    expect(pkg.scripts["vis:j0-view"]).toMatch(/infra\/visibility\/scripts\/j0-view\.sh/);
  });

  it("les scripts de lancement et de vue sont syntaxiquement valides", () => {
    for (const s of ["j0-view.sh", "vis-export.sh", "j0-launch.sh", "j0-first-run.sh"]) {
      expect(spawnSync("bash", ["-n", join(ROOT, "scripts", s)]).status, s).toBe(0);
    }
  });

  it("refuse un worktree placé dans le dépôt, avant toute action", () => {
    const r = spawnSync("bash", [join(ROOT, "scripts/j0-view.sh"), "demo-subject"], {
      encoding: "utf8",
      env: { ...process.env, OIA_VIS_PROTOTYPE_WORKTREE: join(ROOT, "tmp-worktree"), OIA_VIS_NO_OPEN: "1" },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/hors du dépôt/);
  });

  it("n'écrit les données de client que dans des chemins ignorés par Git", () => {
    const ignored = (p: string) => spawnSync("git", ["check-ignore", "-q", p], { cwd: join(ROOT, "../..") }).status === 0;
    expect(ignored("prototypes/oia-prototype/public/data/visibility.json")).toBe(true);
    expect(ignored("visibility.json")).toBe(true);
  });
});

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { horsPerimetre, interdits, Missions, type NouvelleMission } from "../src/executive/missions.js";
import { BaseOps } from "../src/executive/operations.js";

let dir: string;
let ms = Date.UTC(2026, 10, 9);
const horloge = () => new Date((ms += 1000)).toISOString();
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-mis-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const N: NouvelleMission = {
  cle: "fictif:1", objectif: "Mission fictive", demandeur: "shyrka", shaBase: "abc", agent: "dev-assiste", automatisation: "simule",
  perimetre: { repo: "OolalaDXB/OIA", fichiers: ["infra/shyrka/src/dialogue.ts", "infra/shyrka/test/"], commandes: [["pnpm", "--filter", "@oia/shyrka", "test"]] },
};

const ouvrir = () => {
  const ops = new BaseOps(join(dir, "ops"), horloge);
  return { ops, m: new Missions(ops) };
};

describe("A3 · double soumission, crash et reprise", () => {
  it("même clé : une seule mission", () => {
    const { ops, m } = ouvrir();
    expect(m.proposer(N).creee).toBe(true);
    expect(m.proposer(N).creee).toBe(false);
    expect(m.lister()).toHaveLength(1);
    ops.fermer();
  });
  it("bail expiré : reprise traçable, puis blocage quand les tentatives sont épuisées", () => {
    const { ops, m } = ouvrir();
    const id = m.proposer(N).mission.id;
    m.passer(id, "autorisee", "mickael", "ok");
    m.passer(id, "en_file", "registre", "file");
    m.prendre(id, "worker-1", 500);
    expect(() => m.prendre(id, "worker-2", 500)).toThrow(/pas en file/);
    ms += 5000; // le worker-1 a « planté »
    expect(m.reprendreExpires().map((x) => x.statut)).toEqual(["en_file"]);
    expect(() => m.battement(id, "worker-1", 500)).toThrow(/bail perdu/);
    m.prendre(id, "worker-2", 500);
    ms += 5000;
    expect(m.reprendreExpires().map((x) => x.statut)).toEqual(["bloquee"]);
    expect(m.historique(id).map((h) => h.vers)).toEqual(["proposee", "autorisee", "en_file", "en_cours", "en_file", "en_cours", "bloquee"]);
    ops.fermer();
  });
  it("persistant : rouvrir la base retrouve la mission et son journal", () => {
    let { ops, m } = ouvrir();
    const id = m.proposer(N).mission.id;
    ops.fermer();
    ({ ops, m } = ouvrir());
    expect(m.obtenir(id.slice(0, 8)).statut).toBe("proposee");
    ops.fermer();
  });
});

describe("A4 · approbation d'un ancien diff", () => {
  it("refusée pour le nouveau diff ; terminer exige l'approbation du diff actuel ; aucune fusion", () => {
    const { ops, m } = ouvrir();
    const id = m.proposer(N).mission.id;
    m.passer(id, "autorisee", "mickael", "ok");
    m.passer(id, "en_file", "registre", "file");
    m.prendre(id, "w", 60_000);
    m.passer(id, "en_verification", "w", "patch v1", { resultats: { empreinteDiff: "diff-1" } });
    m.passer(id, "attente_validation", "verificateur", "vérifié");
    m.approuver(id, "accepter_patch", "diff-1", "mickael");
    // Correction demandée : un nouveau diff invalide l'approbation précédente.
    m.passer(id, "en_cours", "mickael", "corriger le message");
    m.passer(id, "en_verification", "w", "patch v2", { resultats: { empreinteDiff: "diff-2" } });
    m.passer(id, "attente_validation", "verificateur", "vérifié");
    expect(m.obtenir(id).validation).toBeNull();
    expect(() => m.approuver(id, "accepter_patch", "diff-1", "mickael")).toThrow(/≠ diff actuel/);
    expect(() => m.passer(id, "terminee", "mickael", "fin")).toThrow(/aucune approbation/);
    expect(() => m.approuver(id, "accepter_patch", "diff-2", "shyrka")).toThrow(/seul Mickaël/);
    m.approuver(id, "accepter_patch", "diff-2", "mickael");
    expect(m.passer(id, "terminee", "mickael", "accepté").statut).toBe("terminee");
    ops.fermer();
  });
  it("transitions interdites et décisions réservées", () => {
    const { ops, m } = ouvrir();
    const id = m.proposer(N).mission.id;
    expect(() => m.passer(id, "en_cours", "shyrka", "x")).toThrow(/transition refusée/);
    expect(() => m.passer(id, "autorisee", "shyrka", "x")).toThrow(/Mickaël/);
    expect(m.passer(id, "autorisee", "mandat:v10", "délégation écrite").statut).toBe("autorisee");
    expect(() => m.passer(id, "annulee", "mandat:v10", "x")).toThrow(/Mickaël seulement/);
    ops.fermer();
  });
});

describe("E2 · pause", () => {
  it("plus aucun départ tant que la pause est active", () => {
    const { ops, m } = ouvrir();
    const id = m.proposer(N).mission.id;
    m.passer(id, "autorisee", "mickael", "ok");
    m.passer(id, "en_file", "registre", "file");
    ops.ecrireControle("pause", "1");
    expect(() => m.prendre(id, "w", 1000)).toThrow(/suspendus/);
    ops.ecrireControle("pause", "0");
    expect(m.prendre(id, "w", 1000).statut).toBe("en_cours");
    ops.fermer();
  });
});

describe("A2 · écriture hors périmètre ou sensible", () => {
  it("détectée par le code", () => {
    expect(horsPerimetre(["infra/shyrka/src/dialogue.ts", "infra/shyrka/test/x.test.ts", "infra/shyrka/src/session.ts"], N.perimetre)).toEqual(["infra/shyrka/src/session.ts"]);
    expect(interdits(["~/.env", "packages/database/supabase/migrations/0009.sql", "docs/shyrka/CADRE.md", ".github/workflows/ci.yml", "infra/shyrka/src/dialogue.ts"])).toHaveLength(4);
  });
});

describe("A2 · bac à sable réel (macOS)", () => {
  it.runIf(process.platform === "darwin")("refuse ~/.oia, l'écriture hors worktree et le réseau ; expurge les secrets", async () => {
    const { spawnSync } = await import("node:child_process");
    const { homedir } = await import("node:os");
    const { profilBacASable, envExpurge } = await import("../src/executive/verification.js");
    const wt = join(dir, "wt");
    (await import("node:fs")).mkdirSync(wt);
    const sh = (cmd: string) => spawnSync("sandbox-exec", ["-p", profilBacASable(wt), "sh", "-c", cmd], { cwd: wt, env: { ...envExpurge(), FAUX_TOKEN: undefined }, encoding: "utf8" });
    expect(sh("echo ok > dedans.txt").status).toBe(0);
    expect(sh(`echo x > ${homedir()}/shyrka-hors-perimetre.txt`).status).not.toBe(0);
    expect(sh(`ls ${homedir()}/.oia`).status).not.toBe(0);
    expect(sh("node -e \"fetch('https://example.com').then(()=>process.exit(0),()=>process.exit(3))\"").status).toBe(3);
    process.env.SHYRKA_FAUX_TOKEN = "x";
    expect(Object.keys(envExpurge())).not.toContain("SHYRKA_FAUX_TOKEN");
    delete process.env.SHYRKA_FAUX_TOKEN;
  });
});

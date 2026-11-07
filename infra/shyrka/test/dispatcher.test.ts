import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { appliquer, creerCopie, diffCopie, empreinteDiff, supprimerCopie, type Copie } from "../src/executive/copie.js";
import { EXECUTEUR_CLAUDE_CODE, LIMITES, patchInchange, preparerDeveloppement, refusDepart, verifierDiagnostic, type Executeur } from "../src/executive/dispatcher.js";
import { Missions, type NouvelleMission } from "../src/executive/missions.js";
import { BaseOps } from "../src/executive/operations.js";
import { verifierCandidat } from "../src/executive/verification-candidat.js";
import { profilBacASable } from "../src/executive/verification.js";
import { RACINE_DEPOT } from "../src/local.js";

/** Mandat v11, bloc C : dispatcher borné, copie isolée sans branche ni worktree, T12 à T16. */

let dir: string;
let ms = Date.UTC(2026, 10, 9);
const horloge = () => new Date((ms += 1000)).toISOString();
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-disp-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Dans une copie isolée (git archive, sans dépôt), il n'y a pas de HEAD : la suite se saute, explicitement.
const HEAD = (() => {
  try {
    return execFileSync("git", ["-C", RACINE_DEPOT, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const DEV: NouvelleMission = {
  cle: "fictif:dev", objectif: "Mission fictive de développement", demandeur: "shyrka", shaBase: HEAD, agent: "assiste", automatisation: "assiste",
  perimetre: { repo: "OolalaDXB/OIA", fichiers: ["infra/shyrka/src/dialogue.ts", "infra/shyrka/test/"], commandes: [["pnpm", "--filter", "@oia/shyrka", "typecheck"]] },
};
const pret: Executeur = { id: "fictif", genre: "developpement", automatisation: "assiste", disponible: () => ({ ok: true, raison: "" }) };

function enFile(n: NouvelleMission = DEV) {
  const ops = new BaseOps(join(dir, "ops"), horloge);
  const m = new Missions(ops);
  const id = m.proposer(n).mission.id;
  m.passer(id, "autorisee", "mandat:v11", "autorisée par le mandat");
  m.passer(id, "en_file", "registre", "file");
  return { ops, m, id };
}

describe.skipIf(!HEAD)("refus de départ", () => {
  it("pause, arrêt d'urgence, exécuteur indisponible, budget non nul", () => {
    const { ops, m, id } = enFile();
    expect(refusDepart(ops, m.obtenir(id), pret)).toBeNull();
    ops.ecrireControle("pause", "1");
    expect(refusDepart(ops, m.obtenir(id), pret)).toMatch(/pause/);
    ops.ecrireControle("pause", "0");
    ops.ecrireControle("arret", "1");
    expect(refusDepart(ops, m.obtenir(id), pret)).toMatch(/arrêt d'urgence/);
    ops.ecrireControle("arret", "0");
    expect(refusDepart(ops, m.obtenir(id), { ...pret, disponible: () => ({ ok: false, raison: "absent" }) })).toMatch(/indisponible : absent/);
    ops.fermer();
  });
  it("périmètre vide ou hors dépôt", () => {
    const vide = enFile({ ...DEV, cle: "v", perimetre: { ...DEV.perimetre, fichiers: [] } });
    expect(refusDepart(vide.ops, vide.m.obtenir(vide.id), pret)).toMatch(/périmètre vide/);
    vide.ops.fermer();
    const hors = enFile({ ...DEV, cle: "h", perimetre: { ...DEV.perimetre, fichiers: ["../autre-depot/"] } });
    expect(refusDepart(hors.ops, hors.m.obtenir(hors.id), pret)).toMatch(/hors dépôt/);
    hors.ops.fermer();
  });
  it("quota du jour : arrêt sans repli payant", () => {
    const { ops, m, id } = enFile();
    for (let i = 0; i < LIMITES.missionsDevParJour; i++) ops.db.prepare("INSERT INTO mission_journal (mission, le, acteur, de, vers, note) VALUES (?, ?, 'dispatcher', NULL, NULL, 'dispatch:depart developpement exécuteur x')").run(`autre-${i}`, ops.maintenant());
    expect(refusDepart(ops, m.obtenir(id), pret)).toMatch(/quota atteint.*sans repli payant/);
    ops.fermer();
  });
  it("T12 : Claude Code sans facturation prouvée n'est jamais lancé, et une clé API est refusée", () => {
    const avant = { k: process.env.ANTHROPIC_API_KEY, a: process.env.SHYRKA_CLAUDE_CODE_AUTORISE };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SHYRKA_CLAUDE_CODE_AUTORISE;
    expect(EXECUTEUR_CLAUDE_CODE.disponible()).toMatchObject({ ok: false, raison: expect.stringMatching(/facturation non prouvée/) });
    process.env.ANTHROPIC_API_KEY = "factice";
    expect(EXECUTEUR_CLAUDE_CODE.disponible().raison).toMatch(/clé API/);
    process.env.SHYRKA_CLAUDE_CODE_AUTORISE = "1";
    expect(EXECUTEUR_CLAUDE_CODE.disponible().ok).toBe(false);
    if (avant.k === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = avant.k;
    if (avant.a === undefined) delete process.env.SHYRKA_CLAUDE_CODE_AUTORISE;
    else process.env.SHYRKA_CLAUDE_CODE_AUTORISE = avant.a;
  });
});

describe.skipIf(!HEAD)("vérificateur séparé du diagnostic", () => {
  const m = { preuvesEntree: ["eval recherche.sourcee : 0/3 refus hors corpus"] } as never;
  it("une preuve inventée fait refuser ; l'abstention est permise", () => {
    expect(verifierDiagnostic(m, JSON.stringify({ diagnostic: "x", cause_probable: "y", preuves_citees: ["log inventé"], confiance: "elevee", abstention: false })).verdict).toBe("refuse");
    expect(verifierDiagnostic(m, "pas du JSON").verdict).toBe("refuse");
    expect(verifierDiagnostic(m, JSON.stringify({ diagnostic: "preuves insuffisantes", cause_probable: null, preuves_citees: [], confiance: "faible", abstention: true })).verdict).toBe("conforme");
  });
});

describe.skipIf(!HEAD)("copie isolée (git archive, sans branche ni worktree)", () => {
  let c: Copie;
  afterAll(() => c && supprimerCopie(c));
  it("ne contient ni .git ni fichier non suivi ; le dépôt ne gagne ni branche ni worktree", () => {
    const branches = execFileSync("git", ["-C", RACINE_DEPOT, "branch", "--list"], { encoding: "utf8" });
    const worktrees = execFileSync("git", ["-C", RACINE_DEPOT, "worktree", "list"], { encoding: "utf8" });
    c = creerCopie("HEAD");
    expect(existsSync(join(c.racine, ".git"))).toBe(false);
    expect(existsSync(join(c.racine, "infra/shyrka/src/dialogue.ts"))).toBe(true);
    const nonSuivis = execFileSync("git", ["-C", RACINE_DEPOT, "ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
    for (const f of nonSuivis) expect(existsSync(join(c.racine, f)), f).toBe(false);
    expect(execFileSync("git", ["-C", RACINE_DEPOT, "branch", "--list"], { encoding: "utf8" })).toBe(branches);
    expect(execFileSync("git", ["-C", RACINE_DEPOT, "worktree", "list"], { encoding: "utf8" })).toBe(worktrees);
  });
  it("diff, empreinte stable, application sur une copie fraîche ; T15 : un patch modifié n'a plus la même empreinte", () => {
    const f = join(c.racine, "infra/shyrka/src/dialogue.ts");
    writeFileSync(f, `${readFileSync(f, "utf8")}\n// essai\n`);
    const d = diffCopie(c);
    expect(d.fichiers).toEqual(["infra/shyrka/src/dialogue.ts"]);
    expect(empreinteDiff(d.diff)).toBe(d.empreinte);
    const fraiche = creerCopie(c.sha);
    try {
      expect(appliquer(fraiche, d.diff).ok).toBe(true);
      expect(readFileSync(join(fraiche.racine, "infra/shyrka/src/dialogue.ts"), "utf8")).toMatch(/\/\/ essai\n$/);
    } finally {
      supprimerCopie(fraiche);
    }
    const patch = join(dir, "p.diff");
    writeFileSync(patch, d.diff);
    expect(patchInchange(patch, d.empreinte)).toBe(true);
    writeFileSync(patch, d.diff.replace("// essai", "// essai modifié après approbation"));
    expect(patchInchange(patch, d.empreinte)).toBe(false);
  });
  it("T16 : depuis la copie, écrire hors de la copie ou lire les secrets est refusé par le système", () => {
    const p = profilBacASable(c.dossier);
    expect(spawnSync("sandbox-exec", ["-p", p, "/usr/bin/touch", join(RACINE_DEPOT, `hors-copie-${Date.now()}`)]).status).not.toBe(0);
    expect(spawnSync("sandbox-exec", ["-p", p, "/bin/ls", join(process.env.HOME!, ".oia")]).status).not.toBe(0);
    expect(spawnSync("sandbox-exec", ["-p", p, "/usr/bin/touch", join(c.racine, "permis")]).status).toBe(0);
  });
  it("un patch hors périmètre ou sur un fichier interdit est refusé sans être exécuté", () => {
    const patch = "--- base/infra/shyrka/permissions.json\n+++ copie/infra/shyrka/permissions.json\n@@ -1 +1 @@\n-a\n+b\n";
    const r = verifierCandidat({ id: "x", shaBase: HEAD, perimetre: DEV.perimetre } as never, patch, { executer: false });
    expect(r.verdict).toBe("refuse");
    expect(r.horsPerimetre).toEqual(["infra/shyrka/permissions.json"]);
  });
});

describe.skipIf(!HEAD)("T14 : doublon et reprise via le dispatcher", () => {
  it("préparer deux fois la même mission : le second départ est refusé ; bail expiré : reprise traçable", () => {
    const { ops, m, id } = enFile();
    const { copie } = preparerDeveloppement(ops, id);
    try {
      expect(() => preparerDeveloppement(ops, id)).toThrow(/pas en file/);
      ms += 5 * 3_600_000;
      expect(m.reprendreExpires().map((x) => x.statut)).toEqual(["en_file"]);
      expect(m.historique(id).map((h) => h.note).join("\n")).toMatch(/dispatch:depart developpement[\s\S]*dispatch:copie[\s\S]*expiré/);
    } finally {
      supprimerCopie(copie);
      ops.fermer();
    }
  });
});

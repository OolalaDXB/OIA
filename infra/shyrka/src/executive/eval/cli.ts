import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAGES } from "../config.js";
import { Missions } from "../missions.js";
import { BaseOps } from "../operations.js";
import { comparerMethodes, texteComparaison } from "./modeles.js";
import { evaluerLangues, texteMatrice } from "./langues.js";
import { cli } from "./connaissances.js";
import { chargerCapacites, executerCapacite, resultats, statutCapacite, texteResultat, type EtatCapacite, type StatutCapacite } from "./registre.js";

/**
 * `pnpm shyrka:executive eval run [capacite] [--code <copie>] [--ensemble <e>] [--json]`
 * `pnpm shyrka:executive eval report [--json]`
 *
 * Codes de sortie : 0 exécuté (quels que soient les verdicts), 1 erreur, 2 usage.
 */

const EXECUTABLES = ["routage.decisions", "memoire.rappel", "recherche.sourcee"];

/** Capacités mesurées par le registre des missions, pas par un banc : effectif réel, jamais extrapolé. */
export function statutsParMissions(dossierOps = REGLAGES.dossierOps): Record<string, { statut: StatutCapacite; raison: string }> {
  const out: Record<string, { statut: StatutCapacite; raison: string }> = {};
  if (!existsSync(join(dossierOps, "operations.sqlite"))) return out;
  const o = new BaseOps(dossierOps);
  try {
    const l = new Missions(o).lister();
    const code = l.filter((m) => m.perimetre.fichiers.length > 0);
    const acceptes = code.filter((m) => m.statut === "terminee").length;
    out["generation.correctifs"] = code.length
      ? { statut: "LIMITE", raison: `${acceptes} patch(s) accepté(s) sur ${code.length} mission(s) de code — effectif < 10, automatisation ${[...new Set(code.map((m) => m.automatisation))].join("/")}` }
      : { statut: "NON_TESTE", raison: "aucune mission de code" };
    const auto = l.filter((m) => m.automatisation === "automatique");
    const autoFinies = auto.filter((m) => ["attente_validation", "terminee"].includes(m.statut)).length;
    out.orchestration = auto.length
      ? { statut: "LIMITE", raison: `${autoFinies} mission(s) menée(s) par le dispatcher sur ${auto.length} — effectif < 10` }
      : { statut: "NON_TESTE", raison: "aucune mission lancée par le dispatcher" };
    const diag = auto.filter((m) => m.agent === "diagnostic");
    out.diagnostic = diag.length ? { statut: "LIMITE", raison: `${diag.length} mission(s) de diagnostic local — effectif < 10` } : { statut: "NON_TESTE", raison: "aucune mission de diagnostic exécutée" };
  } finally {
    o.fermer();
  }
  const exp = join(dossierOps, "eval", "experiences-resume.json");
  if (existsSync(exp)) {
    const r = JSON.parse(readFileSync(exp, "utf8")) as { revuesRejetantUnFauxPositif?: number; revues?: number };
    if (r.revues) out.revue = { statut: "LIMITE", raison: `${r.revuesRejetantUnFauxPositif ?? 0} patch(s) verts aux tests habituels rejeté(s) sur ${r.revues} vérification(s) indépendante(s) — effectif < 10` };
  }
  const lang = join(dossierOps, "eval", "langues.json");
  if (existsSync(lang)) {
    const m = JSON.parse(readFileSync(lang, "utf8")) as { resume?: string };
    out.langues = { statut: "LIMITE", raison: `matrice par case : ${m.resume ?? "voir eval langues"}` };
  }
  return out;
}

export function rapportCapacites(): EtatCapacite[] {
  const tous = resultats();
  const externes = statutsParMissions();
  return chargerCapacites().map((c) => statutCapacite(c, tous, EXECUTABLES.includes(c.id) || c.id === "routage.continuite" ? undefined : externes[c.id]));
}

export async function commandeEval(args: string[]): Promise<number> {
  const [sous, ...reste] = args;
  const opt = (k: string) => {
    const i = reste.indexOf(k);
    return i >= 0 ? reste[i + 1] : undefined;
  };
  const json = reste.includes("--json");
  if (sous === "run") {
    const cible = reste.find((a, i) => !a.startsWith("--") && !reste[i - 1]?.startsWith("--"));
    const ids = cible ? [cible] : EXECUTABLES;
    const ensemble = opt("--ensemble");
    const code = opt("--code");
    const sortie = [];
    for (const id of ids) {
      try {
        const r = executerCapacite(id, { ...(code ? { code, candidat: opt("--candidat") ?? code } : {}), ...(ensemble ? { ensembles: [ensemble] } : {}) });
        sortie.push(...r);
        if (!json) for (const x of r) console.log(`${texteResultat(x)}${x.echecs?.length ? `\n${x.echecs.map((e) => `    ${e}`).join("\n")}` : ""}`);
      } catch (e) {
        console.error(`! ${(e as Error).message}`);
        return 1;
      }
    }
    if (json) console.log(JSON.stringify(sortie, null, 2));
    return 0;
  }
  if (sous === "modeles") {
    const ensemble = opt("--ensemble");
    const r = await comparerMethodes(ensemble ? [ensemble] : undefined);
    console.log(json ? JSON.stringify(r, null, 2) : r.map(texteComparaison).join("\n"));
    return 0;
  }
  if (sous === "langues") {
    // Rappel multilingue mesuré sur le vrai volume : un fait fictif retenu en français, demandé dans chaque langue.
    const env = { SHYRKA_MEMOIRE_SOUS_DOSSIER: `recette/langues-${Date.now()}` };
    const r = cli(["memoire", "retenir", "Recette fictive : le banc d'essai de Shyrka s'appelle Héron"], env);
    const id = r.code === 0 ? (JSON.parse(r.sortie) as { id: string }).id : null;
    const rappel = id ? (q: string) => cli(["memoire", "chercher", q], env).sortie.includes(id) : undefined;
    const m = await evaluerLangues({ ...(rappel ? { rappel } : {}), ...(opt("--langue") ? { langues: [opt("--langue")!] } : {}) });
    console.log(json ? JSON.stringify(m, null, 2) : texteMatrice(m));
    return 0;
  }
  if (sous === "report") {
    const r = rapportCapacites();
    if (json) {
      console.log(JSON.stringify(r.map((x) => ({ id: x.capacite.id, statut: x.statut, raison: x.raison, environnement: x.capacite.environnement, automatisation: x.capacite.automatisation, seuil: x.capacite.seuil, derniers: x.derniers.map((d) => ({ ensemble: d.ensemble, le: d.le, mesures: d.mesures, compteurs: d.compteurs, empreinteJeu: d.empreinteJeu, code: d.code.sha })) })), null, 2));
      return 0;
    }
    console.log("Registre des capacités (aucun score global ; seuils fixés avant test) :");
    for (const x of r) {
      console.log(`${x.statut.padEnd(10)} ${x.capacite.id} · ${x.raison}`);
      for (const d of x.derniers) console.log(`           ${texteResultat(d)} · ${d.le.slice(0, 16)}Z`);
    }
    return 0;
  }
  console.log("Usage : pnpm shyrka:executive eval run [routage.decisions|memoire.rappel|recherche.sourcee] [--ensemble developpement|regression|tenu] [--code <copie>] [--json]\n        pnpm shyrka:executive eval report [--json]\n        pnpm shyrka:executive eval modeles [--ensemble e]   règles du code vs modèle local, mêmes jeux");
  return 2;
}

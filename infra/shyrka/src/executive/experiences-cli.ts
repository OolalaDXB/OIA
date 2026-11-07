import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dossierVerifie } from "../memoire/volume.js";
import { REGLAGES, revision } from "./config.js";
import { empreinteDiff } from "./copie.js";
import { CarnetExperiences, RefusExperience, STATUTS_EXP, type Experience } from "./experiences.js";
import { agregatPourAuteur, verifierCandidat } from "./verification-candidat.js";

/**
 * pnpm shyrka:executive experiences …
 *   list | show <id> | rappeler <texte>
 *   comparer <patch> --nom <méthode> --question <q> [--hypothese <h>] [--lien <dépendance>…]
 *        vérifie un patch candidat (copie isolée, tests, banc tenu à l'écart) et consigne l'expérience,
 *        CANDIDAT si conforme, REJETE sinon ; jamais VALIDE
 *   statut <id> <STATUT> <motif>      (VALIDE : Mickaël seulement, via --par mickael)
 *   invalider <dépendance> <motif>    invalide les dérivés d'une source retirée
 *   correction <lien> <texte>         correction de Mickaël, A_CONFIRMER, sans préférence déduite
 */

export function ouvrirCarnet(): CarnetExperiences {
  return new CarnetExperiences(dossierVerifie("apprentissage"));
}

function resume(e: Experience): string {
  return `${e.id.slice(0, 8)}  ${e.statut.padEnd(11)} ${e.nature.padEnd(7)} ${e.capacite.padEnd(18)} ${e.question}${e.invalidePar ? `  (INVALIDÉE : ${e.invalidePar})` : ""}`;
}

/** Résumé non sensible pour le registre des capacités (revue). */
function ecrireResume(c: CarnetExperiences): void {
  const l = c.lister().filter((e) => e.nature === "code");
  const revues = l.filter((e) => e.verification !== "non_faite").length;
  const rejets = l.filter((e) => e.statut === "REJETE" && e.metriquesFinales.testsHabituels === "ok").length;
  mkdirSync(join(REGLAGES.dossierOps, "eval"), { recursive: true, mode: 0o700 });
  writeFileSync(join(REGLAGES.dossierOps, "eval", "experiences-resume.json"), JSON.stringify({ revues, revuesRejetantUnFauxPositif: rejets }), { mode: 0o600 });
}

export function commandeExperiences(args: string[]): number {
  const [sous, ...reste] = args;
  const opt = (k: string) => {
    const i = reste.indexOf(k);
    return i >= 0 ? reste[i + 1] : undefined;
  };
  const c = ouvrirCarnet();
  try {
    if (!sous || sous === "list") {
      const l = c.lister();
      if (!l.length) console.log("Aucune expérience.");
      for (const e of l) console.log(resume(e));
      return 0;
    }
    if (sous === "show") {
      const e = c.obtenir(reste[0] ?? "");
      console.log(JSON.stringify({ ...e, journal: c.historique(e.id) }, null, 2));
      return 0;
    }
    if (sous === "rappeler") {
      const r = c.rappeler(reste.join(" "));
      if (!r.length) console.log("Aucun enseignement pertinent consigné.");
      for (const x of r) console.log(`[${x.experience.id.slice(0, 8)}] ${x.experience.statut} · ${x.experience.verdict}\n    domaine : ${x.experience.domaine ?? "—"} · contre-exemples : ${x.experience.contreExemples.join(" ; ") || "—"}\n    provenance : ${x.provenance}\n    (statut inchangé par ce rappel ; promotion : décision de Mickaël)`);
      return 0;
    }
    if (sous === "comparer") {
      const fichier = reste[0]!;
      const patch = readFileSync(fichier, "utf8");
      const rev = revision();
      const perimetre = { repo: "OolalaDXB/OIA", fichiers: (opt("--fichiers") ?? "infra/shyrka/src/dialogue.ts,infra/shyrka/test/").split(","), commandes: [["pnpm", "--filter", "@oia/shyrka", "test"], ["pnpm", "--filter", "@oia/shyrka", "typecheck"]] };
      const r = verifierCandidat({ id: "experience", shaBase: opt("--sha") ?? rev.sha, perimetre } as never, patch);
      const dossier = join(REGLAGES.dossierOps, "experiences");
      mkdirSync(dossier, { recursive: true, mode: 0o700 });
      const rapport = join(dossier, `verification-${r.empreinte.slice(0, 12)}.json`);
      writeFileSync(rapport, JSON.stringify({ ...r, banc: { reference: r.banc.reference.map(({ echecs: _e, ...x }) => x), candidat: r.banc.candidat.map(({ echecs: _e, ...x }) => x) } }, null, 2), { mode: 0o600 });
      const mesure = (ens: string, quoi: "reference" | "candidat") => {
        const x = r.banc[quoi].find((b) => b.capacite === "routage.decisions" && b.ensemble === ens);
        return x ? `${x.mesures.exactitude?.k}/${x.compteurs.n} · FP ${x.compteurs.fauxPositifsListe}` : "non mesuré";
      };
      const testsOk = r.garde.find((g) => g.regle.startsWith("tests"))?.ok ? "ok" : "echec";
      const e = c.proposer({
        capacite: "routage.decisions", nature: "code", question: opt("--question") ?? "patch candidat", hypothese: opt("--hypothese") ?? "", source: `patch ${r.empreinte.slice(0, 12)} (${fichier.split("/").pop()})`,
        preuves: [rapport], cause: null, versions: { main: rev.sha, base: r.shaBase, jeuTenu: r.banc.candidat.find((b) => b.ensemble === "tenu")?.empreinteJeu ?? "absent" },
        methodes: [{ nom: opt("--nom") ?? "candidat", description: opt("--hypothese") ?? "", resultat: r.verdict }], budget: "0 USD (local)",
        metriquesInitiales: { developpement: mesure("developpement", "reference"), regression: mesure("regression", "reference"), tenu: mesure("tenu", "reference") },
        metriquesFinales: { developpement: mesure("developpement", "candidat"), regression: mesure("regression", "candidat"), tenu: mesure("tenu", "candidat"), testsHabituels: testsOk },
        jeux: { developpement: "infra/shyrka/executive/eval/routage.developpement.json", regression: "infra/shyrka/executive/eval/routage.regression.json", tenu: "~/.oia/shyrka-executive/eval/tenu/routage.json (non divulgué)" },
        objections: r.garde.filter((g) => !g.ok).map((g) => `CRITIQUE ${g.regle} : ${g.detail}`),
        verdict: r.verdict === "conforme" ? "amélioration mesurée, à relire (revue indépendante et décision de Mickaël)" : `rejeté : ${r.garde.filter((g) => !g.ok).map((g) => g.regle).join(", ")}`,
        verification: r.verdict === "conforme" ? "conforme" : "non_conforme", domaine: "routage des décisions", contreExemples: [], dependances: reste.flatMap((a, i) => (reste[i - 1] === "--lien" ? [a] : [])),
        politiqueOubli: "les rapports de vérification sont hors Git ; oubli = suppression du rapport et REJETE", retourArriere: "aucun : le patch n'est pas appliqué à main", affirmeParIA: true,
        statut: r.verdict === "conforme" ? "CANDIDAT" : "REJETE",
      }, "shyrka");
      ecrireResume(c);
      console.log([resume(e), ...agregatPourAuteur(r), `empreinte ${empreinteDiff(patch)}`, `rapport ${rapport}`].join("\n"));
      return 0;
    }
    if (sous === "statut") {
      const [ref, vers, ...motif] = reste.filter((a, i) => a !== "--par" && reste[i - 1] !== "--par");
      if (!STATUTS_EXP.includes(vers as never)) throw new RefusExperience(`statut : ${STATUTS_EXP.join(", ")}`);
      const e = c.changerStatut(ref ?? "", vers as never, opt("--par") ?? "shyrka", motif.join(" "));
      ecrireResume(c);
      console.log(resume(e));
      return 0;
    }
    if (sous === "invalider") {
      const ids = c.invaliderSource(reste[0] ?? "", "mickael", reste.slice(1).join(" "));
      console.log(`${ids.length} dérivé(s) invalidé(s)${ids.length ? ` : ${ids.map((x) => x.slice(0, 8)).join(", ")}` : ""}`);
      return 0;
    }
    if (sous === "correction") {
      const e = c.consignerCorrection(reste.slice(1).join(" "), reste[0] ?? "");
      console.log(resume(e));
      return 0;
    }
    console.log("Usage : pnpm shyrka:executive experiences list | show <id> | rappeler <texte> | comparer <patch> --nom <n> --question <q> | statut <id> <STATUT> <motif> [--par mickael] | invalider <dép> <motif> | correction <lien> <texte>");
    return 2;
  } catch (e) {
    if (e instanceof RefusExperience) {
      console.log(`Refusé : ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    c.fermer();
  }
}

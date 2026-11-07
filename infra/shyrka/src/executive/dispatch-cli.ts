import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAGES } from "./config.js";
import { type Copie } from "./copie.js";
import { collecterPatch, dispatcherDiagnostic, EXECUTEURS, LIMITES, patchInchange, preparerDeveloppement } from "./dispatcher.js";
import { Missions, RefusMission } from "./missions.js";
import { BaseOps } from "./operations.js";
import { agregatPourAuteur, verifierCandidat } from "./verification-candidat.js";

/**
 * pnpm shyrka:executive dispatch …
 *   executeurs                          exécuteurs déclarés et leur disponibilité vérifiée
 *   diagnostic <mission>                lance une mission de diagnostic en file (exécuteur local)
 *   preparer <mission>                  réserve une mission de développement et prépare sa copie isolée
 *   soumettre <mission> <dossier-copie> collecte le patch, le vérifie séparément (tests + banc tenu à l'écart)
 *   revue <mission> CONFORME|A_CORRIGER <fichier>   consigne la revue indépendante
 *   approuver <mission> <empreinte>     (Mickaël) approbation liée au patch exact ; refusée si le fichier a changé
 * Aucune commande n'applique un patch à main, ne pousse, ne fusionne ni ne déploie.
 */

const dossierMission = (id: string) => {
  const d = join(REGLAGES.dossierOps, "missions", id);
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};

export async function commandeDispatch(args: string[]): Promise<number> {
  const [sous, ref, ...reste] = args;
  const o = new BaseOps(REGLAGES.dossierOps);
  const ms = new Missions(o);
  try {
    if (sous === "executeurs") {
      for (const e of Object.values(EXECUTEURS)) {
        const d = e.disponible();
        console.log(`${d.ok ? "disponible  " : "INDISPONIBLE"} ${e.id.padEnd(18)} ${e.genre.padEnd(13)} ${e.automatisation.padEnd(11)} ${d.raison}`);
      }
      console.log(`Limites : ${LIMITES.missionsDevParJour} mission(s) de développement par jour, ${LIMITES.ecrituresSimultanees} écriture simultanée, ${LIMITES.tentativesParMission} tentatives, bail ${LIMITES.bailMs / 60_000} min.`);
      return 0;
    }
    if (sous === "diagnostic") {
      const r = await dispatcherDiagnostic(o, ref ?? "", "dispatcher");
      console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    if (sous === "preparer") {
      const { mission, copie } = preparerDeveloppement(o, ref ?? "");
      writeFileSync(join(dossierMission(mission.id), `copie-tentative-${mission.tentatives}.json`), JSON.stringify(copie), { mode: 0o600 });
      console.log(JSON.stringify({ mission: mission.id, tentative: `${mission.tentatives}/${mission.tentativesMax}`, copie: copie.racine, sha: copie.sha, perimetre: mission.perimetre.fichiers }, null, 2));
      return 0;
    }
    if (sous === "soumettre") {
      const m = ms.obtenir(ref ?? "");
      const dossier = reste[0];
      if (!dossier) throw new RefusMission("dossier de copie requis");
      const copie = JSON.parse(readFileSync(join(dossierMission(m.id), `copie-tentative-${m.tentatives}.json`), "utf8")) as Copie;
      if (copie.dossier !== dossier && copie.racine !== dossier) throw new RefusMission("ce dossier n'est pas la copie préparée pour cette tentative");
      const fichierPatch = join(dossierMission(m.id), `patch-tentative-${m.tentatives}.diff`);
      const p = collecterPatch(copie, fichierPatch);
      // Le vérificateur relit le patch sur disque : il ne reçoit pas le récit de l'auteur.
      const rapport = verifierCandidat(m, readFileSync(fichierPatch, "utf8"));
      const fichierRapport = join(dossierMission(m.id), `verification-tentative-${m.tentatives}.json`);
      writeFileSync(fichierRapport, JSON.stringify({ ...rapport, banc: { reference: rapport.banc.reference.map(({ echecs: _e, ...x }) => x), candidat: rapport.banc.candidat.map(({ echecs: _e, ...x }) => x) } }, null, 2), { mode: 0o600 });
      const resultats = { patch: fichierPatch, empreinteDiff: p.empreinte, fichiers: p.fichiers, verification: fichierRapport, verdict: rapport.verdict, garde: agregatPourAuteur(rapport) };
      ms.passer(m.id, "en_verification", "dispatcher", `patch collecté : ${p.fichiers.length} fichier(s), empreinte ${p.empreinte.slice(0, 12)}`, { resultats });
      const x = rapport.verdict === "conforme"
        ? ms.passer(m.id, "attente_validation", "verificateur:candidat", "vérification conforme ; revue indépendante et décision de Mickaël requises")
        : ms.passer(m.id, "bloquee", "verificateur:candidat", `vérification ${rapport.verdict}`, { cause: `vérification ${rapport.verdict} (tentative ${m.tentatives}/${m.tentativesMax})` });
      console.log([`mission ${x.id.slice(0, 8)} → ${x.statut} · verdict ${rapport.verdict} · empreinte ${p.empreinte}`, ...agregatPourAuteur(rapport)].join("\n"));
      return rapport.verdict === "conforme" ? 0 : 1;
    }
    if (sous === "revue") {
      const m = ms.obtenir(ref ?? "");
      const [verdict, fichier] = reste;
      if (verdict !== "CONFORME" && verdict !== "A_CORRIGER") throw new RefusMission("verdict de revue : CONFORME ou A_CORRIGER");
      const texte = fichier ? readFileSync(fichier, "utf8") : "";
      const dest = join(dossierMission(m.id), `revue-tentative-${m.tentatives}.md`);
      writeFileSync(dest, texte, { mode: 0o600 });
      o.db.prepare("INSERT INTO mission_journal (mission, le, acteur, de, vers, note) VALUES (?, ?, ?, NULL, NULL, ?)").run(m.id, o.maintenant(), "revue:independante", `dispatch:revue ${verdict} pour ${String((m.resultats as { empreinteDiff?: string }).empreinteDiff).slice(0, 12)} (${dest})`);
      if (verdict === "A_CORRIGER" && m.statut === "attente_validation") ms.passer(m.id, "bloquee", "revue:independante", "revue A_CORRIGER : patch rejeté", { cause: "revue indépendante A_CORRIGER" });
      console.log(`revue ${verdict} consignée (${dest})`);
      return 0;
    }
    if (sous === "approuver") {
      const m = ms.obtenir(ref ?? "");
      const r = m.resultats as { patch?: string; empreinteDiff?: string };
      // T15 : le patch sur disque doit être exactement celui que Mickaël a vu.
      if (!r.patch || !patchInchange(r.patch, reste[0] ?? "")) throw new RefusMission("le patch sur disque ne correspond pas à cette empreinte : approbation refusée");
      const x = ms.approuver(m.id, "accepter_patch", reste[0] ?? "", "mickael");
      console.log(`Approuvé pour le patch ${x.validation?.empreinte.slice(0, 12)}. Rien n'est appliqué : applique-le toi-même sur main (git apply -p1 ${r.patch}), puis commit.`);
      return 0;
    }
    console.log("Usage : pnpm shyrka:executive dispatch executeurs | diagnostic <mission> | preparer <mission> | soumettre <mission> <dossier-copie> | revue <mission> CONFORME|A_CORRIGER <fichier> | approuver <mission> <empreinte>");
    return 2;
  } catch (e) {
    if (e instanceof RefusMission) {
      console.log(`Refusé : ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    o.fermer();
  }
}

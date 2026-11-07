import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAGES } from "./config.js";
import { rapportCapacites } from "./eval/cli.js";
import type { CarnetExperiences } from "./experiences.js";
import { Missions } from "./missions.js";
import { BaseOps } from "./operations.js";

/**
 * Rapport de progression (mandat v11, bloc E). Chaque ligne porte sa
 * nature : FAIT_OBSERVE, HYPOTHESE, RECOMMANDATION ou COMPETENCE_TESTEE.
 * Un indicateur sans donnée est écrit « non mesuré », jamais estimé. Un
 * instantané par jour est gardé hors du dépôt pour la comparaison
 * longitudinale, quand plusieurs semaines existeront.
 */

export type Nature = "FAIT_OBSERVE" | "HYPOTHESE" | "RECOMMANDATION" | "COMPETENCE_TESTEE";

export interface Instantane {
  le: string;
  capacites: Record<string, string>;
  experiences: Record<string, number>;
  missions: { total: number; terminees: number; correctifsAcceptes: number; parDispatcher: number; bloquees: number; enAttente: number };
  incidentsOuverts: number;
  valeur: Record<string, number | "non mesuré">;
}

export function construireProgres(carnet: CarnetExperiences | null, dossierOps = REGLAGES.dossierOps): { lignes: [Nature, string][]; instantane: Instantane } {
  const L: [Nature, string][] = [];
  const caps = rapportCapacites();
  const o = new BaseOps(dossierOps);
  const ms = new Missions(o).lister();
  const incidents = o.incidents().filter((i) => !["resolu", "ignore_avec_motif"].includes(i.statut));
  o.fermer();
  const exps = carnet?.lister() ?? [];
  const parStatut = exps.reduce<Record<string, number>>((a, e) => ((a[e.statut] = (a[e.statut] ?? 0) + 1), a), {});

  for (const c of caps.filter((x) => x.statut === "VALIDE")) L.push(["COMPETENCE_TESTEE", `${c.capacite.id} VALIDE : ${c.raison}`]);
  for (const c of caps.filter((x) => x.statut !== "VALIDE")) L.push([c.statut === "NON_TESTE" ? "FAIT_OBSERVE" : "COMPETENCE_TESTEE", `${c.capacite.id} ${c.statut} : ${c.raison}`]);

  const valides = exps.filter((e) => e.statut === "VALIDE" && !e.invalidePar);
  L.push(["FAIT_OBSERVE", `appris avec preuve et validé par Mickaël : ${valides.length ? valides.map((e) => e.question).join(" ; ") : "rien encore"}`]);
  for (const e of exps.filter((x) => ["CANDIDAT", "A_CONFIRMER"].includes(x.statut) && !x.invalidePar)) L.push(["HYPOTHESE", `[${e.id.slice(0, 8)}] ${e.statut} ${e.nature} · ${e.verdict}`]);
  for (const e of exps.filter((x) => x.statut === "REJETE")) L.push(["FAIT_OBSERVE", `[${e.id.slice(0, 8)}] rejeté · ${e.question} → ${e.verdict}`]);
  for (const e of exps.filter((x) => x.nature === "outil" && !x.invalidePar)) L.push(["RECOMMANDATION", `choix de méthode/modèle [${e.id.slice(0, 8)}] ${e.statut} : ${e.verdict} (coût ${e.budget})`]);

  const terminees = ms.filter((m) => m.statut === "terminee");
  const correctifs = terminees.filter((m) => m.perimetre.fichiers.length > 0 && m.validation);
  const auto = ms.filter((m) => m.automatisation === "automatique" && ["attente_validation", "terminee"].includes(m.statut));
  for (const m of ms.filter((x) => ["attente_validation", "bloquee", "proposee"].includes(x.statut))) L.push(["RECOMMANDATION", `décision à prendre : mission ${m.id.slice(0, 8)} ${m.statut} · ${m.objectif.slice(0, 90)}${m.causeBlocage ? ` (${m.causeBlocage})` : ""}`]);
  L.push(["FAIT_OBSERVE", `${incidents.length} incident(s) ouvert(s) ; ${ms.length} mission(s) au registre`]);

  const valeur: Instantane["valeur"] = {
    missionsTerminees: terminees.length,
    correctifsAcceptes: correctifs.length,
    missionsMeneesParLeDispatcher: auto.length,
    tauxAlertesPertinentes: "non mesuré",
    repetitionsEvitees: "non mesuré",
    tachesNonReprisesManuellement: "non mesuré",
    tempsGagneMinutes: "non mesuré",
  };
  L.push(["FAIT_OBSERVE", `valeur pour Mickaël : ${terminees.length} mission(s) terminée(s), ${correctifs.length} correctif(s) accepté(s), ${auto.length} mission(s) menée(s) par le dispatcher jusqu'à ta validation`]);
  L.push(["FAIT_OBSERVE", "taux d'alertes pertinentes, répétitions évitées, tâches non reprises, temps gagné : non mesurés (aucun retour de Mickaël consigné sur les alertes ; aucune mesure de temps)"]);
  L.push(["FAIT_OBSERVE", "coûts : 0 USD de dépense nouvelle constatée pour Shyrka (tout local) ; coût des sessions Claude Code : inconnu (quota d'abonnement, non lisible)"]);

  const instantane: Instantane = {
    le: new Date().toISOString(),
    capacites: Object.fromEntries(caps.map((c) => [c.capacite.id, c.statut])),
    experiences: parStatut,
    missions: { total: ms.length, terminees: terminees.length, correctifsAcceptes: correctifs.length, parDispatcher: auto.length, bloquees: ms.filter((m) => m.statut === "bloquee").length, enAttente: ms.filter((m) => m.statut === "attente_validation").length },
    incidentsOuverts: incidents.length,
    valeur,
  };
  return { lignes: L, instantane };
}

/** Garde l'instantané du jour et rend l'écart avec le précédent (s'il existe). */
export function comparerAuPrecedent(i: Instantane, dossier = join(REGLAGES.dossierOps, "progres")): string[] {
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const jour = i.le.slice(0, 10);
  const precedents = readdirSync(dossier).filter((f) => f.endsWith(".json") && f.slice(0, 10) < jour).sort();
  writeFileSync(join(dossier, `${jour}.json`), JSON.stringify(i, null, 2), { mode: 0o600 });
  const p = precedents.at(-1);
  if (!p || !existsSync(join(dossier, p))) return ["première mesure : état initial des indicateurs, aucune comparaison possible"];
  const a = JSON.parse(readFileSync(join(dossier, p), "utf8")) as Instantane;
  const out: string[] = [];
  for (const [k, v] of Object.entries(i.capacites)) if (a.capacites[k] !== v) out.push(`${k} : ${a.capacites[k] ?? "—"} → ${v}`);
  for (const k of Object.keys(i.missions) as (keyof Instantane["missions"])[]) if (a.missions[k] !== i.missions[k]) out.push(`missions.${k} : ${a.missions[k]} → ${i.missions[k]}`);
  return out.length ? [`depuis ${p.slice(0, 10)} :`, ...out] : [`aucun changement depuis ${p.slice(0, 10)}`];
}

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { decisionsOuvertes, etatOia } from "../contexte.js";
import { RACINE_DEPOT } from "../local.js";
import { VuesExecutiveV1, type VuesExecutive } from "@oia/shyrka-noyau";
import type { EtatSource } from "./corpus.js";
import { REGLAGES, type Produit } from "./config.js";
import type { Missions } from "./missions.js";
import type { BaseOps, Incident } from "./operations.js";

/**
 * Briefing exécutif (mandat v10, E1). Calculé sans LLM, à partir des
 * observations, incidents, missions, de la roadmap et des sources. Distingue
 * fait observé, préférence de Mickaël et recommandation de Shyrka. Ne
 * fabrique pas de priorité pour remplir trois cartes.
 */

export interface Sujet {
  titre: string;
  nature: "fait_observe" | "recommandation";
  impact: string;
  preuve: string;
  recommandation: string;
  action: string;
  cible: string | null;
}

export interface Opportunites {
  source: string;
  dateDonnee: string | null;
  total: number;
  verifiees: number;
  aRevoir: number;
  avecEcheanceFuture: { id: string; titre: string; echeance: string; aConfirmer: boolean }[];
  regles: string[];
}

export interface Brief {
  le: string;
  depuis: string | null;
  changements: string[];
  sujets: Sujet[];
  opportunites: Opportunites | null;
  missions: { id: string; objectif: string; statut: string; automatisation: string; attend: string | null }[];
  couverture: { produit: string; actifs: number; total: number; manquants: string[] }[];
  sourcesAnciennes: string[];
  decisionsOuvertes: number;
  budget: string[];
  dependances: string[];
}

/** Opportunités Money Lookup classées par règles lisibles, depuis le dernier instantané local. */
export function opportunites(donnees = process.env.OIA_ML_DATA ?? join(homedir(), "oia-money-lookup"), aujourdhui = new Date()): Opportunites | null {
  if (!existsSync(donnees)) return null;
  const f = readdirSync(donnees).filter((n) => /^console-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().pop();
  if (!f) return null;
  const x = JSON.parse(readFileSync(join(donnees, f), "utf8")) as {
    records: { id: string; title: string; verificationStatus: string; recommendation: string; deadlines?: { normalized: string; deadlineType: string; isConfirmPending: boolean }[] }[];
  };
  const jour = aujourdhui.toISOString().slice(0, 10);
  const avec = x.records
    .filter((r) => r.recommendation !== "REJECT")
    .flatMap((r) => {
      const d = (r.deadlines ?? []).filter((e) => e.deadlineType === "APPLICATION" && e.normalized >= jour).sort((a, b) => a.normalized.localeCompare(b.normalized))[0];
      return d ? [{ id: r.id, titre: r.title, echeance: d.normalized, aConfirmer: d.isConfirmPending }] : [];
    })
    .sort((a, b) => a.echeance.localeCompare(b.echeance));
  return {
    source: `~/oia-money-lookup/${f}`,
    dateDonnee: f.slice(8, 18),
    total: x.records.length,
    verifiees: x.records.filter((r) => /^VERIFIED/.test(r.verificationStatus)).length,
    aRevoir: x.records.filter((r) => r.verificationStatus === "MANUAL_REVIEW_REQUIRED").length,
    avecEcheanceFuture: avec.slice(0, 5),
    regles: [
      "une opportunité n'est « certaine » que si sa source est vérifiée ; sinon c'est une piste",
      "seules les échéances de type candidature, futures, sont retenues ; une échéance « à confirmer » est signalée comme telle",
      "les recommandations REJECT sont écartées",
      "aucun lien à un projet n'est déduit : il doit être explicite dans la donnée (absent de cet instantané)",
    ],
  };
}

const PRIORITE: Record<Incident["gravite"], number> = { critique: 0, majeure: 1, mineure: 2, info: 3 };

export function construireBrief(deps: { ops: BaseOps; missions: Missions; produits: Produit[]; corpus?: EtatSource[] | null; maintenant?: Date }): Brief {
  const { ops, missions, produits } = deps;
  const maintenant = deps.maintenant ?? new Date();
  const depuis = ops.lireControle("dernier_brief");
  const notifs = ops.notifications(depuis ?? undefined);
  const changements = notifs.map((n) => `${n.niveau === "urgent" ? "URGENT · " : ""}${n.titre} (${n.le.slice(0, 16)}Z, réf. ${n.cible.slice(0, 8)})`);

  const sujets: Sujet[] = [];
  for (const i of ops.incidents(["confirme", "en_traitement"]).sort((a, b) => PRIORITE[a.gravite] - PRIORITE[b.gravite])) {
    sujets.push({
      titre: `${i.produit} · ${i.source}`, nature: "fait_observe", impact: `${i.impact} (${i.gravite}), ${i.occurrences} observation(s) depuis ${i.premiere.slice(0, 16)}Z`,
      preuve: `${i.observation} — ${i.preuve}`, recommandation: i.prochaineAction, action: `pnpm shyrka:executive incident show ${i.id.slice(0, 8)}`, cible: i.id,
    });
  }
  for (const m of missions.lister().filter((x) => x.statut === "attente_validation")) {
    const r = m.resultats as { empreinteDiff?: string; pr?: string };
    sujets.push({
      titre: `Mission prête à relire : ${m.objectif}`, nature: "recommandation", impact: "correctif préparé, non fusionné, non déployé", preuve: r.pr ?? `diff ${r.empreinteDiff?.slice(0, 12) ?? "?"}`,
      recommandation: "relire le diff et les preuves ; accepter ou demander une correction", action: `pnpm shyrka:executive missions show ${m.id.slice(0, 8)}`, cible: m.id,
    });
  }

  const obs = ops.dernieresObservations();
  const couverture = produits.map((p) => {
    const o = obs.filter((x) => x.produit === p.slug);
    return { produit: p.nom, actifs: o.filter((x) => x.etat === "actif").length, total: o.length, manquants: o.filter((x) => x.etat !== "actif").map((x) => `${x.controle} (${x.etat})`) };
  });
  const ageH = (d: string) => (maintenant.getTime() - Date.parse(d)) / 3_600_000;
  const sourcesAnciennes = [
    ...obs.filter((x) => x.etat === "actif" && ageH(x.collecteLe) > REGLAGES.fraicheurHeures).map((x) => `${x.produit} ${x.controle} : collecté il y a ${Math.round(ageH(x.collecteLe))} h`),
    ...obs.filter((x) => x.dateDonnee && /visibility.sync|money-lookup/.test(x.controle) && ageH(x.dateDonnee) > REGLAGES.fraicheurHeures).map((x) => `${x.produit} ${x.controle} : donnée du ${x.dateDonnee!.slice(0, 16)} (${Math.round(ageH(x.dateDonnee!))} h)`),
    ...(deps.corpus ?? []).filter((s) => s.etat !== "indexe").map((s) => `corpus ${s.chemin} : ${s.etat}`),
    ...(deps.corpus ?? []).filter((s) => s.statut === "a_valider").map((s) => `corpus ${s.chemin} : à valider`),
  ];
  if (!obs.length) sourcesAnciennes.unshift("aucune collecte enregistrée : lancer `pnpm shyrka:executive run-once`");

  const e = etatOia();
  return {
    le: maintenant.toISOString(),
    depuis,
    changements,
    sujets: sujets.slice(0, 3),
    opportunites: opportunites(undefined, maintenant),
    missions: missions.lister().filter((m) => !["terminee", "annulee"].includes(m.statut)).map((m) => ({
      id: m.id, objectif: m.objectif, statut: m.statut, automatisation: m.automatisation,
      attend: m.statut === "attente_validation" ? "ta décision" : m.statut === "proposee" ? "ton autorisation" : m.statut === "bloquee" ? m.causeBlocage : null,
    })),
    couverture,
    sourcesAnciennes,
    decisionsOuvertes: e.decisions.length,
    budget: [
      "IA conversation/recherche (Mistral, v9) : plafond 5 $/mois, alerte 4 $ ; consommation tenue côté serveur (oia_ia_reserver), non lisible localement sans session : ACCES_MANQUANT",
      `Visibility J0 (cost-guard) : plafond ${e.budget.plafond} $, alerte ${e.budget.alerte} $ ; ${depenseJ0() ?? "journal illisible"}`,
      "Shyrka exécutive : 0 appel payant (collecte et briefing déterministes, modèle local)",
    ],
    dependances: ["Mac allumé et réseau", "volume Shyrka-corpus déverrouillé pour la mémoire et le corpus", "jeton gh valide pour GitHub", "aucune surveillance pendant que le Mac dort : pas de couverture 24/7"],
  };
}

function depenseJ0(): string | null {
  const f = join(process.env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"), "cost-journal.csv");
  if (!existsSync(f)) return null;
  const l = readFileSync(f, "utf8").trim().split("\n").pop()!.split(",");
  return `retenu ${Number(l[6]).toFixed(2)} $ au ${l[0]} (estimation du journal, la dépense réelle se lit chez chaque fournisseur)`;
}

export function texteBrief(b: Brief): string {
  const L: string[] = [];
  L.push(`Briefing de Shyrka · ${new Date(b.le).toLocaleString("fr-FR", { timeZone: REGLAGES.fuseau, dateStyle: "full", timeStyle: "short" })} (${REGLAGES.fuseau})`);
  L.push("", `1. Depuis le dernier briefing${b.depuis ? ` (${b.depuis.slice(0, 16)}Z)` : " (premier briefing)"}`);
  L.push(...(b.changements.length ? b.changements.map((c) => `   - ${c}`) : ["   - rien de nouveau"]));
  L.push("", "2. Sujets prioritaires");
  if (!b.sujets.length) L.push("   - aucun sujet ne demande ton attention (je n'en invente pas)");
  b.sujets.forEach((s, i) =>
    L.push(`   ${i + 1}) ${s.titre} [${s.nature === "fait_observe" ? "fait observé" : "recommandation de Shyrka"}]`, `      impact : ${s.impact}`, `      preuve : ${s.preuve}`, `      je recommande : ${s.recommandation}`, `      action : ${s.action}`),
  );
  L.push("", "3. Opportunités");
  const o = b.opportunites;
  if (!o) L.push("   - instantané Money Lookup absent du Mac");
  else {
    L.push(`   - ${o.total} dans l'instantané du ${o.dateDonnee} (${o.source}) : ${o.verifiees} vérifiée(s), ${o.aRevoir} à revoir à la main.`);
    L.push(o.avecEcheanceFuture.length ? `   - pistes avec échéance de candidature future :` : "   - aucune échéance de candidature future connue : rien d'urgent à saisir.");
    for (const x of o.avecEcheanceFuture.slice(0, 3)) L.push(`     · ${x.titre} (${x.id}) : ${x.echeance}${x.aConfirmer ? ", à confirmer" : ""} — piste, source non vérifiée`);
    L.push(`   - règles : ${o.regles.join(" ; ")}.`);
  }
  L.push("", "4. Agents et décisions");
  L.push(...(b.missions.length ? b.missions.map((m) => `   - [${m.id.slice(0, 8)}] ${m.objectif} : ${m.statut} (${m.automatisation})${m.attend ? ` → attend ${m.attend}` : ""}`) : ["   - aucune mission en cours"]));
  L.push(`   - ${b.decisionsOuvertes} décision(s) ouverte(s) dans la roadmap (docs/roadmap-oia-shyrka-souffleur.md).`);
  L.push("", "5. Couverture, fraîcheur, budgets");
  for (const c of b.couverture) L.push(`   - ${c.produit} : ${c.actifs}/${c.total} contrôles actifs${c.manquants.length ? ` ; non couverts : ${c.manquants.join(", ")}` : ""}`);
  L.push(...(b.sourcesAnciennes.length ? b.sourcesAnciennes.map((s) => `   - ancien ou absent : ${s}`) : ["   - toutes les sources suivies sont fraîches"]));
  L.push(...b.budget.map((x) => `   - ${x}`));
  L.push(`   - dépendances : ${b.dependances.join(" ; ")}.`);
  return L.join("\n");
}

/** Version vocale courte : jamais de chemins ni d'identifiants longs. */
export function texteVocalBrief(b: Brief): string {
  const urgents = b.sujets.filter((s) => s.nature === "fait_observe").length;
  const attente = b.missions.filter((m) => m.statut === "attente_validation").length;
  const parties = [
    b.changements.length ? `${b.changements.length} changement${b.changements.length > 1 ? "s" : ""} depuis le dernier point.` : "Rien de nouveau depuis le dernier point.",
    urgents ? `${urgents} anomalie${urgents > 1 ? "s" : ""} confirmée${urgents > 1 ? "s" : ""} sur tes produits.` : "Aucune anomalie confirmée sur tes produits.",
    attente ? `${attente} correctif${attente > 1 ? "s" : ""} t'attend${attente > 1 ? "ent" : ""} pour relecture.` : "",
    b.opportunites ? `Côté financements, ${b.opportunites.verifiees} opportunité vérifiée sur ${b.opportunites.total}.` : "",
    `${b.decisionsOuvertes} décisions restent ouvertes dans la roadmap. Le détail est à l'écran.`,
  ];
  return parties.filter(Boolean).join(" ");
}

/**
 * Vues du contrat Lovable v1, validées par le schéma avant d'être rendues.
 * La mémoire du cockpit est « non implémentée » en v1 : aucun élément
 * personnel n'est servi hors du Mac, et la base OIA ne porte pas encore les
 * champs de l'ADR 0004.
 */
export function vuesExecutive(b: Brief, deps: { ops: BaseOps; missions: Missions }): VuesExecutive {
  const env = <T>(vue: string, donnees: T, etat: "connecte" | "ancien" | "non_implemente" = "connecte", motif: string | null = null) => ({ vue, version: 1 as const, etat, produiteLe: b.le, origine: "mac-local" as const, donnees, motif });
  const obs = deps.ops.dernieresObservations();
  const recente = obs.length > 0 && obs.every((o) => Date.parse(b.le) - Date.parse(o.collecteLe) < REGLAGES.fraicheurHeures * 3_600_000);
  const roadmap = (() => {
    try {
      return decisionsOuvertes(readFileSync(join(RACINE_DEPOT, "docs/roadmap-oia-shyrka-souffleur.md"), "utf8"));
    } catch {
      return [];
    }
  })();
  const missions = deps.missions.lister();
  return VuesExecutiveV1.parse({
    format: "shyrka.executive.vues",
    version: 1,
    brief_v1: env("brief_v1", {
      depuis: b.depuis, changements: b.changements, sujets: b.sujets,
      opportunites: b.opportunites && { total: b.opportunites.total, verifiees: b.opportunites.verifiees, aRevoir: b.opportunites.aRevoir, dateDonnee: b.opportunites.dateDonnee, pistes: b.opportunites.avecEcheanceFuture, regles: b.opportunites.regles },
      decisionsOuvertes: b.decisionsOuvertes, budget: b.budget, dependances: b.dependances,
    }),
    couverture_v1: env("couverture_v1", obs, recente ? "connecte" : "ancien", recente ? null : "dernière collecte trop ancienne ou absente"),
    incidents_v1: env("incidents_v1", deps.ops.incidents().map((i) => ({ id: i.id, produit: i.produit, source: i.source, observation: i.observation, gravite: i.gravite, statut: i.statut, premiere: i.premiere, derniere: i.derniere, occurrences: i.occurrences, reapparitions: i.reapparitions, preuve: i.preuve, prochaineAction: i.prochaineAction, motif: i.motif }))),
    missions_v1: env("missions_v1", missions.map((m) => {
      const r = m.resultats as { empreinteDiff?: string; pr?: string };
      return { id: m.id, objectif: m.objectif, statut: m.statut, automatisation: m.automatisation, tentatives: m.tentatives, tentativesMax: m.tentativesMax, empreinteDiff: r.empreinteDiff ?? null, pr: r.pr ?? null, causeBlocage: m.causeBlocage, coutUsd: m.coutConstate, majLe: m.majLe };
    })),
    decisions_v1: env("decisions_v1", [
      ...missions.filter((m) => m.statut === "attente_validation").map((m) => ({ cle: `mission:${m.id}`, intitule: `Relire et accepter ou corriger : ${m.objectif}`, source: "registre des missions", action: `pnpm shyrka:executive missions show ${m.id.slice(0, 8)}` })),
      ...missions.filter((m) => m.statut === "proposee").map((m) => ({ cle: `mission:${m.id}`, intitule: `Autoriser ou refuser : ${m.objectif}`, source: "registre des missions", action: `pnpm shyrka:executive missions autoriser ${m.id.slice(0, 8)}` })),
      ...deps.ops.incidents(["confirme"]).map((i) => ({ cle: `incident:${i.id}`, intitule: `${i.produit} : ${i.observation}`, source: i.preuve, action: `pnpm shyrka:executive incidents show ${i.id.slice(0, 8)}` })),
      ...roadmap.map((d) => ({ cle: `roadmap:${d.ligne}`, intitule: d.intitule, source: `docs/roadmap-oia-shyrka-souffleur.md:${d.ligne}`, action: "décision de Mickaël" })),
    ]),
    memoire_autorisee_v1: env("memoire_autorisee_v1", null, "non_implemente", "la base OIA ne porte pas encore les champs de l'ADR 0004 (migration à relire) ; aucune mémoire personnelle n'est copiée dans Supabase"),
  });
}

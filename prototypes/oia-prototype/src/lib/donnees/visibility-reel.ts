import { useEffect, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOiaAuth } from "@/lib/oia-auth";
import type { Database } from "@/integrations/supabase/types";
import * as mesure from "@/data/visibility";
import type { DonneesModuleVisibility, SujetVisibility } from "./visibility";

export class ErreurVisibility extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

type Vues = Database["public"]["Views"];
export type VueSujetVisibility = "vis_mesure_v1" | "vis_apercu_v1" | "vis_reponses_v1" | "vis_citations_v1" | "vis_reseaux_sociaux_v1" | "vis_concurrents_v1" | "vis_questions_v1" | "vis_recommandations_v1" | "vis_recommandations_v2" | "vis_rapports_v1" | "vis_jugements_v2" | "vis_jugements_moteurs_v2" | "vis_reponses_sources_v2" | "vis_couts_moteurs_v2";
export type LigneVisibility<V extends keyof Vues> = Vues[V]["Row"];
export const VUES_VISIBILITY = ["vis_sujets_v1", "vis_mesure_v1", "vis_apercu_v1", "vis_reponses_v1", "vis_citations_v1", "vis_reseaux_sociaux_v1", "vis_concurrents_v1", "vis_questions_v1", "vis_recommandations_v2", "vis_rapports_v1", "vis_jugements_v2", "vis_jugements_moteurs_v2", "vis_reponses_sources_v2", "vis_couts_moteurs_v2"] as const;
const VUES_DONNEES = ["vis_mesure_v1", "vis_apercu_v1", "vis_reponses_v1", "vis_citations_v1", "vis_reseaux_sociaux_v1", "vis_concurrents_v1", "vis_questions_v1", "vis_recommandations_v2", "vis_rapports_v1", "vis_jugements_v2", "vis_jugements_moteurs_v2", "vis_reponses_sources_v2", "vis_couts_moteurs_v2"] as const;
const TAILLE_PAGE = 500;

type RequetePage = {
  eq: (colonne: string, valeur: string) => RequetePage;
  range: (debut: number, fin: number) => Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;
};
async function paginer<V extends keyof Vues>(vue: V, sujet?: string): Promise<LigneVisibility<V>[]> {
  const lignes: LigneVisibility<V>[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let requete = supabase.from(vue).select("*") as unknown as RequetePage;
    if (sujet && vue !== "vis_sujets_v1") requete = requete.eq("subject_id", sujet);
    const { data, error } = await requete.range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new ErreurVisibility(error.message, error.code);
    const page = (data ?? []) as LigneVisibility<V>[];
    lignes.push(...page);
    if (page.length < TAILLE_PAGE) return lignes;
  }
}

export function lireSujetsVisibility() { return paginer("vis_sujets_v1"); }
export function lireVueVisibility<V extends keyof Vues>(vue: V, sujet?: string) { return paginer(vue, sujet); }

export type VuesSujet = { [K in Exclude<VueSujetVisibility, "vis_recommandations_v2" | "vis_jugements_v2" | "vis_jugements_moteurs_v2" | "vis_reponses_sources_v2" | "vis_couts_moteurs_v2">]: LigneVisibility<K>[] } & {
  vis_recommandations_v2?: LigneVisibility<"vis_recommandations_v2">[];
  vis_jugements_v2?: LigneVisibility<"vis_jugements_v2">[];
  vis_jugements_moteurs_v2?: LigneVisibility<"vis_jugements_moteurs_v2">[];
  vis_reponses_sources_v2?: LigneVisibility<"vis_reponses_sources_v2">[];
  vis_couts_moteurs_v2?: LigneVisibility<"vis_couts_moteurs_v2">[];
};
export async function lireDonneesSujetVisibility(sujet: SujetVisibility, sujets: SujetVisibility[]): Promise<DonneesModuleVisibility> {
  const entrees = await Promise.all(VUES_DONNEES.map(async (vue) => [vue, await lireVueVisibility(vue, sujet.id)] as const));
  return convertirVisibility(sujet, sujets, Object.fromEntries(entrees) as unknown as VuesSujet);
}

const nomsMoteurs: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", mistral: "Le Chat", perplexity: "Perplexity" };
const clesMoteurs: Record<string, string> = { ChatGPT: "chatgpt", Claude: "claude", Gemini: "gemini", "Le Chat": "mistral", Perplexity: "perplexity" };
const nomMoteur = (id: string | null) => nomsMoteurs[id ?? ""] ?? id ?? "Assistant inconnu";
const nonMesurable = (raison: string): mesure.Valeur => ({ v: null, min: null, max: null, raison });
const nombre = (valeur: number | null) => typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
const pct = (valeur: number | null) => nombre(valeur) === null ? null : Math.round(nombre(valeur)! * 10000) / 100;
const dateLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateHeure = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const moisAnnee = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const date = (valeur: string | null) => valeur ? dateHeure.format(new Date(valeur)).replace(":", " h ") : "Date non fournie";
const jour = (valeur: string | null) => valeur ? new Date(`${valeur.slice(0, 10)}T00:00:00Z`) : null;
function libelleFenetre(debut: string | null, fin: string | null) {
  const a = jour(debut); const b = jour(fin);
  if (!a || !b) return "Dates non fournies";
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return `du ${a.getUTCDate()} au ${dateLong.format(b)}`;
  return `du ${dateLong.format(a)} au ${dateLong.format(b)}`;
}
function valeurApercu(ligne: LigneVisibility<"vis_apercu_v1"> | undefined, pourcentage = true): mesure.Valeur {
  if (!ligne) return nonMesurable("Indicateur absent de vis_apercu_v1.");
  const raison = ligne.raison_non_mesurable || (ligne.denominateur === 0 ? "Aucun dénominateur mesurable." : "La base indique cet indicateur comme non mesurable.");
  if (ligne.etat === "non_mesurable" || ligne.denominateur === 0 || nombre(ligne.valeur) === null) return nonMesurable(raison);
  const facteur = pourcentage ? 10000 : 100;
  const convertir = (v: number | null) => nombre(v) === null ? null : Math.round(nombre(v)! * facteur) / 100;
  return { v: convertir(ligne.valeur), min: convertir(ligne.borne_basse), max: convertir(ligne.borne_haute), ...(ligne.methode_intervalle ? {} : { raison: "Intervalle non fourni." }) };
}
function ligneApercu(vues: VuesSujet, fenetre: string, indicateur: string, moteur = "tous") {
  return vues.vis_apercu_v1.find((l) => l.window_id === fenetre && l.indicateur === indicateur && (l.moteur ?? "tous") === moteur);
}
function ligneJugement(vues: VuesSujet, fenetre: string, moteur = "tous") {
  return (vues.vis_jugements_moteurs_v2 ?? []).find((j) => j.window_id === fenetre && (j.moteur ?? "tous") === moteur);
}
function sentimentJugement(ligne: LigneVisibility<"vis_jugements_moteurs_v2"> | undefined): mesure.SentimentGlobal {
  if (!ligne || ligne.etat === "non_mesurable" || !ligne.jugees) return { positif: null, neutre: null, negatif: null, mixte: null, raison: ligne?.raison || "Aucune réponse jugée par Jev.", source: "extrait (Jev 1.13)", effectif: ligne?.marque_citee ?? 0 };
  const n = ligne.marque_citee ?? 0;
  if (!n) return { positif: null, neutre: null, negatif: null, mixte: null, raison: ligne.raison || "Marque jamais citée : sentiment sans objet.", source: ligne.source || "extrait (Jev 1.13)", effectif: 0 };
  const pourcent = (v: number | null) => Math.round((v ?? 0) / n * 10000) / 100;
  return { positif: pourcent(ligne.sentiment_positif), neutre: pourcent(ligne.sentiment_neutre), negatif: pourcent(ligne.sentiment_negatif), mixte: pourcent(ligne.sentiment_mixte), source: ligne.source || "extrait (Jev 1.13)", effectif: n, positifN: ligne.sentiment_positif ?? 0, neutreN: ligne.sentiment_neutre ?? 0, negatifN: ligne.sentiment_negatif ?? 0, mixteN: ligne.sentiment_mixte ?? 0 };
}
function normaliserSujet(ligne: LigneVisibility<"vis_sujets_v1">): SujetVisibility | null {
  if (!ligne.subject_id || !ligne.client_id) return null;
  return { id: ligne.subject_id, clientId: ligne.client_id, nom: ligne.client_nom || ligne.subject_id, role: ligne.mon_role || "membre", statut: ligne.statut || "actif", domaines: ligne.domaines ?? [] };
}
export function sujetsValides(lignes: LigneVisibility<"vis_sujets_v1">[]) { return lignes.map(normaliserSujet).filter((s): s is SujetVisibility => s !== null); }

function agregerCitations(lignes: LigneVisibility<"vis_citations_v1">[]): typeof mesure.citations {
  const groupes = new Map<string, { source: string; n: number; aVous: boolean; type: string }>();
  for (const ligne of lignes) {
    const source = ligne.domaine || ligne.url || "Source inconnue";
    const actuel = groupes.get(source) ?? { source, n: 0, aVous: false, type: ligne.categorie || "autre" };
    actuel.n += ligne.citations ?? 0;
    actuel.aVous ||= ligne.categorie === "marque";
    groupes.set(source, actuel);
  }
  return [...groupes.values()].sort((a, b) => b.n - a.n);
}
function agregerReseaux(lignes: LigneVisibility<"vis_reseaux_sociaux_v1">[]): mesure.ReseauVisibility[] {
  return lignes.map((ligne) => ({
    reseau: ligne.plateforme ? ligne.plateforme[0]!.toLocaleUpperCase("fr-FR") + ligne.plateforme.slice(1) : "Réseau social",
    handle: ligne.url || "Profil non fourni",
    citations: ligne.citations ?? 0,
    controles: [],
    part: pct(ligne.part),
    questions: ligne.questions ?? 0,
    moteurs: (ligne.moteurs ?? []).map(nomMoteur),
  })).sort((a, b) => b.citations - a.citations);
}
function agregerPresenceQuestions(lignes: LigneVisibility<"vis_questions_v1">[], questions: string[]): Record<string, mesure.Valeur> {
  return Object.fromEntries(questions.map((id) => {
    const selection = lignes.filter((l) => l.question_id === id);
    const denominateur = selection.reduce((total, l) => total + (l.reponses_jugees ?? 0), 0);
    if (!selection.length) return [id, nonMesurable("Question absente de cette fenêtre ou de cet assistant.")];
    if (!denominateur) return [id, nonMesurable("Aucune réponse jugée pour cette question.")];
    const numerateur = selection.reduce((total, l) => total + (l.avec_marque ?? 0), 0);
    return [id, { v: Math.round(numerateur / denominateur * 10000) / 100, min: null, max: null, raison: "Intervalle par question non fourni par le contrat v1." }];
  }));
}

export function convertirVisibility(sujet: SujetVisibility, sujets: SujetVisibility[], vues: VuesSujet): DonneesModuleVisibility {
  const mesuresReelles = [...vues.vis_mesure_v1].filter((m) => m.window_id).sort((a, b) => Number(a.window_id?.includes("hors-panel")) - Number(b.window_id?.includes("hors-panel")) || (b.debut ?? "").localeCompare(a.debut ?? ""));
  const aDesMesures = mesuresReelles.length > 0;
  const mesures: LigneVisibility<"vis_mesure_v1">[] = aDesMesures ? mesuresReelles : [{ client_id: sujet.clientId, subject_id: sujet.id, window_id: "", type_fenetre: null, version_panel: null, statut_fenetre: null, debut: null, fin: null, jours_prevus: null, jours_mesures: null, jours_manquants: null, reponses: null, reponses_jugees: null, reponses_non_jugees: null, questions: null, moteurs: null, versions_modele: null, changement_modele: null, langues: null, collecteurs: null, cout_estime_usd: null, etat: "non_mesurable" }];
  const fenetres: mesure.Fenetre[] = mesuresReelles.map((m) => ({
    id: m.window_id!, label: libelleFenetre(m.debut, m.fin), type: m.type_fenetre === "baseline" ? "J0" : m.type_fenetre === "reconnaissance" ? "Reconnaissance" : "Remesure",
    enCours: m.statut_fenetre === "running" || m.etat === "mesure_en_cours", jour: m.jours_mesures ?? 0, joursPrevus: m.jours_prevus ?? 5,
  }));
  const idsFenetres = fenetres.map((f) => f.id);
  const derniere = fenetres[0] ?? { id: "", label: "Aucune fenêtre", type: "", enCours: false, jour: 0, joursPrevus: 5 };
  const mesureDerniere = mesures[0]!;
  const moteurIds = [...new Set(mesures.flatMap((m) => m.moteurs ?? []))];
  const assistants: mesure.AssistantVisibility[] = moteurIds.map((id) => {
    const reponses = vues.vis_reponses_v1.filter((r) => r.moteur === id);
    const versionBrute = mesureDerniere.versions_modele?.find((v) => v.startsWith(`${id}:`));
    const recuLe = reponses.map((r) => r.recu_le).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
    return { nom: nomMoteur(id), modele: versionBrute?.split(":").slice(1).join(":") || id, version: versionBrute?.split(":").slice(1).join(":") || "Version non fournie", recherche: reponses.length ? reponses.some((r) => r.recherche_web) : null, derniere: date(recuLe) };
  });
  const nomsAssistants = assistants.map((a) => a.nom);

  const indicateurs: DonneesModuleVisibility["indicateurs"] = {};
  const presenceAssistant: DonneesModuleVisibility["presenceAssistant"] = {};
  const presenceQuestionsParFenetre: NonNullable<DonneesModuleVisibility["presenceQuestionsParFenetre"]> = {};
  const partVoixParFenetre: NonNullable<DonneesModuleVisibility["partVoixParFenetre"]> = {};
  const citationsParFenetre: NonNullable<DonneesModuleVisibility["citationsParFenetre"]> = {};
  const reseauxParFenetre: NonNullable<DonneesModuleVisibility["reseauxParFenetre"]> = {};
  const etatCollecteParFenetre: NonNullable<DonneesModuleVisibility["etatCollecteParFenetre"]> = {};
  const sentimentAssistants: NonNullable<DonneesModuleVisibility["sentimentAssistants"]> = {};

  const questionRows = vues.vis_questions_v1.filter((q) => q.window_id === derniere.id && q.question_id);
  const questionMap = new Map<string, LigneVisibility<"vis_questions_v1">>();
  for (const ligne of questionRows) if (!questionMap.has(ligne.question_id!)) questionMap.set(ligne.question_id!, ligne);
  const questions: mesure.QuestionVisibility[] = [...questionMap.values()].map((q) => ({ id: q.question_id!, q: q.texte || q.question_id!, famille: q.etiquettes?.join(" · ") || "Sans famille", langue: q.langue || "inconnue", marque: q.marquee ?? false }));
  const questionIds = questions.map((q) => q.id);
  const familles = [...new Set(questions.map((q) => q.famille))];

  for (const fenetre of fenetres) {
    const id = fenetre.id;
    const jugement = ligneJugement(vues, id);
    indicateurs[id] = {
      presence: valeurApercu(ligneApercu(vues, id, "presence")),
      partVoix: valeurApercu(ligneApercu(vues, id, "part_de_voix")),
      exactitude: nonMesurable("Le contrôle des réponses par les faits validés n'est pas en base."),
      position: jugement && jugement.etat === "mesure" && nombre(jugement.position_moyenne) !== null ? { v: jugement.position_moyenne, min: null, max: null, raison: `${jugement.source || "extrait (Jev 1.13)"} · intervalle non fourni` } : nonMesurable(jugement?.raison || "Aucune position mesurée par Jev."),
      sentiment: sentimentJugement(jugement),
    };
    sentimentAssistants[id] = Object.fromEntries(nomsAssistants.map((nom) => [nom, sentimentJugement(ligneJugement(vues, id, clesMoteurs[nom] ?? nom))]));
    presenceAssistant[id] = Object.fromEntries(nomsAssistants.map((nom) => [nom, valeurApercu(ligneApercu(vues, id, "presence", clesMoteurs[nom] ?? nom))]));
    const lignesQuestions = vues.vis_questions_v1.filter((q) => q.window_id === id);
    presenceQuestionsParFenetre[id] = { Tous: agregerPresenceQuestions(lignesQuestions, questionIds) };
    for (const nom of nomsAssistants) presenceQuestionsParFenetre[id][nom] = agregerPresenceQuestions(lignesQuestions.filter((q) => nomMoteur(q.moteur) === nom), questionIds);

    const concurrentsFenetre = vues.vis_concurrents_v1.filter((c) => c.window_id === id);
    const global = concurrentsFenetre.filter((c) => (c.moteur ?? "tous") === "tous").map((c): mesure.PartVoixEntite => ({
      nom: c.entite || "Entité inconnue", v: c.denominateur_part ? pct(c.part_de_voix) : null,
      min: c.denominateur_part ? pct(c.borne_basse) : null, max: c.denominateur_part ? pct(c.borne_haute) : null,
      ...(!c.denominateur_part ? { raison: "Aucun dénominateur de part de voix." } : {}),
    }));
    const parAssistant = Object.fromEntries(nomsAssistants.map((nom) => {
      const valeur = valeurApercu(ligneApercu(vues, id, "part_de_voix", clesMoteurs[nom] ?? nom));
      return [nom, valeur.v];
    }));
    partVoixParFenetre[id] = { global, parAssistant, parQuestion: Object.fromEntries(questionIds.map((q) => [q, null])) };

    const citationsFenetre = vues.vis_citations_v1.filter((c) => c.window_id === id);
    citationsParFenetre[id] = { Tous: agregerCitations(citationsFenetre) };
    for (const nom of nomsAssistants) citationsParFenetre[id][nom] = agregerCitations(citationsFenetre.filter((c) => nomMoteur(c.moteur) === nom));
    const reseauxFenetre = vues.vis_reseaux_sociaux_v1.filter((r) => r.window_id === id);
    reseauxParFenetre[id] = { Tous: agregerReseaux(reseauxFenetre) };
    for (const nom of nomsAssistants) reseauxParFenetre[id][nom] = agregerReseaux(reseauxFenetre.filter((r) => (r.moteurs ?? []).some((m) => nomMoteur(m) === nom)));

    const m = mesures.find((x) => x.window_id === id)!;
    const derniereReponse = vues.vis_reponses_v1.filter((r) => r.window_id === id).map((r) => r.recu_le).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
    etatCollecteParFenetre[id] = { questions: m.questions ?? 0, reponses: m.reponses ?? 0, frequence: "Fréquence non fournie par le contrat v1", derniere: date(derniereReponse ?? m.fin) };
  }

  const entites = new Map<string, boolean>();
  for (const c of vues.vis_concurrents_v1) if (c.entite) entites.set(c.entite, c.est_marque ?? false);
  const fenetresChrono = [...fenetres].reverse();
  const serie: mesure.SerieVisibility = {
    fenetres: fenetresChrono.map((f) => f.label.replace("du ", "").replace("au ", "–")),
    lignes: [...entites.entries()].map(([nom, marque]) => ({ nom, marque, v: fenetresChrono.map((f) => {
      const ligne = vues.vis_concurrents_v1.find((c) => c.window_id === f.id && c.entite === nom && (c.moteur ?? "tous") === "tous");
      return ligne?.reponses_jugees ? pct(ligne.taux_apparition) : null;
    }) })),
  };
  const concurrents = [...entites.entries()].filter(([, estMarque]) => !estMarque).map(([nom]) => ({ nom, categorie: "Concurrent cité" }));
  const marqueNom = [...entites.entries()].find(([, estMarque]) => estMarque)?.[0] ?? sujet.nom;
  const reponses: mesure.ReponseVisibility[] = [...vues.vis_reponses_v1].sort((a, b) => (b.recu_le ?? "").localeCompare(a.recu_le ?? "")).map((r) => {
    const jugement = (vues.vis_jugements_v2 ?? []).find((j) => j.reponse_id === r.id);
    const detail = (vues.vis_reponses_sources_v2 ?? []).find((s) => s.reponse_id === r.id);
    const citations = Array.isArray(detail?.citations) ? detail.citations.map((c) => c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>)["url"] : null).filter((url): url is string => typeof url === "string") : null;
    const recherches = detail?.etat_recherches === "non_fourni" || !detail ? null : Array.isArray(detail.recherches) ? detail.recherches.filter((x): x is string => typeof x === "string") : detail.etat_recherches === "aucune" ? [] : null;
    const sentiment = jugement?.sentiment === "positive" ? "positif" : jugement?.sentiment === "neutral" ? "neutre" : jugement?.sentiment === "negative" ? "negatif" : jugement?.sentiment === "mixed" ? "mixte" : null;
    return {
      id: r.id ?? crypto.randomUUID(), question: r.question_id || "Question inconnue", assistant: nomMoteur(r.moteur), date: date(r.recu_le), fenetre: r.window_id || "",
      sentiment, texte: r.texte || "Réponse vide.", sources: citations, recherches, pages: null, nbCitations: detail?.nb_citations ?? r.nb_citations,
      marqueCitee: jugement?.marque_citee ?? null, sourceJugement: jugement?.source || "extrait (Jev 1.13)", position: jugement?.position ?? null, passage: jugement?.passage ?? null,
      ...(jugement?.raison_non_mesurable ? { raisonNonMesurable: jugement.raison_non_mesurable } : {}),
      ...(r.empreinte ? { empreinte: r.empreinte } : {}), ...(r.version_modele ? { versionModele: r.version_modele } : {}),
    };
  });
  const rapports = vues.vis_rapports_v1.map((r) => ({ id: r.id ?? crypto.randomUUID(), titre: r.type || "Rapport de fenêtre", fenetre: fenetres.find((f) => f.id === r.window_id)?.label || r.window_id || "Fenêtre inconnue", statut: r.statut || "Statut non fourni" }));
  const questionsAvant: Record<string, mesure.Valeur> = fenetres.length > 1 ? presenceQuestionsParFenetre[fenetres.at(-1)!.id]!["Tous"]! : {};
  const questionsApres: Record<string, mesure.Valeur> = presenceQuestionsParFenetre[derniere.id]!["Tous"]!;
  const comparaison = fenetres.length > 1 ? questionIds.map((question) => ({ question, avant: questionsAvant[question]?.v ?? null, apres: questionsApres[question]?.v ?? null })) : [];

  const referenceMois = jour(mesureDerniere.debut) ?? new Date();
  const cleMois = referenceMois.toISOString().slice(0, 7);
  const reponsesMois = vues.vis_reponses_v1.filter((r) => r.recu_le?.startsWith(cleMois));
  const coutsMoteurs = (vues.vis_couts_moteurs_v2 ?? []).filter((c) => c.window_id === derniere.id);
  const moteurs: mesure.MoteurVisibility[] = assistants.map((a) => {
    const rs = reponsesMois.filter((r) => nomMoteur(r.moteur) === a.nom);
    const cout = coutsMoteurs.find((c) => nomMoteur(c.moteur) === a.nom);
    const fournisseurs = [...new Set(rs.map((r) => r.fournisseur).filter(Boolean))];
    const collecteurs = [...new Set(rs.map((r) => r.collecteur).filter(Boolean))];
    return { assistant: a.nom, fournisseur: fournisseurs[0] || clesMoteurs[a.nom] || a.nom, modele: a.modele, version: a.version, acces: collecteurs.join(", ") || "Collecteur non fourni", estime: cout?.reponses ? (cout.cout_estime_usd ?? 0) / cout.reponses : null, observe: cout?.reponses_cout_reel ? (cout.cout_reel_usd ?? 0) / cout.reponses_cout_reel : null, suivi: true };
  });
  const mesuresMois = mesures.filter((m) => m.debut?.startsWith(cleMois));
  const domaines = sujet.domaines.length ? sujet.domaines : ["Domaine non fourni"];
  const sites = sujets.map((s) => {
    const actif = s.id === sujet.id;
    return { slug: s.id, nom: s.nom, url: s.domaines[0] || "Domaine non fourni", panel: actif && aDesMesures ? `Panel v${mesureDerniere.version_panel ?? "non fourni"}` : actif ? "Panel à valider" : "Sélectionner ce sujet", depart: actif ? derniere.label : "Mesure non chargée", ia: actif ? indicateurs[derniere.id]!.presence.v : null, google: "Non mesurable, contrôle d'indexation disponible dans l'audit quand il existe" };
  });
  const recommandationsV2 = vues.vis_recommandations_v2 ?? [];
  const recommandationsSource: (LigneVisibility<"vis_recommandations_v1"> | LigneVisibility<"vis_recommandations_v2">)[] = recommandationsV2.length ? recommandationsV2 : vues.vis_recommandations_v1;
  const recommandations = [...recommandationsSource].sort((a, b) => (a.priorite ?? 0) - (b.priorite ?? 0)).map((r) => ({
    etat: (r.etat === "accepted" || r.etat === "validated" ? "conforme" : r.etat === "rejected" ? "bloquant" : "verifier") as "conforme" | "verifier" | "bloquant",
    titre: r.titre || r.id || "Recommandation", effet: [r.impact && `impact ${r.impact}`, r.effort && `effort ${r.effort}`].filter(Boolean).join(" · ") || "Impact et effort non fournis",
  }));
  const indicateursDerniere = indicateurs[derniere.id]!;
  const presenceDerniere = presenceAssistant[derniere.id]!;
  const citationsDerniere = citationsParFenetre[derniere.id]!["Tous"]!;
  const reseauxDerniere = reseauxParFenetre[derniere.id]!["Tous"]!;
  const partVoixDerniere = partVoixParFenetre[derniere.id]!;
  const presenceQuestionsDerniere = presenceQuestionsParFenetre[derniere.id]!["Tous"]!;
  const etatCollecteDerniere = etatCollecteParFenetre[derniere.id]!;

  return {
    ...mesure,
    reel: true,
    sujets,
    sujetActif: sujet.id,
    sites,
    agents: [],
    onboarding: { url: "", constats: [], activite: "", lieu: "", langues: "", offres: [], concurrents: [], connexions: [], questions: [], assistants: [], bloquants: [], familles: [] },
    vueSite: {
      nom: sujet.nom, url: domaines[0]!, presence: indicateursDerniere.presence.v, min: indicateursDerniere.presence.min, max: indicateursDerniere.presence.max, jours: mesureDerniere.jours_mesures ?? 0,
      parAssistant: nomsAssistants.map((nom) => ({ nom, v: presenceDerniere[nom]!.v })),
      sources: citationsDerniere.map((c) => ({ nom: c.source, n: c.n })),
      concurrents: partVoixDerniere.global.filter((c) => c.nom !== marqueNom).map((c) => ({ nom: c.nom, v: c.v })),
      recommandations,
      historique: fenetres.map((f) => ({ fenetre: f.label, v: indicateurs[f.id]!.presence.v, min: indicateurs[f.id]!.presence.min, max: indicateurs[f.id]!.presence.max, statut: f.enCours ? `Mesure en cours, jour ${f.jour} sur ${f.joursPrevus}` : "Définitif" })),
    },
    fenetres,
    assistants,
    moteurs,
    depensesMoteurs: { questions: mesureDerniere.questions ?? 0, joursMesures: mesuresMois.reduce((t, m) => t + (m.jours_mesures ?? 0), 0), frequence: aDesMesures ? `Coûts de la fenêtre ${derniere.id}` : "Aucune fenêtre mesurée", mois: aDesMesures ? derniere.label : moisAnnee.format(referenceMois), observe: coutsMoteurs.some((c) => c.cout_reel_usd !== null) ? coutsMoteurs.reduce((t, c) => t + (c.cout_reel_usd ?? 0), 0) : null, plafond: null, estimeGlobal: coutsMoteurs.some((c) => c.cout_estime_usd !== null) ? coutsMoteurs.reduce((t, c) => t + (c.cout_estime_usd ?? 0), 0) : null },
    plateformesMoteurs: [],
    familles,
    questions,
    marque: { nom: marqueNom, sites: sujet.domaines, alias: [], profils: [] },
    concurrents,
    indicateurs,
    presenceAssistant,
    presenceQuestion: Object.fromEntries(questionIds.map((id) => [id, presenceQuestionsDerniere[id]?.v ?? null])),
    presenceQuestionsParFenetre,
    serie,
    partVoix: partVoixDerniere,
    partVoixParFenetre,
    reponses,
    citations: citationsDerniere,
    citationsParFenetre,
    opportunites: [],
    reseaux: reseauxDerniere,
    reseauxParFenetre,
    rapports,
    comparaison,
    etatCollecte: etatCollecteDerniere,
    etatCollecteParFenetre,
    sentimentAssistants,
    recommandationsV2,
    NOTE_MESURE: "Mesures issues des collecteurs déclarés dans vis_mesure_v1. Sentiment et position : extrait (Jev 1.13). Les réponses des applications grand public peuvent différer.",
  };
}

export function optionsSujetsVisibility(userId: string) {
  return queryOptions({ queryKey: ["visibility-sujets", userId], queryFn: lireSujetsVisibility, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export function optionsDonneesVisibility(userId: string, sujet: SujetVisibility, sujets: SujetVisibility[]) {
  return queryOptions({ queryKey: ["visibility-reel", userId, sujet.id], queryFn: () => lireDonneesSujetVisibility(sujet, sujets), retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export function useVisibilityReel() {
  const auth = useOiaAuth();
  const userId = auth.user?.id ?? "";
  const [sujetId, setSujetId] = useState<string | null>(null);
  const sujetsQuery = useQuery({ ...optionsSujetsVisibility(userId), enabled: Boolean(userId) && !auth.loading });
  const sujets = sujetsValides(sujetsQuery.data ?? []);
  useEffect(() => { setSujetId(null); }, [userId]);
  useEffect(() => { if (sujets.length && !sujets.some((s) => s.id === sujetId)) setSujetId(sujets[0]!.id); }, [sujetsQuery.data, sujetId]);
  const sujet = sujets.find((s) => s.id === sujetId) ?? null;
  const donneesQuery = useQuery({ ...optionsDonneesVisibility(userId, sujet ?? { id: "", clientId: "", nom: "", role: "", statut: "", domaines: [] }, sujets), enabled: Boolean(userId && sujet) });
  return { auth, sujets, sujetId: sujet?.id ?? null, setSujetId, sujetsQuery, donneesQuery };
}

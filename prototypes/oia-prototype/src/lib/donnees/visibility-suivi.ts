import type { Database, Json } from "@/integrations/supabase/types";
import { lireVueVisibility } from "./visibility-reel";
import { objet, tableau, texte } from "./visibility-pilotage";
import type { DemandeV2 } from "./visibility-v3";

type Vues = Database["public"]["Views"];
export type SuiviActionV3 = Vues["vis_plan_suivi_v3"]["Row"];
export type PlanConsolideV3 = Vues["vis_plan_consolide_v3"]["Row"];
export const DELAI_SUIVI_CONSOLIDATION = 30_000;

export const ETATS_SUIVI: Record<string, string> = { a_planifier: "À planifier", planifie: "Planifié", en_cours: "En cours", fait: "Fait", abandonne: "Abandonné" };
/** États acceptés par vis_suivre_action. */
export const ETATS_GESTE = ["planifie", "en_cours", "fait", "abandonne"] as const;
export type EtatGeste = (typeof ETATS_GESTE)[number];
export const libelleSuivi = (s: string | null | undefined) => ETATS_SUIVI[s ?? ""] ?? "À planifier";

export type TonVerification = "ok" | "attention" | "neutre" | "mesure";
export const VERIFICATIONS: Record<string, { label: string; ton: TonVerification }> = {
  corrige_verifie: { label: "Corrigé, vérifié", ton: "ok" },
  pas_encore_corrige: { label: "Pas encore corrigé, le contrôle le voit encore", ton: "attention" },
  verification_en_attente: { label: "Vérification au prochain contrôle", ton: "neutre" },
  a_mesurer: { label: "À mesurer", ton: "mesure" },
};
export const verificationDe = (v: string | null | undefined) => VERIFICATIONS[v ?? ""] ?? null;

export const PRIORITES: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, haute: 0, high: 0, elevee: 0, moyenne: 1, medium: 1, basse: 2, low: 2 };
export const rangPriorite = (p: string | null | undefined) => PRIORITES[p ?? ""] ?? 9;

export const lireSuiviPlan = (subject?: string) => lireVueVisibility("vis_plan_suivi_v3", subject);
export const lirePlanConsolide = (subject?: string) => lireVueVisibility("vis_plan_consolide_v3", subject);

export type DeltaEffet = { cle: string; label: string; valeur: number | null };
export function deltasEffet(a: SuiviActionV3): DeltaEffet[] {
  return [
    { cle: "gp", label: "Pages indexées Google", valeur: a.delta_google_pages_indexees },
    { cle: "gi", label: "Impressions Google", valeur: a.delta_google_impressions },
    { cle: "gc", label: "Clics Google", valeur: a.delta_google_clics },
    { cle: "bi", label: "Impressions Bing", valeur: a.delta_bing_impressions },
    { cle: "si", label: "Score d'indexation", valeur: a.delta_score_indexation },
  ];
}

export type FiltresSuivi = { suivi: string; priorite: string; origine: string; qui: string; retard: string };
export const filtresSuiviVides: FiltresSuivi = { suivi: "", priorite: "", origine: "", qui: "", retard: "" };
export const libelleOrigineSuivi = (a: Pick<SuiviActionV3, "origine">) => texte(objet(a.origine ?? null)["libelle"]) || texte(objet(a.origine ?? null)["type"]) || "Origine non fournie";
export function filtrerSuivi(actions: SuiviActionV3[], f: FiltresSuivi) {
  return actions.filter((a) => (!f.suivi || (a.suivi ?? "a_planifier") === f.suivi)
    && (!f.priorite || a.priorite === f.priorite)
    && (!f.origine || libelleOrigineSuivi(a) === f.origine)
    && (!f.qui || a.qui === f.qui)
    && (!f.retard || (f.retard === "oui") === Boolean(a.en_retard)));
}
export function trierSuivi(actions: SuiviActionV3[]) {
  return [...actions].sort((a, b) => rangPriorite(a.priorite) - rangPriorite(b.priorite) || (a.ordre ?? 0) - (b.ordre ?? 0) || (a.titre ?? "").localeCompare(b.titre ?? "", "fr"));
}
const pl = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
export function compteurSuivi(actions: SuiviActionV3[]) {
  const faites = actions.filter((a) => a.suivi === "fait").length;
  const verifiees = actions.filter((a) => a.verification === "corrige_verifie").length;
  const retard = actions.filter((a) => a.en_retard).length;
  return `${pl(actions.length, "action")} · ${pl(faites, "faite")} · ${pl(verifiees, "vérifiée")} · ${retard} en retard`;
}

export type SuiviChantier = { cle: string; suivi: string | null; verification: string | null };
export type Chantier = {
  titre: string; pourquoi: string; priorite: string | null; impact: string | null; effort: string | null; qui: string | null;
  actions: string[]; sources: string[]; etapes: string[]; critere: string | null; prompt: string | null; suivi: SuiviChantier[];
};
const libelleSource = (s: Json) => typeof s === "string" ? s : texte(objet(s)["libelle"]) || texte(objet(s)["type"]);
export function chantiers(plan: PlanConsolideV3 | null | undefined): Chantier[] {
  return tableau<Json>(plan?.groupes ?? null).map((brut, i) => {
    const g = objet(brut);
    return {
      titre: texte(g["titre"], `Chantier ${i + 1}`), pourquoi: texte(g["pourquoi"]),
      priorite: texte(g["priorite"]) || null, impact: texte(g["impact"]) || null, effort: texte(g["effort"]) || null, qui: texte(g["qui"]) || null,
      actions: tableau<Json>(g["actions"] ?? null).filter((a): a is string => typeof a === "string"),
      sources: [...new Set(tableau<Json>(g["sources"] ?? null).map(libelleSource).filter(Boolean))],
      etapes: tableau<Json>(g["etapes"] ?? null).map((e) => typeof e === "string" ? e : texte(objet(e)["titre"]) || texte(objet(e)["etape"])).filter(Boolean),
      critere: texte(g["critere_reussite"]) || null, prompt: texte(g["prompt_execution"]) || null,
      suivi: tableau<Json>(g["suivi_actions"] ?? null).map((s) => { const o = objet(s); return { cle: texte(o["cle"]), suivi: texte(o["suivi"]) || null, verification: texte(o["verification"]) || null }; }).filter((s) => s.cle),
    };
  }).map((c, i) => ({ c, i })).sort((a, b) => rangPriorite(a.c.priorite) - rangPriorite(b.c.priorite) || a.i - b.i).map(({ c }) => c);
}
export const nombreSources = (plan: PlanConsolideV3 | null | undefined) => {
  const s = plan?.sources;
  return Array.isArray(s) ? s.length : typeof s === "number" ? s : s && typeof s === "object" ? Object.keys(s).length : null;
};
export function enteteConsolidation(plan: PlanConsolideV3) {
  const n = plan.actions_lues, x = nombreSources(plan);
  return `${n ?? "?"} action${(n ?? 0) > 1 ? "s" : ""} croisée${(n ?? 0) > 1 ? "s" : ""} depuis ${x ?? "?"} source${(x ?? 0) > 1 ? "s" : ""}`;
}
export const mentionSources = (n: number) => n > 1 ? `relevé par ${n} sources` : n === 1 ? "relevé par 1 source" : "source non fournie";

export function demandeConsolidationActive(demandes: DemandeV2[], subject: string) {
  return demandes.filter((d) => d.subject_id === subject && d.type === "CONSOLIDER_PLAN" && (d.statut === "QUEUED" || d.statut === "RUNNING"))
    .sort((a, b) => (b.demande_le ?? "").localeCompare(a.demande_le ?? ""))[0];
}
export function resumePilotage(plans: PlanConsolideV3[], suivi: SuiviActionV3[], subject: string) {
  const plan = plans.filter((p) => p.subject_id === subject).sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""))[0];
  return { chantiers: chantiers(plan).length, retard: suivi.filter((a) => a.subject_id === subject && a.en_retard).length };
}
export const texteResumePilotage = (r: { chantiers: number; retard: number }) => `${r.chantiers} chantier${r.chantiers > 1 ? "s" : ""} · ${r.retard} action${r.retard > 1 ? "s" : ""} en retard`;

const base = { client_id: "studio", subject_id: "studio-ardoise", categorie: "technique", horizon: null, nature: "constat", releve_le: "2026-11-10", note: null, preuve: null, fait_le: null, verification: null, verifie_le: null, effet: null, avant_le: null, apres_le: null, delta_google_pages_indexees: null, delta_google_impressions: null, delta_google_clics: null, delta_bing_impressions: null, delta_score_indexation: null, responsable: null, echeance: null, echeance_proposee: true, en_retard: false } satisfies Partial<SuiviActionV3>;
/** Exemple fictif réservé aux visiteurs non connectés. */
export const suiviDemo: SuiviActionV3[] = [
  { ...base, action_cle: "constat:indexation:sitemap", ordre: 1, origine: { type: "indexation", libelle: "Hygiène d'indexation (site en ligne, Bing)", date: "2026-11-10" }, priorite: "P0", titre: "Déclarer le sitemap", quoi_faire: "Ajouter la ligne Sitemap dans robots.txt.", pourquoi: "Les moteurs découvrent les pages plus vite.", effort: "XS", qui: "equipe", suivi: "fait", responsable: "Mickaël", echeance: "2026-11-12", echeance_proposee: false, fait_le: "2026-11-11", preuve: "commit 4f2a1c9", verification: "corrige_verifie", verifie_le: "2026-11-12", effet: "mesure", avant_le: "2026-10-28", apres_le: "2026-11-17", delta_google_pages_indexees: 6, delta_google_impressions: 140, delta_google_clics: -3, delta_bing_impressions: 25, delta_score_indexation: 12 },
  { ...base, action_cle: "constat:seo:titres", ordre: 2, origine: { type: "audit", libelle: "Audit du site", date: "2026-11-08" }, priorite: "P1", titre: "Titres de pages en double", quoi_faire: "Donner un titre unique aux 8 pages concernées.", pourquoi: "Les moteurs confondent les pages.", effort: "S", qui: "client", suivi: "fait", fait_le: "2026-11-16", verification: "pas_encore_corrige", effet: "trop_tot" },
  { ...base, action_cle: "constat:indexation:canonique", ordre: 3, origine: { type: "indexation", libelle: "Hygiène d'indexation (site en ligne, Bing)", date: "2026-11-10" }, priorite: "P1", titre: "Adresse canonique incohérente", quoi_faire: "Aligner la balise canonique sur l'adresse en https.", pourquoi: "Google choisit une autre adresse.", effort: "S", qui: "equipe", suivi: "fait", fait_le: "2026-11-17", verification: "verification_en_attente", effet: "trop_tot" },
  { ...base, action_cle: "recommandation:faq", ordre: 4, nature: "recommandation", origine: { type: "audit_ia", libelle: "Audit IA express", date: "2026-11-09" }, priorite: "P2", titre: "Publier une FAQ tarifs", quoi_faire: "Répondre aux 6 questions posées aux IA.", pourquoi: "Les IA citent un concurrent à votre place.", categorie: "contenu", effort: "M", qui: "client", suivi: "fait", fait_le: "2026-11-15", verification: "a_mesurer", effet: "trop_tot" },
  { ...base, action_cle: "constat:perf:images", ordre: 5, origine: { type: "audit", libelle: "Audit du site", date: "2026-11-08" }, priorite: "P1", titre: "Images trop lourdes", quoi_faire: "Compresser les images de l'accueil.", pourquoi: "La page met 6 secondes à s'afficher.", categorie: "performance", effort: "S", qui: "equipe", suivi: "en_cours", responsable: "Léa", echeance: "2026-11-14", en_retard: true },
  { ...base, action_cle: "recommandation:avis", ordre: 6, nature: "recommandation", origine: { type: "audit_ia", libelle: "Audit IA express", date: "2026-11-09" }, priorite: "P2", titre: "Collecter des avis clients", quoi_faire: "Demander un avis après chaque projet.", pourquoi: "Les IA s'appuient sur les avis.", categorie: "commercial", effort: "M", qui: "client", suivi: "a_planifier", echeance: "2026-12-15" },
];
export const consolideDemo: PlanConsolideV3[] = [{
  client_id: "studio", subject_id: "studio-ardoise", plan_id: "plan-demo", le: "2026-11-17T08:00:00Z", modele: "exemple", actions_lues: 6,
  resume: "Deux chantiers d'abord : rendre le site lisible par les moteurs, puis donner aux IA de quoi vous citer.",
  sources: ["Hygiène d'indexation (site en ligne, Bing)", "Audit du site", "Audit IA express"],
  groupes: [
    { titre: "Rendre le site lisible par les moteurs", pourquoi: "Trois sources relèvent des pages mal déclarées ou en double.", priorite: "P0", impact: "high", effort: "S", qui: "equipe",
      actions: ["constat:indexation:sitemap", "constat:seo:titres", "constat:indexation:canonique"], sources: ["Hygiène d'indexation (site en ligne, Bing)", "Audit du site", "Audit IA express"],
      etapes: ["Déclarer le sitemap dans robots.txt", "Rendre les titres uniques", "Aligner les canoniques sur https"], critere_reussite: "Le contrôle d'indexation ne relève plus aucun écart sur ces trois points.",
      prompt_execution: "Dans ce dépôt, ajoute la ligne Sitemap dans public/robots.txt, donne un titre unique à chaque page et fais pointer chaque balise canonique vers l'adresse https. Ne modifie rien d'autre.",
      suivi_actions: [{ cle: "constat:indexation:sitemap", suivi: "fait", verification: "corrige_verifie" }, { cle: "constat:seo:titres", suivi: "fait", verification: "pas_encore_corrige" }, { cle: "constat:indexation:canonique", suivi: "fait", verification: "verification_en_attente" }] },
    { titre: "Donner aux IA de quoi vous citer", pourquoi: "Les IA citent un concurrent sur les questions de prix.", priorite: "P2", impact: "medium", effort: "M", qui: "client",
      actions: ["recommandation:faq", "recommandation:avis"], sources: ["Audit IA express"],
      etapes: ["Rédiger la FAQ tarifs", "Mettre en place la demande d'avis"], critere_reussite: "Le site est cité sur au moins 3 questions de prix au prochain audit.",
      prompt_execution: "Crée une page FAQ tarifs avec les six questions fournies, balisée en FAQPage.",
      suivi_actions: [{ cle: "recommandation:faq", suivi: "fait", verification: "a_mesurer" }, { cle: "recommandation:avis", suivi: "a_planifier", verification: null }] },
  ],
}];

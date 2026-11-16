import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/integrations/supabase/types";
import { ErreurVisibility, lireVueVisibility, type LigneVisibility } from "./visibility-reel";

export type VuePilotage =
  | "vis_portefeuille_v2" | "vis_demandes_v2" | "vis_propositions_v2"
  | "vis_fenetres_v2" | "vis_budget_v2" | "vis_alertes_v2" | "vis_moteur_v2"
  | "vis_pages_client_v2" | "vis_comparaisons_v2" | "vis_comparaison_moteurs_v2";
export type LignePilotage<V extends VuePilotage> = LigneVisibility<V>;

export type PilotageGlobal = {
  portefeuille: LignePilotage<"vis_portefeuille_v2">[];
  demandes: LignePilotage<"vis_demandes_v2">[];
  budgets: LignePilotage<"vis_budget_v2">[];
  alertes: LignePilotage<"vis_alertes_v2">[];
  moteur: LignePilotage<"vis_moteur_v2">[];
};
export type PilotageSujet = {
  propositions: LignePilotage<"vis_propositions_v2">[];
  fenetres: LignePilotage<"vis_fenetres_v2">[];
  pages: LignePilotage<"vis_pages_client_v2">[];
  comparaisons: LignePilotage<"vis_comparaisons_v2">[];
  comparaisonMoteurs: LignePilotage<"vis_comparaison_moteurs_v2">[];
};

export async function lirePilotageGlobal(): Promise<PilotageGlobal> {
  const [portefeuille, demandes, budgets, alertes, moteur] = await Promise.all([
    lireVueVisibility("vis_portefeuille_v2"), lireVueVisibility("vis_demandes_v2"),
    lireVueVisibility("vis_budget_v2"), lireVueVisibility("vis_alertes_v2"), lireVueVisibility("vis_moteur_v2"),
  ]);
  return { portefeuille, demandes, budgets, alertes, moteur };
}

export async function lirePilotageSujet(subject: string): Promise<PilotageSujet> {
  const [propositions, fenetres, pages, comparaisons, comparaisonMoteurs] = await Promise.all([
    lireVueVisibility("vis_propositions_v2", subject), lireVueVisibility("vis_fenetres_v2", subject),
    lireVueVisibility("vis_pages_client_v2", subject), lireVueVisibility("vis_comparaisons_v2", subject),
    lireVueVisibility("vis_comparaison_moteurs_v2", subject),
  ]);
  return { propositions, fenetres, pages, comparaisons, comparaisonMoteurs };
}

export type Fonctions = Database["public"]["Functions"];
export type GesteVisibility =
  | "vis_demander_site" | "vis_modifier_proposition" | "vis_ajouter_proposition"
  | "vis_valider_faits" | "vis_valider_panel" | "vis_valider_concurrents"
  | "vis_go_reconnaissance" | "vis_go_fenetre" | "vis_annuler_fenetre"
  | "vis_valider_rapport" | "vis_declarer_execution" | "vis_fixer_plafond"
  | "vis_relancer_demande" | "vis_acquitter_alerte"
  | "vis_valider_recommandation" | "vis_rejeter_recommandation" | "vis_demander_analyse"
  | "vis_importer_audit_externe" | "vis_lancer_audit_ia" | "vis_lancer_note_contenu" | "vis_lier_depot";
export type ArgsGeste<N extends GesteVisibility> = N extends "vis_lier_depot"
  ? Omit<Fonctions[N]["Args"], "p_depot"> & { p_depot: string | null }
  : Fonctions[N]["Args"];
export type ClientRpc = { rpc: (nom: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };

/** Toutes les mutations Visibility passent par ce point. Aucun accès table en écriture. */
export async function gesteVisibility<N extends GesteVisibility>(
  nom: N,
  params: ArgsGeste<N>,
  client: ClientRpc = supabase as unknown as ClientRpc,
): Promise<Fonctions[N]["Returns"]> {
  const { data, error } = await client.rpc(nom, params as Record<string, unknown>);
  if (error) throw new ErreurVisibility(error.message, error.code);
  return data as Fonctions[N]["Returns"];
}

export const demanderAnalyse = (p: Fonctions["vis_demander_analyse"]["Args"], client?: ClientRpc) => gesteVisibility("vis_demander_analyse", p, client);
export const demanderSite = (p: Fonctions["vis_demander_site"]["Args"], client?: ClientRpc) => gesteVisibility("vis_demander_site", p, client);
export const modifierProposition = (p: Fonctions["vis_modifier_proposition"]["Args"], client?: ClientRpc) => gesteVisibility("vis_modifier_proposition", p, client);
export const ajouterProposition = (p: Fonctions["vis_ajouter_proposition"]["Args"], client?: ClientRpc) => gesteVisibility("vis_ajouter_proposition", p, client);
export const validerFaits = (p: Fonctions["vis_valider_faits"]["Args"], client?: ClientRpc) => gesteVisibility("vis_valider_faits", p, client);
export const validerPanel = (p: Fonctions["vis_valider_panel"]["Args"], client?: ClientRpc) => gesteVisibility("vis_valider_panel", p, client);
export const validerConcurrents = (p: Fonctions["vis_valider_concurrents"]["Args"], client?: ClientRpc) => gesteVisibility("vis_valider_concurrents", p, client);
export const goReconnaissance = (p: Fonctions["vis_go_reconnaissance"]["Args"], client?: ClientRpc) => gesteVisibility("vis_go_reconnaissance", p, client);
export const goFenetre = (p: Fonctions["vis_go_fenetre"]["Args"], client?: ClientRpc) => gesteVisibility("vis_go_fenetre", p, client);
export const annulerFenetre = (p: Fonctions["vis_annuler_fenetre"]["Args"], client?: ClientRpc) => gesteVisibility("vis_annuler_fenetre", p, client);
export const validerRapport = (p: Fonctions["vis_valider_rapport"]["Args"], client?: ClientRpc) => gesteVisibility("vis_valider_rapport", p, client);
export const declarerExecution = (p: Fonctions["vis_declarer_execution"]["Args"], client?: ClientRpc) => gesteVisibility("vis_declarer_execution", p, client);
export const fixerPlafond = (p: Fonctions["vis_fixer_plafond"]["Args"], client?: ClientRpc) => gesteVisibility("vis_fixer_plafond", p, client);
export const relancerDemande = (p: Fonctions["vis_relancer_demande"]["Args"], client?: ClientRpc) => gesteVisibility("vis_relancer_demande", p, client);
export const acquitterAlerte = (p: Fonctions["vis_acquitter_alerte"]["Args"], client?: ClientRpc) => gesteVisibility("vis_acquitter_alerte", p, client);
export const importerAuditExterne = (p: Fonctions["vis_importer_audit_externe"]["Args"], client?: ClientRpc) => gesteVisibility("vis_importer_audit_externe", p, client);
export const lancerAuditIa = (p: Fonctions["vis_lancer_audit_ia"]["Args"], client?: ClientRpc) => gesteVisibility("vis_lancer_audit_ia", p, client);
export const lancerNoteContenu = (p: Fonctions["vis_lancer_note_contenu"]["Args"], client?: ClientRpc) => gesteVisibility("vis_lancer_note_contenu", p, client);
export const lierDepot = (p: ArgsGeste<"vis_lier_depot">, client?: ClientRpc) => gesteVisibility("vis_lier_depot", p, client);

export function dollars(valeur: number | null | undefined) {
  return typeof valeur === "number" && Number.isFinite(valeur)
    ? `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
    : "Non mesurable";
}

export function raisonGo(budget: LignePilotage<"vis_budget_v2"> | undefined, cout: number | null | undefined) {
  if (!budget || budget.etat === "non_fixe" || budget.plafond_usd === null) return "Plafond mensuel non fixé. Définissez d'abord le plafond global, puis celui du client.";
  if (budget.plafond_global_usd === null) return "Plafond global OIA non fixé. Aucun GO n'est possible.";
  if (budget.etat === "atteint") return "Plafond mensuel atteint. Le lancement est désactivé.";
  if (typeof cout !== "number" || !Number.isFinite(cout)) return "Estimation absente. Le moteur doit chiffrer cette étape avant le lancement.";
  const restant = (budget.plafond_usd ?? 0) - (budget.reel_usd ?? 0) - (budget.engage_usd ?? 0);
  if (cout > restant) return `Estimation supérieure au plafond restant (${dollars(Math.max(0, restant))}).`;
  return null;
}

export function demainIso(maintenant = new Date()) {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + 1));
  return d.toISOString().slice(0, 10);
}

/** Attributs volontairement minimaux : ni script, ni formulaire, ni navigation du rapport. */
export function proprietesRapport(html: string) {
  return { srcDoc: html, sandbox: "" } as const;
}

export function objet(valeur: Json | null): Record<string, Json | undefined> {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? valeur as Record<string, Json | undefined> : {};
}
export function tableau<T = Json>(valeur: Json | null | undefined): T[] {
  return Array.isArray(valeur) ? valeur as T[] : [];
}
export function texte(valeur: Json | undefined, defaut = "") {
  return typeof valeur === "string" ? valeur : defaut;
}

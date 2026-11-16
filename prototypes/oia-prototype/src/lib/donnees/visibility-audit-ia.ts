import type { AuditExterneV3, AuditIaV3, EstimationAuditIaV3 } from "./visibility-v3";
import { objet, tableau, texte } from "./visibility-pilotage";

export const OUTIL_AUDIT_IA_EXPRESS = "OIA · Audit IA express";
export const DELAI_SUIVI_AUDIT_IA = 30_000;

export type MoteurEstimationAuditIa = {
  moteur: string;
  cible: string;
  appels: number | null;
  maxUsd: number | null;
  habituelUsd: number | null;
};

const nombre = (valeur: unknown) => typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;

export function moteursEstimationAuditIa(estimation: EstimationAuditIaV3 | undefined): MoteurEstimationAuditIa[] {
  return tableau(estimation?.moteurs).map((brut, index) => {
    const ligne = objet(brut);
    return {
      moteur: texte(ligne["moteur"], `Moteur ${index + 1}`),
      cible: texte(ligne["cible"], "Cible non fournie"),
      appels: nombre(ligne["appels"]),
      maxUsd: nombre(ligne["max_usd"]),
      habituelUsd: nombre(ligne["habituel_usd"]),
    };
  });
}

export function budgetRestantAuditIa(estimation: EstimationAuditIaV3 | undefined) {
  if (!estimation || estimation.plafond_usd === null) return null;
  return Math.max(0, estimation.plafond_usd - (estimation.reel_usd ?? 0) - (estimation.engage_usd ?? 0));
}

export function raisonEtatAuditIa(etat: string | null | undefined) {
  if (etat === "plafond_client_non_fixe") return "Plafond client non fixé. Définissez-le avant de lancer l’audit.";
  if (etat === "plafond_global_non_fixe") return "Plafond global OIA non fixé. Définissez-le avant de lancer l’audit.";
  if (etat === "plafond_depasse") return "Plafond du mois dépassé. Le lancement est désactivé.";
  if (etat === "ok") return null;
  return "Estimation indisponible pour ce site. Rechargez la page ou vérifiez les réglages du budget.";
}

export function auditsIaPourSujet(audits: AuditIaV3[], subject: string) {
  return audits
    .filter((audit) => audit.subject_id === subject)
    .sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""));
}

export function auditIaEnCours(audits: AuditIaV3[], subject: string) {
  return auditsIaPourSujet(audits, subject).find((audit) => audit.statut === "QUEUED" || audit.statut === "RUNNING");
}

export function delaiSuiviAuditIa(audits: AuditIaV3[]): number | false {
  return audits.some((audit) => audit.statut === "QUEUED" || audit.statut === "RUNNING") ? DELAI_SUIVI_AUDIT_IA : false;
}

function plusRecent<T extends AuditExterneV3>(audits: T[]) {
  return [...audits].sort((a, b) => (b.realise_le ?? "").localeCompare(a.realise_le ?? "") || (b.importe_le ?? "").localeCompare(a.importe_le ?? ""))[0];
}

export function auditsExternesAComparer(audits: AuditExterneV3[], subject: string) {
  const duSite = audits.filter((audit) => audit.subject_id === subject);
  const oia = plusRecent(duSite.filter((audit) => audit.outil === OUTIL_AUDIT_IA_EXPRESS));
  const perplexity = plusRecent(duSite.filter((audit) => audit.outil?.toLocaleLowerCase("fr-FR").includes("perplexity")));
  return oia && perplexity ? { oia, perplexity } : null;
}

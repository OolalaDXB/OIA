import type { Database, Json } from "@/integrations/supabase/types";
export type VuesMoney = Database["public"]["Views"];
export type VueMoney = Extract<keyof VuesMoney, `ml_${string}`>;
export type LigneMoney<V extends VueMoney> = VuesMoney[V]["Row"];
export type OpportuniteReelle = LigneMoney<"ml_toutes_v2">;
export type FicheReelle = LigneMoney<"ml_fiche_v2">;
export const ESPACE_OIA = "00000000-0000-4000-8000-000000000001";
export const naturesMoney: Record<string, string> = { GRANT: "Subvention", PRIZE: "Prix", TAX_INCENTIVE: "Aide fiscale", DEBT_GUARANTEE: "Prêt ou garantie", TENDER: "Appel d'offres", PRE_SOLICITATION: "Préconsultation", MARKETPLACE_PROJECT: "Projet de place de marché", CONSORTIUM_CALL: "Appel à consortium", EQUITY: "Investissement en capital", ACQUISITION: "Acquisition" };
export const categoriesMoney: Record<string, string> = { subvention: "Subvention", chiffre_affaires_contractuel_potentiel: "Chiffre d'affaires contractuel potentiel", investissement_capital: "Investissement en capital", pret: "Prêt", aide_fiscale: "Aide fiscale", montant_inconnu: "Montant inconnu" };
export const decisionsMoney: Record<string, string> = { PENDING: "À décider", APPROVE: "Approuver", REJECT: "Rejeter", NEEDS_VERIFICATION: "À vérifier", COMMENT: "Commenter" };
export function dateMoney(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "inconnue"; }
export function montantMoney(value: number | null, devise: string | null) { return value === null ? "inconnu" : `${new Intl.NumberFormat("fr-FR").format(value)} ${devise ?? "devise inconnue"}`; }
export function objetsJson(value: Json | null | undefined): Record<string, Json | undefined>[] { return Array.isArray(value) ? value.filter((v): v is Record<string, Json | undefined> => v !== null && typeof v === "object" && !Array.isArray(v)) : []; }
export function texteJson(value: Json | undefined) { return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); }
export function csvMoney(rows: Record<string, unknown>[], columns?: string[]) {
  const keys = columns ?? Object.keys(rows[0] ?? {});
  const cell = (value: unknown) => { const s = value === null || value === undefined ? "inconnu" : typeof value === "object" ? JSON.stringify(value) : String(value); return `"${(/^[=+@-]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`; };
  return "\uFEFF" + [keys.map(cell).join(";"), ...rows.map((r) => keys.map((k) => cell(r[k])).join(";"))].join("\n");
}
export function markdownMoney(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {}); const cell = (v: unknown) => (v === null || v === undefined ? "inconnu" : typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
  return [`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${keys.map((k) => cell(r[k])).join(" | ")} |`)].join("\n");
}
export const clesSauvegarde = { decisions: "oia.audit.v1", etiquettes: "oia.tags.v1", notes: "oia.notes.v1", taches: "oia.tasks.v1", contacts: "oia.contacts.v1", vues: "oia.views.v1" } as const;
export function apercuSauvegarde(value: unknown) {
  if (!value || typeof value !== "object" || !("kind" in value) || value.kind !== "oia.workspace.backup" || !("version" in value) || value.version !== 1 || !("data" in value) || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) throw new Error("Fichier de sauvegarde OIA non reconnu (22023).");
  const data = value.data as Record<string, unknown>;
  return Object.fromEntries(Object.entries(clesSauvegarde).map(([name, key]) => {
    const v = data[key]; if (v === null || v === undefined) return [name, 0];
    if (name === "etiquettes" ? typeof v !== "object" || Array.isArray(v) : !Array.isArray(v)) throw new Error(`Collection ${name} non reconnue (22023).`);
    return [name, name === "etiquettes" ? Object.keys(v).length : (v as unknown[]).length];
  }));
}
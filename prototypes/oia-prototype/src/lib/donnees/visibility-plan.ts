import type { Json } from "@/integrations/supabase/types";
import type { LigneVisibility } from "./visibility-reel";
import { objet, texte } from "./visibility-pilotage";

export type PlanActionV3 = LigneVisibility<"vis_plan_action_v3">;
export type DemandeMoteurV2 = LigneVisibility<"vis_demandes_v2">;

export const HORIZONS = ["Cette semaine", "Sous 2 à 6 semaines", "Sous 3 à 10 semaines", "Ensuite"] as const;
const ordrePriorite: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const ETATS_PLAN: Record<string, string> = { a_valider: "À valider", a_faire: "À faire", fait: "Fait", mesure: "Mesuré", refuse: "Refusé" };
export const EFFORTS_PLAN: Record<string, string> = { XS: "1 h", S: "une demi-journée", M: "1 à 2 jours", L: "une semaine", XL: "plusieurs semaines" };
export const IMPACTS_PLAN: Record<string, string> = { high: "élevé", medium: "moyen", low: "faible", eleve: "élevé", moyen: "moyen", faible: "faible" };
export const QUI_PLAN: Record<string, string> = { client: "Client", equipe: "Équipe OIA", oia: "Équipe OIA", mickael: "Mickaël" };
export const CATEGORIES_PLAN: Record<string, string> = { technique: "Technique", fonctionnel: "Fonctionnel", commercial: "Commercial", performance: "Performance", seo: "SEO", contenu: "Contenu", accessibilite: "Accessibilité", visibilite: "Visibilité IA" };

export const libelleEtatPlan = (etat: string | null | undefined) => ETATS_PLAN[etat ?? ""] ?? "État non fourni";
export const libelleEffort = (effort: string | null | undefined) => effort ? EFFORTS_PLAN[effort] ?? effort : "Effort non fourni";
export const libelleImpact = (impact: string | null | undefined) => impact ? IMPACTS_PLAN[impact] ?? impact : "non chiffré";
export const libelleQui = (qui: string | null | undefined) => qui ? QUI_PLAN[qui] ?? qui : "Non attribué";
export const libelleCategorie = (c: string | null | undefined) => c ? CATEGORIES_PLAN[c] ?? c.replace(/^./, (x) => x.toLocaleUpperCase("fr-FR")) : "Sans catégorie";

const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
/** « Audit externe · Perplexity Computer · 16 nov. » : libellé de la base, puis la date courte si elle existe. */
export const ORIGINE_INDEXATION = "Hygiène d'indexation (site en ligne, Bing)";
export function libelleOrigine(action: Pick<PlanActionV3, "origine">) {
  const o = objet(action.origine as Json | null);
  const type = texte(o["type"]);
  const source = texte(o["source"]);
  if (type.toLocaleLowerCase("fr-FR") === "indexation" || source.toLocaleLowerCase("fr-FR") === "indexation") return ORIGINE_INDEXATION;
  return texte(o["libelle"]) || type || "Origine non fournie";
}
export function badgeOrigine(action: Pick<PlanActionV3, "origine">) {
  const o = objet(action.origine as Json | null);
  const libelle = libelleOrigine(action);
  const brut = texte(o["date"]);
  const d = brut ? new Date(brut.length === 10 ? `${brut}T00:00:00Z` : brut) : null;
  return d && !Number.isNaN(d.getTime()) ? `${libelle} · ${dateCourte.format(d)}` : libelle;
}
const estLighthouse = (a: PlanActionV3) => a.nature === "constat" && /lighthouse/i.test(`${texte(objet(a.origine as Json | null)["type"])} ${libelleOrigine(a)}`);

export type CartePlan = { action: PlanActionV3; ids: string[]; mobileEtOrdinateur: boolean };
export function trierPlan(actions: PlanActionV3[]) {
  return [...actions].sort((a, b) => (ordrePriorite[a.priorite ?? ""] ?? 9) - (ordrePriorite[b.priorite ?? ""] ?? 9) || (a.ordre ?? 999) - (b.ordre ?? 999) || (a.titre ?? "").localeCompare(b.titre ?? "", "fr"));
}
/** Les constats Lighthouse identiques en mobile et en ordinateur forment une seule carte. */
export function regrouperPlan(actions: PlanActionV3[]): CartePlan[] {
  const cartes: CartePlan[] = [];
  const parTitre = new Map<string, CartePlan>();
  for (const action of trierPlan(actions)) {
    if (estLighthouse(action)) {
      const cle = `${action.subject_id}|${(action.titre ?? "").trim().toLocaleLowerCase("fr-FR")}`;
      const existante = parTitre.get(cle);
      if (existante) { existante.ids.push(action.id ?? ""); existante.mobileEtOrdinateur = true; continue; }
      const carte = { action, ids: [action.id ?? ""], mobileEtOrdinateur: false };
      parTitre.set(cle, carte); cartes.push(carte); continue;
    }
    cartes.push({ action, ids: [action.id ?? ""], mobileEtOrdinateur: false });
  }
  return cartes;
}
export function horizonDe(action: PlanActionV3) { return HORIZONS.includes(action.horizon as (typeof HORIZONS)[number]) ? action.horizon! : "Ensuite"; }
export function groupesHorizon(cartes: CartePlan[]) {
  return HORIZONS.map((horizon) => ({ horizon, cartes: cartes.filter((c) => horizonDe(c.action) === horizon) })).filter((g) => g.cartes.length > 0);
}
export const enteteHorizon = (horizon: string, n: number) => `${horizon} · ${n} action${n > 1 ? "s" : ""}`;
export function compteurPlan(cartes: CartePlan[]) {
  const total = cartes.length;
  const semaine = cartes.filter((c) => horizonDe(c.action) === "Cette semaine").length;
  const aValider = cartes.filter((c) => c.action.etat === "a_valider").length;
  return `${total} action${total > 1 ? "s" : ""} · ${semaine} cette semaine · ${aValider} à valider`;
}
export type FiltresPlan = { origine: string; categorie: string; etat: string; qui: string };
export const filtresPlanVides: FiltresPlan = { origine: "", categorie: "", etat: "", qui: "" };
export function filtrerPlan(actions: PlanActionV3[], f: FiltresPlan) {
  return actions.filter((a) => (!f.origine || libelleOrigine(a) === f.origine) && (!f.categorie || a.categorie === f.categorie) && (!f.etat || a.etat === f.etat) && (!f.qui || a.qui === f.qui));
}
export const ESTFAIT = new Set(["fait", "mesure", "refuse"]);
export function actionsP0AFaire(actions: PlanActionV3[], subject: string) {
  return regrouperPlan(actions.filter((a) => a.subject_id === subject && a.priorite === "P0" && !ESTFAIT.has(a.etat ?? ""))).length;
}
export function premieresActions(actions: PlanActionV3[], subject: string, limite = 5) {
  return regrouperPlan(actions.filter((a) => a.subject_id === subject && !ESTFAIT.has(a.etat ?? ""))).slice(0, limite);
}

// Rapports externes
export const RAPPORT_MIN = 200;
export const RAPPORT_MAX = 400_000;
export const COUT_EXTRACTION_MAX_USD = 0.25;
export const COUT_EXTRACTION_HABITUEL_USD = 0.03;
export function erreurTexteRapport(texteRapport: string) {
  const n = texteRapport.trim().length;
  if (n < RAPPORT_MIN) return `Le texte doit faire au moins ${RAPPORT_MIN} caractères (actuellement ${n}).`;
  if (n > RAPPORT_MAX) return `Le texte dépasse ${RAPPORT_MAX.toLocaleString("fr-FR")} caractères (actuellement ${n.toLocaleString("fr-FR")}).`;
  return null;
}
export type ChargeurPdf = (donnees: ArrayBuffer) => Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }> }>;
const chargeurPdfParDefaut: ChargeurPdf = async (donnees) => {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data: new Uint8Array(donnees), isEvalSupported: false }).promise as unknown as ReturnType<ChargeurPdf>;
};
/** Extraction locale dans le navigateur : seul le texte obtenu est ensuite envoyé. */
export async function extraireTextePdf(donnees: ArrayBuffer, chargeur: ChargeurPdf = chargeurPdfParDefaut) {
  const doc = await chargeur(donnees);
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const contenu = await (await doc.getPage(n)).getTextContent();
    pages.push(contenu.items.map((i) => `${i.str ?? ""}${i.hasEOL ? "\n" : ""}`).join("").replace(/[ \t]+\n/g, "\n").trim());
  }
  return pages.filter(Boolean).join("\n\n");
}
function lireOctets(fichier: File): Promise<ArrayBuffer> {
  if (typeof fichier.arrayBuffer === "function") return fichier.arrayBuffer();
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.onerror = () => ko(r.error); r.readAsArrayBuffer(fichier); });
}
export async function lireFichierRapport(fichier: File, chargeur?: ChargeurPdf) {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith(".pdf") || fichier.type === "application/pdf") return extraireTextePdf(await lireOctets(fichier), chargeur);
  if (nom.endsWith(".md") || nom.endsWith(".txt") || fichier.type.startsWith("text/")) return new TextDecoder().decode(await lireOctets(fichier));
  throw new Error("Format non pris en charge : choisissez un fichier .md, .txt ou .pdf.");
}

// Activité du moteur
export const TYPES_DEMANDE: Record<string, string> = { ANALYSE: "Analyse", HYGIENE: "Hygiène d'indexation", AUDIT_IA: "Audit IA express", AUDIT_IA_EXPRESS: "Audit IA express", NOTE_CONTENU: "Note du contenu", EXTRAIRE_PLAN: "Extraction du plan", MESURE: "Mesure", RECONNAISSANCE: "Reconnaissance", AUDIT: "Audit du site", RAPPORT: "Rapport" };
export const libelleTypeDemande = (type: string | null | undefined) => type ? TYPES_DEMANDE[type] ?? type.replaceAll("_", " ").toLocaleLowerCase("fr-FR").replace(/^./, (c) => c.toLocaleUpperCase("fr-FR")) : "Type non fourni";
export const peutRelancer = (d: Pick<DemandeMoteurV2, "statut" | "remplacee_par" | "id">) => d.statut === "FAILED" && Boolean(d.id) && !d.remplacee_par;
export function erreurTronquee(erreur: string | null | undefined, max = 160) {
  if (!erreur) return { court: null, tronquee: false };
  return erreur.length > max ? { court: `${erreur.slice(0, max)}…`, tronquee: true } : { court: erreur, tronquee: false };
}
export function demandeExtraction(demandes: DemandeMoteurV2[], audit: string, id?: string | null) {
  return demandes
    .filter((d) => d.type === "EXTRAIRE_PLAN" && (d.id === id || JSON.stringify(d.charge ?? null).includes(audit)))
    .sort((a, b) => (b.demande_le ?? "").localeCompare(a.demande_le ?? ""))[0];
}

const l = (v: Partial<PlanActionV3>) => v as PlanActionV3;
/** Démonstration réservée aux visiteurs non connectés. */
export const planDemo: PlanActionV3[] = [
  l({ id: "p1", subject_id: "studio-ardoise", nature: "constat", origine: { type: "indexation", date: "2026-11-17" }, origine_ref: "c1", priorite: "P0", horizon: "Cette semaine", ordre: 1, titre: "Une page importante est en noindex", quoi_faire: "Retirer la directive noindex de la page des stages, puis demander une nouvelle indexation.", pourquoi: "Google ne peut pas intégrer cette page à ses résultats.", categorie: "seo", impact: "high", effort: "XS", qui: "client", etat: "a_faire" }),
  l({ id: "p2", subject_id: "studio-ardoise", nature: "recommandation", origine: { type: "audit_externe", libelle: "Audit externe · Perplexity Computer", date: "2026-11-16" }, priorite: "P0", horizon: "Cette semaine", ordre: 2, titre: "Publier une page « Cours de céramique à Vannes »", quoi_faire: "Créer une page dédiée avec horaires, prix et niveau.", pourquoi: "Aucune IA ne cite le studio sur les questions sans son nom.", categorie: "visibilite", impact: "high", effort: "M", qui: "equipe", etat: "a_valider" }),
  l({ id: "p3", subject_id: "studio-ardoise", nature: "constat", origine: { type: "lighthouse", libelle: "Analyse Lighthouse", date: "2026-11-16" }, origine_ref: "c2", priorite: "P1", horizon: "Sous 2 à 6 semaines", ordre: 3, titre: "Différer les images hors écran", quoi_faire: "Charger les images à la demande et réserver leurs dimensions.", pourquoi: "Le premier affichage attend des images invisibles.", categorie: "performance", impact: "medium", effort: "S", qui: "equipe", etat: "a_faire", reference: "mobile" }),
  l({ id: "p4", subject_id: "studio-ardoise", nature: "constat", origine: { type: "lighthouse", libelle: "Analyse Lighthouse", date: "2026-11-16" }, origine_ref: "c2", priorite: "P1", horizon: "Sous 2 à 6 semaines", ordre: 4, titre: "Différer les images hors écran", quoi_faire: "Charger les images à la demande et réserver leurs dimensions.", pourquoi: "Le premier affichage attend des images invisibles.", categorie: "performance", impact: "medium", effort: "S", qui: "equipe", etat: "a_faire", reference: "ordinateur" }),
  l({ id: "p5", subject_id: "studio-ardoise", nature: "recommandation", origine: { type: "audit_ia", libelle: "Audit IA express", date: "2026-11-16" }, priorite: "P2", horizon: "Sous 3 à 10 semaines", ordre: 5, titre: "Obtenir une citation sur un annuaire local", quoi_faire: "Demander une fiche sur deux annuaires cités par les IA.", pourquoi: "Les concurrents cités y figurent tous.", categorie: "visibilite", impact: "medium", effort: "L", qui: "client", etat: "a_valider" }),
];

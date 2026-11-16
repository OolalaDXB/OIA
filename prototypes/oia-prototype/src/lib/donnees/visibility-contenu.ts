import type { Json } from "@/integrations/supabase/types";
import type { ConstatV3, NoteContenuV3, EstimationNoteContenuV3 } from "./visibility-v3";
import { objet, tableau, texte } from "./visibility-pilotage";

export const DELAI_SUIVI_NOTE_CONTENU = 30_000;
export const AXES_CONTENU = [
  { id: "technique", label: "Technique", note: "note_technique", couleur: "var(--chart-1)" },
  { id: "fonctionnel", label: "Fonctionnel", note: "note_fonctionnelle", couleur: "var(--chart-3)" },
  { id: "commercial", label: "Commercial", note: "note_commerciale", couleur: "var(--chart-4)" },
] as const;

export type AxeContenu = (typeof AXES_CONTENU)[number]["id"];
export type CritereContenu = {
  id: string;
  axe: AxeContenu;
  titre: string;
  points: number | null;
  ok: boolean | null;
  valeur: string | null;
  source: "html" | "depot" | "modele" | "inconnue";
  preuve: Json | null;
};

const nombre = (valeur: unknown) => typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
const chaine = (valeur: unknown) => typeof valeur === "string" && valeur.trim() ? valeur : null;
const liste = (valeur: Json | undefined) => tableau(valeur).map(chaine).filter((v): v is string => Boolean(v));

export function criteresContenu(note: NoteContenuV3 | undefined): CritereContenu[] {
  return tableau(note?.criteres).map((brut, index) => {
    const ligne = objet(brut);
    const axeBrut = texte(ligne["axe"], "technique");
    const axe: AxeContenu = AXES_CONTENU.some((a) => a.id === axeBrut) ? axeBrut as AxeContenu : "technique";
    const sourceBrut = texte(ligne["source"], "inconnue");
    return {
      id: texte(ligne["id"], `critere-${index + 1}`),
      axe,
      titre: texte(ligne["titre"], "Critère sans titre"),
      points: nombre(ligne["points"]),
      ok: typeof ligne["ok"] === "boolean" ? ligne["ok"] : null,
      valeur: chaine(ligne["valeur"]) ?? (typeof ligne["valeur"] === "number" ? String(ligne["valeur"]) : null),
      source: sourceBrut === "html" || sourceBrut === "depot" || sourceBrut === "modele" ? sourceBrut : "inconnue",
      preuve: ligne["preuve"] ?? null,
    };
  });
}

export function preuveCritere(critere: CritereContenu) {
  if (typeof critere.preuve === "string") {
    return { pages: [] as string[], fichiers: [] as string[], citation: critere.source === "modele" ? critere.preuve : null, texte: critere.source === "modele" ? null : critere.preuve };
  }
  const preuve = objet(critere.preuve);
  return {
    pages: liste(preuve["pages"] ?? preuve["pages_en_cause"]),
    fichiers: liste(preuve["fichiers"]),
    citation: chaine(preuve["citation"] ?? preuve["citation_exacte"]),
    texte: chaine(preuve["texte"] ?? preuve["detail"]),
  };
}

export function libelleSourceCritere(source: CritereContenu["source"]) {
  return source === "html" ? "page" : source === "depot" ? "dépôt" : source === "modele" ? "IA" : "source inconnue";
}

export function etatCritereContenu(critere: CritereContenu) {
  if (critere.source === "modele" && !preuveCritere(critere).citation) return "non vérifiable";
  if (critere.ok === null) return "non mesuré";
  return critere.ok ? "conforme" : "à corriger";
}

export function notesContenuPourSujet(notes: NoteContenuV3[], subject: string) {
  return notes.filter((note) => note.subject_id === subject).sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""));
}

export function noteContenuActive(notes: NoteContenuV3[], subject: string) {
  return notesContenuPourSujet(notes, subject).find((note) => note.statut === "QUEUED" || note.statut === "RUNNING");
}

export function noteContenuResultat(notes: NoteContenuV3[], subject: string) {
  const terminees = notesContenuPourSujet(notes, subject).filter((note) => note.statut === "DONE");
  return terminees.find((note) => note.derniere) ?? terminees[0];
}

export function constatsContenuOuverts(constats: ConstatV3[], subject: string) {
  const gravite: Record<string, number> = { critique: 1, important: 2, mineur: 3 };
  return constats
    .filter((item) => item.subject_id === subject && item.source === "contenu" && item.etat === "ouvert")
    .map((constat, index) => ({ constat, index }))
    .sort((a, b) => (gravite[a.constat.gravite ?? ""] ?? 99) - (gravite[b.constat.gravite ?? ""] ?? 99)
      || (a.constat.ordre ?? 99) - (b.constat.ordre ?? 99) || a.index - b.index)
    .map(({ constat }) => constat);
}

export function delaiSuiviNoteContenu(note: NoteContenuV3 | undefined): number | false {
  return note && (note.statut === "QUEUED" || note.statut === "RUNNING") ? DELAI_SUIVI_NOTE_CONTENU : false;
}

export function depotLuContenu(note: NoteContenuV3 | undefined) {
  const depot = objet(note?.depot_lu ?? null);
  return {
    depot: chaine(depot["depot"]) ?? note?.depot ?? null,
    sha: chaine(depot["sha"]),
    branche: chaine(depot["branche"]),
    fichiers: nombre(depot["fichiers"]),
    sensibles: nombre(depot["sensibles"]),
    erreur: chaine(depot["erreur"]),
  };
}

export function budgetRestantNoteContenu(estimation: EstimationNoteContenuV3 | undefined) {
  if (!estimation || estimation.plafond_usd === null) return null;
  return Math.max(0, estimation.plafond_usd - (estimation.reel_usd ?? 0) - (estimation.engage_usd ?? 0));
}

export function raisonEtatNoteContenu(etat: string | null | undefined) {
  if (etat === "plafond_client_non_fixe") return "Plafond client non fixé. Définissez-le avant de lancer la note du contenu.";
  if (etat === "plafond_global_non_fixe") return "Plafond global OIA non fixé. Définissez-le avant de lancer la note du contenu.";
  if (etat === "plafond_depasse") return "Plafond du mois dépassé. Le lancement est désactivé.";
  if (etat === "ok") return null;
  return "Estimation indisponible pour ce site. Rechargez la page ou vérifiez les réglages du budget.";
}

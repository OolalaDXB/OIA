import { lireVueVisibilityBrute } from "./visibility-reel";

export const VUE_EFFICACITE = "vis_efficacite_v3";
export const VUE_EFFICACITE_MESURES = "vis_efficacite_mesures_v3";

export type EfficaciteJourV3 = {
  subject_id: string;
  jour: string;
  score_indexation: number | null;
  ecarts: number | null;
  google_pages_indexees: number | null;
  google_pages_inspectees: number | null;
  google_impressions_28j: number | null;
  google_clics_28j: number | null;
  google_position: number | null;
  bing_impressions_28j: number | null;
  bing_clics_28j: number | null;
  bing_pages_indexees: number | null;
  constats_resolus_cumules: number | null;
};

export type EfficaciteMesureV3 = {
  id?: string | null;
  analyse_id?: string | null;
  subject_id: string;
  realise_le: string;
  score: number | null;
  moteurs: unknown;
  citations_sans_nom: number | null;
  reponses_sans_nom: number | null;
  cout_reel_usd: number | null;
  mensuelle: boolean | null;
  memes_questions_que: string | null;
};

export type ConstatResolu = { subject_id: string | null; etat: string | null; derniere_fois: string | null };

export type CleIndicateur = "score_indexation" | "google_pages_indexees" | "bing_pages_indexees" | "google_impressions_28j" | "google_clics_28j" | "bing_impressions_28j" | "bing_clics_28j" | "ecarts" | "constats_resolus_cumules";
export type Indicateur = { cle: CleIndicateur; label: string; sens: "hausse" | "baisse" };

/** Sens favorable de chaque indicateur : seuls les écarts ouverts s'améliorent en baissant. */
export const INDICATEURS: Indicateur[] = [
  { cle: "score_indexation", label: "Score d'indexation", sens: "hausse" },
  { cle: "google_pages_indexees", label: "Pages indexées Google", sens: "hausse" },
  { cle: "bing_pages_indexees", label: "Pages indexées Bing", sens: "hausse" },
  { cle: "google_impressions_28j", label: "Impressions Google (28 j)", sens: "hausse" },
  { cle: "google_clics_28j", label: "Clics Google (28 j)", sens: "hausse" },
  { cle: "bing_impressions_28j", label: "Impressions Bing (28 j)", sens: "hausse" },
  { cle: "bing_clics_28j", label: "Clics Bing (28 j)", sens: "hausse" },
  { cle: "ecarts", label: "Écarts ouverts", sens: "baisse" },
  { cle: "constats_resolus_cumules", label: "Corrections faites", sens: "hausse" },
];

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

export type Variation = { delta: number | null; tendance: "amelioration" | "degradation" | "stable" | "inconnue" };
export function variation(depart: number | null | undefined, aujourdhui: number | null | undefined, sens: Indicateur["sens"]): Variation {
  const a = num(depart), b = num(aujourdhui);
  if (a === null || b === null) return { delta: null, tendance: "inconnue" };
  const delta = b - a;
  if (delta === 0) return { delta, tendance: "stable" };
  return { delta, tendance: (delta > 0) === (sens === "hausse") ? "amelioration" : "degradation" };
}

export function trierJours(lignes: EfficaciteJourV3[], subject?: string) {
  return lignes.filter((l) => !subject || l.subject_id === subject).sort((a, b) => a.jour.localeCompare(b.jour));
}
export function departEtAujourdhui(lignes: EfficaciteJourV3[], subject?: string) {
  const t = trierJours(lignes, subject);
  return { depart: t[0] ?? null, aujourdhui: t[t.length - 1] ?? null, jours: t.length };
}

/** Dates (AAAA-MM-JJ) des constats résolus du site, une seule fois chacune. */
export function reperesResolution(constats: ConstatResolu[], subject: string) {
  return [...new Set(constats.filter((c) => c.subject_id === subject && c.etat === "resolu" && c.derniere_fois).map((c) => c.derniere_fois!.slice(0, 10)))].sort();
}

const idMesure = (m: EfficaciteMesureV3) => m.id ?? m.analyse_id ?? null;
export type LigneMesure = { mesure: EfficaciteMesureV3; precedente: EfficaciteMesureV3 | null; comparable: boolean; deltaScore: number | null };
/** Une mesure n'est comparée à la précédente que si memes_questions_que pointe vers elle. */
export function comparerMesures(mesures: EfficaciteMesureV3[], subject?: string): LigneMesure[] {
  const t = mesures.filter((m) => !subject || m.subject_id === subject).sort((a, b) => a.realise_le.localeCompare(b.realise_le));
  return t.map((mesure, i) => {
    const precedente: EfficaciteMesureV3 | null = i > 0 ? t[i - 1] ?? null : null;
    const comparable = Boolean(precedente && mesure.memes_questions_que && idMesure(precedente) === mesure.memes_questions_que);
    const deltaScore = comparable && num(mesure.score) !== null && num(precedente!.score) !== null ? mesure.score! - precedente!.score! : null;
    return { mesure, precedente, comparable, deltaScore };
  });
}
/** Tendance du score IA pour l'accueil : uniquement entre deux mesures comparables. */
export function tendanceScoreIa(mesures: EfficaciteMesureV3[], subject: string): Variation & { comparable: boolean } {
  const lignes = comparerMesures(mesures, subject);
  const derniere = lignes[lignes.length - 1];
  if (!derniere || !derniere.precedente) return { delta: null, tendance: "inconnue", comparable: false };
  if (!derniere.comparable) return { delta: null, tendance: "inconnue", comparable: false };
  return { ...variation(derniere.precedente.score, derniere.mesure.score, "hausse"), comparable: true };
}

export function lireEfficacite(subject?: string) { return lireVueVisibilityBrute<EfficaciteJourV3>(VUE_EFFICACITE, subject); }
export function lireEfficaciteMesures(subject?: string) { return lireVueVisibilityBrute<EfficaciteMesureV3>(VUE_EFFICACITE_MESURES, subject); }

/** Exemple réservé aux visiteurs non connectés. */
const j = (jour: string, v: Partial<EfficaciteJourV3>): EfficaciteJourV3 => ({ subject_id: "studio-ardoise", jour, score_indexation: null, ecarts: null, google_pages_indexees: null, google_pages_inspectees: null, google_impressions_28j: null, google_clics_28j: null, google_position: null, bing_impressions_28j: null, bing_clics_28j: null, bing_pages_indexees: null, constats_resolus_cumules: null, ...v });
export const efficaciteDemo: EfficaciteJourV3[] = [
  j("2026-11-05", { score_indexation: 61, ecarts: 6, google_pages_indexees: 5, google_pages_inspectees: 10, bing_pages_indexees: 12, constats_resolus_cumules: 0 }),
  j("2026-11-08", { score_indexation: 66, ecarts: 5, google_pages_indexees: 6, google_pages_inspectees: 10, bing_pages_indexees: 13, google_impressions_28j: 310, google_clics_28j: 9, bing_impressions_28j: 80, bing_clics_28j: 2, constats_resolus_cumules: 1 }),
  j("2026-11-11", { score_indexation: 72, ecarts: 4, google_pages_indexees: 7, google_pages_inspectees: 10, bing_pages_indexees: 15, google_impressions_28j: 360, google_clics_28j: 11, bing_impressions_28j: 74, bing_clics_28j: 2, constats_resolus_cumules: 2 }),
  j("2026-11-14", { score_indexation: 78, ecarts: 3, google_pages_indexees: 8, google_pages_inspectees: 10, bing_pages_indexees: 15, google_impressions_28j: 420, google_clics_28j: 14, bing_impressions_28j: 70, bing_clics_28j: 1, constats_resolus_cumules: 3 }),
  j("2026-11-17", { score_indexation: 82, ecarts: 2, google_pages_indexees: 8, google_pages_inspectees: 10, bing_pages_indexees: 16, google_impressions_28j: 455, google_clics_28j: 15, bing_impressions_28j: 66, bing_clics_28j: 1, constats_resolus_cumules: 4 }),
];
export const mesuresDemo: EfficaciteMesureV3[] = [
  { id: "m-sep", subject_id: "studio-ardoise", realise_le: "2026-09-12T10:00:00Z", score: 14, moteurs: ["chatgpt", "claude"], citations_sans_nom: 2, reponses_sans_nom: 40, cout_reel_usd: 3.1, mensuelle: true, memes_questions_que: null },
  { id: "m-oct", subject_id: "studio-ardoise", realise_le: "2026-10-12T10:00:00Z", score: 19, moteurs: ["chatgpt", "claude", "gemini"], citations_sans_nom: 4, reponses_sans_nom: 60, cout_reel_usd: 4.4, mensuelle: true, memes_questions_que: null },
  { id: "m-nov", subject_id: "studio-ardoise", realise_le: "2026-11-12T10:00:00Z", score: 23, moteurs: ["chatgpt", "claude", "gemini"], citations_sans_nom: 6, reponses_sans_nom: 60, cout_reel_usd: 4.2, mensuelle: true, memes_questions_que: "m-oct" },
];

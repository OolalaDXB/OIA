import type { Json } from "@/integrations/supabase/types";
import type { ReseauVisibility } from "@/data/visibility";
import { lireVueVisibility, type LigneVisibility } from "./visibility-reel";
import { objet, tableau, texte } from "./visibility-pilotage";

export type ScoreV3 = LigneVisibility<"vis_score_v3">;
export type HistoriqueScoreV3 = LigneVisibility<"vis_score_historique_v3">;
export type AnalyseV3 = LigneVisibility<"vis_analyses_v3">;
export type ConstatV3 = LigneVisibility<"vis_constats_v3">;
export type DemandeV2 = LigneVisibility<"vis_demandes_v2">;
export type SeoCommandV1 = LigneVisibility<"vis_seo_command_v1">;
export type PlanificateurV1 = LigneVisibility<"vis_planificateur_v1">;
export type AuditExterneV3 = LigneVisibility<"vis_audits_externes_v3">;
export type AuditExterneLigneV3 = LigneVisibility<"vis_audit_externe_lignes_v3">;
export type EstimationAuditIaV3 = LigneVisibility<"vis_audit_ia_estimation_v3">;
export type AuditIaV3 = LigneVisibility<"vis_audits_ia_v3">;
export type DepotV3 = LigneVisibility<"vis_depots_v3">;
export type EstimationNoteContenuV3 = LigneVisibility<"vis_note_contenu_estimation_v3">;
export type NoteContenuV3 = LigneVisibility<"vis_notes_contenu_v3">;

export const VUES_VISIBILITY_V3 = ["vis_score_v3", "vis_score_historique_v3", "vis_analyses_v3", "vis_constats_v3"] as const;
export const VUES_AUDITS_VISIBILITY = ["vis_audits_externes_v3", "vis_audit_externe_lignes_v3"] as const;
export const VUES_AUDIT_IA_VISIBILITY = ["vis_audit_ia_estimation_v3", "vis_audits_ia_v3"] as const;
export const VUES_CONTENU_VISIBILITY = ["vis_depots_v3", "vis_note_contenu_estimation_v3", "vis_notes_contenu_v3"] as const;
export const VUES_SEO_VISIBILITY = ["vis_seo_command_v1", "vis_planificateur_v1"] as const;

export type DonneesVisibilityV3 = {
  scores: ScoreV3[];
  historique: HistoriqueScoreV3[];
  analyses: AnalyseV3[];
  constats: ConstatV3[];
  seo: SeoCommandV1[];
  planificateur: PlanificateurV1[];
  audits: AuditExterneV3[];
  auditLignes: AuditExterneLigneV3[];
  estimationsAuditIa: EstimationAuditIaV3[];
  auditsIa: AuditIaV3[];
  depots: DepotV3[];
  estimationsNotesContenu: EstimationNoteContenuV3[];
  notesContenu: NoteContenuV3[];
};

export async function lireVisibilityV3(): Promise<DonneesVisibilityV3> {
  const [scores, historique, analyses, constats, seo, planificateur, audits, auditLignes, estimationsAuditIa, auditsIa, depots, estimationsNotesContenu, notesContenu] = await Promise.all([
    lireVueVisibility("vis_score_v3"),
    lireVueVisibility("vis_score_historique_v3"),
    lireVueVisibility("vis_analyses_v3"),
    lireVueVisibility("vis_constats_v3"),
    lireVueVisibility("vis_seo_command_v1"),
    lireVueVisibility("vis_planificateur_v1"),
    lireVueVisibility("vis_audits_externes_v3"),
    lireVueVisibility("vis_audit_externe_lignes_v3"),
    lireVueVisibility("vis_audit_ia_estimation_v3"),
    lireVueVisibility("vis_audits_ia_v3"),
    lireVueVisibility("vis_depots_v3"),
    lireVueVisibility("vis_note_contenu_estimation_v3"),
    lireVueVisibility("vis_notes_contenu_v3"),
  ]);
  return { scores, historique, analyses, constats, seo, planificateur, audits, auditLignes, estimationsAuditIa, auditsIa, depots, estimationsNotesContenu, notesContenu };
}

export const COMPOSANTES_IA = [
  { id: "visibilite_ia", label: "Questions sans le nom", mesure: "ia" },
  { id: "notoriete_ia", label: "Questions avec le nom", mesure: "ia" },
] as const;
export const COMPOSANTES_SITE = [
  { id: "performance_mobile", label: "Performance mobile", mesure: "analyse" },
  { id: "seo_technique", label: "SEO technique", mesure: "analyse" },
  { id: "accessibilite", label: "Accessibilité", mesure: "analyse" },
  { id: "performance_ordinateur", label: "Performance ordinateur", mesure: "analyse" },
  { id: "bonnes_pratiques", label: "Bonnes pratiques", mesure: "analyse" },
] as const;
export const COMPOSANTES_SCORE = [...COMPOSANTES_IA, ...COMPOSANTES_SITE] as const;
export type ComposanteScore = (typeof COMPOSANTES_SCORE)[number]["id"];

export function valeurComposante(score: ScoreV3 | undefined, composante: ComposanteScore) {
  if (!score || score.manquantes?.includes(composante)) return null;
  const valeur = score[composante];
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

export function tonScore(score: number | null | undefined): "block" | "warn" | "ok" | "muted" {
  if (typeof score !== "number" || !Number.isFinite(score)) return "muted";
  if (score < 50) return "block";
  if (score < 80) return "warn";
  return "ok";
}

export function couleurScore(score: number | null | undefined) {
  return `var(--${tonScore(score)})`;
}

const ordreEffort: Record<string, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5 };
const ordreGravite: Record<string, number> = { critique: 1, important: 2, mineur: 3 };

/** Gravité d'abord, effort ensuite. L'ordre de la base sert de premier critère lorsqu'il existe. */
export function trierConstats(constats: ConstatV3[]) {
  return constats
    .map((constat, index) => ({ constat, index }))
    .sort((a, b) =>
      (a.constat.ordre ?? ordreGravite[a.constat.gravite ?? ""] ?? 99) - (b.constat.ordre ?? ordreGravite[b.constat.gravite ?? ""] ?? 99)
      || (ordreEffort[a.constat.effort ?? ""] ?? 99) - (ordreEffort[b.constat.effort ?? ""] ?? 99)
      || a.index - b.index,
    )
    .map(({ constat }) => constat);
}

export function actionsPrioritaires(constats: ConstatV3[], subject: string, limite = 3) {
  return trierConstats(constats.filter((c) => c.subject_id === subject && c.etat === "ouvert")).slice(0, limite);
}

export type RecommandationV2 = LigneVisibility<"vis_recommandations_v2">;
export type ActionPrioritaire = {
  id: string;
  titre: string;
  explication: string;
  impact: string | null;
  effort: string | null;
  origine: "Visibilité IA" | "Santé technique";
};
/** Les recommandations IA en attente priment, puis les constats techniques ouverts. */
export function actionsPrioritairesMixtes(recommandations: RecommandationV2[], constats: ConstatV3[], subject: string, limite = 3): ActionPrioritaire[] {
  const ia = recommandations
    .filter((r) => r.subject_id === subject && r.etat === "pending")
    .sort((a, b) => (a.priorite ?? 999) - (b.priorite ?? 999))
    .map((r): ActionPrioritaire => ({
      id: r.id ?? `recommandation-${r.priorite ?? 0}`,
      titre: r.titre ?? "Recommandation de visibilité IA",
      explication: r.enonce ?? "Recommandation en attente de décision.",
      impact: r.impact ?? null,
      effort: r.effort ?? null,
      origine: "Visibilité IA",
    }));
  const techniques = actionsPrioritaires(constats, subject).map((c): ActionPrioritaire => ({
    id: c.id ?? c.cle ?? "constat",
    titre: c.titre ?? "Constat technique",
    explication: c.explication ?? "Correction technique à examiner.",
    impact: c.impact ?? null,
    effort: c.effort ?? null,
    origine: "Santé technique",
  }));
  return [...ia, ...techniques].slice(0, limite);
}

export function variationScore(score: ScoreV3 | undefined, historique: HistoriqueScoreV3[]) {
  if (!score || typeof score.score !== "number" || !score.subject_id) return null;
  const points = historique
    .filter((p) => p.subject_id === score.subject_id && p.composante === "score" && typeof p.valeur === "number" && p.le)
    .sort((a, b) => (a.le ?? "").localeCompare(b.le ?? ""));
  if (!points.length) return null;
  const courantIndex = score.analyse_le ? points.filter((p) => (p.le ?? "") <= score.analyse_le!).length - 1 : points.length - 1;
  const index = courantIndex >= 0 ? courantIndex : points.length - 1;
  const precedent = index > 0 ? points[index - 1] : points.length > 1 ? points[points.length - 2] : undefined;
  if (!precedent || typeof precedent.valeur !== "number") return null;
  return Math.round((score.score - precedent.valeur) * 100) / 100;
}

export type PointHistorique = Record<string, string | number | null> & { jour: string };
export function historiqueParJour(historique: HistoriqueScoreV3[], subject: string): PointHistorique[] {
  const parJour = new Map<string, PointHistorique>();
  for (const point of historique.filter((p) => p.subject_id === subject && p.le && p.composante)) {
    const jour = point.le!.slice(0, 10);
    const ligne: PointHistorique = parJour.get(jour) ?? { jour };
    ligne[point.composante!] = typeof point.valeur === "number" ? point.valeur : null;
    ligne[`${point.composante!}_origine`] = point.origine ?? null;
    ligne[`${point.composante!}_reference`] = point.reference ?? null;
    parJour.set(jour, ligne);
  }
  return [...parJour.values()].sort((a, b) => String(a.jour).localeCompare(String(b.jour)));
}

function dateAnalyse(a: AnalyseV3) {
  return a.recu_le ?? "";
}

export function analyseRecente(analyses: AnalyseV3[], subject: string, nature: string, strategie?: string) {
  return analyses
    .filter((a) => a.subject_id === subject && a.nature === nature && (strategie === undefined || a.strategie === strategie))
    .sort((a, b) => dateAnalyse(b).localeCompare(dateAnalyse(a)))[0];
}

export function analyseReussie(analyses: AnalyseV3[], subject: string, nature: string, strategie?: string) {
  const candidates = analyses.filter((a) => a.subject_id === subject && a.nature === nature && a.statut === "fait" && (strategie === undefined || a.strategie === strategie));
  return candidates.find((a) => a.derniere) ?? candidates.sort((a, b) => dateAnalyse(b).localeCompare(dateAnalyse(a)))[0];
}

export function scoreLighthouse(analyse: AnalyseV3 | undefined, cle: "performance" | "accessibilite" | "bonnes_pratiques" | "seo") {
  const valeur = objet(analyse?.scores ?? null)[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 && valeur <= 1 ? Math.round(valeur * 100) : null;
}

export function metrique(analyse: AnalyseV3 | undefined, cle: string) {
  const valeur = objet(analyse?.metriques ?? null)[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

export type OpportuniteLighthouse = { id: string; titre: string; gainMs: number; gainKo: number | null };
export function opportunitesLighthouse(analyse: AnalyseV3 | undefined): OpportuniteLighthouse[] {
  return tableau<Json>(objet(analyse?.resultat ?? null)["opportunites"] ?? null)
    .map((brut, index) => {
      const o = objet(brut);
      const gainMs = typeof o["gain_ms"] === "number" ? o["gain_ms"] : 0;
      return {
        id: texte(o["id"], `opportunite-${index}`),
        titre: texte(o["titre"], "Opportunité sans titre"),
        gainMs,
        gainKo: typeof o["gain_ko"] === "number" ? o["gain_ko"] : null,
      };
    })
    .filter((o) => o.gainMs > 0 || (o.gainKo ?? 0) > 0)
    .sort((a, b) => b.gainMs - a.gainMs || (b.gainKo ?? 0) - (a.gainKo ?? 0));
}

export type NiveauSignal = "bon" | "a_ameliorer" | "mauvais";
export function niveauSignal(valeur: number | null, seuilBon: number, seuilMauvais: number): NiveauSignal | null {
  if (valeur === null) return null;
  if (valeur <= seuilBon) return "bon";
  if (valeur <= seuilMauvais) return "a_ameliorer";
  return "mauvais";
}

export function demandeAnalyseActive(demandes: DemandeV2[], subject: string) {
  return demandes
    .filter((d) => d.subject_id === subject && d.type === "ANALYSE" && (d.statut === "QUEUED" || d.statut === "RUNNING"))
    .sort((a, b) => (b.demande_le ?? "").localeCompare(a.demande_le ?? ""))[0];
}

export function documentationConstat(constat: ConstatV3) {
  const url = texte(objet(constat.preuve)["documentation"]);
  return /^https?:\/\//i.test(url) ? url : null;
}

function normaliserProfil(valeur: string) {
  return valeur.trim().toLocaleLowerCase("fr-FR")
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^@/, "").replace(/\/+$/, "");
}

export function profilDeLaMarque(profil: ReseauVisibility, marque: { sites: string[]; profils: { reseau: string; handle: string }[] }) {
  const cible = normaliserProfil(profil.handle);
  const finCible = cible.split("/").at(-1) ?? cible;
  const correspondProfil = marque.profils.some((p) => {
    if (p.reseau.toLocaleLowerCase("fr-FR") !== profil.reseau.toLocaleLowerCase("fr-FR")) return false;
    const connu = normaliserProfil(p.handle);
    return cible === connu || finCible === connu || finCible === connu.split("/").at(-1);
  });
  const correspondDomaine = marque.sites.some((site) => {
    const domaine = normaliserProfil(site);
    return Boolean(domaine) && cible.includes(domaine);
  });
  return correspondProfil || correspondDomaine;
}

export function separerProfils<T extends ReseauVisibility>(profils: T[], marque: { sites: string[]; profils: { reseau: string; handle: string }[] }) {
  return {
    marque: profils.filter((p) => profilDeLaMarque(p, marque)),
    autres: profils.filter((p) => !profilDeLaMarque(p, marque)),
  };
}

export function groupesReseaux<T extends ReseauVisibility>(profils: T[]) {
  const groupes = new Map<string, T[]>();
  for (const profil of profils) groupes.set(profil.reseau, [...(groupes.get(profil.reseau) ?? []), profil]);
  return [...groupes.entries()]
    .map(([reseau, lignes]) => ({ reseau, profils: lignes.sort((a, b) => b.citations - a.citations).slice(0, 5), total: lignes.length }))
    .sort((a, b) => a.reseau.localeCompare(b.reseau, "fr"));
}

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;

/** Données uniquement destinées aux visiteurs non connectés, signalées par le Shell. */
export const donneesDemoVisibilityV3: DonneesVisibilityV3 = {
  scores: [ligne<ScoreV3>({
    subject_id: "studio-ardoise", client_id: "studio", score: 19, score_site: 97, visibilite_ia: 0, notoriete_ia: 64,
    performance_mobile: 88, performance_ordinateur: 100, seo_technique: 100, accessibilite: 100,
    bonnes_pratiques: 100, manquantes: [], analyse_le: "2026-11-16T10:00:00Z", fenetre_ia: "f3",
    constats_ouverts: 4, constats_critiques: 1, constats_resolus: 2,
  })],
  historique: [
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-09T10:00:00Z", composante: "score", valeur: 13, origine: "analyse", reference: "a1" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-09T10:00:00Z", composante: "performance_mobile", valeur: 76, origine: "analyse", reference: "a1" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-16T10:00:00Z", composante: "score", valeur: 19, origine: "analyse", reference: "a2" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-16T10:00:00Z", composante: "performance_mobile", valeur: 88, origine: "analyse", reference: "a2" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-09T10:00:00Z", composante: "score_site", valeur: 94, origine: "analyse", reference: "a1" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-16T10:00:00Z", composante: "score_site", valeur: 97, origine: "analyse", reference: "a2" }),
  ],
  analyses: [
    ligne<AnalyseV3>({ id: "lh-mobile", subject_id: "studio-ardoise", nature: "lighthouse", strategie: "mobile", statut: "fait", derniere: true, recu_le: "2026-11-16T10:00:00Z", outil: "Lighthouse 12.6.0", url: "https://studio-ardoise.fr", scores: { performance: 0.88, accessibilite: 1, bonnes_pratiques: 1, seo: 1 }, metriques: { lcp_ms: 2300, fcp_ms: 1400, cls: 0.06, tbt_ms: 180, si_ms: 2500, ttfb_ms: 420, poids_ko: 1450, requetes: 58 }, resultat: { opportunites: [{ id: "images", titre: "Différer les images hors écran", gain_ms: 450, gain_ko: 280 }, { id: "js", titre: "Réduire le JavaScript inutilisé", gain_ms: 220, gain_ko: 90 }] } }),
    ligne<AnalyseV3>({ id: "lh-desktop", subject_id: "studio-ardoise", nature: "lighthouse", strategie: "ordinateur", statut: "fait", derniere: true, recu_le: "2026-11-16T10:00:00Z", outil: "Lighthouse 12.6.0", url: "https://studio-ardoise.fr", scores: { performance: 1, accessibilite: 1, bonnes_pratiques: 1, seo: 1 }, metriques: { lcp_ms: 900, fcp_ms: 600, cls: 0.01, tbt_ms: 40, si_ms: 1100, ttfb_ms: 180, poids_ko: 1320, requetes: 52 }, resultat: { opportunites: [] } }),
    ligne<AnalyseV3>({ id: "crawl", subject_id: "studio-ardoise", nature: "crawl", strategie: null, statut: "fait", derniere: true, recu_le: "2026-11-16T10:02:00Z", outil: "Crawlie", url: "https://studio-ardoise.fr", scores: { sante: 0.82, geo: 0.74 }, metriques: { pages: 50, indexables: 47 }, resultat: { robots: "Présent", donnees_structurees: "LocalBusiness détecté", prix_sans_js: "3 pages sans prix lisible", regles: [] } }),
  ],
  constats: [
    ligne<ConstatV3>({ id: "c1", cle: "crawl:noindex", subject_id: "studio-ardoise", source: "crawl", categorie: "seo", gravite: "critique", ordre: 1, titre: "Une page importante est en noindex", explication: "Google ne peut pas intégrer cette page à ses résultats.", correction: "Retirez la directive noindex de la page des stages, puis demandez une nouvelle indexation.", impact: "Page à nouveau éligible à l'indexation", effort: "XS", qui: "client", valeur: "1 page", preuve: { documentation: "https://developers.google.com/search/docs/crawling-indexing/block-indexed" }, etat: "ouvert", premiere_fois: "2026-11-16T10:02:00Z", derniere_fois: "2026-11-16T10:02:00Z" }),
    ligne<ConstatV3>({ id: "c2", cle: "lighthouse:images:mobile", subject_id: "studio-ardoise", source: "lighthouse", categorie: "performance", gravite: "important", ordre: 2, titre: "Les images ralentissent le premier affichage mobile", explication: "Le contenu principal attend des images qui ne sont pas encore visibles.", correction: "Différez leur chargement et réservez leurs dimensions.", impact: "0,45 s", effort: "S", qui: "equipe", valeur: "2,3 s", preuve: { documentation: "https://web.dev/articles/offscreen-images" }, etat: "ouvert", premiere_fois: "2026-11-16T10:00:00Z", derniere_fois: "2026-11-16T10:00:00Z" }),
    ligne<ConstatV3>({ id: "c3", cle: "crawl:prix", subject_id: "studio-ardoise", source: "crawl", categorie: "contenu", gravite: "mineur", ordre: 3, titre: "Les prix sont absents sur trois pages", explication: "Les visiteurs et les assistants ne peuvent pas comparer les formules.", correction: "Affichez les prix dans le HTML, sans attendre JavaScript.", impact: null, effort: "M", qui: "client", valeur: "3 pages", preuve: {}, etat: "ouvert", premiere_fois: "2026-11-16T10:02:00Z", derniere_fois: "2026-11-16T10:02:00Z" }),
    ligne<ConstatV3>({ id: "c4", cle: "lighthouse:cls", subject_id: "studio-ardoise", source: "lighthouse", categorie: "performance", gravite: "mineur", ordre: 3, titre: "Le bandeau déplaçait le contenu", explication: "Ce déplacement a disparu à la dernière analyse.", correction: "Conservez les dimensions réservées du bandeau.", impact: null, effort: "S", qui: "equipe", valeur: "0", preuve: {}, etat: "resolu", premiere_fois: "2026-11-09T10:00:00Z", derniere_fois: "2026-11-09T10:00:00Z" }),
  ],
  seo: [],
  planificateur: [],
  audits: [],
  auditLignes: [],
  estimationsAuditIa: [ligne<EstimationAuditIaV3>({
    subject_id: "studio-ardoise", client_id: "studio", langues: ["fr"], questions: 20, appels: 120,
    moteurs: [
      { moteur: "ChatGPT", cible: "chatgpt.com", appels: 20, max_usd: 2.4, habituel_usd: 0.7 },
      { moteur: "Claude", cible: "claude.ai", appels: 20, max_usd: 2.4, habituel_usd: 0.7 },
      { moteur: "Gemini", cible: "gemini.google.com", appels: 20, max_usd: 2.4, habituel_usd: 0.7 },
      { moteur: "Perplexity", cible: "perplexity.ai", appels: 20, max_usd: 2.4, habituel_usd: 0.7 },
      { moteur: "Grok", cible: "grok.com", appels: 20, max_usd: 2.4, habituel_usd: 0.7 },
      { moteur: "Mistral", cible: "chat.mistral.ai", appels: 20, max_usd: 1.56, habituel_usd: 0.35 },
    ],
    cout_max_usd: 13.56, cout_habituel_usd: 3.85, plafond_usd: 30, reel_usd: 0, engage_usd: 0,
    plafond_global_usd: 100, etat: "ok",
  })],
  auditsIa: [],
  depots: [ligne<DepotV3>({ subject_id: "studio-ardoise", client_id: "studio", depot: "oolala/studio-ardoise", branche: "main", par: "Démonstration", le: "2026-11-16T09:00:00Z" })],
  estimationsNotesContenu: [ligne<EstimationNoteContenuV3>({ subject_id: "studio-ardoise", client_id: "studio", depot: "oolala/studio-ardoise", branche: "main", cout_max_usd: 0.2, cout_habituel_usd: 0.03, plafond_usd: 30, reel_usd: 4, engage_usd: 2, plafond_global_usd: 100, etat: "ok" })],
  notesContenu: [ligne<NoteContenuV3>({
    id: "note-demo", subject_id: "studio-ardoise", client_id: "studio", demande_id: "demande-demo", depot: "oolala/studio-ardoise",
    cout_max_usd: 0.2, cout_vu_usd: 0.2, cout_reel_usd: 0.03, par: "Démonstration", le: "2026-11-16T10:10:00Z", terminee_le: "2026-11-16T10:12:00Z",
    statut: "DONE", note_technique: 82, note_fonctionnelle: 68, note_commerciale: null, derniere: true,
    criteres: [
      { id: "t1", axe: "technique", titre: "Titres hiérarchisés", points: 10, ok: true, valeur: "Une balise H1", source: "html", preuve: { pages: ["https://studio-ardoise.fr/stages"] } },
      { id: "f1", axe: "fonctionnel", titre: "Formulaire utilisable", points: 10, ok: false, valeur: "Un libellé manquant", source: "depot", preuve: { fichiers: ["src/Formulaire.tsx"] } },
      { id: "c1", axe: "commercial", titre: "Promesse commerciale citée", points: 10, ok: null, valeur: "Citation absente", source: "modele", preuve: {} },
    ],
    synthese: "La structure technique est lisible. Le parcours et la promesse commerciale demandent une revue ciblée.",
    depot_lu: { depot: "oolala/studio-ardoise", sha: "a1b2c3d4e5f6", branche: "main", fichiers: 18, sensibles: 0 },
  })],
};

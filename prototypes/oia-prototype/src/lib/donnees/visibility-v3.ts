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

export const VUES_VISIBILITY_V3 = ["vis_score_v3", "vis_score_historique_v3", "vis_analyses_v3", "vis_constats_v3"] as const;
export const VUES_SEO_VISIBILITY = ["vis_seo_command_v1", "vis_planificateur_v1"] as const;

export type DonneesVisibilityV3 = {
  scores: ScoreV3[];
  historique: HistoriqueScoreV3[];
  analyses: AnalyseV3[];
  constats: ConstatV3[];
  seo: SeoCommandV1[];
  planificateur: PlanificateurV1[];
};

export async function lireVisibilityV3(): Promise<DonneesVisibilityV3> {
  const [scores, historique, analyses, constats, seo, planificateur] = await Promise.all([
    lireVueVisibility("vis_score_v3"),
    lireVueVisibility("vis_score_historique_v3"),
    lireVueVisibility("vis_analyses_v3"),
    lireVueVisibility("vis_constats_v3"),
    lireVueVisibility("vis_seo_command_v1"),
    lireVueVisibility("vis_planificateur_v1"),
  ]);
  return { scores, historique, analyses, constats, seo, planificateur };
}

export const COMPOSANTES_SCORE = [
  { id: "visibilite_ia", label: "Visibilité IA", poids: 35, mesure: "ia" },
  { id: "seo_technique", label: "SEO technique", poids: 15, mesure: "analyse" },
  { id: "performance_mobile", label: "Performance mobile", poids: 15, mesure: "analyse" },
  { id: "notoriete_ia", label: "Notoriété IA", poids: 15, mesure: "ia" },
  { id: "accessibilite", label: "Accessibilité", poids: 10, mesure: "analyse" },
  { id: "performance_ordinateur", label: "Performance ordinateur", poids: 5, mesure: "analyse" },
  { id: "bonnes_pratiques", label: "Bonnes pratiques", poids: 5, mesure: "analyse" },
] as const;
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
    subject_id: "studio-ardoise", client_id: "studio", score: 68, visibilite_ia: 15, notoriete_ia: 64,
    performance_mobile: 88, performance_ordinateur: 100, seo_technique: 100, accessibilite: 100,
    bonnes_pratiques: 100, manquantes: [], analyse_le: "2026-11-16T10:00:00Z", fenetre_ia: "f3",
    constats_ouverts: 4, constats_critiques: 1, constats_resolus: 2,
  })],
  historique: [
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-09T10:00:00Z", composante: "score", valeur: 61, origine: "analyse", reference: "a1" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-09T10:00:00Z", composante: "performance_mobile", valeur: 76, origine: "analyse", reference: "a1" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-16T10:00:00Z", composante: "score", valeur: 68, origine: "analyse", reference: "a2" }),
    ligne<HistoriqueScoreV3>({ subject_id: "studio-ardoise", le: "2026-11-16T10:00:00Z", composante: "performance_mobile", valeur: 88, origine: "analyse", reference: "a2" }),
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
};

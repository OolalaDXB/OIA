import type { Json } from "@/integrations/supabase/types";
import { lireVueVisibilityBrute } from "./visibility-reel";
import { objet, tableau, texte } from "./visibility-pilotage";
import type { DemandeV2 } from "./visibility-v3";

export const VUE_HYGIENE = "vis_hygiene_v3";
export const DELAI_SUIVI_HYGIENE = 30_000;

export type HygieneV3 = {
  subject_id: string;
  analyse_id: string | null;
  url: string | null;
  recu_le: string | null;
  scores: Json;
  metriques: Json;
  ecarts_ouverts: number | null;
  /** Lecture Google Search Console (migration 0019), absente des anciennes lignes. */
  gsc?: Json;
};

export type ControleHygiene = {
  id: string;
  titre: string;
  ok: boolean | null;
  valeur: string | null;
  gravite: string | null;
  preuve: Json;
};
export type FeedBing = { url: string; statut: string | null; dernierPassage: string | null; adresses: number | null };
export type RequeteBing = { requete: string; impressions: number | null; clics: number | null; position: number | null };
export type ProblemesBing = { total: number | null; exemples: string[] };
export type BingHygiene = {
  present: boolean;
  site: string | null;
  verifie: boolean | null;
  erreur: string | null;
  feeds: FeedBing[];
  problemes: ProblemesBing;
  exploration: Record<string, Json | undefined>;
  requetes: RequeteBing[];
};
export type SitemapGoogle = { url: string; envoye: string | null; lu: string | null; erreurs: number | null; avertissements: number | null; soumises: number | null; indexees: number | null };
export type InspectionGoogle = { url: string; indexee: boolean | null; verdict: string | null; couverture: string | null; dernierPassage: string | null; canoniqueGoogle: string | null; canoniqueSite: string | null; autreAdresse: boolean };
export type GoogleHygiene = {
  present: boolean;
  erreur: string | null;
  propriete: string | null;
  autorisation: string | null;
  /** Lu sans erreur mais aucune propriété Search Console ne couvre le site. */
  proprieteIntrouvable: boolean;
  sitemaps: SitemapGoogle[];
  inspection: InspectionGoogle[];
  requetes: RequeteBing[];
};
export type ActionHygiene = { action: string; cible: string | null; resultat: string | null };

const nombre = (valeur: Json | undefined) => typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
const chaine = (valeur: Json | undefined) => typeof valeur === "string" ? valeur : typeof valeur === "number" || typeof valeur === "boolean" ? String(valeur) : null;

export function lireHygieneVisibility(subject: string) {
  return lireVueVisibilityBrute<HygieneV3>(VUE_HYGIENE, subject);
}

export function scoreIndexation(hygiene: HygieneV3 | null | undefined) {
  const score = nombre(objet(hygiene?.scores ?? null)["indexation"]);
  return score === null || score < 0 || score > 1 ? null : Math.round(score * 100);
}

export function controlesHygiene(hygiene: HygieneV3 | null | undefined): ControleHygiene[] {
  const metriques = objet(hygiene?.metriques ?? null);
  return tableau<Json>(metriques["controles"] ?? null).map((brut, index) => {
    const controle = objet(brut);
    return {
      id: texte(controle["id"], `controle-${index}`),
      titre: texte(controle["titre"], "Contrôle sans titre"),
      ok: typeof controle["ok"] === "boolean" ? controle["ok"] : null,
      valeur: chaine(controle["valeur"]),
      gravite: texte(controle["gravite"]) || null,
      preuve: controle["preuve"] ?? null,
    };
  });
}

const gravites: Record<string, number> = { critique: 0, important: 1, mineur: 2 };
/** Les échecs mesurés priment, puis les contrôles non mesurés, puis les conformités. */
export function trierControlesHygiene(controles: ControleHygiene[]) {
  return controles
    .map((controle, index) => ({ controle, index }))
    .sort((a, b) => {
      const etatA = a.controle.ok === false ? 0 : a.controle.ok === null ? 1 : 2;
      const etatB = b.controle.ok === false ? 0 : b.controle.ok === null ? 1 : 2;
      return etatA - etatB
        || (gravites[a.controle.gravite ?? ""] ?? 9) - (gravites[b.controle.gravite ?? ""] ?? 9)
        || a.index - b.index;
    })
    .map(({ controle }) => controle);
}

export function bingHygiene(hygiene: HygieneV3 | null | undefined): BingHygiene {
  const metriques = objet(hygiene?.metriques ?? null);
  const brut = metriques["bing"];
  const bing = objet(brut ?? null);
  const problemes = objet(bing["problemes"] ?? null);
  const exemples = tableau<Json>(problemes["exemples"] ?? null).map((exemple) => {
    if (typeof exemple === "string") return exemple;
    const detail = objet(exemple);
    return [texte(detail["titre"]), texte(detail["url"]), texte(detail["message"]), texte(detail["detail"])].filter(Boolean).join(" · ");
  }).filter(Boolean);
  return {
    present: brut !== null && brut !== undefined,
    site: texte(bing["site"]) || null,
    verifie: typeof bing["verifie"] === "boolean" ? bing["verifie"] : null,
    erreur: texte(bing["erreur"]) || null,
    feeds: tableau<Json>(bing["feeds"] ?? null).map((brutFeed) => {
      const feed = objet(brutFeed);
      return { url: texte(feed["url"], "Sitemap sans adresse"), statut: texte(feed["statut"]) || null, dernierPassage: texte(feed["dernier_passage"]) || null, adresses: nombre(feed["adresses"]) };
    }),
    problemes: { total: nombre(problemes["total"]) ?? nombre(metriques["bing_problemes"]), exemples },
    exploration: objet(bing["exploration"] ?? null),
    requetes: tableau<Json>(bing["requetes"] ?? null).map((brutRequete) => {
      const requete = objet(brutRequete);
      return { requete: texte(requete["requete"], "Requête sans libellé"), impressions: nombre(requete["impressions"]), clics: nombre(requete["clics"]), position: nombre(requete["position"]) };
    }).sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1)),
  };
}

const normaliserAdresse = (adresse: string) => adresse.trim().replace(/\/+$/, "").toLowerCase();
export function googleHygiene(hygiene: HygieneV3 | null | undefined): GoogleHygiene {
  const brut = hygiene?.gsc;
  const gsc = objet(brut ?? null);
  const erreur = texte(gsc["erreur"]) || null;
  const propriete = texte(gsc["propriete"]) || null;
  return {
    present: brut !== null && brut !== undefined,
    erreur,
    propriete,
    autorisation: chaine(gsc["autorisation"]),
    proprieteIntrouvable: brut !== null && brut !== undefined && !erreur && !propriete,
    sitemaps: tableau<Json>(gsc["sitemaps"] ?? null).map((b) => {
      const s = objet(b);
      return { url: texte(s["url"], "Sitemap sans adresse"), envoye: texte(s["envoye"]) || null, lu: texte(s["lu"]) || null, erreurs: nombre(s["erreurs"]), avertissements: nombre(s["avertissements"]), soumises: nombre(s["soumises"]), indexees: nombre(s["indexees"]) };
    }),
    inspection: tableau<Json>(gsc["inspection"] ?? null).map((b) => {
      const i = objet(b);
      const verdict = texte(i["verdict"]) || null;
      const canoniqueGoogle = texte(i["canonique_google"]) || null;
      const canoniqueSite = texte(i["canonique_site"]) || null;
      return {
        url: texte(i["url"], "Page sans adresse"), verdict,
        indexee: verdict === null ? null : verdict.toUpperCase() === "PASS",
        couverture: texte(i["couverture"]) || null, dernierPassage: texte(i["dernier_passage"]) || null,
        canoniqueGoogle, canoniqueSite,
        autreAdresse: Boolean(canoniqueGoogle && canoniqueSite && normaliserAdresse(canoniqueGoogle) !== normaliserAdresse(canoniqueSite)),
      };
    }),
    requetes: tableau<Json>(gsc["requetes"] ?? null).map((b) => {
      const r = objet(b);
      return { requete: texte(r["requete"], "Requête sans libellé"), impressions: nombre(r["impressions"]), clics: nombre(r["clics"]), position: nombre(r["position"]) };
    }).sort((a, b) => (b.impressions ?? -1) - (a.impressions ?? -1)),
  };
}

/** Les actions mentionnant Google vont dans la carte Google, les autres dans la carte Bing. */
export const actionGoogle = (action: ActionHygiene) => /google/i.test(`${action.action} ${action.resultat ?? ""}`);

export function actionsHygiene(hygiene: HygieneV3 | null | undefined): ActionHygiene[] {
  const metriques = objet(hygiene?.metriques ?? null);
  return tableau<Json>(metriques["actions"] ?? null).map((brut) => {
    const action = objet(brut);
    return { action: texte(action["action"], "Action sans libellé"), cible: texte(action["cible"]) || null, resultat: texte(action["resultat"]) || null };
  });
}

const etiquettesExploration: Record<string, string> = {
  pages_explorees: "Pages explorées", pages_indexees: "Pages indexées", crawled_pages: "Pages explorées", in_index: "Pages indexées",
  in_links: "Pages avec liens entrants", code_2xx: "Réponses 2xx", code_4xx: "Réponses 4xx", code_5xx: "Réponses 5xx",
  dernier_releve: "Dernier relevé", date: "Dernier relevé",
};
export function explorationBing(bing: BingHygiene) {
  return Object.entries(bing.exploration).flatMap(([cle, valeur]) => {
    const affichee = chaine(valeur);
    if (affichee === null) return [];
    const label = etiquettesExploration[cle] ?? cle.replaceAll("_", " ").replace(/^./, (c) => c.toLocaleUpperCase("fr-FR"));
    return [{ cle, label, valeur: affichee }];
  });
}

export function demandeHygieneActive(demandes: DemandeV2[], subject: string) {
  return demandes
    .filter((d) => d.subject_id === subject && d.type === "HYGIENE" && (d.statut === "QUEUED" || d.statut === "RUNNING"))
    .sort((a, b) => (b.demande_le ?? "").localeCompare(a.demande_le ?? ""))[0];
}
export const delaiSuiviHygiene = (active: DemandeV2 | undefined) => active ? DELAI_SUIVI_HYGIENE : false;

/** Exemple réservé aux visiteurs non connectés, signalé par le Shell. */
export const hygieneDemo: HygieneV3 = {
  subject_id: "studio-ardoise",
  analyse_id: "hygiene-demo",
  url: "https://studio-ardoise.fr",
  recu_le: "2026-11-17T09:30:00Z",
  scores: { indexation: 0.82 },
  ecarts_ouverts: 2,
  metriques: {
    ecarts: 2,
    adresses_sitemap: 47,
    bing_problemes: 1,
    controles: [
      { id: "sitemap", titre: "Sitemap déclaré et lisible", ok: true, valeur: "47 adresses", gravite: "mineur", preuve: { pages: ["https://studio-ardoise.fr/sitemap.xml"] } },
      { id: "noindex", titre: "Page des stages indexable", ok: false, valeur: "Directive noindex", gravite: "critique", preuve: { pages: ["https://studio-ardoise.fr/stages"] } },
      { id: "canonical", titre: "Adresses canoniques cohérentes", ok: null, valeur: "Contrôle non mesuré", gravite: "important", preuve: {} },
    ],
    bing: {
      site: "https://studio-ardoise.fr",
      verifie: true,
      feeds: [{ url: "https://studio-ardoise.fr/sitemap.xml", statut: "SUCCESS", dernier_passage: "2026-11-17T08:00:00Z", adresses: 47 }],
      problemes: { total: 1, exemples: ["https://studio-ardoise.fr/stages · directive noindex"] },
      exploration: { pages_explorees: 52, pages_indexees: 44, code_4xx: 1, dernier_releve: "2026-11-17" },
      requetes: [
        { requete: "cours poterie vannes", impressions: 184, clics: 12, position: 8.4 },
        { requete: "studio ardoise", impressions: 96, clics: 31, position: 1.2 },
      ],
    },
    actions: [
      { action: "Sitemap soumis à Bing", cible: "https://studio-ardoise.fr/sitemap.xml", resultat: "Sitemap soumis à Bing le 17 nov." },
      { action: "Sitemap soumis à Google", cible: "https://studio-ardoise.fr/sitemap.xml", resultat: "Sitemap soumis à Google le 17 nov." },
    ],
  },
  gsc: {
    propriete: "sc-domain:studio-ardoise.fr",
    autorisation: "Compte de service, lecture complète",
    sitemaps: [{ url: "https://studio-ardoise.fr/sitemap.xml", envoye: "2026-11-17T08:05:00Z", lu: "2026-11-17T09:00:00Z", erreurs: 0, avertissements: 0, soumises: 47, indexees: 39 }],
    inspection: [
      { url: "https://studio-ardoise.fr/", verdict: "PASS", couverture: "Envoyée et indexée", dernier_passage: "2026-11-16T22:10:00Z", canonique_google: "https://studio-ardoise.fr/", canonique_site: "https://studio-ardoise.fr/" },
      { url: "https://studio-ardoise.fr/stages", verdict: "NEUTRAL", couverture: "Exclue par la balise noindex", dernier_passage: "2026-11-15T10:00:00Z", canonique_google: null, canonique_site: "https://studio-ardoise.fr/stages" },
      { url: "https://studio-ardoise.fr/cours?ref=a", verdict: "PASS", couverture: "Envoyée et indexée", dernier_passage: "2026-11-14T10:00:00Z", canonique_google: "https://studio-ardoise.fr/cours-poterie", canonique_site: "https://studio-ardoise.fr/cours" },
    ],
    requetes: [
      { requete: "poterie vannes", impressions: 412, clics: 18, position: 6.9 },
      { requete: "studio ardoise", impressions: 230, clics: 88, position: 1.1 },
    ],
  },
};

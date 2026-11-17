/**
 * Bing Webmaster Tools par son API JSON (gratuite). Bing alimente la recherche de ChatGPT et
 * Copilot : y être vérifié, avec un sitemap soumis et sans erreur d'exploration, compte pour la
 * visibilité dans les IA.
 *
 * Clé : BING_WEBMASTER_API_KEY (secret du dépôt OIA ; Bing Webmaster › Paramètres › Accès API).
 * L'API veut la clé en paramètre d'adresse : l'adresse n'est donc JAMAIS écrite dans un message
 * d'erreur ni dans un journal, et la clé est masquée partout où un texte de Bing est repris.
 *
 * Lecture : sites, sitemaps (feeds), problèmes d'exploration, statistiques d'exploration et de
 * requêtes. Seule écriture : soumettre le sitemap s'il ne l'est pas (sans risque, idempotente).
 */
import type { Controle } from "./controles.js";

export type BingFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export interface BingSite {
  Url: string;
  IsVerified?: boolean;
}
export interface BingFeed {
  Url: string;
  Status?: string;
  LastCrawled?: string;
  UrlCount?: number;
  Submitted?: string;
}

/** « /Date(1731801600000-0800)/ » → ISO ; autre forme rendue telle quelle. */
export function dateBing(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /\/Date\((-?\d+)/.exec(v);
  return m ? new Date(Number(m[1])).toISOString() : v;
}

export function createBingClient(apiKey: string, f: BingFetch = globalThis.fetch as unknown as BingFetch) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(apiKey)) throw new Error("clé Bing Webmaster refusée (format)");
  const masque = (s: string) => s.split(apiKey).join("***");
  async function appel<T>(methode: string, params: Record<string, string> = {}, corps?: Record<string, unknown>): Promise<T> {
    const q = new URLSearchParams({ ...params, apikey: apiKey });
    const res = await f(`${BASE}/${methode}?${q.toString()}`, corps
      ? { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(corps) }
      : { method: "GET" });
    const texte = await res.text();
    if (!res.ok) {
      let m = `Bing ${methode} : HTTP ${res.status}`;
      try {
        const e = JSON.parse(texte) as { Message?: string; ErrorCode?: number };
        if (e.Message) m += ` (${masque(e.Message).slice(0, 160)})`;
      } catch {
        /* corps illisible */
      }
      throw new Error(m);
    }
    if (!texte.trim()) return null as T;
    const j = JSON.parse(texte) as { d?: T };
    return (j && typeof j === "object" && "d" in j ? j.d : j) as T;
  }
  return {
    sites: () => appel<BingSite[]>("GetUserSites"),
    feeds: (siteUrl: string) => appel<BingFeed[]>("GetFeeds", { siteUrl }),
    soumettreFeed: (siteUrl: string, feedUrl: string) => appel<null>("SubmitFeed", {}, { siteUrl, feedUrl }),
    problemes: (siteUrl: string) => appel<{ Url: string; Issues?: number; HttpCode?: number }[]>("GetCrawlIssues", { siteUrl }),
    exploration: (siteUrl: string) => appel<Record<string, unknown>[]>("GetCrawlStats", { siteUrl }),
    requetes: (siteUrl: string) => appel<{ Query: string; Impressions?: number; Clicks?: number; AvgImpressionPosition?: number }[]>("GetQueryStats", { siteUrl }),
  };
}
export type BingClient = ReturnType<typeof createBingClient>;

const hote = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

export interface ResultatBing {
  site: string | null;
  verifie: boolean;
  feeds: { url: string; statut: string | null; dernier_passage: string | null; adresses: number | null }[];
  problemes: { total: number; exemples: { url: string; http: number | null }[] };
  exploration: Record<string, unknown> | null;
  requetes: { requete: string; impressions: number; clics: number; position: number | null }[];
  actions: { action: string; cible: string; resultat: string }[];
  controles: Controle[];
}

/**
 * Bilan Bing d'un site, et soumission du sitemap s'il manque. Une erreur d'un appel n'arrête pas
 * les autres : elle devient un contrôle « non mesuré » avec sa raison.
 */
export async function bilanBing(client: BingClient, site: string, sitemapUrl: string | null): Promise<ResultatBing> {
  const r: ResultatBing = { site: null, verifie: false, feeds: [], problemes: { total: 0, exemples: [] }, exploration: null, requetes: [], actions: [], controles: [] };
  const sites = await client.sites();
  const trouve = (sites ?? []).find((s) => hote(s.Url) === hote(site));
  r.site = trouve?.Url ?? null;
  r.verifie = !!trouve?.IsVerified;
  r.controles.push({
    id: "bing-verifie", titre: "Site vérifié dans Bing Webmaster Tools", categorie: "visibilite_ia", points: 4, ok: r.verifie,
    valeur: !trouve ? "absent du compte Bing" : r.verifie ? "vérifié" : "ajouté mais non vérifié", preuve: { site: r.site },
    gravite: "critique", effort: "S",
    explication: "Bing alimente la recherche de ChatGPT et Copilot. Sans site vérifié, pas de suivi de l'indexation ni de soumission de sitemap.",
    correction: "Bing Webmaster Tools › Ajouter un site (ou Importer depuis Google Search Console), puis vérifier (fichier, balise ou DNS).",
  });
  if (!trouve || !r.verifie) return r;
  const siteUrl = trouve.Url;

  try {
    const feeds = (await client.feeds(siteUrl)) ?? [];
    r.feeds = feeds.map((x) => ({ url: x.Url, statut: x.Status ?? null, dernier_passage: dateBing(x.LastCrawled), adresses: typeof x.UrlCount === "number" ? x.UrlCount : null }));
    const soumis = sitemapUrl ? feeds.some((x) => x.Url.replace(/\/$/, "") === sitemapUrl.replace(/\/$/, "")) : feeds.length > 0;
    if (!soumis && sitemapUrl) {
      try {
        await client.soumettreFeed(siteUrl, sitemapUrl);
        r.actions.push({ action: "sitemap soumis à Bing", cible: sitemapUrl, resultat: "fait" });
      } catch (err) {
        r.actions.push({ action: "sitemap soumis à Bing", cible: sitemapUrl, resultat: `échec : ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    const enEchec = r.feeds.filter((x) => x.statut && !/success|ok|processed|réussi/i.test(x.statut));
    r.controles.push({
      id: "bing-sitemap", titre: "Sitemap soumis à Bing et lu sans erreur", categorie: "seo", points: 2,
      ok: (soumis || r.actions.some((a) => a.resultat === "fait")) && enEchec.length === 0,
      valeur: soumis ? (enEchec.length ? `en erreur : ${enEchec.map((x) => `${x.url} (${x.statut})`).join(", ")}` : "soumis") : r.actions.some((a) => a.resultat === "fait") ? "soumis aujourd'hui par OIA" : "non soumis",
      preuve: { feeds: r.feeds.slice(0, 5) }, gravite: "important", effort: "XS",
      explication: "Un sitemap soumis dit à Bing quelles pages explorer, et son état montre s'il a pu le lire.",
      correction: "Bing Webmaster Tools › Sitemaps : corriger le sitemap en erreur (format, adresses en 200) puis le soumettre à nouveau.",
    });
  } catch (err) {
    r.controles.push({ id: "bing-sitemap", titre: "Sitemap soumis à Bing et lu sans erreur", categorie: "seo", points: 2, ok: null, valeur: `non mesuré : ${err instanceof Error ? err.message : String(err)}`, preuve: {}, gravite: "important", effort: "XS", explication: "Lecture des sitemaps de Bing impossible.", correction: "Vérifier la clé d'API Bing Webmaster." });
  }

  try {
    const p = (await client.problemes(siteUrl)) ?? [];
    r.problemes = { total: p.length, exemples: p.slice(0, 8).map((x) => ({ url: x.Url, http: typeof x.HttpCode === "number" ? x.HttpCode : null })) };
    r.controles.push({
      id: "bing-exploration", titre: "Aucun problème d'exploration chez Bing", categorie: "technique", points: 2, ok: p.length === 0,
      valeur: `${p.length} adresse(s) en problème`, preuve: { exemples: r.problemes.exemples }, gravite: p.length > 10 ? "important" : "mineur", effort: "S",
      explication: "Les problèmes d'exploration (erreurs, redirections en boucle, pages bloquées) empêchent Bing de lire et de citer ces pages.",
      correction: "Bing Webmaster Tools › Exploration : corriger chaque adresse (redirection 301, page rétablie ou retirée du sitemap).",
    });
  } catch {
    /* non bloquant : l'API ne rend pas ce rapport pour tous les sites */
  }
  try {
    const s = (await client.exploration(siteUrl)) ?? [];
    const dernier = s[s.length - 1];
    if (dernier) r.exploration = Object.fromEntries(Object.entries(dernier).map(([k, v]) => [k, k === "Date" ? dateBing(v) : v]));
  } catch {
    /* non bloquant */
  }
  try {
    const q = (await client.requetes(siteUrl)) ?? [];
    r.requetes = q
      .map((x) => ({ requete: x.Query, impressions: x.Impressions ?? 0, clics: x.Clicks ?? 0, position: typeof x.AvgImpressionPosition === "number" ? x.AvgImpressionPosition : null }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20);
  } catch {
    /* non bloquant */
  }
  return r;
}

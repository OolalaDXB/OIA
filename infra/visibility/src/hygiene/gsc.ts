/**
 * Google Search Console par son API (gratuite), avec un compte de service.
 *
 * Secret : GSC_SERVICE_ACCOUNT_JSON (le fichier JSON entier du compte de service, secret du dépôt
 * OIA). Le compte est ajouté comme utilisateur de chaque propriété Search Console (autorisation
 * « Complète » pour pouvoir soumettre un sitemap). La clé privée ne sort jamais de ce module : elle
 * signe le jeton d'accès (RS256, node:crypto, sans dépendance) et n'apparaît dans aucun message.
 *
 * Lecture : propriétés accessibles, sitemaps et leurs erreurs, requêtes (28 jours), inspection
 * d'indexation d'un échantillon de pages (verdict, couverture, canonique choisie par Google).
 * Seule écriture : soumettre le sitemap s'il ne l'est pas (sans risque, idempotente).
 */
import { createSign } from "node:crypto";
import type { Controle } from "./controles.js";

export type GscFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

interface CompteService {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = "https://www.googleapis.com/auth/webmasters";
const WM = "https://www.googleapis.com/webmasters/v3";
const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function lireCompteService(json: string): CompteService {
  let o: Partial<CompteService> & { type?: string };
  try {
    o = JSON.parse(json);
  } catch {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON illisible (JSON attendu)");
  }
  if (o.type !== "service_account" || !o.client_email || !o.private_key?.includes("PRIVATE KEY")) throw new Error("GSC_SERVICE_ACCOUNT_JSON : compte de service incomplet");
  return { client_email: o.client_email, private_key: o.private_key, token_uri: o.token_uri };
}

/** Jeton signé (assertion JWT) pour l'échange OAuth du compte de service. */
export function assertion(c: CompteService, maintenant: number): string {
  const tete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify({ iss: c.client_email, scope: SCOPE, aud: c.token_uri ?? "https://oauth2.googleapis.com/token", iat: Math.floor(maintenant / 1000), exp: Math.floor(maintenant / 1000) + 3600 }));
  const signe = createSign("RSA-SHA256").update(`${tete}.${corps}`).sign(c.private_key);
  return `${tete}.${corps}.${b64url(signe)}`;
}

export function createGscClient(json: string, f: GscFetch = globalThis.fetch as unknown as GscFetch, now: () => number = Date.now) {
  const compte = lireCompteService(json);
  let jeton: { valeur: string; fin: number } | null = null;
  const raison = async (res: { status: number; text(): Promise<string> }, quoi: string) => {
    let m = `Search Console ${quoi} : HTTP ${res.status}`;
    try {
      const e = JSON.parse(await res.text()) as { error?: { message?: string } | string; error_description?: string };
      const d = typeof e.error === "string" ? e.error_description ?? e.error : e.error?.message;
      if (d) m += ` (${String(d).slice(0, 160)})`;
    } catch {
      /* corps illisible */
    }
    return new Error(m);
  };
  async function acces(): Promise<string> {
    if (jeton && jeton.fin > now() + 60_000) return jeton.valeur;
    const res = await f(compte.token_uri ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion(compte, now()) }).toString(),
    });
    if (!res.ok) throw await raison(res, "jeton");
    const j = JSON.parse(await res.text()) as { access_token: string; expires_in?: number };
    jeton = { valeur: j.access_token, fin: now() + (j.expires_in ?? 3600) * 1000 };
    return jeton.valeur;
  }
  async function appel<T>(url: string, quoi: string, methode = "GET", corps?: unknown): Promise<T> {
    const res = await f(url, { method: methode, headers: { authorization: `Bearer ${await acces()}`, ...(corps ? { "content-type": "application/json" } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
    if (!res.ok) throw await raison(res, quoi);
    const t = await res.text();
    return (t.trim() ? JSON.parse(t) : {}) as T;
  }
  const enc = encodeURIComponent;
  return {
    compte: compte.client_email,
    proprietes: () => appel<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${WM}/sites`, "propriétés"),
    sitemaps: (site: string) => appel<{ sitemap?: GscSitemap[] }>(`${WM}/sites/${enc(site)}/sitemaps`, "sitemaps"),
    soumettreSitemap: (site: string, sitemap: string) => appel<unknown>(`${WM}/sites/${enc(site)}/sitemaps/${enc(sitemap)}`, "soumission du sitemap", "PUT"),
    requetes: (site: string, debut: string, fin: string) =>
      appel<{ rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>(`${WM}/sites/${enc(site)}/searchAnalytics/query`, "requêtes", "POST", { startDate: debut, endDate: fin, dimensions: ["query"], rowLimit: 20 }),
    totaux: (site: string, debut: string, fin: string) =>
      appel<{ rows?: { clicks: number; impressions: number; ctr: number; position: number }[] }>(`${WM}/sites/${enc(site)}/searchAnalytics/query`, "totaux", "POST", { startDate: debut, endDate: fin }),
    inspecter: (site: string, url: string) => appel<{ inspectionResult?: { indexStatusResult?: GscIndexStatus } }>(INSPECT, "inspection", "POST", { inspectionUrl: url, siteUrl: site, languageCode: "fr" }),
  };
}
export type GscClient = ReturnType<typeof createGscClient>;

export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  errors?: string | number;
  warnings?: string | number;
  contents?: { type: string; submitted?: string | number; indexed?: string | number }[];
}
export interface GscIndexStatus {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
}

const hote = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Propriété Search Console d'un site : la propriété de domaine d'abord, sinon le préfixe d'adresse. */
export function proprieteDuSite(site: string, entrees: { siteUrl: string; permissionLevel: string }[]) {
  const h = hote(site);
  return (
    entrees.find((e) => e.siteUrl.toLowerCase() === `sc-domain:${h}`) ??
    entrees.find((e) => !e.siteUrl.startsWith("sc-domain:") && hote(e.siteUrl) === h) ??
    null
  );
}

export interface ResultatGsc {
  propriete: string | null;
  autorisation: string | null;
  sitemaps: { url: string; envoye: string | null; lu: string | null; erreurs: number; avertissements: number; soumises: number | null; indexees: number | null }[];
  inspection: { url: string; verdict: string | null; couverture: string | null; dernier_passage: string | null; canonique_google: string | null; canonique_site: string | null }[];
  requetes: { requete: string; impressions: number; clics: number; position: number | null }[];
  /** Totaux des 28 derniers jours disponibles (toutes requêtes). */
  totaux: { impressions: number; clics: number; position: number | null } | null;
  actions: { action: string; cible: string; resultat: string }[];
  controles: Controle[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));

/**
 * Bilan Search Console d'un site, et soumission du sitemap s'il manque. Une erreur d'un appel
 * n'arrête pas les autres : elle devient un contrôle « non mesuré » avec sa raison.
 */
export async function bilanGsc(client: GscClient, site: string, sitemapUrl: string | null, pages: string[], maintenant: Date): Promise<ResultatGsc> {
  const r: ResultatGsc = { propriete: null, autorisation: null, sitemaps: [], inspection: [], requetes: [], totaux: null, actions: [], controles: [] };
  const p = proprieteDuSite(site, (await client.proprietes()).siteEntry ?? []);
  r.propriete = p?.siteUrl ?? null;
  r.autorisation = p?.permissionLevel ?? null;
  const accessible = !!p && p.permissionLevel !== "siteUnverifiedUser";
  r.controles.push({
    id: "gsc-propriete", titre: "Site suivi dans Google Search Console", categorie: "visibilite_ia", points: 4, ok: accessible,
    valeur: !p ? `propriété introuvable pour ${client.compte}` : accessible ? `${p.siteUrl} (${p.permissionLevel})` : "propriété non vérifiée", preuve: { propriete: r.propriete },
    gravite: "critique", effort: "S",
    explication: "Google alimente Gemini et les réponses d'IA de Google. Sans Search Console, pas de suivi de l'indexation ni des requêtes.",
    correction: `Search Console › Paramètres › Utilisateurs : ajouter ${client.compte} (autorisation Complète) à la propriété du site.`,
  });
  if (!p || !accessible) return r;
  const propriete = p.siteUrl;
  const peutEcrire = p.permissionLevel === "siteOwner" || p.permissionLevel === "siteFullUser";

  try {
    const s = (await client.sitemaps(propriete)).sitemap ?? [];
    r.sitemaps = s.map((x) => {
      const pages = x.contents?.find((c) => c.type === "web") ?? x.contents?.[0];
      return { url: x.path, envoye: x.lastSubmitted ?? null, lu: x.lastDownloaded ?? null, erreurs: Number(x.errors ?? 0), avertissements: Number(x.warnings ?? 0), soumises: n(pages?.submitted), indexees: n(pages?.indexed) };
    });
    const soumis = sitemapUrl ? s.some((x) => x.path.replace(/\/$/, "") === sitemapUrl.replace(/\/$/, "")) : s.length > 0;
    if (!soumis && sitemapUrl) {
      if (peutEcrire) {
        try {
          await client.soumettreSitemap(propriete, sitemapUrl);
          r.actions.push({ action: "sitemap soumis à Google", cible: sitemapUrl, resultat: "fait" });
        } catch (err) {
          r.actions.push({ action: "sitemap soumis à Google", cible: sitemapUrl, resultat: `échec : ${err instanceof Error ? err.message : String(err)}` });
        }
      } else r.actions.push({ action: "sitemap soumis à Google", cible: sitemapUrl, resultat: "non fait : autorisation Restreinte" });
    }
    const enErreur = r.sitemaps.filter((x) => x.erreurs > 0);
    const fait = soumis || r.actions.some((a) => a.resultat === "fait");
    r.controles.push({
      id: "gsc-sitemap", titre: "Sitemap soumis à Google et lu sans erreur", categorie: "seo", points: 2, ok: fait && enErreur.length === 0,
      valeur: !fait ? "non soumis" : enErreur.length ? `erreurs : ${enErreur.map((x) => `${x.url} (${x.erreurs})`).join(", ")}` : soumis ? "soumis" : "soumis aujourd'hui par OIA",
      preuve: { sitemaps: r.sitemaps.slice(0, 5) }, gravite: "important", effort: "XS",
      explication: "Un sitemap soumis dit à Google quelles pages explorer ; ses erreurs montrent ce qu'il n'a pas pu lire.",
      correction: "Search Console › Sitemaps : ouvrir le sitemap en erreur, corriger les adresses signalées, le soumettre à nouveau.",
    });
  } catch (err) {
    r.controles.push({ id: "gsc-sitemap", titre: "Sitemap soumis à Google et lu sans erreur", categorie: "seo", points: 2, ok: null, valeur: `non mesuré : ${err instanceof Error ? err.message : String(err)}`, preuve: {}, gravite: "important", effort: "XS", explication: "Lecture des sitemaps de Search Console impossible.", correction: "Vérifier le compte de service et son autorisation." });
  }

  // Inspection d'un échantillon (quota Google : 2 000 par jour et par propriété ; 10 suffisent ici).
  for (const u of pages.slice(0, 10)) {
    try {
      const s = (await client.inspecter(propriete, u)).inspectionResult?.indexStatusResult ?? {};
      r.inspection.push({ url: u, verdict: s.verdict ?? null, couverture: s.coverageState ?? null, dernier_passage: s.lastCrawlTime ?? null, canonique_google: s.googleCanonical ?? null, canonique_site: s.userCanonical ?? null });
    } catch {
      /* une page non inspectée n'arrête pas les autres */
    }
  }
  if (r.inspection.length) {
    const nonIndexees = r.inspection.filter((x) => x.verdict && x.verdict !== "PASS");
    r.controles.push({
      id: "gsc-indexation", titre: "Pages indexées par Google", categorie: "seo", points: 3, ok: nonIndexees.length === 0,
      valeur: `${r.inspection.length - nonIndexees.length}/${r.inspection.length} pages indexées`, preuve: { pages: nonIndexees.slice(0, 6).map((x) => ({ url: x.url, couverture: x.couverture })) },
      gravite: "important", effort: "S",
      explication: "Une page non indexée par Google n'existe ni dans ses résultats ni dans ses réponses d'IA ; la couverture dit pourquoi.",
      correction: "Search Console › Inspection de l'URL : corriger la cause indiquée (noindex, redirection, page en double, explorée non indexée), puis « Demander une indexation ».",
    });
    const canonAutre = r.inspection.filter((x) => x.canonique_google && x.canonique_site && x.canonique_google.replace(/\/$/, "") !== x.canonique_site.replace(/\/$/, ""));
    r.controles.push({
      id: "gsc-canonique", titre: "Google retient la canonique déclarée", categorie: "seo", points: 1, ok: canonAutre.length === 0,
      valeur: `${canonAutre.length} page(s) où Google choisit une autre adresse`, preuve: { pages: canonAutre.slice(0, 5).map((x) => ({ url: x.url, google: x.canonique_google, site: x.canonique_site })) },
      gravite: "mineur", effort: "S",
      explication: "Quand Google choisit une autre adresse que celle déclarée, c'est elle qu'il indexe et cite.",
      correction: "Aligner canonical, liens internes, sitemap et redirections sur une seule adresse par page.",
    });
  }

  try {
    const fin = new Date(maintenant.getTime() - 3 * 86_400_000);
    const debut = new Date(fin.getTime() - 28 * 86_400_000);
    const q = (await client.requetes(propriete, iso(debut), iso(fin))).rows ?? [];
    r.requetes = q.map((x) => ({ requete: x.keys[0] ?? "", impressions: x.impressions, clics: x.clicks, position: Number.isFinite(x.position) ? Math.round(x.position * 10) / 10 : null }));
    const t = (await client.totaux(propriete, iso(debut), iso(fin))).rows?.[0];
    r.totaux = t ? { impressions: t.impressions, clics: t.clicks, position: Number.isFinite(t.position) ? Math.round(t.position * 10) / 10 : null } : { impressions: 0, clics: 0, position: null };
  } catch {
    /* non bloquant */
  }
  return r;
}

/**
 * Lecture des pages publiques d'un site (mandat v15, bloc A) : page d'accueil, robots.txt,
 * puis quelques pages du même site liées depuis l'accueil. Requêtes GET seulement, sans
 * JavaScript : ce qu'on lit ici est ce que lit un robot qui n'exécute rien.
 *
 * `PageFetcher` est injecté : `safeFetch` (src/network/safe-fetch.ts : DNS vérifié, aucune
 * adresse interne, redirections contrôlées) en production, un faux site dans les tests.
 */
import { safeFetch } from "../network/safe-fetch.js";
import { assertPublicUrl, assertResponseNotInternal } from "../site-init.js";

export interface FetchedPage {
  /** URL demandée, et URL finale après redirections. */
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

/** Lecteur de production : safeFetch, 5 redirections au plus, 20 s par requête. */
export const safePageFetcher: PageFetcher = async (url) => {
  const r = await safeFetch(url, { headers: { "user-agent": "oia-visibility-audit/1 (+lecture seule)", accept: "text/html,*/*;q=0.5" } });
  const ct = r.headers["content-type"];
  return { url, finalUrl: r.url, status: r.status, contentType: Array.isArray(ct) ? ct.join(", ") : ct ?? "", body: r.body.toString("utf8") };
};

export interface JsonLdNode {
  [key: string]: unknown;
}

export interface ParsedPage {
  url: string;
  status: number;
  lang: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  h1: string[];
  jsonLd: JsonLdNode[];
  /** Blocs JSON-LD illisibles (JSON invalide). */
  invalidJsonLd: number;
  links: string[];
  /** Texte visible sans JavaScript (balises, scripts et styles retirés). */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}

function meta(html: string, key: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const k = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (k === key) return attr(tag, "content");
  }
  return null;
}

/** Analyse d'une page HTML, sans dépendance ni exécution. */
export function parsePage(page: FetchedPage): ParsedPage {
  const html = page.body;
  const jsonLd: JsonLdNode[] = [];
  let invalidJsonLd = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v: unknown = JSON.parse(m[1]!.trim());
      for (const node of flattenJsonLd(v)) jsonLd.push(node);
    } catch {
      invalidJsonLd++;
    }
  }
  const base = page.finalUrl || page.url;
  const links: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      u.hash = "";
      links.push(u.toString());
    } catch {
      // lien illisible : ignoré
    }
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTag = html.match(/<html\b[^>]*>/i);
  const lang = htmlTag ? attr(htmlTag[0], "lang") : null;
  const body = html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return {
    url: base,
    status: page.status,
    lang: lang ? lang.slice(0, 2).toLowerCase() : null,
    title: title ? clean(title[1]!) || null : null,
    description: meta(html, "description") ?? meta(html, "og:description"),
    siteName: meta(html, "og:site_name"),
    h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1]!)).filter(Boolean),
    jsonLd,
    invalidJsonLd,
    links: [...new Set(links)],
    text: clean(body.replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, " \n ")),
  };
}

/** Nœuds JSON-LD à plat : tableaux et `@graph` dépliés. */
export function flattenJsonLd(v: unknown): JsonLdNode[] {
  if (Array.isArray(v)) return v.flatMap(flattenJsonLd);
  if (typeof v !== "object" || v === null) return [];
  const node = v as JsonLdNode;
  const graph = node["@graph"];
  return graph ? [...(Object.keys(node).some((k) => k !== "@graph" && k !== "@context") ? [node] : []), ...flattenJsonLd(graph)] : [node];
}

export interface RobotsTxt {
  status: number;
  /** Règles Disallow du groupe `User-agent: *`. */
  disallow: string[];
  sitemaps: string[];
}

export function parseRobots(status: number, body: string): RobotsTxt {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let star = false;
  let inGroup = false;
  for (const raw of body.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!inGroup) star = false;
      inGroup = true;
      if (value === "*") star = true;
      continue;
    }
    inGroup = false;
    if (key === "sitemap") sitemaps.push(value);
    else if (key === "disallow" && star && value) disallow.push(value);
  }
  return { status, disallow, sitemaps };
}

export interface SiteRead {
  home: ParsedPage;
  pages: ParsedPage[];
  robots: RobotsTxt | null;
  /** Pages non lues, avec la raison (statut, adresse refusée, erreur). */
  skipped: { url: string; reason: string }[];
}

/** Pages à lire d'abord : offres, prix, contact, à propos. */
const PRIORITY = /(tarif|prix|price|pricing|offre|offer|service|programme|program|coaching|contact|about|a-propos|apropos|qui-sommes|equipe|team)/i;

export interface ReadSiteOptions {
  fetch: PageFetcher;
  /** Pages lues au plus, accueil compris (défaut 8). */
  maxPages?: number;
  allowedLocal?: string[];
}

/** Accueil, robots.txt, puis les pages du même site liées depuis l'accueil. */
export async function readSite(rawUrl: string, opts: ReadSiteOptions): Promise<SiteRead> {
  const start = assertPublicUrl(rawUrl, { allowedLocal: opts.allowedLocal });
  const maxPages = opts.maxPages ?? 8;
  const skipped: SiteRead["skipped"] = [];
  const sameSite = (u: URL) => u.hostname.replace(/^www\./, "") === start.hostname.replace(/^www\./, "");

  const get = async (url: string): Promise<FetchedPage | null> => {
    try {
      const r = await opts.fetch(url);
      assertResponseNotInternal(r.finalUrl || url, { allowedLocal: opts.allowedLocal });
      return r;
    } catch (err) {
      skipped.push({ url, reason: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  // robots.txt d'abord : une page qu'il interdit n'est pas lue, l'accueil compris.
  const robotsRaw = await get(new URL("/robots.txt", start).toString());
  const robots = robotsRaw ? parseRobots(robotsRaw.status, robotsRaw.status < 400 ? robotsRaw.body : "") : null;
  const blocked = (u: URL) => (robots?.disallow ?? []).some((d) => u.pathname.startsWith(d));
  if (blocked(start)) throw new Error(`robots.txt interdit la lecture de ${start.toString()} : rien n'est lu`);

  const homeRaw = await get(start.toString());
  if (!homeRaw) throw new Error(`page d'accueil illisible : ${skipped.at(-1)?.reason ?? start.toString()}`);
  if (homeRaw.status >= 400) throw new Error(`page d'accueil en erreur HTTP ${homeRaw.status} : ${start.toString()}`);
  const home = parsePage(homeRaw);

  const candidates = home.links
    .map((l) => new URL(l))
    .filter((u) => sameSite(u) && (u.protocol === "https:" || u.protocol === "http:"))
    .filter((u) => !/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|xml|txt)$/i.test(u.pathname))
    .map((u) => u.toString())
    .filter((u) => u.replace(/\/$/, "") !== home.url.replace(/\/$/, ""));
  const ordered = [...new Set(candidates)].sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)) || a.localeCompare(b));

  const pages: ParsedPage[] = [home];
  for (const url of ordered) {
    if (pages.length >= maxPages) break;
    if (blocked(new URL(url))) {
      skipped.push({ url, reason: "interdit par robots.txt" });
      continue;
    }
    const r = await get(url);
    if (!r) continue;
    if (r.status >= 400) {
      skipped.push({ url, reason: `HTTP ${r.status}` });
      continue;
    }
    if (r.contentType && !/html/i.test(r.contentType)) {
      skipped.push({ url, reason: `type ${r.contentType}` });
      continue;
    }
    pages.push(parsePage(r));
  }
  return { home, pages, robots, skipped };
}

/** Montants lisibles dans un texte (symbole ou code de devise, avant ou après le nombre). */
const CURRENCY = String.raw`(?:€|\$|£|EUR|USD|GBP|CHF|AED|MAD|CAD|dhs?|dirhams?|euros?)`;
const PRICE = new RegExp(String.raw`(?:${CURRENCY}\s?\d[\d\s.,]*\d|${CURRENCY}\s?\d|\d[\d\s.,]*\s?${CURRENCY})(?![\p{L}])`, "giu");

export function pricesIn(text: string, limit = 5): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PRICE)) {
    const v = m[0].replace(/\s+/g, " ").trim();
    if (!out.includes(v)) out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

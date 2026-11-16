/**
 * Audit de lecture d'un site (mandat v15, bloc A, étape 4), sans aucun appel payant :
 *
 *  - Crawlie (même version épinglée que scripts/crawlie-audit.sh, via npx) : pages, prix
 *    lisibles sans JavaScript (Crawlie ne rend pas le JavaScript par défaut), données
 *    structurées, robots. L'exécutable est injecté (`CrawlieCommand`) : un faux dans les tests ;
 *  - lecture directe des pages (src/site/pages.ts) : prix et JSON-LD vus sans JavaScript ;
 *  - contrôle PUBLIC de l'indexation : requête `site:<domaine>` sur Bing et Google, en lecture,
 *    `fetch` injecté. Résultat « indicatif » seulement ; une page de défi, de captcha ou de
 *    consentement est consignée « non vérifiable » et n'est jamais contournée.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { PageFetcher, SiteRead } from "./pages.js";
import { pricesIn } from "./pages.js";

export const CRAWLIE_PACKAGE = "crawlie@0.5.3";

/** Préfixe de la commande Crawlie : `npx -y crawlie@0.5.3` en production, un faux dans les tests. */
export type CrawlieCommand = string[];
export const DEFAULT_CRAWLIE_COMMAND: CrawlieCommand = ["npx", "-y", CRAWLIE_PACKAGE];

/** Lance `<commande> crawl <url> --format json --max-pages N --concurrency 4 -o <fichier>`. */
export function runCrawlie(command: CrawlieCommand, url: string, outFile: string, maxPages = 500): Promise<void> {
  const [bin, ...pre] = command;
  if (!bin) return Promise.reject(new Error("commande Crawlie vide"));
  return new Promise((resolvePromise, reject) => {
    execFile(bin, [...pre, "crawl", url, "--format", "json", "--max-pages", String(maxPages), "--concurrency", "4", "-o", outFile], { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`Crawlie en échec : ${(stderr || err.message).toString().trim().slice(0, 300)}`));
      else resolvePromise();
    });
  });
}

/** Ce qu'on lit d'un rapport Crawlie 0.5.x (les autres champs sont ignorés). */
interface CrawliePage {
  url: string;
  status: number;
  title?: string | null;
  wordCount?: number;
  text?: string;
  indexable?: boolean;
  metaRobots?: string | null;
  xRobotsTag?: string | null;
  schemaTypes?: string[];
  invalidJsonld?: number | unknown[];
}
interface CrawlieRaw {
  config?: { render?: boolean };
  summary?: { totalPages?: number; indexablePages?: number; healthScore?: number; geoScore?: number };
  pages?: CrawliePage[];
  issues?: { rule: string; severity?: string; url?: string }[];
  robotsFound?: boolean;
  robotsBlocked?: string[];
  sitemapFound?: boolean;
  llmsTxtFound?: boolean;
}

export interface CrawlieSummary {
  statut: "fait" | "echec";
  detail: string | null;
  rendu: "sans-javascript" | "avec-javascript" | null;
  pages: { total: number; indexables: number; liste: { url: string; status: number; indexable: boolean | null; titre: string | null; mots: number | null }[] };
  scores: { sante: number | null; geo: number | null };
  prixSansJs: { url: string; exemples: string[] }[];
  donneesStructurees: { types: string[]; pagesSans: string[]; jsonldInvalides: number };
  robots: { robotsTxt: boolean | null; bloquees: string[]; sitemap: boolean | null; llmsTxt: boolean | null; noindex: string[] };
  regles: { regle: string; n: number }[];
}

export function summarizeCrawlie(raw: CrawlieRaw): CrawlieSummary {
  const pages = raw.pages ?? [];
  const rules = new Map<string, number>();
  for (const i of raw.issues ?? []) rules.set(i.rule, (rules.get(i.rule) ?? 0) + 1);
  const invalid = (p: CrawliePage) => (Array.isArray(p.invalidJsonld) ? p.invalidJsonld.length : typeof p.invalidJsonld === "number" ? p.invalidJsonld : 0);
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  return {
    statut: "fait",
    detail: null,
    rendu: raw.config?.render === true ? "avec-javascript" : raw.config ? "sans-javascript" : null,
    pages: {
      total: raw.summary?.totalPages ?? pages.length,
      indexables: raw.summary?.indexablePages ?? pages.filter((p) => p.indexable).length,
      liste: pages.map((p) => ({ url: p.url, status: p.status, indexable: p.indexable ?? null, titre: p.title ?? null, mots: p.wordCount ?? null })),
    },
    scores: { sante: raw.summary?.healthScore ?? null, geo: raw.summary?.geoScore ?? null },
    prixSansJs: ok.map((p) => ({ url: p.url, exemples: pricesIn(p.text ?? "") })).filter((p) => p.exemples.length > 0),
    donneesStructurees: {
      types: [...new Set(ok.flatMap((p) => p.schemaTypes ?? []))].sort(),
      pagesSans: ok.filter((p) => !(p.schemaTypes ?? []).length).map((p) => p.url),
      jsonldInvalides: pages.reduce((s, p) => s + invalid(p), 0),
    },
    robots: {
      robotsTxt: raw.robotsFound ?? null,
      bloquees: [...new Set(raw.robotsBlocked ?? [])],
      sitemap: raw.sitemapFound ?? null,
      llmsTxt: raw.llmsTxtFound ?? null,
      noindex: pages.filter((p) => /noindex/i.test(`${p.metaRobots ?? ""} ${p.xRobotsTag ?? ""}`)).map((p) => p.url),
    },
    regles: [...rules.entries()].map(([regle, n]) => ({ regle, n })).sort((a, b) => b.n - a.n || a.regle.localeCompare(b.regle)),
  };
}

export function crawlieFailure(detail: string): CrawlieSummary {
  return {
    statut: "echec",
    detail,
    rendu: null,
    pages: { total: 0, indexables: 0, liste: [] },
    scores: { sante: null, geo: null },
    prixSansJs: [],
    donneesStructurees: { types: [], pagesSans: [], jsonldInvalides: 0 },
    robots: { robotsTxt: null, bloquees: [], sitemap: null, llmsTxt: null, noindex: [] },
    regles: [],
  };
}

export interface IndexCheck {
  moteur: "bing" | "google";
  requete: string;
  url: string;
  statut: "trouve" | "aucun-resultat" | "non-verifiable";
  /** Liens de résultats vers le domaine vus dans la page (lecture brute, sans JavaScript). */
  resultatsVus: number;
  detail: string;
  indicatif: true;
}

/** Page de défi, captcha ou consentement : on s'arrête là, sans rien contourner. */
const CHALLENGE = /(captcha|recaptcha|hcaptcha|unusual traffic|trafic inhabituel|\/sorry\/|cf-chl|challenge-platform|verify you are (a )?human|vérifiez que vous (êtes|etes) humain|consent\.google|before you continue|avant d'accéder|are you a robot|êtes-vous un robot)/i;
const NO_RESULT = /(did not match any documents|aucun document ne correspond|no results found for|aucun résultat|there are no results|il n'y a aucun résultat)/i;

const SEARCHES: { moteur: IndexCheck["moteur"]; url: (q: string) => string }[] = [
  { moteur: "bing", url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { moteur: "google", url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
];

/** Contrôle public de l'indexation : une requête `site:` par moteur, en lecture seule. */
export async function checkIndexation(domain: string, fetch: PageFetcher): Promise<IndexCheck[]> {
  const requete = `site:${domain}`;
  const out: IndexCheck[] = [];
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const resultLink = new RegExp(`href=["'][^"']*//(?:www\\.)?${escaped}[/"'?#]`, "gi");
  for (const s of SEARCHES) {
    const url = s.url(requete);
    const base = { moteur: s.moteur, requete, url, indicatif: true as const };
    try {
      const r = await fetch(url);
      if (r.status === 429 || r.status === 403 || r.status >= 500 || CHALLENGE.test(r.finalUrl) || CHALLENGE.test(r.body)) {
        out.push({ ...base, statut: "non-verifiable", resultatsVus: 0, detail: `page de défi ou refus (HTTP ${r.status}) : non contournée` });
        continue;
      }
      if (r.status >= 400) {
        out.push({ ...base, statut: "non-verifiable", resultatsVus: 0, detail: `HTTP ${r.status}` });
        continue;
      }
      const n = (r.body.match(resultLink) ?? []).length;
      if (n > 0) out.push({ ...base, statut: "trouve", resultatsVus: n, detail: `${n} lien(s) vers ${domain} dans la page de résultats` });
      else if (NO_RESULT.test(r.body)) out.push({ ...base, statut: "aucun-resultat", resultatsVus: 0, detail: "le moteur annonce aucun résultat" });
      else out.push({ ...base, statut: "non-verifiable", resultatsVus: 0, detail: "aucun lien vers le domaine et aucune mention « aucun résultat » : page illisible sans JavaScript" });
    } catch (err) {
      out.push({ ...base, statut: "non-verifiable", resultatsVus: 0, detail: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

export interface SiteAudit {
  format: 1;
  site: string;
  domaine: string;
  le: string;
  crawlie: CrawlieSummary;
  lecture: {
    pages: { url: string; status: number; titre: string | null; langue: string | null; prixSansJs: string[]; jsonLd: number; jsonLdTypes: string[]; jsonLdInvalides: number }[];
    robotsTxt: { status: number; disallow: string[]; sitemaps: string[] } | null;
    ignorees: { url: string; reason: string }[];
  };
  indexation: IndexCheck[];
}

export interface AuditOptions {
  site: string;
  domain: string;
  read: SiteRead;
  fetch: PageFetcher;
  crawlie: CrawlieCommand;
  /** Fichier du rapport brut de Crawlie (dossier privé du sujet). */
  crawlieOut: string;
  now: () => Date;
}

export async function auditSite(o: AuditOptions): Promise<SiteAudit> {
  let crawlie: CrawlieSummary;
  try {
    await runCrawlie(o.crawlie, o.site, o.crawlieOut);
    if (!existsSync(o.crawlieOut)) throw new Error(`Crawlie n'a pas écrit ${o.crawlieOut}`);
    crawlie = summarizeCrawlie(JSON.parse(readFileSync(o.crawlieOut, "utf8")) as CrawlieRaw);
  } catch (err) {
    crawlie = crawlieFailure(err instanceof Error ? err.message : String(err));
  }
  const typesOf = (n: Record<string, unknown>) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).filter((x): x is string => typeof x === "string");
  return {
    format: 1,
    site: o.site,
    domaine: o.domain,
    le: o.now().toISOString(),
    crawlie,
    lecture: {
      pages: o.read.pages.map((p) => ({
        url: p.url,
        status: p.status,
        titre: p.title,
        langue: p.lang,
        prixSansJs: pricesIn(p.text),
        jsonLd: p.jsonLd.length,
        jsonLdTypes: [...new Set(p.jsonLd.flatMap(typesOf))].sort(),
        jsonLdInvalides: p.invalidJsonLd,
      })),
      robotsTxt: o.read.robots,
      ignorees: o.read.skipped,
    },
    indexation: await checkIndexation(o.domain, o.fetch),
  };
}

const yesNo = (v: boolean | null) => (v === null ? "inconnu" : v ? "oui" : "non");

export function renderAudit(a: SiteAudit): string {
  const c = a.crawlie;
  const L = [
    `# Audit de lecture · ${a.domaine}`,
    "",
    `Le ${a.le}. Lecture seule, aucun appel payant. Statut de tout ce qui suit : extrait.`,
    "",
    "## Crawlie",
    "",
  ];
  if (c.statut === "echec") L.push(`Échec : ${c.detail}`, "");
  else {
    L.push(
      `- Rendu : ${c.rendu ?? "inconnu"}.`,
      `- Pages : ${c.pages.total} crawlées, ${c.pages.indexables} indexables.`,
      `- Scores : santé ${c.scores.sante ?? "?"}, GEO ${c.scores.geo ?? "?"}.`,
      `- Prix lisibles sans JavaScript : ${c.prixSansJs.length ? c.prixSansJs.map((p) => `${p.url} (${p.exemples.join(", ")})`).join(" ; ") : "aucun"}.`,
      `- Données structurées : ${c.donneesStructurees.types.length ? c.donneesStructurees.types.join(", ") : "aucune"} ; pages sans : ${c.donneesStructurees.pagesSans.length} ; JSON-LD invalides : ${c.donneesStructurees.jsonldInvalides}.`,
      `- Robots : robots.txt ${yesNo(c.robots.robotsTxt)}, sitemap ${yesNo(c.robots.sitemap)}, llms.txt ${yesNo(c.robots.llmsTxt)} ; bloquées : ${c.robots.bloquees.length ? c.robots.bloquees.join(", ") : "aucune"} ; noindex : ${c.robots.noindex.length ? c.robots.noindex.join(", ") : "aucune"}.`,
      "",
    );
    if (c.regles.length) L.push("| Règle | Constats |", "|---|---|", ...c.regles.map((r) => `| ${r.regle} | ${r.n} |`), "");
  }
  L.push("## Lecture directe (sans JavaScript)", "", "| Page | HTTP | Prix vus | JSON-LD |", "|---|---|---|---|");
  for (const p of a.lecture.pages) L.push(`| ${p.url} | ${p.status} | ${p.prixSansJs.join(", ") || "aucun"} | ${p.jsonLdTypes.join(", ") || (p.jsonLd ? p.jsonLd : "aucun")}${p.jsonLdInvalides ? ` (${p.jsonLdInvalides} invalide(s))` : ""} |`);
  if (a.lecture.ignorees.length) L.push("", `Pages non lues : ${a.lecture.ignorees.map((x) => `${x.url} (${x.reason})`).join(" ; ")}.`);
  L.push("", "## Indexation (indicatif)", "", "| Moteur | Requête | Résultat | Détail |", "|---|---|---|---|");
  for (const i of a.indexation) L.push(`| ${i.moteur} | \`${i.requete}\` | ${i.statut} | ${i.detail} |`);
  L.push("", "Contrôle public, en lecture : indicatif, jamais une preuve d'indexation. Une page de défi est consignée « non vérifiable » sans être contournée.", "");
  return L.join("\n");
}

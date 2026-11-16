/**
 * Analyse instantanée d'un site (Visibility v3) : Lighthouse en mobile et en ordinateur, puis
 * des constats expliqués et corrigeables, sans aucun appel payant.
 *
 *  - Lighthouse est lancé par npx, version épinglée, en français (`--locale=fr`) : titres et
 *    descriptions des audits sont ceux de Lighthouse, traduits par Google. L'exécutable est
 *    injecté (`LighthouseCommand`) : un faux dans les tests ;
 *  - les constats sont DÉTERMINISTES : un audit en échec devient un constat, avec sa
 *    gravité, l'explication de son effet (par catégorie) et la correction donnée par Lighthouse.
 *    Aucun modèle de langage n'intervient.
 */
import { execFile } from "node:child_process";

export const LIGHTHOUSE_PACKAGE = "lighthouse@12.6.0";
export type LighthouseCommand = string[];
export const DEFAULT_LIGHTHOUSE_COMMAND: LighthouseCommand = ["npx", "-y", LIGHTHOUSE_PACKAGE];
export type Strategie = "mobile" | "ordinateur";

/** Lance Lighthouse et rend le rapport JSON (LHR). */
export function runLighthouse(command: LighthouseCommand, url: string, strategie: Strategie): Promise<unknown> {
  const [bin, ...pre] = command;
  if (!bin) return Promise.reject(new Error("commande Lighthouse vide"));
  const args = [
    ...pre,
    url,
    "--output=json",
    "--output-path=stdout",
    "--quiet",
    "--locale=fr",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    "--max-wait-for-load=45000",
    ...(strategie === "ordinateur" ? ["--preset=desktop"] : ["--form-factor=mobile"]),
  ];
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 4 * 60_000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Lighthouse (${strategie}) en échec : ${(stderr || err.message).toString().trim().split("\n").pop()?.slice(0, 300)}`));
      try {
        resolve(JSON.parse(stdout.toString()));
      } catch {
        reject(new Error(`Lighthouse (${strategie}) : rapport illisible`));
      }
    });
  });
}

// ---------------------------------------------------------------- lecture du rapport

interface Audit {
  id: string;
  title?: string;
  description?: string;
  score: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  details?: { type?: string; items?: unknown[]; overallSavingsMs?: number; overallSavingsBytes?: number };
  metricSavings?: Record<string, number>;
}
interface Lhr {
  lighthouseVersion?: string;
  finalDisplayedUrl?: string;
  finalUrl?: string;
  runtimeError?: { code?: string; message?: string };
  runWarnings?: string[];
  categories?: Record<string, { score: number | null; auditRefs?: { id: string; weight: number; group?: string }[] }>;
  audits?: Record<string, Audit>;
}

const CAT = { performance: "performance", accessibility: "accessibilite", "best-practices": "bonnes_pratiques", seo: "seo" } as const;
type CatLh = keyof typeof CAT;
export type Categorie = (typeof CAT)[CatLh];

export interface AnalyseLighthouse {
  nature: "lighthouse";
  strategie: Strategie;
  url: string;
  outil: string;
  statut: "fait" | "echec";
  scores: Partial<Record<Categorie, number | null>>;
  metriques: Record<string, number | null>;
  resultat: Record<string, unknown>;
  erreur?: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, d = 0) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Résumé lisible d'un LHR : scores, métriques clés, opportunités. */
export function summarizeLighthouse(raw: unknown, strategie: Strategie, url: string): AnalyseLighthouse {
  const lhr = (raw ?? {}) as Lhr;
  const outil = `lighthouse ${lhr.lighthouseVersion ?? "?"}`;
  if (lhr.runtimeError?.code && lhr.runtimeError.code !== "NO_ERROR") {
    return { nature: "lighthouse", strategie, url, outil, statut: "echec", scores: {}, metriques: {}, resultat: {}, erreur: `${lhr.runtimeError.code} : ${lhr.runtimeError.message ?? ""}`.slice(0, 300) };
  }
  const a = lhr.audits ?? {};
  const scores: AnalyseLighthouse["scores"] = {};
  for (const [k, v] of Object.entries(CAT)) scores[v] = num(lhr.categories?.[k]?.score);
  const nv = (id: string) => num(a[id]?.numericValue);
  const metriques = {
    lcp_ms: round(nv("largest-contentful-paint")),
    fcp_ms: round(nv("first-contentful-paint")),
    cls: round(nv("cumulative-layout-shift"), 3),
    tbt_ms: round(nv("total-blocking-time")),
    si_ms: round(nv("speed-index")),
    ttfb_ms: round(nv("server-response-time")),
    poids_ko: nv("total-byte-weight") === null ? null : Math.round(nv("total-byte-weight")! / 1024),
    requetes: Array.isArray(a["network-requests"]?.details?.items) ? a["network-requests"]!.details!.items!.length : null,
  };
  const opportunites = Object.values(a)
    .filter((x) => x.details?.type === "opportunity" && (x.details.overallSavingsMs ?? 0) > 0)
    .sort((x, z) => (z.details?.overallSavingsMs ?? 0) - (x.details?.overallSavingsMs ?? 0))
    .slice(0, 10)
    .map((x) => ({ id: x.id, titre: x.title ?? x.id, gain_ms: Math.round(x.details?.overallSavingsMs ?? 0), gain_ko: Math.round((x.details?.overallSavingsBytes ?? 0) / 1024) }));
  return {
    nature: "lighthouse",
    strategie,
    url: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? url,
    outil,
    statut: "fait",
    scores,
    metriques,
    resultat: { opportunites, avertissements: (lhr.runWarnings ?? []).slice(0, 5) },
  };
}

// ---------------------------------------------------------------- constats

export interface Constat {
  cle: string;
  source: "lighthouse" | "crawl" | "indexation";
  categorie: Categorie | "contenu" | "technique" | "visibilite_ia";
  gravite: "critique" | "important" | "mineur";
  titre: string;
  explication: string;
  correction: string;
  impact: string | null;
  effort: "XS" | "S" | "M" | "L" | "XL";
  qui: "client" | "equipe";
  valeur: string | null;
  preuve: Record<string, unknown>;
}

const POURQUOI: Record<Categorie, string> = {
  performance: "Une page lente fait partir les visiteurs, surtout sur téléphone, et pèse sur le classement Google (signaux Web essentiels).",
  seo: "Google et les assistants IA qui s'appuient sur le web lisent et classent moins bien la page : elle a moins de chances d'être trouvée et citée.",
  accessibilite: "Une partie des visiteurs (lecteurs d'écran, faible vision, clavier seul) ne peut pas utiliser la page correctement ; c'est aussi un signal de qualité.",
  bonnes_pratiques: "La page présente un risque de sécurité, de compatibilité ou d'erreur visible pour le visiteur.",
};

/** Métriques dont le seuil « mauvais » de Google rend le constat critique. */
const METRIQUES_CRITIQUES: Record<string, number> = {
  "largest-contentful-paint": 4000,
  "cumulative-layout-shift": 0.25,
  "total-blocking-time": 600,
};
/** Audits SEO bloquants : la page n'est pas lisible ou pas indexable. */
const SEO_BLOQUANTS = new Set(["is-crawlable", "http-status-code", "document-title", "robots-txt", "crawlable-anchors", "canonical"]);

/** Texte de Lighthouse sans les liens markdown, lien gardé à part. */
export function sansLiens(t: string): { texte: string; liens: string[] } {
  const liens: string[] = [];
  const texte = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_m, label: string, href: string) => {
    liens.push(href);
    return label;
  }).replace(/\s+/g, " ").trim();
  return { texte, liens };
}

export function constatsLighthouse(raw: unknown, strategie: Strategie): Constat[] {
  const lhr = (raw ?? {}) as Lhr;
  const audits = lhr.audits ?? {};
  const out: Constat[] = [];
  const vus = new Set<string>();
  for (const [catLh, cat] of Object.entries(CAT) as [CatLh, Categorie][]) {
    for (const ref of lhr.categories?.[catLh]?.auditRefs ?? []) {
      const a = audits[ref.id];
      if (!a || vus.has(a.id)) continue;
      const mode = a.scoreDisplayMode ?? "";
      if (a.score === null || !["binary", "numeric", "metricSavings"].includes(mode)) continue;
      if (a.score >= 0.9) continue;
      // Seuls les audits qui comptent (poids) ou qui font gagner du temps.
      const gainMs = a.details?.overallSavingsMs ?? 0;
      if (ref.weight <= 0 && gainMs <= 0 && !a.metricSavings) continue;
      vus.add(a.id);
      const seuil = METRIQUES_CRITIQUES[a.id];
      const critique = (seuil !== undefined && (a.numericValue ?? 0) >= seuil) || (cat === "seo" && SEO_BLOQUANTS.has(a.id)) || (cat === "performance" && a.score < 0.25 && ref.weight >= 10);
      const gravite: Constat["gravite"] = critique ? "critique" : a.score < 0.5 ? "important" : "mineur";
      const { texte, liens } = sansLiens(a.description ?? "");
      const impact = gainMs > 0 ? `Gain estimé : ${(gainMs / 1000).toFixed(1).replace(".", ",")} s de chargement${a.details?.overallSavingsBytes ? `, ${Math.round(a.details.overallSavingsBytes / 1024)} Ko de moins` : ""}.` : seuil !== undefined ? `Seuil « bon » de Google non atteint.` : null;
      out.push({
        cle: `lighthouse:${a.id}:${strategie}`.toLowerCase().replace(/[^a-z0-9:._-]/g, "-").slice(0, 120),
        source: "lighthouse",
        categorie: cat,
        gravite,
        titre: `${a.title ?? a.id}${strategie === "ordinateur" ? " (ordinateur)" : " (mobile)"}`.slice(0, 200),
        explication: `${POURQUOI[cat]}${a.displayValue ? ` Mesuré : ${a.displayValue}.` : ""}`,
        correction: texte.length >= 10 ? texte : `Corriger l'audit Lighthouse « ${a.title ?? a.id} ».`,
        impact,
        effort: cat === "performance" ? (gainMs > 1500 || critique ? "M" : "S") : cat === "seo" ? "S" : "S",
        qui: "client",
        valeur: a.displayValue ?? null,
        preuve: { audit: a.id, score: a.score, strategie, ...(liens[0] ? { documentation: liens[0] } : {}) },
      });
    }
  }
  return out.sort((x, z) => ["critique", "important", "mineur"].indexOf(x.gravite) - ["critique", "important", "mineur"].indexOf(z.gravite));
}

// ---------------------------------------------------------------- constats de l'audit de lecture (Crawlie)

import type { CrawlieSummary } from "../site/audit.js";

export function constatsCrawl(c: CrawlieSummary, url: string): Constat[] {
  if (c.statut !== "fait") return [];
  const out: Constat[] = [];
  const base = { source: "crawl" as const, qui: "client" as const, preuve: { url } };
  if (c.robots.noindex.length) {
    out.push({ ...base, cle: "crawl:noindex", categorie: "seo", gravite: "critique", titre: `${c.robots.noindex.length} page(s) exclue(s) de Google (noindex)`,
      explication: "Ces pages demandent aux moteurs de ne pas les indexer : ni Google ni les assistants IA ne peuvent les proposer.",
      correction: "Retirer la balise meta robots « noindex » (ou l'en-tête X-Robots-Tag) des pages qui doivent être trouvées.", impact: "Pages invisibles dans la recherche.", effort: "XS", valeur: String(c.robots.noindex.length), preuve: { url, pages: c.robots.noindex.slice(0, 20) } });
  }
  if (c.robots.sitemap === false) {
    out.push({ ...base, cle: "crawl:sitemap-absent", categorie: "seo", gravite: "important", titre: "Aucun plan du site (sitemap.xml)",
      explication: "Sans plan du site, Google et Bing découvrent les pages plus lentement et peuvent en manquer.",
      correction: "Publier un sitemap.xml listant les pages utiles, le déclarer dans robots.txt et dans Google Search Console et Bing Webmaster Tools.", impact: null, effort: "XS", valeur: null });
  }
  if (c.robots.robotsTxt === false) {
    out.push({ ...base, cle: "crawl:robots-absent", categorie: "technique", gravite: "mineur", titre: "Pas de fichier robots.txt",
      explication: "Le fichier robots.txt indique aux robots ce qu'ils peuvent lire et où trouver le plan du site.",
      correction: "Publier un robots.txt minimal qui autorise l'exploration et pointe vers le sitemap.", impact: null, effort: "XS", valeur: null });
  }
  if (c.robots.bloquees.length) {
    out.push({ ...base, cle: "crawl:robots-bloque", categorie: "seo", gravite: "important", titre: `${c.robots.bloquees.length} adresse(s) bloquée(s) par robots.txt`,
      explication: "Ces adresses sont interdites aux robots : leur contenu ne peut pas être lu par les moteurs ni par les assistants IA.",
      correction: "Vérifier les règles Disallow de robots.txt et ne bloquer que ce qui doit vraiment l'être.", impact: null, effort: "XS", valeur: String(c.robots.bloquees.length), preuve: { url, adresses: c.robots.bloquees.slice(0, 20) } });
  }
  if (c.donneesStructurees.types.length === 0) {
    out.push({ ...base, cle: "crawl:jsonld-absent", categorie: "visibilite_ia", gravite: "important", titre: "Aucune donnée structurée (JSON-LD)",
      explication: "Les données structurées disent aux moteurs et aux assistants IA, sans ambiguïté, qui vous êtes, ce que vous proposez et à quel prix.",
      correction: "Ajouter un bloc JSON-LD schema.org (Organization ou Person, LocalBusiness, Service ou Offer avec prix et devise, sameAs vers les profils officiels).", impact: "Moins de confusion avec des homonymes ; faits repris plus fidèlement.", effort: "S", valeur: null });
  } else if (c.donneesStructurees.jsonldInvalides > 0) {
    out.push({ ...base, cle: "crawl:jsonld-invalide", categorie: "technique", gravite: "important", titre: `${c.donneesStructurees.jsonldInvalides} bloc(s) JSON-LD invalide(s)`,
      explication: "Un bloc de données structurées mal formé est ignoré par les moteurs.",
      correction: "Corriger la syntaxe des blocs JSON-LD (test : validator.schema.org ou le test des résultats enrichis de Google).", impact: null, effort: "XS", valeur: String(c.donneesStructurees.jsonldInvalides) });
  }
  if (c.prixSansJs.length === 0 && c.pages.total > 0) {
    out.push({ ...base, cle: "crawl:prix-invisibles-sans-js", categorie: "visibilite_ia", gravite: "important", titre: "Aucun prix lisible sans JavaScript",
      explication: "Les robots des assistants IA lisent souvent la page sans exécuter JavaScript : un prix affiché seulement par script leur est invisible, et ils reprennent alors des prix d'ailleurs.",
      correction: "Écrire les offres et leurs prix dans le HTML servi (rendu serveur ou statique), et les doubler dans le JSON-LD (Offer, price, priceCurrency).", impact: "Réponses des IA plus justes sur les prix.", effort: "M", valeur: null });
  }
  if (c.robots.llmsTxt === false) {
    out.push({ ...base, cle: "crawl:llms-txt-absent", categorie: "visibilite_ia", gravite: "mineur", titre: "Pas de fichier llms.txt",
      explication: "Le fichier llms.txt (convention récente, encore peu lue) résume le site pour les assistants IA.",
      correction: "Publier /llms.txt : qui vous êtes, offres, prix, zones, liens vers les pages clés. Effet non garanti.", impact: null, effort: "XS", valeur: null });
  }
  return out;
}

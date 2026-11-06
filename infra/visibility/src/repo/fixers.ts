import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VisibilityLLM } from "../llm";
import { fixTargets, type RepoMap } from "./reader";

/**
 * Générateurs de correctifs **déterministes**. Chaque générateur renvoie un
 * `Fix` qui décrit un unique fichier à écrire (création ou remplacement
 * complet) : OIA Visibility stocke le fichier avant / après, sans jamais
 * effectuer d'opération dans un vrai dépôt (D4 compose la demande de fusion,
 * D5 fait tourner le garde-fou CI).
 *
 * Règle 12 du mandat : aucune donnée commerciale n'est inventée. Si un prix
 * ou une caractéristique manque dans les faits validés fournis, le correctif
 * **laisse un emplacement à remplir** (`__TO_FILL__`), jamais une valeur
 * plausible. Un `write` LLM (via `VisibilityLLM.write`) peut rédiger du texte
 * d'introduction ou de FAQ, mais jamais poser une donnée factuelle non fournie.
 */

export interface Fix {
  /** Identifiant déterministe (inclut le type + une empreinte courte du contenu). */
  id: string;
  /** Type de correctif (voir recommendation.schema.json). */
  kind: FixKind;
  /** Chemin relatif au root du dépôt. */
  path: string;
  /** Contenu avant (null = création). */
  before: string | null;
  /** Contenu après. */
  after: string;
  /** Explication en langage naturel, destinée à la description de la PR (D4). */
  rationale: string;
  /**
   * Niveau de risque. `noindex-removal` est systématiquement `high` : jamais
   * appliqué automatiquement par un agent.
   */
  risk: "low" | "medium" | "high";
}

export type FixKind =
  | "robots-txt"
  | "sitemap-xml"
  | "llms-txt"
  | "jsonld-organization"
  | "jsonld-local-business"
  | "jsonld-product"
  | "title"
  | "meta-description"
  | "price-ssr-placeholder"
  | "noindex-removal";

function readMaybe(root: string, path: string): string | null {
  const full = join(root, path);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

function shortHash(s: string): string {
  // Non-cryptographic, deterministic hash. OK for a fix id.
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

function mkFix(kind: FixKind, path: string, before: string | null, after: string, rationale: string, risk: Fix["risk"] = "low"): Fix {
  const id = `${kind}-${shortHash(path + "|" + after)}`;
  return { id, kind, path, before, after, rationale, risk };
}

/** Fait validé passé au générateur. Rien d'inventé : seuls les champs fournis sont utilisés. */
export interface ValidatedFact {
  category: "identity" | "offer" | "price" | "location" | "audience" | "contact" | "other";
  statement: string;
  /** Valeurs normalisées quand elles existent (amount, currency, address…). */
  value?: Record<string, unknown>;
}

export interface SiteIdentity {
  /** URL canonique du site (`https://…/`). */
  siteUrl: string;
  /** Nom affiché. */
  brand: string;
}

/* ---------- robots.txt / sitemap.xml / llms.txt ---------- */

export function fixRobotsTxt(m: RepoMap, site: SiteIdentity): Fix {
  const t = fixTargets(m, "robots-txt");
  const path = t.path ?? (m.framework === "nextjs" ? "public/robots.txt" : "robots.txt");
  const sitemap = site.siteUrl.replace(/\/$/, "") + "/sitemap.xml";
  const after = [
    "# Générée par OIA Visibility.",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");
  const before = readMaybe(m.root, path);
  return mkFix(
    "robots-txt",
    path,
    before,
    after,
    "Robots.txt minimale, autorise la lecture et déclare la sitemap canonique du site.",
    "low",
  );
}

export function fixSitemapXml(m: RepoMap, site: SiteIdentity, urls: string[]): Fix {
  const t = fixTargets(m, "sitemap-xml");
  const path = t.path ?? (m.framework === "nextjs" ? "public/sitemap.xml" : "sitemap.xml");
  const safeUrls = urls.length > 0 ? urls : [site.siteUrl];
  const body = safeUrls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n");
  const after = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  const before = readMaybe(m.root, path);
  return mkFix(
    "sitemap-xml",
    path,
    before,
    after,
    "Sitemap.xml listant les URL explicitement indexables.",
    "low",
  );
}

export async function fixLlmsTxt(
  m: RepoMap,
  site: SiteIdentity,
  summary: string,
  opts: { llm?: VisibilityLLM } = {},
): Promise<Fix> {
  const t = fixTargets(m, "llms-txt");
  const path = t.path ?? (m.framework === "nextjs" ? "public/llms.txt" : "llms.txt");
  let text = summary;
  if (opts.llm) {
    const out = await opts.llm.write({
      purpose: "content.write",
      system: "Compose a short llms.txt summary (3-5 lines) that an AI assistant can read.",
      input: summary,
      maxChars: 600,
    });
    text = out.data.text.trim() || summary;
  }
  const after = `# ${site.brand}\n\n> ${site.siteUrl}\n\n${text}\n`;
  const before = readMaybe(m.root, path);
  return mkFix(
    "llms-txt",
    path,
    before,
    after,
    "llms.txt synthétise le site pour les assistants IA (point de branchement LLM optionnel).",
    "low",
  );
}

/* ---------- JSON-LD ---------- */

function pickValue<T>(facts: ValidatedFact[], category: ValidatedFact["category"], key: string): T | "__TO_FILL__" {
  for (const f of facts) {
    const v = f.category === category ? (f.value?.[key] as T | undefined) : undefined;
    if (v !== undefined && v !== null && String(v).length > 0) return v;
  }
  return "__TO_FILL__";
}

export function fixJsonLdOrganization(m: RepoMap, site: SiteIdentity, facts: ValidatedFact[]): Fix {
  const t = fixTargets(m, "jsonld-organization");
  const path = t.path;
  if (!path) throw new Error("fixJsonLdOrganization: no head source in repo map");
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.brand,
    url: site.siteUrl,
    email: pickValue<string>(facts, "contact", "email"),
    telephone: pickValue<string>(facts, "contact", "telephone"),
    sameAs: facts.filter((f) => f.category === "identity" && typeof f.value?.sameAs === "string").map((f) => f.value!.sameAs),
  };
  const block = scriptLdJson(data);
  const before = readMaybe(m.root, path);
  const after = (before ?? "") + "\n" + block + "\n";
  return mkFix(
    "jsonld-organization",
    path,
    before,
    after,
    "JSON-LD Organization avec les faits validés. Les champs manquants restent à __TO_FILL__ (règle 12).",
    "low",
  );
}

export function fixJsonLdProduct(m: RepoMap, site: SiteIdentity, facts: ValidatedFact[]): Fix {
  const t = fixTargets(m, "jsonld-product");
  const path = t.path;
  if (!path) throw new Error("fixJsonLdProduct: no head source in repo map");
  const priceFact = facts.find((f) => f.category === "price");
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: pickValue<string>(facts, "offer", "name"),
    description: pickValue<string>(facts, "offer", "description"),
    offers: {
      "@type": "Offer",
      price: priceFact?.value?.amount ?? "__TO_FILL__",
      priceCurrency: priceFact?.value?.currency ?? "__TO_FILL__",
      availability: priceFact?.value?.availability ?? "__TO_FILL__",
      url: site.siteUrl,
    },
  };
  const block = scriptLdJson(data);
  const before = readMaybe(m.root, path);
  const after = (before ?? "") + "\n" + block + "\n";
  return mkFix(
    "jsonld-product",
    path,
    before,
    after,
    "JSON-LD Product/Offer. Si un prix valide existe dans les faits, il est posé ; sinon, __TO_FILL__ (règle 12).",
    priceFact ? "low" : "medium",
  );
}

function scriptLdJson(data: unknown): string {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

/* ---------- Titre / description ---------- */

export function fixTitle(m: RepoMap, pageRelPath: string, newTitle: string): Fix {
  const text = readFileSync(join(m.root, pageRelPath), "utf8");
  const after = replaceTitleIfPresent(text, newTitle) ?? insertTitle(text, newTitle, m);
  return mkFix(
    "title",
    pageRelPath,
    text,
    after,
    `Titre réécrit : ${newTitle.length > 70 ? newTitle.slice(0, 67) + "..." : newTitle}`,
    "low",
  );
}

export function fixMetaDescription(m: RepoMap, pageRelPath: string, newDescription: string): Fix {
  const text = readFileSync(join(m.root, pageRelPath), "utf8");
  const after = replaceMetaDescriptionIfPresent(text, newDescription) ?? insertMetaDescription(text, newDescription);
  return mkFix(
    "meta-description",
    pageRelPath,
    text,
    after,
    "Meta description réécrite ou injectée.",
    "low",
  );
}

function replaceTitleIfPresent(text: string, newTitle: string): string | null {
  const m = /<title>[^<]*<\/title>/.exec(text);
  if (!m) return null;
  return text.slice(0, m.index) + `<title>${escapeHtml(newTitle)}</title>` + text.slice(m.index + m[0].length);
}
function insertTitle(text: string, newTitle: string, _m: RepoMap): string {
  const head = /<head[^>]*>/.exec(text);
  const tag = `<title>${escapeHtml(newTitle)}</title>`;
  if (!head) return `${tag}\n${text}`;
  return text.slice(0, head.index + head[0].length) + "\n    " + tag + text.slice(head.index + head[0].length);
}
function replaceMetaDescriptionIfPresent(text: string, newDescription: string): string | null {
  const m = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/.exec(text);
  if (!m) return null;
  const tag = `<meta name="description" content="${escapeHtml(newDescription)}" />`;
  return text.slice(0, m.index) + tag + text.slice(m.index + m[0].length);
}
function insertMetaDescription(text: string, newDescription: string): string {
  const head = /<head[^>]*>/.exec(text);
  const tag = `<meta name="description" content="${escapeHtml(newDescription)}" />`;
  if (!head) return `${tag}\n${text}`;
  return text.slice(0, head.index + head[0].length) + "\n    " + tag + text.slice(head.index + head[0].length);
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- Prix côté serveur (placeholder) ---------- */

/**
 * Pose un placeholder serveur pour le prix. Note : la vraie bascule client→serveur
 * dépend du framework et nécessite une revue humaine ; ce correctif n'y touche
 * pas automatiquement. Il écrit un fichier d'orientation à côté de la page, à
 * destination de la revue humaine.
 */
export function fixPriceSsrPlaceholder(m: RepoMap, pageRelPath: string, note: string): Fix {
  const path = `${pageRelPath}.oia-price-ssr.md`;
  const before = readMaybe(m.root, path);
  const after = [
    `# Correctif à revoir humainement — prix côté serveur`,
    "",
    `Page concernée : \`${pageRelPath}\``,
    "",
    "## Contexte",
    "",
    note,
    "",
    "## Marche à suivre",
    "",
    "- Lire le prix depuis la base ou le CMS au moment du rendu.",
    "- Interdire au client de recouvrir la valeur serveur tant qu'elle est présente.",
    "- Tester sans JavaScript (par exemple via `curl` + grep sur la devise).",
    "",
    "Aucun code n'a été écrit automatiquement : ce chantier est à faire humainement.",
    "",
  ].join("\n");
  return mkFix(
    "price-ssr-placeholder",
    path,
    before,
    after,
    "Note posée à côté de la page pour la revue humaine (le générateur n'écrit pas de code SSR tout seul).",
    "medium",
  );
}

/* ---------- Retrait d'un noindex ---------- */

export function fixNoindexRemoval(m: RepoMap, pageRelPath: string): Fix {
  const text = readFileSync(join(m.root, pageRelPath), "utf8");
  const after = text.replace(/<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"\s*\/?>\s*\n?/g, "");
  return mkFix(
    "noindex-removal",
    pageRelPath,
    text,
    after,
    "ATTENTION — retrait d'un noindex. Haut risque : à n'appliquer qu'après une décision humaine explicite.",
    "high",
  );
}

/* ---------- unified diff (utilitaire) ---------- */

export function unifiedDiff(fix: Fix): string {
  // A tiny unified diff: not valid for `patch`, but sufficient for a PR body.
  const a = (fix.before ?? "").split("\n");
  const b = fix.after.split("\n");
  const lines: string[] = [`--- a/${fix.path}`, `+++ b/${fix.path}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const la = a[i];
    const lb = b[i];
    if (la === lb) {
      if (la !== undefined) lines.push(` ${la}`);
    } else {
      if (la !== undefined) lines.push(`-${la}`);
      if (lb !== undefined) lines.push(`+${lb}`);
    }
  }
  return lines.join("\n");
}

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

/**
 * Lecture statique d'un dépôt cloné en local. Jamais d'exécution du code du
 * dépôt (règle 14 du mandat) : ni `npm install`, ni `next build`, ni script.
 * On classe le cadre (framework), on localise les surfaces SEO, on produit
 * une « carte » qui dira à D3 où écrire les correctifs.
 */

export type RepoFramework = "nextjs" | "vite-react" | "html-static" | "other";

export interface RepoMap {
  root: string;
  framework: RepoFramework;
  /** Fichiers « d'entrée » où l'on trouvera les balises de tête et les titres. */
  headSources: string[];
  /** robots.txt, sitemap.xml, llms.txt (chemin relatif si trouvé, sinon undefined). */
  robotsTxt?: string;
  sitemapXml?: string;
  llmsTxt?: string;
  /** Fichiers qui semblent contenir du JSON-LD (grep statique sur `application/ld+json`). */
  jsonLdFiles: string[];
  /** Pages HTML/JSX/TSX servies — on les liste pour les correctifs titre/description. */
  pageFiles: string[];
  /**
   * Pages où un prix semble être rendu côté client (recherche de `useState`,
   * `useEffect`, `fetch(` juste autour d'un marqueur « price » ou « prix »).
   * Heuristique : utile pour recommander un passage en rendu côté serveur.
   */
  priceClientSide: string[];
  /** Fichier de la langue `/.github/workflows/` qui ressemble au garde-fou SEO D5. */
  seoGuardrailCi?: string;
}

/** Fichiers et dossiers ignorés par défaut. */
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", ".next", "out", "build", ".turbo", "coverage"]);

function walk(dir: string, acc: string[] = [], base: string = dir): string[] {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc, base);
    else acc.push(relative(base, full));
  }
  return acc;
}

function readText(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function detectFramework(root: string, files: string[]): RepoFramework {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps.next) return "nextjs";
      if (deps.vite) return "vite-react";
    } catch {
      // Fall through to HTML static detection.
    }
  }
  // HTML static: there is an index.html at the root and no package.json
  // declaring a bundler.
  if (files.some((f) => f === "index.html")) return "html-static";
  return "other";
}

function findFirst(files: string[], predicate: (f: string) => boolean): string | undefined {
  return files.find(predicate);
}

function detectPriceClientSide(root: string, pageFiles: string[]): string[] {
  const out: string[] = [];
  for (const rel of pageFiles) {
    let text: string;
    try {
      text = readText(root, rel);
    } catch {
      continue;
    }
    const lower = text.toLowerCase();
    const hasPriceWord = lower.includes("price") || lower.includes("prix");
    if (!hasPriceWord) continue;
    // Client-side markers: useState/useEffect/fetch close to the word.
    const clientMarkers = /useEffect|useState|fetch\(|window\.|document\./i;
    if (clientMarkers.test(text)) out.push(rel);
  }
  return out;
}

function detectJsonLd(root: string, files: string[]): string[] {
  const out: string[] = [];
  for (const rel of files) {
    const ext = extname(rel).toLowerCase();
    if (![".html", ".htm", ".tsx", ".jsx", ".ts", ".js", ".mdx"].includes(ext)) continue;
    let text: string;
    try {
      text = readText(root, rel);
    } catch {
      continue;
    }
    if (text.includes("application/ld+json")) out.push(rel);
  }
  return out;
}

function listPageFiles(framework: RepoFramework, files: string[]): string[] {
  switch (framework) {
    case "nextjs":
      // App router: app/**/page.{tsx,jsx,ts,js}. Pages router: pages/**/*.{tsx,jsx,ts,js}.
      return files.filter(
        (f) =>
          (f.startsWith("app/") && /page\.(tsx|jsx|ts|js)$/.test(f)) ||
          (f.startsWith("pages/") && /\.(tsx|jsx|ts|js)$/.test(f) && !f.endsWith(".d.ts")),
      );
    case "vite-react":
      // SPA Vite : la seule page SSR est index.html.
      return files.filter((f) => f === "index.html" || f.startsWith("src/") && /\.(tsx|jsx)$/.test(f));
    case "html-static":
      return files.filter((f) => /\.(html?)$/.test(f));
    default:
      return files.filter((f) => /\.(html?|tsx|jsx)$/.test(f));
  }
}

function listHeadSources(framework: RepoFramework, files: string[]): string[] {
  switch (framework) {
    case "nextjs":
      // Head/metadata is Metadata-exports in App router, _document for Pages router.
      return files.filter(
        (f) =>
          (f.startsWith("app/") && /(layout|page)\.(tsx|jsx|ts|js)$/.test(f)) ||
          (f.startsWith("pages/") && /_document\.(tsx|jsx|ts|js)$/.test(f)),
      );
    case "vite-react":
      return files.filter((f) => f === "index.html");
    case "html-static":
      return files.filter((f) => /\.(html?)$/.test(f));
    default:
      return files.filter((f) => /\.(html?|tsx|jsx)$/.test(f));
  }
}

export function readRepo(root: string): RepoMap {
  if (!existsSync(root)) throw new Error(`repo root does not exist: ${root}`);
  const files = walk(root);
  const framework = detectFramework(root, files);
  const pageFiles = listPageFiles(framework, files);
  const headSources = listHeadSources(framework, files);
  const jsonLdFiles = detectJsonLd(root, files);
  const priceClientSide = detectPriceClientSide(root, pageFiles);
  // robots.txt and sitemap.xml: usually at root (HTML, Vite) or in public/ (Next.js).
  const robotsCandidates = ["robots.txt", "public/robots.txt"];
  const sitemapCandidates = ["sitemap.xml", "public/sitemap.xml", "app/sitemap.xml"];
  const llmsCandidates = ["llms.txt", "public/llms.txt"];
  const robotsTxt = findFirst(files, (f) => robotsCandidates.includes(f));
  const sitemapXml = findFirst(files, (f) => sitemapCandidates.includes(f));
  const llmsTxt = findFirst(files, (f) => llmsCandidates.includes(f));
  const seoGuardrailCi = findFirst(files, (f) =>
    f.startsWith(".github/workflows/") && /seo|visibility/i.test(f),
  );
  return {
    root,
    framework,
    headSources,
    robotsTxt,
    sitemapXml,
    llmsTxt,
    jsonLdFiles,
    pageFiles,
    priceClientSide,
    seoGuardrailCi,
  };
}

/** Pretty-print a RepoMap for the CLI. */
export function summarizeRepoMap(m: RepoMap): string {
  const line = (k: string, v: unknown) => `${k.padEnd(18)} ${v}`;
  return [
    line("framework", m.framework),
    line("head sources", m.headSources.length),
    line("pages", m.pageFiles.length),
    line("robots.txt", m.robotsTxt ?? "(absent)"),
    line("sitemap.xml", m.sitemapXml ?? "(absent)"),
    line("llms.txt", m.llmsTxt ?? "(absent)"),
    line("JSON-LD files", m.jsonLdFiles.length),
    line("price client-side", m.priceClientSide.length),
    line("CI guardrail", m.seoGuardrailCi ?? "(absent)"),
  ].join("\n");
}

/**
 * Where does a given fix type need to write ? Used by D3 to pick a target
 * file before composing a diff.
 */
export function fixTargets(m: RepoMap, kind:
  | "robots-txt"
  | "sitemap-xml"
  | "llms-txt"
  | "jsonld-organization"
  | "jsonld-local-business"
  | "jsonld-product"
  | "title"
  | "meta-description"
  | "noindex-removal"
): { path: string | null; create: boolean } {
  switch (kind) {
    case "robots-txt": {
      const dft = m.framework === "nextjs" ? "public/robots.txt" : "robots.txt";
      return { path: m.robotsTxt ?? dft, create: !m.robotsTxt };
    }
    case "sitemap-xml": {
      const dft = m.framework === "nextjs" ? "public/sitemap.xml" : "sitemap.xml";
      return { path: m.sitemapXml ?? dft, create: !m.sitemapXml };
    }
    case "llms-txt": {
      const dft = m.framework === "nextjs" ? "public/llms.txt" : "llms.txt";
      return { path: m.llmsTxt ?? dft, create: !m.llmsTxt };
    }
    case "jsonld-organization":
    case "jsonld-local-business":
    case "jsonld-product":
      return { path: m.headSources[0] ?? null, create: false };
    case "title":
    case "meta-description":
    case "noindex-removal":
      return { path: m.pageFiles[0] ?? m.headSources[0] ?? null, create: false };
  }
}

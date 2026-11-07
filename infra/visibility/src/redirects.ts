/**
 * Résolution des liens de redirection des citations (Gemini renvoie des liens
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/…` au lieu des vrais
 * sites). Une seule requête par lien, au service de redirection, SANS suivre
 * la redirection : on lit l'en-tête Location, le site cité n'est jamais
 * contacté. Passe par safeFetch (S5). Gratuit, aucun appel à un fournisseur
 * d'IA. Cache hors du dépôt : un lien n'est résolu qu'une fois.
 *
 * CLI : tsx src/redirects.ts <export.json> <cache.json>   (export de la réanalyse)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { safeFetch } from "./network/safe-fetch.js";

export type RedirectCache = Record<string, string | null>;

export function isRedirectLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "vertexaisearch.cloud.google.com" && u.pathname.startsWith("/grounding-api-redirect/");
  } catch {
    return false;
  }
}

/** Lit la cible d'une redirection, sans la suivre. null si pas de Location exploitable. */
export type Resolver = (url: string) => Promise<string | null>;

export const safeResolver: Resolver = async (url) => {
  const r = await safeFetch(url, { maxRedirects: 0, timeoutMs: 10_000 });
  const loc = r.headers.location;
  if (r.status < 300 || r.status >= 400 || !loc) return null;
  const target = new URL(String(Array.isArray(loc) ? loc[0] : loc), url).toString();
  return /^https?:\/\//.test(target) ? target : null;
};

export async function resolveRedirects(
  urls: string[],
  cache: RedirectCache,
  resolver: Resolver = safeResolver,
  concurrency = 4,
): Promise<{ cache: RedirectCache; resolved: number; failed: number; cached: number }> {
  const todo = [...new Set(urls.filter(isRedirectLink))].filter((u) => !(u in cache));
  const cached = [...new Set(urls.filter(isRedirectLink))].length - todo.length;
  let resolved = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const url = todo[i++]!;
      try {
        const target = await resolver(url);
        cache[url] = target;
        if (target) resolved++;
        else failed++;
      } catch {
        // Échec réseau : non mis en cache, retenté au prochain passage.
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { cache, resolved, failed, cached };
}

/** Remplace un lien de redirection par sa cible connue ; sinon le laisse tel quel. */
export function applyRedirects(url: string, cache: RedirectCache): string {
  return (isRedirectLink(url) && cache[url]) || url;
}

export function readCache(path: string): RedirectCache {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RedirectCache) : {};
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [exportFile, cacheFile] = process.argv.slice(2);
  (async () => {
    if (!exportFile || !cacheFile) throw new Error("usage: tsx src/redirects.ts <export.json> <cache.json>");
    const data = JSON.parse(readFileSync(exportFile, "utf8")) as { runs: { citations: string[] }[] };
    const urls = data.runs.flatMap((r) => r.citations);
    const r = await resolveRedirects(urls, readCache(cacheFile));
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, `${JSON.stringify(r.cache, null, 2)}\n`);
    process.stderr.write(`liens de redirection : ${r.resolved} résolus, ${r.cached} déjà en cache, ${r.failed} en échec\n`);
  })().catch((err) => {
    process.stderr.write(`redirects : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

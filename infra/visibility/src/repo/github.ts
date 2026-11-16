/**
 * Lecture d'un dépôt GitHub par l'API, en lecture seule, sans clonage ni exécution.
 *
 * - Dépôt public : aucun jeton. Dépôt privé : jeton en lecture seule (secret
 *   `OIA_DEPOTS_TOKEN`, droits « Contents: read »), passé en en-tête, jamais dans l'adresse
 *   ni dans un message d'erreur.
 * - Les fichiers sensibles (.env, clés, certificats…) sont listés par leur chemin seulement :
 *   leur contenu n'est jamais téléchargé. Le simple fait qu'ils soient versionnés est un constat.
 * - Seuls les fichiers texte utiles sont lus, avec des bornes (nombre, taille unitaire, total).
 *
 * Partagé par le moteur (note du contenu) et le serveur MCP `oia-depot`.
 */

export interface DepotRef {
  proprietaire: string;
  nom: string;
}

export interface FichierDepot {
  chemin: string;
  taille: number;
  /** Contenu texte ; absent si non lu (binaire, trop gros, sensible, au-delà des bornes). */
  contenu?: string;
}

export interface LectureDepot {
  depot: string;
  branche: string;
  sha: string;
  prive: boolean;
  fichiers: FichierDepot[];
  /** Fichiers vus mais non lus, avec la raison. */
  ignores: { chemin: string; raison: "sensible" | "binaire" | "taille" | "borne" }[];
  /** Arborescence tronquée par GitHub (dépôt très grand). */
  tronque: boolean;
}

export type GithubFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const DEPOT = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

/** « proprietaire/nom », ou une adresse https://github.com/proprietaire/nom(.git). */
export function parseDepot(s: string): DepotRef {
  const t = s.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
  const m = DEPOT.exec(t);
  if (!m || m[2] === "." || m[2] === "..") throw new Error(`dépôt refusé : « ${s.slice(0, 80)} » (proprietaire/nom attendu)`);
  return { proprietaire: m[1]!, nom: m[2]! };
}

/** Fichiers dont le contenu n'est jamais lu (secrets probables). */
export function estSensible(chemin: string): boolean {
  const base = chemin.split("/").pop()!.toLowerCase();
  return (
    /^\.env(\..*)?$/.test(base) && base !== ".env.example" && base !== ".env.sample" ||
    /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der|ppk|asc|gpg)$/.test(base) ||
    /^id_(rsa|dsa|ecdsa|ed25519)/.test(base) ||
    /^(\.npmrc|\.pypirc|\.netrc|\.htpasswd|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|service[-_]account.*\.json)$/.test(base)
  );
}

const TEXTE = /\.(html?|xml|txt|md|mdx|json|ya?ml|toml|css|scss|js|mjs|cjs|jsx|ts|tsx|vue|svelte|astro|php|py|rb|liquid|njk|hbs|ejs|svg|webmanifest)$|^(robots\.txt|llms\.txt|vercel\.json|netlify\.toml|_redirects|_headers|Dockerfile|README)$/i;
const IGNORE_DOSSIERS = /(^|\/)(node_modules|\.git|dist|build|\.next|\.vercel|\.turbo|vendor|coverage)\//;

export interface LireDepotOptions {
  depot: string;
  branche?: string | null;
  token?: string | null;
  fetch?: GithubFetch;
  maxFichiers?: number;
  maxOctets?: number;
  maxTotal?: number;
}

export async function lireDepotGithub(o: LireDepotOptions): Promise<LectureDepot> {
  const ref = parseDepot(o.depot);
  const f = o.fetch ?? (globalThis.fetch as unknown as GithubFetch);
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "oia-depot/1 (lecture seule)", "x-github-api-version": "2022-11-28" };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  const api = async <T>(path: string): Promise<T> => {
    const r = await f(`https://api.github.com/repos/${ref.proprietaire}/${ref.nom}${path}`, { headers });
    if (!r.ok) {
      const raison = r.status === 404 ? "introuvable ou privé (jeton en lecture requis)" : r.status === 403 ? "accès refusé ou quota d'API atteint" : `HTTP ${r.status}`;
      throw new Error(`dépôt ${ref.proprietaire}/${ref.nom} : ${raison}`);
    }
    return JSON.parse(await r.text()) as T;
  };
  const info = await api<{ default_branch: string; private: boolean }>("");
  const branche = o.branche?.trim() || info.default_branch;
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branche) || branche.includes("..")) throw new Error("branche refusée");
  const c = await api<{ sha: string }>(`/commits/${encodeURIComponent(branche)}`);
  const arbre = await api<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(`/git/trees/${c.sha}?recursive=1`);
  const maxFichiers = o.maxFichiers ?? 400;
  const maxOctets = o.maxOctets ?? 300_000;
  const maxTotal = o.maxTotal ?? 8_000_000;
  const fichiers: FichierDepot[] = [];
  const ignores: LectureDepot["ignores"] = [];
  let total = 0;
  let lus = 0;
  const blobs = arbre.tree.filter((t) => t.type === "blob" && !IGNORE_DOSSIERS.test(`${t.path}/`) && !IGNORE_DOSSIERS.test(t.path));
  for (const t of blobs) {
    const taille = t.size ?? 0;
    const fichier: FichierDepot = { chemin: t.path, taille };
    fichiers.push(fichier);
    if (estSensible(t.path)) ignores.push({ chemin: t.path, raison: "sensible" });
    else if (!TEXTE.test(t.path.split("/").pop()!)) ignores.push({ chemin: t.path, raison: "binaire" });
    else if (taille > maxOctets) ignores.push({ chemin: t.path, raison: "taille" });
    else if (lus >= maxFichiers || total + taille > maxTotal) ignores.push({ chemin: t.path, raison: "borne" });
    else {
      const chemin = t.path.split("/").map(encodeURIComponent).join("/");
      // Dépôt public : fichiers bruts hors quota d'API (3 appels d'API par lecture en tout).
      // Dépôt privé : API des contenus, avec le jeton.
      const r = info.private
        ? await f(`https://api.github.com/repos/${ref.proprietaire}/${ref.nom}/contents/${chemin}?ref=${c.sha}`, { headers: { ...headers, accept: "application/vnd.github.raw" } })
        : await f(`https://raw.githubusercontent.com/${ref.proprietaire}/${ref.nom}/${c.sha}/${chemin}`, { headers: { "user-agent": headers["user-agent"]! } });
      if (!r.ok) {
        ignores.push({ chemin: t.path, raison: "borne" });
        continue;
      }
      fichier.contenu = await r.text();
      lus++;
      total += taille;
    }
  }
  return { depot: `${ref.proprietaire}/${ref.nom}`, branche, sha: c.sha, prive: info.private, fichiers, ignores, tronque: arbre.truncated };
}

/** Recherche dans les fichiers lus (texte littéral, insensible à la casse), lignes bornées. */
export function chercher(l: LectureDepot, motif: string, max = 50): { chemin: string; ligne: number; texte: string }[] {
  const m = motif.toLowerCase();
  if (m.length < 2) throw new Error("motif trop court");
  const out: { chemin: string; ligne: number; texte: string }[] = [];
  for (const f of l.fichiers) {
    if (f.contenu === undefined) continue;
    const lignes = f.contenu.split("\n");
    for (let i = 0; i < lignes.length && out.length < max; i++) {
      if (lignes[i]!.toLowerCase().includes(m)) out.push({ chemin: f.chemin, ligne: i + 1, texte: lignes[i]!.trim().slice(0, 240) });
    }
    if (out.length >= max) break;
  }
  return out;
}

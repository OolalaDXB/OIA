import { isIP } from "node:net";

/**
 * Initialisation d'un nouveau site pour OIA Visibility (C2).
 *
 * Règle 15 du mandat : aucune requête vers une adresse interne.
 * `assertPublicUrl()` refuse :
 *   - les adresses de bouclage (`localhost`, `127/8`, `::1`) ;
 *   - les RFC 1918 (`10/8`, `172.16-31`, `192.168/16`) ;
 *   - les liaisons (`169.254/16`, `fe80::/10`) ;
 *   - les Unique Local (`fc00::/7`) ;
 *   - un hostname `localhost` ou `*.localhost`.
 *
 * Seule exception explicite : un hostname dont le suffixe correspond à
 * `allowedLocal` (ex: `.example.test`) — utilisé par les tests qui servent
 * des sites fictifs en local.
 */

export interface AssertPublicUrlOptions {
  /** Suffixes de hostname autorisés en local (ex: [".example.test"]). */
  allowedLocal?: string[];
}

export class InternalAddressError extends Error {
  constructor(public readonly reason: string, public readonly url: string) {
    super(`internal address refused (${reason}): ${url}`);
  }
}

export function assertPublicUrl(rawUrl: string, opts: AssertPublicUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new InternalAddressError("not a valid URL", rawUrl);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InternalAddressError(`unsupported protocol "${url.protocol}"`, rawUrl);
  }
  // Node's URL keeps IPv6 hosts bracketed (e.g. "[::1]"); strip brackets for isIP().
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowedLocal = opts.allowedLocal ?? [];
  if (allowedLocal.some((suf) => host.endsWith(suf))) return url;

  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new InternalAddressError("hostname is localhost", rawUrl);
  }
  // IPv4 ?
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map((p) => Number(p));
    if (a === 127) throw new InternalAddressError("IPv4 loopback", rawUrl);
    if (a === 10) throw new InternalAddressError("IPv4 RFC 1918 (10/8)", rawUrl);
    if (a === 169 && b === 254) throw new InternalAddressError("IPv4 link-local (169.254/16)", rawUrl);
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) throw new InternalAddressError("IPv4 RFC 1918 (172.16-31)", rawUrl);
    if (a === 192 && b === 168) throw new InternalAddressError("IPv4 RFC 1918 (192.168/16)", rawUrl);
  }
  // IPv6 ?
  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    if (lower === "::1") throw new InternalAddressError("IPv6 loopback", rawUrl);
    if (lower.startsWith("fe80:")) throw new InternalAddressError("IPv6 link-local (fe80::/10)", rawUrl);
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      throw new InternalAddressError("IPv6 unique local (fc00::/7)", rawUrl);
    }
  }
  return url;
}

/**
 * Résultat d'un `visibility site init --dry-run` : pas d'écriture, juste la
 * synthèse de ce qui serait créé.
 */
export interface SiteInitDryRun {
  clientId: string;
  subjectId: string;
  primaryUrl: string;
  languagesDetected: string[];
  factsCandidates: Array<{ category: string; statement: string }>;
  repo?: { ownerName: string };
}

export interface SiteInitOptions {
  clientId: string;
  url: string;
  repo?: string; // owner/name
  allowedLocal?: string[];
}

/** Dry-run d'initialisation : valide les entrées et prépare la fiche. */
export function dryRunSiteInit(opts: SiteInitOptions): SiteInitDryRun {
  const url = assertPublicUrl(opts.url, { allowedLocal: opts.allowedLocal });
  const subjectId = url.hostname
    .replace(/^www\./, "")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+$/, "");
  return {
    clientId: opts.clientId,
    subjectId,
    primaryUrl: url.toString(),
    languagesDetected: [], // on ne crawle rien ici ; le vrai init appelle Crawlie après.
    factsCandidates: [],
    repo: opts.repo ? { ownerName: opts.repo } : undefined,
  };
}

/**
 * Vérifie une réponse HTTP (status + redirection) et refuse une redirection
 * vers une adresse interne. À appeler après chaque fetch pour empêcher un
 * server externe de nous rediriger sur une IP RFC 1918.
 */
export function assertResponseNotInternal(
  responseUrl: string,
  opts: AssertPublicUrlOptions = {},
): void {
  // Réutilise assertPublicUrl pour la même règle.
  assertPublicUrl(responseUrl, opts);
}

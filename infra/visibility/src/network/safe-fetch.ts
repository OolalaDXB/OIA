import { createConnection } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import type { LookupAddress } from "node:dns";

/**
 * S5 — fonction de récupération unique, utilisée par tout appel sortant.
 *
 * Objectif : empêcher qu'un hôte résolu ou redirigé vers une adresse
 * privée, locale ou de liaison soit contacté. Les règles :
 *
 *   1. Résolution DNS explicite (IPv4 + IPv6). Toute adresse résolue
 *      dans une plage interne refuse la requête. On vérifie avant la
 *      connexion ET on connecte sur l'adresse vérifiée (pin DNS) pour
 *      empêcher un changement de résolution entre le contrôle et la
 *      socket (DNS rebinding).
 *   2. Protocole : `http:` ou `https:` uniquement.
 *   3. Redirections suivies à la main (max 5 sauts) ; à chaque saut,
 *      la nouvelle URL est repassée dans `safeFetch`.
 *   4. IPv6 : refus de loopback (::1), link-local (fe80::/10), ULA
 *      (fc00::/7), IPv4 encapsulée en IPv6 quand elle pointe sur une
 *      plage interne (::ffff:a.b.c.d).
 *
 * Pas d'agent personnalisé pour l'instant (pas de proxy, pas d'altération
 * de l'User-Agent) : le but de ce module est la sécurité réseau, pas la
 * personnalisation HTTP.
 */

export class UnsafeAddressError extends Error {
  constructor(public readonly reason: string, public readonly url: string, public readonly address?: string) {
    super(`unsafe address refused (${reason}): ${url}${address ? ` -> ${address}` : ""}`);
  }
}

/** Reconstruit une IPv4 depuis une forme IPv6 ::ffff:xxxx:yyyy (hex) ou ::ffff:a.b.c.d (texte). */
function ipv4MappedToDotted(addr: string): string | null {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const tail = lower.slice(7);
  // Forme texte : ::ffff:a.b.c.d
  if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) return tail;
  // Forme hex : ::ffff:xxxx:yyyy  (deux groupes de 4 hex séparés par ':')
  const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!m) return null;
  const hi = parseInt(m[1]!, 16);
  const lo = parseInt(m[2]!, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** True si l'adresse IP pointe sur une plage interne (IPv4 ou IPv6). */
export function isInternalAddress(addr: string): { internal: true; reason: string } | { internal: false } {
  // IPv4 encapsulée en IPv6 (::ffff:a.b.c.d OU ::ffff:hex:hex après normalisation
  // par Node's URL). On extrait la partie IPv4 et on reteste.
  const mapped = ipv4MappedToDotted(addr);
  const v4 = mapped ?? addr;
  const family = isIP(v4);
  if (family === 4) {
    const parts = v4.split(".").map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1];
    if (a === 127) return { internal: true, reason: "IPv4 loopback" };
    if (a === 10) return { internal: true, reason: "IPv4 RFC 1918 (10/8)" };
    if (a === 169 && b === 254) return { internal: true, reason: "IPv4 link-local (169.254/16)" };
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return { internal: true, reason: "IPv4 RFC 1918 (172.16-31)" };
    if (a === 192 && b === 168) return { internal: true, reason: "IPv4 RFC 1918 (192.168/16)" };
    if (a === 0) return { internal: true, reason: "IPv4 unspecified (0.0.0.0/8)" };
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return { internal: true, reason: "IPv4 CGNAT (100.64/10)" };
    if (a >= 224) return { internal: true, reason: "IPv4 multicast/reserved" };
    return { internal: false };
  }
  if (family === 6) {
    const lower = addr.toLowerCase();
    if (lower === "::1") return { internal: true, reason: "IPv6 loopback" };
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return { internal: true, reason: "IPv6 link-local (fe80::/10)" };
    if (lower.startsWith("fc") || lower.startsWith("fd")) return { internal: true, reason: "IPv6 unique local (fc00::/7)" };
    if (lower === "::") return { internal: true, reason: "IPv6 unspecified" };
    // IPv4 mapped au-dessus déjà traité.
    return { internal: false };
  }
  return { internal: true, reason: "unrecognised address family" };
}

async function resolveAndCheck(hostname: string, rawUrl: string): Promise<LookupAddress> {
  // Récupère la PREMIÈRE adresse résolue ; on la vérifie ET on pin ensuite
  // la connexion sur cette adresse. Pas de fallback vers une autre
  // adresse : si la première est interne, on refuse (il y a toujours la
  // chance qu'un attaquant contrôle le DNS et en mette une publique en
  // seconde position).
  let addr: LookupAddress;
  try {
    addr = await dnsLookup(hostname, { family: 0, verbatim: true });
  } catch (e) {
    throw new UnsafeAddressError(`DNS resolution failed: ${(e as Error).message}`, rawUrl);
  }
  const judgement = isInternalAddress(addr.address);
  if (judgement.internal) {
    throw new UnsafeAddressError(judgement.reason, rawUrl, addr.address);
  }
  return addr;
}

export interface SafeFetchOptions {
  /** Combien de redirections suivre ; 0 = aucune. Par défaut 5. */
  maxRedirects?: number;
  /** Méthode HTTP (défaut GET). */
  method?: "GET" | "HEAD";
  /** En-têtes additionnels. */
  headers?: Record<string, string>;
  /** Timeout par requête, en ms. */
  timeoutMs?: number;
  /** Hostnames de test autorisés en interne (suffixes). Sert aux tests. */
  allowedLocalSuffixes?: string[];
}

export interface SafeFetchResponse {
  url: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  /** Chaîne d'URL effectivement contactées (après redirections). */
  chain: string[];
}

function parseUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeAddressError("not a valid URL", raw);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UnsafeAddressError(`unsupported protocol "${u.protocol}"`, raw);
  }
  return u;
}

async function fetchOnce(u: URL, pinnedAddress: LookupAddress, opts: SafeFetchOptions): Promise<SafeFetchResponse> {
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  const method = opts.method ?? "GET";
  const headers = { host: u.host, "user-agent": opts.headers?.["user-agent"] ?? "oia-safe-fetch/1", ...opts.headers };
  const timeoutMs = opts.timeoutMs ?? 20_000;

  // On ouvre une socket sur l'ADRESSE RÉSOLUE, pas sur le hostname. Si le
  // DNS reconfigure l'hôte vers une adresse interne entre la résolution
  // et ce point, l'attaquant n'y arrive pas : la socket va sur l'adresse
  // déjà jugée publique.
  return new Promise<SafeFetchResponse>((resolve, reject) => {
    const socket = createConnection({ host: pinnedAddress.address, port, family: pinnedAddress.family });
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new UnsafeAddressError("timeout", u.toString(), pinnedAddress.address));
    });
    socket.once("error", (err) => reject(err));
    socket.once("connect", () => {
      const req = (u.protocol === "https:" ? https : http).request(
        {
          method,
          createConnection: () =>
            u.protocol === "https:"
              ? tls.connect({ socket, host: u.hostname, servername: u.hostname })
              : socket,
          hostname: u.hostname,
          port,
          path: u.pathname + u.search,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              url: u.toString(),
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
              chain: [u.toString()],
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const allowed = opts.allowedLocalSuffixes ?? [];
  const chain: string[] = [];
  let url = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const u = parseUrl(url);
    // Exception de test : des hostnames réservés aux fixtures locales.
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const inAllowed = allowed.some((suf) => host.endsWith(suf));
    if (!inAllowed) {
      // Refuse d'emblée les hostnames évidents.
      if (host === "localhost" || host.endsWith(".localhost")) {
        throw new UnsafeAddressError("hostname is localhost", url);
      }
      // Résout et vérifie l'adresse.
      const pinned = await resolveAndCheck(host, url);
      const r = await fetchOnce(u, pinned, opts);
      chain.push(r.url);
      if (r.status >= 300 && r.status < 400 && r.headers.location && hop < maxRedirects) {
        const next = new URL(String(r.headers.location), r.url).toString();
        url = next;
        continue;
      }
      return { ...r, chain };
    } else {
      // Branche réservée aux tests : connexion directe au hostname.
      const r = await new Promise<SafeFetchResponse>((resolve, reject) => {
        const req = (u.protocol === "https:" ? https : http).request(
          {
            method: opts.method ?? "GET",
            hostname: u.hostname,
            port: u.port ? Number(u.port) : undefined,
            path: u.pathname + u.search,
            headers: { host: u.host, "user-agent": "oia-safe-fetch-test/1", ...opts.headers },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () =>
              resolve({
                url: u.toString(),
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: Buffer.concat(chunks),
                chain: [u.toString()],
              }),
            );
            res.on("error", reject);
          },
        );
        req.on("error", reject);
        req.end();
      });
      chain.push(r.url);
      if (r.status >= 300 && r.status < 400 && r.headers.location && hop < maxRedirects) {
        url = new URL(String(r.headers.location), r.url).toString();
        continue;
      }
      return { ...r, chain };
    }
  }
  throw new UnsafeAddressError(`too many redirects (> ${maxRedirects})`, rawUrl);
}

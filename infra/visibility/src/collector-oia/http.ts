/**
 * Appel HTTP d'un fournisseur pour le collecteur OIA direct (mandat v14, bloc C).
 *
 *  - `fetch` est toujours injecté : les tests n'atteignent jamais le réseau ;
 *  - reprises bornées sur 408, 429, 5xx et erreurs réseau : MAX_ATTEMPTS essais au
 *    plus (deux reprises), attente RETRY_BASE_MS puis le double, ou l'en-tête
 *    Retry-After quand le fournisseur le donne (borné à RETRY_AFTER_MAX_MS) ;
 *  - toute autre erreur (400, 401, 403, 404…) est définitive au premier essai ;
 *  - la clé n'apparaît jamais dans un message d'erreur (masquée si le fournisseur
 *    la renvoyait), le corps d'erreur est tronqué à 500 caractères.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 2_000;
export const RETRY_AFTER_MAX_MS = 60_000;

export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Échec d'un appel après les reprises : `transient` dit si la dernière cause était passagère. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly attempts: number,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[clé masquée]");
  return out;
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const s = Number(value);
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, RETRY_AFTER_MAX_MS);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(Math.max(at - Date.now(), 0), RETRY_AFTER_MAX_MS) : null;
}

export interface PostJsonOptions {
  fetch: FetchLike;
  sleep: Sleep;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Nom du fournisseur, pour les messages. */
  label: string;
  /** Valeurs à masquer dans les messages (la clé). */
  secrets: string[];
}

/** POST JSON avec reprises bornées. Renvoie le corps décodé et le nombre d'essais. */
export async function postJson(o: PostJsonOptions): Promise<{ data: unknown; attempts: number }> {
  let last = "";
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let wait = RETRY_BASE_MS * 2 ** (attempt - 1);
    try {
      const res = await o.fetch(o.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...o.headers },
        body: JSON.stringify(o.body),
      });
      const text = await res.text();
      if (res.ok) {
        try {
          return { data: JSON.parse(text) as unknown, attempts: attempt };
        } catch {
          throw new ProviderError(`${o.label} : réponse illisible (JSON invalide)`, res.status, attempt, false);
        }
      }
      lastStatus = res.status;
      last = scrub(`${res.status}: ${text.slice(0, 500)}`, o.secrets);
      if (!isTransientStatus(res.status)) throw new ProviderError(`${o.label} : erreur ${last}`, res.status, attempt, false);
      wait = retryAfterMs(res.headers.get("retry-after")) ?? wait;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      // Erreur réseau (connexion coupée, délai) : passagère.
      lastStatus = null;
      last = scrub(err instanceof Error ? err.message : String(err), o.secrets);
    }
    if (attempt < MAX_ATTEMPTS) await o.sleep(wait);
  }
  throw new ProviderError(`${o.label} : échec après ${MAX_ATTEMPTS} essais (${last})`, lastStatus, MAX_ATTEMPTS, true);
}

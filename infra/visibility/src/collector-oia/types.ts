import type { Citation } from "./extract.js";
import type { FetchLike, Sleep } from "./http.js";

/** Ce qu'un fournisseur reçoit pour un appel. La clé vient de l'environnement du processus, jamais d'un fichier. */
export interface ProviderCallInput {
  fetch: FetchLike;
  sleep: Sleep;
  apiKey: string;
  /** Modèle tel que dans la cible (ex. `gpt-6-luna`, `google/gemini-3-flash-preview`). */
  model: string;
  webSearch: boolean;
  /** Texte de la question, envoyé tel quel (aucun prompt système, comme Elmo). */
  prompt: string;
}

/** Un appel HTTP facturé : sa réponse brute COMPLÈTE et ce qu'il faut pour le chiffrer. */
export interface BilledCall {
  raw: unknown;
  /** Compteurs du fournisseur, au format que lit src/cost-grid.ts. */
  usage: unknown;
  /** Recherches lues dans la réponse (web_search_call, tool.execution…), pour la grille. */
  searchItems: number;
  /** Version servie, telle que la réponse la donne. */
  servedModel: string;
  /** Essais HTTP de cet appel (reprises sur 429 / 5xx comprises). */
  httpAttempts: number;
  /** Pourquoi cet appel a eu lieu : appel initial, nouvel essai d'Elmo, suite de conversation… */
  role: "initial" | "retry-web-search-error" | "continuation";
}

export interface ProviderCallResult {
  calls: BilledCall[];
  /** Texte de la réponse, extrait comme Elmo (src/collector-oia/extract.ts). "" si aucun. */
  text: string;
  citations: Citation[];
  webQueries: string[];
  /** Identifiant de la réponse chez le fournisseur. */
  runId: string;
  finishReason: string | null;
  /** Faits notables de l'appel (plafond atteint, suite de conversation, réponse sans texte…). */
  notes: string[];
  /** Champs propres au fournisseur, rangés dans `structured`. */
  extra: Record<string, unknown>;
}

export type ProviderId = "openai-api" | "anthropic-api" | "mistral-api" | "openrouter";

export interface ProviderImpl {
  id: ProviderId;
  /** Variable d'environnement qui porte la clé. */
  keyEnv: string;
  call(input: ProviderCallInput): Promise<ProviderCallResult>;
}

/** Plafond de jetons de sortie par appel, identique pour les quatre fournisseurs (Elmo, providers/config.ts, l. 31-36). */
export const MAX_OUTPUT_TOKENS = 8000;

export const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null;
export const str = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);

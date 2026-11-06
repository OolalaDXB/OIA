import { createHash } from "node:crypto";
import type { Tenanted } from "./tenancy";

/**
 * Adaptateur Elmo → table de preuves A5. Elmo n'offre pas d'export JSON
 * natif ; en pratique, l'adaptateur lira sa base Postgres via un SELECT
 * filtré. Cette nuit, on se contente de modéliser la transformation : prend
 * une structure proche de ce que Elmo stocke, retourne un lot de preuves
 * conforme au contrat `Evidence` d'A5.
 */

/** Ligne brute d'un dump Elmo (sous-ensemble des colonnes utiles). */
export interface ElmoRunRow {
  /** UUID Elmo du run. */
  id: string;
  /** Jour UTC YYYY-MM-DD. */
  collected_day: string;
  /** Datetime ISO-8601 de la collecte. */
  collected_at: string;
  /** Identifiant Elmo (chatgpt, claude, gemini, perplexity, mistral). */
  provider: string;
  /** Version du modèle qui a répondu. */
  provider_model: string;
  /** Identifiant de la question dans Elmo. */
  prompt_id: string;
  /** Texte brut de la réponse. */
  raw_answer: string;
  /** Citations (URL + label) extraites par Elmo. */
  citations: Array<{ url: string; label?: string }>;
  /** Coût estimé par Elmo. */
  estimated_cost_usd?: number;
}

export interface EvidenceRow extends Tenanted {
  /** UUID OIA de la preuve (génère un UUID stable à partir du run Elmo). */
  id: string;
  windowId: string;
  promptId: string;
  promptVersion: number;
  promptLanguage: string;
  engine: string;
  engineVersion?: string;
  collectorName: string;
  collectorRunId: string;
  receivedAt: string;
  rawText: string;
  rawSha256Hex: string;
  structured: Record<string, unknown>;
  citations: Array<{ url: string; label?: string }>;
  costUsd: number;
}

export interface ElmoImportContext {
  clientId: string;
  siteId: string | null;
  subjectId: string;
  windowId: string;
  /** Promptid Elmo → {promptId OIA, promptVersion, promptLanguage}. */
  promptIndex: Record<string, { id: string; version: number; language: string }>;
}

function stableUuid(input: string): string {
  const h = createHash("sha256").update(input).digest("hex");
  // Formate en pseudo-UUID stable à partir du SHA (non RFC 4122, mais lisible).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function importElmoRow(row: ElmoRunRow, ctx: ElmoImportContext): EvidenceRow {
  const prompt = ctx.promptIndex[row.prompt_id];
  if (!prompt) {
    throw new Error(`elmo-import: prompt "${row.prompt_id}" not in promptIndex`);
  }
  return {
    id: stableUuid(`elmo:${row.id}`),
    clientId: ctx.clientId,
    siteId: ctx.siteId,
    subjectId: ctx.subjectId,
    windowId: ctx.windowId,
    promptId: prompt.id,
    promptVersion: prompt.version,
    promptLanguage: prompt.language,
    engine: row.provider,
    engineVersion: row.provider_model,
    collectorName: "elmo",
    collectorRunId: row.id,
    receivedAt: row.collected_at,
    rawText: row.raw_answer,
    rawSha256Hex: sha256Hex(row.raw_answer),
    structured: { fromElmo: true, elmoId: row.id },
    citations: row.citations,
    costUsd: row.estimated_cost_usd ?? 0,
  };
}

export function importElmoBatch(rows: ElmoRunRow[], ctx: ElmoImportContext): EvidenceRow[] {
  return rows.map((r) => importElmoRow(r, ctx));
}

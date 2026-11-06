/**
 * Contrat générique de collecteur. Deux implémentations à terme :
 *
 *   - `@oia/collector-elmo`, lit la base d'Elmo via un adaptateur et
 *     recopie les réponses dans la table `vis.evidence` ;
 *   - `@oia/collector-oia-direct`, collecteur maison, qui interroge les
 *     moteurs via leur API et écrit directement dans `vis.evidence`.
 *
 * Les deux peuvent tourner **en parallèle** sur les mêmes questions : chaque
 * ligne de preuve porte son `collector_name`. La couche F1 agrège par jour
 * et par fournisseur, et F3 compare les relevés inter-collecteurs comme une
 * revue croisée (règle 17 : outils de lecture seulement pour les agents ;
 * déclenchement d'une collecte reste une mission validée).
 *
 * Cette nuit, aucune implémentation réelle n'est activée. Seuls le contrat
 * et une implémentation **fictive déterministe** vivent ici.
 */

import type { Tenanted } from "./tenancy";

/** Request a collector can serve. All fields are mandatory for traceability. */
export interface CollectRequest extends Tenanted {
  windowId: string;
  promptId: string;
  promptVersion: number;
  promptLanguage: string;
  promptText: string;
  engine: string;
  /** Any engine-specific knobs; opaque to the contract. */
  engineOptions?: Record<string, unknown>;
}

/** Response the collector returns. `rawText` is stored byte-for-byte. */
export interface CollectResult {
  collectorName: string;
  /** Opaque identifier the collector uses for its own run bookkeeping. */
  collectorRunId: string;
  /** The exact string the engine returned. Never trim, never reformat. */
  rawText: string;
  /** Parsed/structured view the collector produced; stored in `structured`. */
  structured: Record<string, unknown>;
  /** Citations as the collector saw them (url + label). */
  citations: Array<{ url: string; label?: string }>;
  /** Real cost in USD the collector paid for this call, if known. */
  costUsd: number;
  /** Server will stamp SHA-256 anyway; this is advisory. */
  clientSha256Hex?: string;
  /** Engine's version identifier when available (model string, hash, date). */
  engineVersion?: string;
  /** When the engine actually returned (ISO-8601). */
  receivedAt: string;
}

export interface Collector {
  readonly name: string;
  collect(req: CollectRequest): Promise<CollectResult>;
}

/**
 * Deterministic fictive collector. Equal request ⇒ equal result. No network,
 * no state. Useful for unit tests of E5 (SEO Command Orchestrator) and F2
 * (import to the evidence table) without touching Elmo or a provider.
 */
export function createFakeCollector(opts: { name?: string } = {}): Collector {
  const name = opts.name ?? "fake-collector";
  return {
    name,
    async collect(req) {
      const stub = `[donnée fictive] ${req.engine} → ${req.promptText.slice(0, 40)}`;
      return {
        collectorName: name,
        collectorRunId: `fake-${req.engine}-${req.windowId}-${req.promptId}-v${req.promptVersion}`,
        rawText: stub,
        structured: { answered: true, fictive: true },
        citations: [],
        costUsd: 0,
        engineVersion: "fake-0",
        receivedAt: "2026-11-08T00:00:00Z",
      };
    },
  };
}

/**
 * Tiny collector guard: refuses to collect against a repository's internal
 * network or an invalid tenant scope. The real adapters call this before
 * reaching out to a provider; the fictive one above never needs it.
 */
export function assertCollectRequestSafe(req: CollectRequest): void {
  if (!req.clientId) throw new Error("collect: missing clientId");
  if (!req.subjectId) throw new Error("collect: missing subjectId");
  if (!req.windowId) throw new Error("collect: missing windowId");
  if (!req.promptText || req.promptText.length < 3) {
    throw new Error("collect: promptText too short");
  }
}

/**
 * Collecteur OIA direct (`oia-direct`, mandat v14, bloc C) : implémentation du contrat
 * de src/collector.ts qui interroge les moteurs par leur API, avec les réglages
 * qu'Elmo 0.7.7 appliquait à J0 (relevé et écarts : docs/collecteur-oia-direct.md).
 *
 *  - une cible par appel, au format des fenêtres de measurement.yaml
 *    (`moteur:fournisseur:modèle[:online]`, comme SCRAPE_TARGETS d'Elmo), passée dans
 *    `engineOptions.target` ;
 *  - `rawText` : le texte de la réponse, extrait comme Elmo (comparable à J0) ;
 *    `structured.raw` : la réponse brute COMPLÈTE de chaque appel facturé ;
 *  - coût : grille src/cost-grid.ts sur les compteurs de chaque appel, relevée par le
 *    montant facturé quand l'API le donne (OpenRouter `usage.cost`). Un modèle absent de
 *    la grille rend le coût illisible : la preuve est gardée, comptée au majorant du
 *    fournisseur, et `structured.cost.readable` vaut false (collect-day s'arrête) ;
 *  - aucune clé n'est lue ailleurs que dans l'environnement passé (process.env en
 *    production), aucune n'est écrite ni affichée ;
 *  - `fetch` est injecté : aucun appel réseau dans les tests.
 */
import { assertCollectRequestSafe, type CollectRequest, type CollectResult, type Collector } from "./collector.js";
import { anthropicProvider } from "./collector-oia/anthropic.js";
import type { FetchLike, Sleep } from "./collector-oia/http.js";
import { realSleep } from "./collector-oia/http.js";
import { MISTRAL_MAX_CONTINUATIONS, mistralProvider } from "./collector-oia/mistral.js";
import { openaiProvider } from "./collector-oia/openai.js";
import { openrouterProvider } from "./collector-oia/openrouter.js";
import type { ProviderId, ProviderImpl } from "./collector-oia/types.js";
import { PRICE_GRID, runCostUsd, worstCaseRunUsd } from "./cost-grid.js";
import { sha256Hex } from "./evidence-store.js";

export const OIA_DIRECT_COLLECTOR = "oia-direct";

export const PROVIDERS: Record<ProviderId, ProviderImpl> = {
  "openai-api": openaiProvider,
  "anthropic-api": anthropicProvider,
  "mistral-api": mistralProvider,
  openrouter: openrouterProvider,
};

export interface Target {
  /** Moteur mesuré (chatgpt, claude…), clé de `engines` dans measurement.yaml. */
  engine: string;
  provider: ProviderId;
  model: string;
  webSearch: boolean;
  /** La cible telle qu'écrite dans la fenêtre. */
  raw: string;
}

/** Même découpage qu'Elmo (packages/config/src/scrape-targets.ts, l. 36-46). */
export function parseTarget(raw: string): Target {
  const parts = raw.trim().split(":");
  if (parts.length < 3) throw new Error(`cible "${raw}" : format moteur:fournisseur:modèle[:online] attendu`);
  const [engine, provider] = parts as [string, string];
  const webSearch = parts[parts.length - 1] === "online";
  const model = parts.slice(2, webSearch ? -1 : undefined).join(":");
  if (!model) throw new Error(`cible "${raw}" : modèle absent`);
  if (!(provider in PROVIDERS)) throw new Error(`cible "${raw}" : fournisseur "${provider}" non pris en charge par le collecteur OIA direct`);
  return { engine, provider: provider as ProviderId, model, webSearch, raw: raw.trim() };
}

/** Majorant d'un appel pour un fournisseur : la plus chère de ses entrées de la grille. */
export function providerWorstCaseUsd(provider: string): number | undefined {
  const entries = PRICE_GRID.filter((e) => e.provider === provider);
  return entries.length ? Math.max(...entries.map(worstCaseRunUsd)) : undefined;
}

/** Suite des conversations Mistral arrêtées après la recherche : désactivée sauf OIA_VIS_MISTRAL_CONTINUATION=1. */
export function mistralContinuationEnabled(env: Record<string, string | undefined>): boolean {
  return env.OIA_VIS_MISTRAL_CONTINUATION === "1";
}

/** Majorant d'un appel pour une cible : son entrée de la grille, sinon celle du fournisseur. */
export function targetWorstCaseUsd(t: Target, opts: { mistralContinuation?: boolean } = {}): number | undefined {
  const entry = PRICE_GRID.find((e) => e.provider === t.provider && e.versions.test(t.model));
  // Appels facturés au plus : Anthropic refait l'appel une fois ; Mistral, avec l'option, demande deux suites.
  const calls = t.provider === "mistral-api" ? (opts.mistralContinuation ? 1 + MISTRAL_MAX_CONTINUATIONS : 1) : t.provider === "anthropic-api" ? 2 : 1;
  const one = entry ? worstCaseRunUsd(entry) : providerWorstCaseUsd(t.provider);
  return one === undefined ? undefined : one * calls;
}

export interface CallCost {
  role: string;
  servedModel: string;
  /** Coût selon la grille (relevé par le montant facturé quand il est connu). */
  usd: number;
  /** Montant facturé donné par l'API (OpenRouter), sinon null. */
  billedUsd: number | null;
  fromUsage: boolean;
  /** Faux : modèle absent de la grille, coût compté au majorant du fournisseur. */
  readable: boolean;
}

export interface OiaDirectOptions {
  fetch: FetchLike;
  /** Environnement d'où lire les clés : process.env en production. */
  env: Record<string, string | undefined>;
  sleep?: Sleep;
  now?: () => Date;
}

export class MissingKeyError extends Error {}

export function createOiaDirectCollector(opts: OiaDirectOptions): Collector {
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? (() => new Date());
  return {
    name: OIA_DIRECT_COLLECTOR,
    async collect(req: CollectRequest): Promise<CollectResult> {
      assertCollectRequestSafe(req);
      const targetRaw = req.engineOptions?.target;
      if (typeof targetRaw !== "string") throw new Error("collect : engineOptions.target absent");
      const target = parseTarget(targetRaw);
      if (target.engine !== req.engine) throw new Error(`collect : la cible ${target.raw} ne mesure pas le moteur ${req.engine}`);
      const impl = PROVIDERS[target.provider];
      const apiKey = opts.env[impl.keyEnv];
      if (!apiKey) throw new MissingKeyError(`clé absente de l'environnement : ${impl.keyEnv}`);

      const r = await impl.call({
        fetch: opts.fetch,
        sleep,
        apiKey,
        model: target.model,
        webSearch: target.webSearch,
        prompt: req.promptText,
        mistralContinuation: mistralContinuationEnabled(opts.env),
      });

      const worst = providerWorstCaseUsd(target.provider) ?? 0;
      const costs: CallCost[] = r.calls.map((c) => {
        const cost = runCostUsd({ provider: target.provider, version: c.servedModel, webSearch: target.webSearch, usage: c.usage, searchItems: c.searchItems });
        const u = c.usage as { cost?: unknown } | undefined;
        const billedUsd = target.provider === "openrouter" && typeof u?.cost === "number" ? u.cost : null;
        return cost
          ? { role: c.role, servedModel: c.servedModel, usd: cost.usd, billedUsd, fromUsage: cost.fromUsage, readable: true }
          : { role: c.role, servedModel: c.servedModel, usd: Math.max(worst, billedUsd ?? 0), billedUsd, fromUsage: false, readable: false };
      });
      const costUsd = Math.round(costs.reduce((s, c) => s + c.usd, 0) * 1e6) / 1e6;
      const served = r.calls[r.calls.length - 1]?.servedModel ?? target.model;
      const receivedAt = now().toISOString();

      return {
        collectorName: OIA_DIRECT_COLLECTOR,
        collectorRunId: r.runId || `${OIA_DIRECT_COLLECTOR}:${sha256Hex(`${target.raw}\n${req.promptId}\n${receivedAt}`).slice(0, 16)}`,
        rawText: r.text,
        structured: {
          collector: OIA_DIRECT_COLLECTOR,
          provider: target.provider,
          target: target.raw,
          model: target.model,
          webSearch: target.webSearch,
          answered: r.text !== "",
          finishReason: r.finishReason,
          webQueries: r.webQueries,
          notes: r.notes,
          httpAttempts: r.calls.map((c) => c.httpAttempts),
          usage: r.calls.map((c) => c.usage ?? null),
          searchItems: r.calls.reduce((s, c) => s + c.searchItems, 0),
          cost: { usd: costUsd, readable: costs.every((c) => c.readable), perCall: costs },
          ...r.extra,
          raw: r.calls.map((c) => ({ role: c.role, body: c.raw })),
        },
        citations: r.citations.map((c) => (c.title === undefined ? { url: c.url } : { url: c.url, label: c.title })),
        costUsd,
        clientSha256Hex: sha256Hex(r.text),
        engineVersion: served,
        receivedAt,
      };
    },
  };
}

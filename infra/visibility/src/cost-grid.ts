/**
 * Grille de prix des modèles retenus pour la mesure, et calcul du coût réel
 * d'un mois à partir des runs d'Elmo (`prompt_runs.raw_output`, qui garde la
 * réponse brute du fournisseur, compteurs de tokens compris).
 *
 * Pourquoi : Elmo n'estime qu'un forfait par fournisseur
 * (`packages/lib/src/usage/cost.ts` de la v0.7.7 : 0,02 $ par run Anthropic
 * avec recherche, quel que soit le modèle). Avec claude-sonnet-5-5, le coût
 * réel est près de trois fois plus élevé. cost-guard.sh retient le maximum
 * entre cette grille, l'estimation d'Elmo, le solde OpenRouter et le relevé
 * manuel.
 *
 * Règles :
 *   - un run dont le modèle n'est pas dans la grille rend le coût illisible
 *     (cost-guard.sh arrête alors le worker) : changer de modèle impose de
 *     mettre la grille à jour d'abord ;
 *   - un run sans compteur de tokens est compté au majorant du modèle ;
 *   - un run échoué (usage_events.prompt_run_failed) est compté au majorant
 *     le plus cher de son fournisseur : il a pu être facturé en partie.
 *
 * CLI (lit des lignes JSON sur stdin, écrit le total en USD sur stdout) :
 *   {"kind":"run","provider":"anthropic-api","version":"claude-sonnet-5-5","webSearch":true,"usage":{...},"searchItems":0}
 *   {"kind":"failed","provider":"anthropic-api","count":2}
 * Code de sortie 3 si un modèle est absent de la grille (rien n'est écrit).
 */

export interface PriceEntry {
  provider: string;
  /** Identifiant tel qu'il figure dans SCRAPE_TARGETS. */
  id: string;
  /** Versions acceptées telles qu'Elmo les enregistre (prompt_runs.version). */
  versions: RegExp;
  inputPerMTok: number;
  outputPerMTok: number;
  perSearchUsd: number;
  /** Recherches facturables au plus par run (plafond posé par Elmo, nouvelle tentative comprise). */
  maxSearchesPerRun: number;
  source: string;
  verifiedAt: string;
  /** Prix non publié par le fournisseur : majorant provisoire, signalé à chaque relevé. */
  provisional?: string;
}

/** Hypothèse de majorant quand un run n'a pas de compteur de tokens. */
export const WORST_CASE_TOKENS = { input: 20_000, output: 8_000 } as const;

export const PRICE_GRID: PriceEntry[] = [
  {
    provider: "openai-api",
    id: "gpt-6-luna",
    versions: /^gpt-6-luna(-\d{4}-\d{2}-\d{2})?$/,
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    perSearchUsd: 0.01,
    maxSearchesPerRun: 2,
    source: "developers.openai.com/api/docs/pricing (recherche web : 10 $ / 1 000 appels)",
    verifiedAt: "2026-11-07",
  },
  {
    provider: "anthropic-api",
    id: "claude-sonnet-5-5",
    versions: /^claude-sonnet-5-5$/,
    inputPerMTok: 2,
    outputPerMTok: 10,
    perSearchUsd: 0.01,
    maxSearchesPerRun: 2,
    source: "platform.claude.com/docs (models overview ; web search tool : 10 $ / 1 000 recherches)",
    verifiedAt: "2026-11-07",
  },
  {
    provider: "mistral-api",
    id: "mistral-large-4",
    // Mistral renvoie la version servie (`model` de la réponse), que garde Elmo.
    versions: /^mistral-large-(4(-0)?(-\d{2}-\d{2})?|2610)$/,
    inputPerMTok: 0.7,
    outputPerMTok: 2.1,
    perSearchUsd: 0.03,
    maxSearchesPerRun: 3,
    source: "docs.mistral.ai/models/mistral-large-4-0 et docs.mistral.ai/inference/pricing (0,70 $ / 2,10 $ par M) ; outil web_search : 0,03 $ provisoire",
    verifiedAt: "2026-11-07",
    provisional: "prix de l'outil web_search non publié par Mistral au 2026-11-07 ; se lira sur la première facture",
  },
  {
    provider: "openrouter",
    id: "google/gemini-3-flash-preview",
    versions: /^google\/gemini-3-flash-preview(-\d[\w-]*)?(:online)?$/,
    inputPerMTok: 0.5,
    outputPerMTok: 3,
    perSearchUsd: 0.014,
    maxSearchesPerRun: 1,
    source: "openrouter.ai/api/v1/models (pricing.prompt, completion, web_search)",
    verifiedAt: "2026-11-07",
  },
  {
    provider: "openrouter",
    id: "perplexity/sonar",
    versions: /^perplexity\/sonar(:online)?$/,
    inputPerMTok: 1,
    outputPerMTok: 1,
    perSearchUsd: 0.005,
    maxSearchesPerRun: 1,
    source: "openrouter.ai/api/v1/models (pricing.prompt, completion, web_search)",
    verifiedAt: "2026-11-07",
  },
];

export interface RunRecord {
  provider: string;
  version: string;
  webSearch: boolean;
  /** `raw_output->'usage'` tel qu'enregistré par Elmo. */
  usage: unknown;
  /** Recherches lues dans la réponse : `web_search_call` (OpenAI), `tool.execution` web_search (Mistral). */
  searchItems: number;
}

export interface RunCost {
  usd: number;
  entry: PriceEntry;
  /** Faux si le coût vient du majorant (compteurs absents). */
  fromUsage: boolean;
}

export function findPrice(provider: string, version: string): PriceEntry | undefined {
  return PRICE_GRID.find((e) => e.provider === provider && e.versions.test(version));
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function tokenCost(entry: PriceEntry, input: number, output: number): number {
  return (input * entry.inputPerMTok + output * entry.outputPerMTok) / 1_000_000;
}

export function worstCaseRunUsd(entry: PriceEntry): number {
  return (
    tokenCost(entry, WORST_CASE_TOKENS.input, WORST_CASE_TOKENS.output) + entry.maxSearchesPerRun * entry.perSearchUsd
  );
}

/** Lit les compteurs de la réponse brute, selon le format du fournisseur. null = absents. */
function readUsage(run: RunRecord): { input: number; output: number; searches: number; billedUsd?: number } | null {
  const u = run.usage;
  if (!isObj(u)) return null;
  switch (run.provider) {
    case "openai-api":
      // Responses API : les tokens des résultats de recherche sont déjà dans input_tokens.
      if (u.input_tokens === undefined && u.output_tokens === undefined) return null;
      return { input: num(u.input_tokens), output: num(u.output_tokens), searches: run.searchItems };
    case "anthropic-api": {
      if (u.input_tokens === undefined && u.output_tokens === undefined) return null;
      const tool = isObj(u.server_tool_use) ? u.server_tool_use : {};
      return {
        // Les écritures et lectures de cache sont comptées au prix plein : majorant.
        input: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
        output: num(u.output_tokens),
        searches: num(tool.web_search_requests),
      };
    }
    case "mistral-api": {
      if (u.prompt_tokens === undefined && u.completion_tokens === undefined) return null;
      const connectors = isObj(u.connectors) ? u.connectors : {};
      return {
        input: num(u.prompt_tokens) + num(u.connector_tokens),
        output: num(u.completion_tokens),
        searches: Math.max(num(connectors.web_search), run.searchItems),
      };
    }
    case "openrouter":
      if (u.prompt_tokens === undefined && u.completion_tokens === undefined && u.cost === undefined) return null;
      return {
        input: num(u.prompt_tokens),
        output: num(u.completion_tokens),
        // OpenRouter ne dit pas combien de recherches ont tourné : une par run en ligne.
        searches: run.webSearch ? 1 : 0,
        // Montant facturé par OpenRouter, quand la réponse le donne.
        billedUsd: typeof u.cost === "number" && Number.isFinite(u.cost) ? u.cost : undefined,
      };
    default:
      return null;
  }
}

/** Coût d'un run, ou undefined si son modèle n'est pas dans la grille. */
export function runCostUsd(run: RunRecord): RunCost | undefined {
  const entry = findPrice(run.provider, run.version);
  if (!entry) return undefined;
  const usage = readUsage(run);
  if (!usage) return { usd: worstCaseRunUsd(entry), entry, fromUsage: false };
  const searches = run.webSearch ? usage.searches : 0;
  const computed = tokenCost(entry, usage.input, usage.output) + searches * entry.perSearchUsd;
  // Le montant facturé ne fait que relever le calcul, jamais le baisser.
  const usd = usage.billedUsd !== undefined ? Math.max(usage.billedUsd, computed) : computed;
  return { usd, entry, fromUsage: true };
}

export type CostLine =
  | ({ kind: "run" } & RunRecord)
  | { kind: "failed"; provider: string; count: number };

export interface MonthCost {
  usd: number;
  unknown: string[];
  provisional: string[];
  worstCaseRuns: number;
}

export function monthCostUsd(lines: CostLine[]): MonthCost {
  let usd = 0;
  let worstCaseRuns = 0;
  const unknown = new Set<string>();
  const provisional = new Set<string>();
  for (const line of lines) {
    if (line.kind === "failed") {
      const entries = PRICE_GRID.filter((e) => e.provider === line.provider);
      if (entries.length === 0) {
        unknown.add(`${line.provider} (run échoué)`);
        continue;
      }
      usd += num(line.count) * Math.max(...entries.map(worstCaseRunUsd));
      worstCaseRuns += num(line.count);
      continue;
    }
    const cost = runCostUsd(line);
    if (!cost) {
      unknown.add(`${line.provider}:${line.version}`);
      continue;
    }
    usd += cost.usd;
    if (!cost.fromUsage) worstCaseRuns += 1;
    if (cost.entry.provisional) provisional.add(`${cost.entry.id} : ${cost.entry.provisional}`);
  }
  return { usd, unknown: [...unknown], provisional: [...provisional], worstCaseRuns };
}

async function main(): Promise<void> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CostLine);
  const result = monthCostUsd(lines);
  if (result.unknown.length > 0) {
    process.stderr.write(`Modèle absent de la grille de prix (src/cost-grid.ts) : ${result.unknown.join(", ")}\n`);
    process.exit(3);
  }
  for (const p of result.provisional) process.stderr.write(`Prix provisoire : ${p}\n`);
  if (result.worstCaseRuns > 0) process.stderr.write(`${result.worstCaseRuns} run(s) comptés au majorant\n`);
  process.stdout.write(result.usd.toFixed(4));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    process.stderr.write(`cost-grid : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(4);
  });
}

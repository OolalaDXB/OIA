import type { VisibilityLLM, LLMPurpose } from "./llm";

/**
 * Emplacements d'adaptateurs LLM (G1). Chacun reste **désactivé** cette nuit :
 * l'appel réel refuse en jetant. L'activation se fait en remplaçant l'export
 * du module par une implémentation complète, lue depuis l'environnement.
 *
 * `createLLMFromEnv()` lit la configuration par `LLMPurpose` et renvoie un
 * `VisibilityLLM` composite : chaque méthode route vers l'adaptateur configuré
 * pour cette purpose. Aucune valeur par défaut payante.
 */

export interface LLMConfig {
  /** Nom de l'adaptateur. Doit correspondre à une clé de `ADAPTERS`. */
  provider: "mistral" | "anthropic" | "openai" | "gemini" | "fake";
  /** Modèle exact (ex: `mistral-medium-latest`). */
  model: string;
  /** Plafond par appel, USD. */
  maxCostUsd?: number;
}

/** Table de configuration par purpose. */
export type LLMConfigByPurpose = Partial<Record<LLMPurpose, LLMConfig>>;

/** Lit une configuration depuis `process.env`. */
export function readLLMConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfigByPurpose {
  const out: LLMConfigByPurpose = {};
  const purposes: LLMPurpose[] = [
    "panel.reformulate",
    "panel.suggest",
    "facts.extract",
    "content.write",
    "report.review",
    "report.summarize",
  ];
  for (const p of purposes) {
    const key = p.toUpperCase().replace(/\./g, "_");
    const provider = env[`OIA_VIS_LLM_${key}_PROVIDER`];
    const model = env[`OIA_VIS_LLM_${key}_MODEL`];
    const maxCost = env[`OIA_VIS_LLM_${key}_MAX_COST_USD`];
    if (provider && model) {
      out[p] = {
        provider: provider as LLMConfig["provider"],
        model,
        maxCostUsd: maxCost ? Number(maxCost) : undefined,
      };
    }
  }
  return out;
}

const DISABLED_MSG = (provider: string) =>
  `LLM adapter "${provider}" is a placeholder this night (G1). Enable it by replacing src/llm-adapters.ts#createAdapter().`;

function disabled(provider: string): () => Promise<never> {
  return async () => {
    throw new Error(DISABLED_MSG(provider));
  };
}

/**
 * Crée un adaptateur. **Toutes les implémentations réelles sont désactivées.**
 * Une activation plus tard remplace cette fonction.
 */
export function createAdapter(cfg: LLMConfig): VisibilityLLM {
  const nope = disabled(cfg.provider);
  return {
    name: cfg.provider,
    defaultModel: cfg.model,
    reformulate: nope,
    suggest: nope,
    extract: nope,
    write: nope,
    review: nope,
    summarize: nope,
  } as unknown as VisibilityLLM;
}

/**
 * Compose un VisibilityLLM qui dispatche par purpose. Si une purpose n'est pas
 * configurée, l'appel renvoie une promesse rejetée. Le harness tests passe
 * une implémentation fictive complète à la place (voir `llm.test.ts`).
 */
export function composeLLM(byPurpose: LLMConfigByPurpose): VisibilityLLM {
  const cache = new Map<string, VisibilityLLM>();
  async function get(p: LLMPurpose): Promise<VisibilityLLM> {
    const cfg = byPurpose[p];
    if (!cfg) throw new Error(`composeLLM: no adapter configured for purpose "${p}"`);
    const key = `${cfg.provider}:${cfg.model}`;
    let a = cache.get(key);
    if (!a) {
      a = createAdapter(cfg);
      cache.set(key, a);
    }
    return a;
  }
  return {
    name: "composed",
    defaultModel: "configured-per-purpose",
    reformulate: async (req) => (await get(req.purpose)).reformulate(req),
    suggest: async (req) => (await get(req.purpose)).suggest(req),
    extract: async (req) => (await get(req.purpose)).extract(req),
    write: async (req) => (await get(req.purpose)).write(req),
    review: async (req) => (await get(req.purpose)).review(req),
    summarize: async (req) => (await get(req.purpose)).summarize(req),
  };
}

import type { VisibilityLLM } from "../llm";
import type { Mission } from "./mission";

/**
 * Interface d'exécution d'un agent SEO Command. Quatre adaptateurs :
 *   `fake`    : déterministe, pour les tests.
 *   `claude-code-headless` : préparé, désactivé.
 *   `llm-api` : via VisibilityLLM, préparé, désactivé.
 *   `manual`  : transforme la mission en tâche humaine.
 *
 * Tous les exécuteurs d'agents tournent avec la variable `OIA_SEO_IS_AGENT=1`
 * dans leur environnement (ou l'équivalent dans leur contexte). Un test de
 * B2 (`resolveHumanValidator`) prouve qu'un exécuteur ne peut pas valider.
 */

export type ExecutorName = "fake" | "claude-code-headless" | "llm-api" | "manual";

export interface AgentOutput {
  /** Recommendation IDs produits (pointent vers les fichiers / lignes `vis.recommendation`). */
  recommendationIds: string[];
  /** Evidence IDs utilisés. */
  evidenceIds: string[];
  /** Coût réel consommé. */
  costUsd: number;
  /** La mission a-t-elle produit une proposition d'écriture ? */
  hasWriteProposal: boolean;
  notes?: string;
}

export interface Executor {
  readonly name: ExecutorName;
  /** `true` si cet exécuteur est prêt à être appelé en production. */
  readonly enabled: boolean;
  execute(mission: Mission, ctx: { llm?: VisibilityLLM }): Promise<AgentOutput>;
}

/** Exécuteur fictif déterministe (tests). */
export function createFakeExecutor(opts: {
  output?: Partial<AgentOutput>;
} = {}): Executor {
  return {
    name: "fake",
    enabled: true,
    async execute(mission) {
      return {
        recommendationIds: opts.output?.recommendationIds ?? [`rec-fake-${mission.id}`],
        evidenceIds: opts.output?.evidenceIds ?? [],
        costUsd: opts.output?.costUsd ?? 0,
        hasWriteProposal: opts.output?.hasWriteProposal ?? true,
        notes: opts.output?.notes ?? "[donnée fictive] exécuteur fake",
      };
    },
  };
}

export function createDisabledClaudeCodeExecutor(): Executor {
  return {
    name: "claude-code-headless",
    enabled: false,
    async execute() {
      throw new Error("executor claude-code-headless is disabled this night (see E5).");
    },
  };
}

export function createDisabledLlmApiExecutor(): Executor {
  return {
    name: "llm-api",
    enabled: false,
    async execute() {
      throw new Error("executor llm-api is disabled this night (G1 branche un vrai modèle plus tard).");
    },
  };
}

export function createManualExecutor(opts: { assignTo: string }): Executor {
  return {
    name: "manual",
    enabled: true,
    async execute(mission) {
      return {
        recommendationIds: [],
        evidenceIds: [],
        costUsd: 0,
        hasWriteProposal: false,
        notes: `Mission ${mission.id} assignée à ${opts.assignTo} (manuel).`,
      };
    },
  };
}

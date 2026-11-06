import type { VisibilityLLM } from "../llm";
import type { ActionLog } from "./action-log";
import type { BudgetGuard } from "./budget";
import type { Executor } from "./executor";
import type { Mission } from "./mission";
import type { Queue } from "./queue";

/**
 * Noyau de SEO Command : prend une mission `planned`, réserve un budget,
 * appelle un exécuteur, pose en `waiting-validation` si une écriture est
 * proposée, ou en `done` sinon. Jamais d'exécution sans validation humaine
 * quand il y a une proposition d'écriture (règle 16).
 */

export interface OrchestratorCtx {
  queue: Queue;
  budget: BudgetGuard;
  log: ActionLog;
  executors: Record<string, Executor>;
  llm?: VisibilityLLM;
  /** Le planificateur du contexte, pour tracer son état dans les logs. */
  env?: Record<string, string | undefined>;
}

export interface AckValidation {
  missionId: string;
  humanId: string;
  decidedAt: string;
}

/** Fait tourner une étape : prend la prochaine mission planifiée et la termine. */
export async function tick(ctx: OrchestratorCtx, workerId: string): Promise<Mission | null> {
  const next = ctx.queue.claim(workerId);
  if (!next) return null;

  // Budget d'abord.
  const r = ctx.budget.reserve({ missionId: next.id, amountUsd: next.reservedBudgetUsd });
  if (r === "refused-cap") {
    const updated = ctx.queue.transition(next.id, "waiting-budget");
    ctx.log.append({ who: "seo-command-orchestrator", what: "mission.waiting-budget", clientId: next.clientId, missionId: next.id });
    return updated;
  }

  const executor = ctx.executors[next.agents[0]!] ?? ctx.executors.fake;
  if (!executor) {
    ctx.budget.cancel({ missionId: next.id });
    const updated = ctx.queue.transition(next.id, "failed");
    ctx.log.append({ who: "seo-command-orchestrator", what: "mission.failed-no-executor", clientId: next.clientId, missionId: next.id });
    return updated;
  }
  if (!executor.enabled) {
    ctx.budget.cancel({ missionId: next.id });
    const updated = ctx.queue.transition(next.id, "failed");
    ctx.log.append({ who: "seo-command-orchestrator", what: "mission.failed-executor-disabled", clientId: next.clientId, missionId: next.id, details: { executor: executor.name } });
    return updated;
  }

  ctx.log.append({ who: executor.name, what: "mission.start", clientId: next.clientId, missionId: next.id });
  try {
    const out = await executor.execute(next, { llm: ctx.llm });
    ctx.budget.settle({ missionId: next.id, costUsd: out.costUsd });
    if (out.hasWriteProposal) {
      const updated = ctx.queue.transition(next.id, "waiting-validation", {
        actualCostUsd: out.costUsd,
        results: { recommendationIds: out.recommendationIds, evidenceIds: out.evidenceIds, notes: out.notes },
      });
      ctx.log.append({ who: executor.name, what: "mission.waiting-validation", clientId: next.clientId, missionId: next.id, costUsd: out.costUsd });
      return updated;
    }
    const updated = ctx.queue.transition(next.id, "done", {
      actualCostUsd: out.costUsd,
      results: { recommendationIds: out.recommendationIds, evidenceIds: out.evidenceIds, notes: out.notes },
    });
    ctx.log.append({ who: executor.name, what: "mission.done", clientId: next.clientId, missionId: next.id, costUsd: out.costUsd });
    return updated;
  } catch (err) {
    ctx.budget.cancel({ missionId: next.id });
    const updated = ctx.queue.transition(next.id, "failed");
    ctx.log.append({ who: executor.name, what: "mission.failed", clientId: next.clientId, missionId: next.id, details: { error: (err as Error).message } });
    return updated;
  }
}

/** Acquitte une validation humaine (règle 16) : passe une mission à `done`. */
export function ackValidation(ctx: OrchestratorCtx, ack: AckValidation, isAgent: boolean): Mission {
  if (isAgent) {
    throw new Error("ackValidation refused: current executor is an agent (règle 16).");
  }
  const m = ctx.queue.get(ack.missionId);
  if (!m) throw new Error(`ackValidation: unknown mission "${ack.missionId}"`);
  if (m.state !== "waiting-validation") {
    throw new Error(`ackValidation refused: mission state is "${m.state}" (expected waiting-validation).`);
  }
  const updated = ctx.queue.transition(ack.missionId, "done", {
    validatedBy: ack.humanId,
    validatedAt: ack.decidedAt,
  });
  ctx.log.append({ who: `humain:${ack.humanId}`, what: "mission.validated", clientId: m.clientId, missionId: m.id });
  return updated;
}

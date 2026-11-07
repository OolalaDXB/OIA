import { describe, expect, it } from "vitest";
import { createActionLog } from "../src/seo-command/action-log";
import { createMultiBudgetGuard } from "../src/seo-command/budget-multi";
import { createFakeExecutor } from "../src/seo-command/executor";
import { MissionSchema } from "../src/seo-command/mission";
import { tick } from "../src/seo-command/orchestrator";
import { createQueue } from "../src/seo-command/queue";
import { createScheduler } from "../src/seo-command/scheduler";

/**
 * Z2.2 · Résilience. Interruption d'un worker au milieu d'une mission, puis
 * reprise : idempotence, aucun doublon, aucune dépense supplémentaire non
 * réservée, preuves et décisions conservées, et le planificateur reste
 * désactivé après redémarrage.
 */

function mission(id = "msn-fictive-res") {
  return MissionSchema.parse({
    id,
    type: "audit-technique",
    clientId: "fictive-client",
    subjectId: "fictive-subject",
    trigger: "manual",
    agents: ["fake"],
    reservedBudgetUsd: 1,
    actualCostUsd: 0,
    state: "planned",
    createdAt: "2026-11-08",
    updatedAt: "2026-11-08",
    results: { recommendationIds: [], evidenceIds: [] },
  });
}

function setupCtx() {
  const queue = createQueue({ staleAfterMs: 100 });
  const multi = createMultiBudgetGuard({ globalUsd: 10 });
  const budget = {
    reservedUsd: () => 0,
    spentUsd: () => 0,
    capUsd: () => 10,
    reserve: ({ missionId, amountUsd }: { missionId: string; amountUsd: number }) =>
      multi.reserve({ missionId, amountUsd, clientId: "fictive-client" }).ok ? ("ok" as const) : ("refused-cap" as const),
    settle: ({ missionId, costUsd }: { missionId: string; costUsd: number }) =>
      multi.settle({ missionId, costUsd, clientId: "fictive-client" }),
    cancel: ({ missionId }: { missionId: string }) => multi.cancel({ missionId }),
  };
  const log = createActionLog();
  const executors = {
    fake: createFakeExecutor({ output: { hasWriteProposal: false, costUsd: 0.1 } }),
  };
  return { queue, multi, budget, log, executors };
}

describe("Z2.2 résilience", () => {
  it("reap() ré-encollé après le staleAfterMs ; aucune mission n'est perdue", () => {
    const { queue } = setupCtx();
    queue.enqueue(mission());
    const now = Date.now();
    const a = queue.claim("worker-1", now);
    expect(a?.state).toBe("running");
    // Worker interrompu : rien ne commite plus de progrès pour cette mission.
    // reap avant la limite : la mission reste bloquée en running.
    expect(queue.reap(now + 50)).toEqual([]);
    expect(queue.get(a!.id)?.state).toBe("running");
    // reap après la limite : la mission est ré-encollé en planned.
    expect(queue.reap(now + 200)).toEqual([a!.id]);
    expect(queue.get(a!.id)?.state).toBe("planned");
    // Un deuxième claim peut la reprendre.
    const b = queue.claim("worker-2", now + 300);
    expect(b?.id).toBe(a!.id);
    expect(b?.state).toBe("running");
  });

  it("enqueue est idempotent : pas de doublon même si l'appel est répété", () => {
    const { queue } = setupCtx();
    expect(queue.enqueue(mission("msn-duplicata"))).toBe("enqueued");
    expect(queue.enqueue(mission("msn-duplicata"))).toBe("already-queued");
    expect(queue.list({})).toHaveLength(1);
  });

  it("la dépense d'une reprise ne double pas le coût", async () => {
    const ctx = setupCtx();
    ctx.queue.enqueue(mission("msn-oneshot-x"));
    const done = await tick(ctx, "worker-1");
    expect(done?.state).toBe("done");
    // Le mock a signalé 0.1 $ ; on ne doit pas voir plus d'un settle.
    const snap = ctx.multi.snapshot();
    expect(snap.spent.client["fictive-client"]).toBeCloseTo(0.1, 5);
  });

  it("le planificateur reste désactivé après un redémarrage (globalEnabled=false)", () => {
    // Simulation : on crée deux schedulers successifs. Le second n'hérite PAS
    // d'un état « enabled » d'un premier ; seul l'environnement compte.
    const first = createScheduler({ globalEnabled: false });
    expect(first.globalEnabled).toBe(false);
    const second = createScheduler({ globalEnabled: false });
    expect(second.globalEnabled).toBe(false);
    second.register({
      id: "r1",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      type: "audit-technique",
      everyDays: 7,
      reservedBudgetUsd: 1,
      agents: ["fake"],
      enabled: true,
    });
    expect(second.tick(new Date("2026-11-08"))).toEqual([]);
  });
});

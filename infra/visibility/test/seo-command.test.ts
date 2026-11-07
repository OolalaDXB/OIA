import { describe, expect, it } from "vitest";
import { createActionLog } from "../src/seo-command/action-log";
import { createBudgetGuard } from "../src/seo-command/budget";
import {
  createDisabledClaudeCodeExecutor,
  createDisabledLlmApiExecutor,
  createFakeExecutor,
  createManualExecutor,
} from "../src/seo-command/executor";
import { MissionSchema, canTransition, type Mission } from "../src/seo-command/mission";
import { ackValidation, tick, type OrchestratorCtx, type ValidationGateway } from "../src/seo-command/orchestrator";
import { createQueue } from "../src/seo-command/queue";
import { createScheduler } from "../src/seo-command/scheduler";
import { missionsForEvent } from "../src/seo-command/trigger";

function mission(overrides: Partial<Mission> = {}): Mission {
  return MissionSchema.parse({
    id: "msn-fictive-1",
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
    ...overrides,
  });
}

describe("Mission state machine", () => {
  it("accepts planned → running → waiting-validation → done", () => {
    expect(canTransition("planned", "running")).toBe(true);
    expect(canTransition("running", "waiting-validation")).toBe(true);
    expect(canTransition("waiting-validation", "done")).toBe(true);
  });
  it("refuses done → anything", () => {
    expect(canTransition("done", "planned")).toBe(false);
  });
});

describe("Queue idempotency and claim", () => {
  it("enqueue is idempotent", () => {
    const q = createQueue();
    expect(q.enqueue(mission())).toBe("enqueued");
    expect(q.enqueue(mission())).toBe("already-queued");
    expect(q.list().length).toBe(1);
  });
  it("claim prevents double-pickup", () => {
    const q = createQueue();
    q.enqueue(mission());
    const a = q.claim("worker-A");
    const b = q.claim("worker-B");
    expect(a?.id).toBe("msn-fictive-1");
    expect(b).toBeNull();
    expect(q.get("msn-fictive-1")?.state).toBe("running");
  });
  it("reap() requeues a stale running mission", () => {
    const q = createQueue({ staleAfterMs: 1000 });
    q.enqueue(mission());
    const now = Date.now();
    q.claim("worker-A", now);
    expect(q.reap(now + 500)).toEqual([]);
    expect(q.reap(now + 2000)).toEqual(["msn-fictive-1"]);
    expect(q.get("msn-fictive-1")?.state).toBe("planned");
  });
});

describe("Scheduler is OFF by default (règle 16)", () => {
  it("tick returns nothing when globalEnabled is false", () => {
    const s = createScheduler({ globalEnabled: false });
    s.register({
      id: "rec-weekly",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      type: "audit-technique",
      everyDays: 7,
      reservedBudgetUsd: 1,
      agents: ["fake"],
      enabled: true,
    });
    expect(s.tick(new Date("2026-11-08"))).toEqual([]);
  });
  it("S2 : enabled fourni par l'appelant est toujours ignoré (toggle en base)", () => {
    const s = createScheduler({ globalEnabled: true });
    s.register({
      id: "rec-weekly",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      type: "audit-technique",
      everyDays: 7,
      reservedBudgetUsd: 1,
      agents: ["fake"],
      enabled: true,
    });
    // L'appelant a demandé enabled=true, mais l'orchestrateur force à false ;
    // l'activation passe désormais par `vis.toggle_scheduler` (base, security
    // definer avec contrôle auth.uid() + rôle).
    expect(s.list()[0]?.enabled).toBe(false);
    expect(s.tick(new Date("2026-11-08"))).toEqual([]);
  });
  it("register ignores enabled even if present (S2)", () => {
    const s = createScheduler({ globalEnabled: true });
    s.register({
      id: "rec-weekly-2",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      type: "audit-technique",
      everyDays: 7,
      reservedBudgetUsd: 1,
      agents: ["fake"],
      enabled: true,
    });
    expect(s.list()[0]?.enabled).toBe(false);
    expect(s.tick(new Date("2026-11-08"))).toEqual([]);
  });
});

describe("Triggers", () => {
  it("fin de fenêtre → mission report-review", () => {
    const [m] = missionsForEvent({ kind: "window-end", clientId: "fc", subjectId: "fs", windowId: "j0" }, "2026-11-08");
    expect(m?.type).toBe("report-review");
    expect(m?.trigger).toBe("window-end");
  });
  it("PR fusionnée → post-deploy-analysis avec sourcePrRef", () => {
    const [m] = missionsForEvent({ kind: "pr-merged", clientId: "fc", subjectId: "fs", prRef: "pr#1", recommendationId: "rec-x" }, "2026-11-08");
    expect(m?.type).toBe("post-deploy-analysis");
    expect(m?.sourcePrRef).toBe("pr#1");
  });
  it("alerte seuil → competitive-watch", () => {
    const [m] = missionsForEvent({ kind: "threshold-alert", clientId: "fc", subjectId: "fs", metric: "share", value: 10, threshold: 20 }, "2026-11-08");
    expect(m?.type).toBe("competitive-watch");
  });
});

describe("Budget refuses at cap", () => {
  it("reserve returns refused-cap when the cap is exceeded", () => {
    const b = createBudgetGuard({ capUsd: 5 });
    expect(b.reserve({ missionId: "m1", amountUsd: 3 })).toBe("ok");
    expect(b.reserve({ missionId: "m2", amountUsd: 3 })).toBe("refused-cap");
  });
});

describe("Disabled executors refuse to run", () => {
  it("claude-code-headless throws", async () => {
    const e = createDisabledClaudeCodeExecutor();
    expect(e.enabled).toBe(false);
    await expect(e.execute(mission(), {})).rejects.toThrow(/disabled/);
  });
  it("llm-api throws", async () => {
    const e = createDisabledLlmApiExecutor();
    expect(e.enabled).toBe(false);
    await expect(e.execute(mission(), {})).rejects.toThrow(/disabled/);
  });
  it("manual returns an output without hasWriteProposal", async () => {
    const e = createManualExecutor({ assignTo: "mt" });
    const out = await e.execute(mission(), {});
    expect(out.hasWriteProposal).toBe(false);
  });
});

describe("Orchestrator end-to-end (données fictives)", () => {
  function gateway(overrides: Partial<{ fails: string; decidedBy: string }> = {}): ValidationGateway {
    return {
      async validateRecommendation(recId, _reason) {
        if (overrides.fails) throw new Error(overrides.fails);
        return { decisionId: 1, clientId: "fictive-client", decidedBy: overrides.decidedBy ?? "mt" };
      },
    };
  }

  async function setup(opts: { withWriteProposal: boolean; capUsd?: number; validation?: ValidationGateway }): Promise<OrchestratorCtx> {
    const queue = createQueue();
    const budget = createBudgetGuard({ capUsd: opts.capUsd ?? 10 });
    const log = createActionLog();
    const executors = {
      fake: createFakeExecutor({
        output: {
          recommendationIds: ["rec-fictive-tech"],
          evidenceIds: ["ev-fictive-1"],
          costUsd: 0.5,
          hasWriteProposal: opts.withWriteProposal,
        },
      }),
      "claude-code-headless": createDisabledClaudeCodeExecutor(),
      "llm-api": createDisabledLlmApiExecutor(),
      manual: createManualExecutor({ assignTo: "mt" }),
    };
    queue.enqueue(mission({ agents: ["fake"] }));
    return { queue, budget, log, executors, validation: opts.validation };
  }

  it("a read-only mission goes planned → running → done, no validation", async () => {
    const ctx = await setup({ withWriteProposal: false });
    const next = await tick(ctx, "worker-1");
    expect(next?.state).toBe("done");
    expect(next?.actualCostUsd).toBe(0.5);
    expect(ctx.log.all().some((e) => e.what === "mission.done")).toBe(true);
  });

  it("a mission that proposes a write stops at waiting-validation", async () => {
    const ctx = await setup({ withWriteProposal: true });
    const next = await tick(ctx, "worker-1");
    expect(next?.state).toBe("waiting-validation");
    expect(ctx.log.all().some((e) => e.what === "mission.waiting-validation")).toBe(true);
  });

  it("S2 : ackValidation refusée quand la base rejette (identité de service)", async () => {
    const ctx = await setup({
      withWriteProposal: true,
      validation: gateway({ fails: "validate_recommendation refusée : identité de service (seo-worker-7)" }),
    });
    await tick(ctx, "worker-1");
    await expect(
      ackValidation(ctx, { missionId: "msn-fictive-1", decidedAt: "2026-11-08" }),
    ).rejects.toThrow(/identité de service/);
  });

  it("S2 : ackValidation refusée si aucune passerelle configurée", async () => {
    const ctx = await setup({ withWriteProposal: true /* pas de validation */ });
    await tick(ctx, "worker-1");
    await expect(
      ackValidation(ctx, { missionId: "msn-fictive-1", decidedAt: "2026-11-08" }),
    ).rejects.toThrow(/no validation gateway/);
  });

  it("S2 : ackValidation acceptée quand la base valide ; validatedBy vient d'auth.uid()", async () => {
    const ctx = await setup({ withWriteProposal: true, validation: gateway({ decidedBy: "u-mickael" }) });
    await tick(ctx, "worker-1");
    const done = await ackValidation(ctx, { missionId: "msn-fictive-1", decidedAt: "2026-11-08" });
    expect(done.state).toBe("done");
    // L'identité qui valide vient de la base (auth.uid()), pas d'un humanId
    // fourni par l'appelant.
    expect(done.validatedBy).toBe("u-mickael");
    expect(ctx.log.all().some((e) => e.what === "mission.validated")).toBe(true);
  });

  it("budget refusal moves the mission to waiting-budget without executing the agent", async () => {
    const ctx = await setup({ withWriteProposal: false, capUsd: 0 });
    const out = await tick(ctx, "worker-1");
    expect(out?.state).toBe("waiting-budget");
    expect(out?.actualCostUsd).toBe(0);
  });

  it("E5 bout en bout : planifiée → agent fictif → recommandation → attente → validation simulée → done", async () => {
    const ctx = await setup({ withWriteProposal: true, validation: gateway() });
    const m1 = await tick(ctx, "w");
    expect(m1?.state).toBe("waiting-validation");
    expect(m1?.results.recommendationIds).toContain("rec-fictive-tech");
    // Validation simulée par la base (S2)
    const done = await ackValidation(ctx, { missionId: "msn-fictive-1", decidedAt: "2026-11-08" });
    expect(done.state).toBe("done");
    // Événement fictif de PR fusionnée déclenche une post-deploy-analysis
    const postDeploy = missionsForEvent(
      { kind: "pr-merged", clientId: "fictive-client", subjectId: "fictive-subject", prRef: "pr#1", recommendationId: "rec-fictive-tech" },
      "2026-11-08",
    );
    expect(postDeploy[0]?.type).toBe("post-deploy-analysis");
    expect(postDeploy[0]?.sourcePrRef).toBe("pr#1");
  });
});

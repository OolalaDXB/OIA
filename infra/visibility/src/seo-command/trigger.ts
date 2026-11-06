import type { Mission, MissionType } from "./mission";

/**
 * Déclencheurs d'évènements : une mission se crée automatiquement quand une
 * fenêtre se termine, qu'une PR est fusionnée, qu'un déploiement est détecté,
 * ou qu'une alerte de seuil est levée. Testés sur fixtures.
 */

export type Event =
  | { kind: "window-end"; clientId: string; subjectId: string; windowId: string }
  | { kind: "deploy-detected"; clientId: string; subjectId: string; siteId: string; commitSha: string }
  | { kind: "pr-merged"; clientId: string; subjectId: string; prRef: string; recommendationId: string }
  | { kind: "threshold-alert"; clientId: string; subjectId: string; metric: string; value: number; threshold: number };

export type MissionSpec = Pick<Mission, "id" | "type" | "clientId" | "subjectId" | "trigger" | "agents" | "reservedBudgetUsd" | "sourcePrRef">;

export function missionsForEvent(event: Event, now: string): MissionSpec[] {
  switch (event.kind) {
    case "window-end":
      return [
        mk({
          id: `msn-we-${shortId()}`,
          type: "report-review",
          clientId: event.clientId,
          subjectId: event.subjectId,
          trigger: "window-end",
          agents: ["seo-command-orchestrator", "seo-command-technique", "seo-command-aeo"],
          reservedBudgetUsd: 2,
        }, now),
      ];
    case "deploy-detected":
      return [
        mk({
          id: `msn-dp-${shortId()}`,
          type: "post-deploy-analysis",
          clientId: event.clientId,
          subjectId: event.subjectId,
          trigger: "deploy-detected",
          agents: ["seo-command-technique"],
          reservedBudgetUsd: 1,
        }, now),
      ];
    case "pr-merged":
      return [
        mk({
          id: `msn-pm-${shortId()}`,
          type: "post-deploy-analysis",
          clientId: event.clientId,
          subjectId: event.subjectId,
          trigger: "pr-merged",
          agents: ["seo-command-technique"],
          reservedBudgetUsd: 1,
          sourcePrRef: event.prRef,
        }, now),
      ];
    case "threshold-alert":
      return [
        mk({
          id: `msn-ta-${shortId()}`,
          type: "competitive-watch",
          clientId: event.clientId,
          subjectId: event.subjectId,
          trigger: "threshold-alert",
          agents: ["seo-command-orchestrator", "seo-command-aeo"],
          reservedBudgetUsd: 1,
        }, now),
      ];
  }
}

let counter = 0;
function shortId(): string {
  counter += 1;
  return counter.toString(16).padStart(8, "0");
}

function mk(partial: Omit<MissionSpec, "trigger" | "type"> & { trigger: Mission["trigger"]; type: MissionType; sourcePrRef?: string }, _now: string): MissionSpec {
  return { ...partial } as MissionSpec;
}

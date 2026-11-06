import type { Mission, MissionType } from "./mission";

/**
 * Planificateur de missions récurrentes. **Désactivé par défaut** (règle 16
 * + mandat E5.3). Un test vérifie qu'aucune mission ne part quand
 * `OIA_SEO_COMMAND_SCHEDULER_ENABLED=false`, et qu'un redémarrage ne force
 * jamais l'interrupteur à `true`.
 */

export interface Recurrence {
  id: string;
  subjectId: string;
  clientId: string;
  type: MissionType;
  /** Cron expression ou intervalle en jours. Non exécuté cette nuit. */
  cron?: string;
  everyDays?: number;
  reservedBudgetUsd: number;
  agents: string[];
  /** Désactivée par défaut à la création (règle 16) ; seul un humain owner peut passer à `enabled: true`. */
  enabled: boolean;
  enabledBy?: string;
  enabledAt?: string;
}

export interface SchedulerOptions {
  /** Interrupteur global. Lu depuis `OIA_SEO_COMMAND_SCHEDULER_ENABLED`. */
  globalEnabled?: boolean;
}

export interface Scheduler {
  readonly globalEnabled: boolean;
  list(): Recurrence[];
  register(r: Recurrence): "registered" | "already-exists";
  /** Ne part jamais si `globalEnabled=false`. Retourne les missions qui seraient créées. */
  tick(now: Date): Pick<Mission, "id" | "type" | "clientId" | "subjectId" | "trigger" | "agents" | "reservedBudgetUsd">[];
}

export function createScheduler(opts: SchedulerOptions = {}): Scheduler {
  const globalEnabled =
    opts.globalEnabled ?? (process.env.OIA_SEO_COMMAND_SCHEDULER_ENABLED === "true" || process.env.OIA_SEO_COMMAND_SCHEDULER_ENABLED === "1");
  const recurrences = new Map<string, Recurrence>();

  function nextId(): string {
    return `msn-sch-${Math.random().toString(36).slice(2, 10)}`;
  }

  return {
    get globalEnabled() {
      return globalEnabled;
    },
    list: () => [...recurrences.values()],
    register(r) {
      if (recurrences.has(r.id)) return "already-exists";
      // Règle 16 renforcée : même à la création, `enabled=true` sans
      // enabledBy/enabledAt n'est pas acceptable.
      const enabled = Boolean(r.enabled && r.enabledBy && r.enabledAt);
      recurrences.set(r.id, { ...r, enabled });
      return "registered";
    },
    tick(_now) {
      if (!globalEnabled) return []; // garde-fou global : rien ne part.
      const out: Pick<Mission, "id" | "type" | "clientId" | "subjectId" | "trigger" | "agents" | "reservedBudgetUsd">[] = [];
      for (const r of recurrences.values()) {
        if (!r.enabled) continue;
        out.push({
          id: nextId(),
          type: r.type,
          clientId: r.clientId,
          subjectId: r.subjectId,
          trigger: "scheduler",
          agents: r.agents,
          reservedBudgetUsd: r.reservedBudgetUsd,
        });
      }
      return out;
    },
  };
}

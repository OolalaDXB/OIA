import type { Mission, MissionType } from "./mission";

/**
 * Planificateur de missions récurrentes. **Désactivé par défaut** (règle 16
 * + mandat E5.3 + S2). Un test vérifie qu'aucune mission ne part quand
 * `OIA_SEO_COMMAND_SCHEDULER_ENABLED=false`, et qu'un redémarrage ne force
 * jamais l'interrupteur à `true`.
 *
 * S2 : `enabled` n'est jamais mis à `true` par le code applicatif. Il est
 * lu dans `vis.scheduler_switch` via la fonction `vis.toggle_scheduler`
 * (voir migrations/0004_auth_identity.sql). Le `Recurrence` ne porte plus
 * de `enabledBy` : la trace est en base, dans `scheduler_switch.toggled_by`.
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
  /** Lu depuis `vis.scheduler_switch.enabled` ; jamais positionné à `true` par l'appelant. */
  enabled: boolean;
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
      // S2 : `enabled` à la création est TOUJOURS ignoré (forcé à false).
      // L'activation passe exclusivement par `vis.toggle_scheduler` (base,
      // security definer avec contrôle auth.uid() + rôle). Ce que l'appelant
      // fournit n'est pas pris en compte pour la décision d'activation.
      recurrences.set(r.id, { ...r, enabled: false });
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

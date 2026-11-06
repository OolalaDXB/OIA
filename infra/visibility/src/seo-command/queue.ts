import type { MissionState } from "./mission";
import { MissionSchema, canTransition, type Mission } from "./mission";

/**
 * File de missions SEO Command.
 *
 * Cette nuit, l'implémentation est en mémoire. La **migration SQL proposée**
 * vit en commentaire ici, à écrire en C1/E5 persistant. L'important est
 * que :
 *   - `enqueue()` est idempotent (même mission id = pas de doublon) ;
 *   - `claim()` prend un verrou exclusif (une seule mission par appel) ;
 *   - un crash du worker ne perd pas une mission : les missions en état
 *     `running` depuis plus de `staleAfterMs` reviennent à `planned`
 *     (reprise). Appeler `reap()` à intervalle régulier.
 *
 * Migration SQL proposée (à écrire en 0003_mission_queue.sql) :
 *   create table vis.mission (
 *     id text primary key, ..., payload jsonb, state text,
 *     claimed_by text, claimed_at timestamptz,
 *     ...
 *   );
 *   On utilise `select ... for update skip locked` pour la prise de verrou.
 */

export interface QueueOptions {
  staleAfterMs?: number;
}

export interface Queue {
  enqueue(mission: Mission): "enqueued" | "already-queued";
  claim(workerId: string, now?: number): Mission | null;
  transition(missionId: string, next: MissionState, patch?: Partial<Mission>): Mission;
  reap(now?: number): string[];
  list(filter?: { state?: MissionState; clientId?: string }): Mission[];
  get(id: string): Mission | null;
}

export function createQueue(opts: QueueOptions = {}): Queue {
  const staleAfterMs = opts.staleAfterMs ?? 15 * 60 * 1000; // 15 min
  const missions = new Map<string, Mission>();
  const claimed = new Map<string, { workerId: string; at: number }>();

  function set(mission: Mission): Mission {
    const parsed = MissionSchema.parse(mission);
    missions.set(parsed.id, parsed);
    return parsed;
  }

  return {
    enqueue(mission) {
      if (missions.has(mission.id)) return "already-queued";
      set(mission);
      return "enqueued";
    },
    claim(workerId, now = Date.now()) {
      for (const [id, m] of missions) {
        if (m.state !== "planned") continue;
        const existing = claimed.get(id);
        if (existing) continue;
        claimed.set(id, { workerId, at: now });
        const next = set({ ...m, state: "running", updatedAt: new Date(now).toISOString().slice(0, 10) });
        return next;
      }
      return null;
    },
    transition(missionId, next, patch = {}) {
      const m = missions.get(missionId);
      if (!m) throw new Error(`queue.transition: mission "${missionId}" unknown`);
      if (!canTransition(m.state, next)) {
        throw new Error(`queue.transition: refused ${m.state} → ${next}`);
      }
      const updated = set({ ...m, ...patch, state: next, updatedAt: new Date().toISOString().slice(0, 10) });
      if (next !== "running") claimed.delete(missionId);
      return updated;
    },
    reap(now = Date.now()) {
      const requeued: string[] = [];
      for (const [id, c] of [...claimed.entries()]) {
        if (now - c.at > staleAfterMs) {
          const m = missions.get(id);
          if (m && m.state === "running") {
            set({ ...m, state: "planned", updatedAt: new Date(now).toISOString().slice(0, 10) });
            claimed.delete(id);
            requeued.push(id);
          }
        }
      }
      return requeued;
    },
    list(filter = {}) {
      const out: Mission[] = [];
      for (const m of missions.values()) {
        if (filter.state && m.state !== filter.state) continue;
        if (filter.clientId && m.clientId !== filter.clientId) continue;
        out.push(m);
      }
      return out;
    },
    get(id) {
      return missions.get(id) ?? null;
    },
  };
}

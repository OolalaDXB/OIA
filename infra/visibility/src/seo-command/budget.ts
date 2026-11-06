/**
 * Interface de budget pour SEO Command. En mémoire pour la nuit ; C3 écrira
 * son équivalent en base. L'important est que `reserve()` échoue si le
 * plafond est atteint, et que `settle()` enregistre le coût réel à la fin.
 */

export interface BudgetReservation {
  missionId: string;
  amountUsd: number;
}

export interface BudgetGuard {
  /** Globalement réservé jusqu'ici (sans dépasser le plafond). */
  reservedUsd(): number;
  /** Globalement consommé (coûts réels enregistrés). */
  spentUsd(): number;
  /** Plafond global. */
  capUsd(): number;
  reserve(r: BudgetReservation): "ok" | "refused-cap";
  settle(r: { missionId: string; costUsd: number }): void;
  cancel(r: { missionId: string }): void;
}

export function createBudgetGuard(opts: { capUsd: number }): BudgetGuard {
  const reservations = new Map<string, number>();
  let spent = 0;
  const cap = opts.capUsd;
  return {
    reservedUsd: () => [...reservations.values()].reduce((a, b) => a + b, 0),
    spentUsd: () => spent,
    capUsd: () => cap,
    reserve({ missionId, amountUsd }) {
      if (reservations.has(missionId)) return "ok"; // idempotent
      const newReserved = [...reservations.values()].reduce((a, b) => a + b, 0) + amountUsd;
      if (newReserved + spent > cap) return "refused-cap";
      reservations.set(missionId, amountUsd);
      return "ok";
    },
    settle({ missionId, costUsd }) {
      const reserved = reservations.get(missionId) ?? 0;
      reservations.delete(missionId);
      spent += costUsd;
      // The reservation `reserved` is released, the real cost is now counted
      // against the cap. A mission that spent less frees the delta.
      if (costUsd > reserved) {
        // Over-budget on an individual mission : noted in spent, but the next
        // reserve() calls will now see less headroom.
      }
    },
    cancel({ missionId }) {
      reservations.delete(missionId);
    },
  };
}

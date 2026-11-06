/**
 * BudgetGuard multi-niveaux (C3). Étend le `BudgetGuard` global d'E5 avec
 * des plafonds par client, par site et par fournisseur, lus depuis la
 * configuration (`vis.client.monthly_budget_usd`, etc.). Arrêt au premier
 * plafond atteint.
 *
 * Interface : `reserve(r)` prend un `BudgetReservationScoped` avec la
 * dimension demandée. Le guard retourne la première limite qui refuserait
 * (global, client, site, fournisseur) ; `ok` si toutes acceptent.
 */

export interface BudgetReservationScoped {
  missionId: string;
  amountUsd: number;
  clientId: string;
  siteId?: string;
  provider?: string;
}

export interface MultiBudgetCaps {
  globalUsd: number;
  perClientUsd?: Record<string, number>;
  perSiteUsd?: Record<string, number>;
  perProviderUsd?: Record<string, number>;
}

type Dim = "global" | "client" | "site" | "provider";
type Used = Record<Dim, Record<string, number>>;

export interface MultiBudgetGuard {
  reserve(r: BudgetReservationScoped): { ok: boolean; blockedBy?: Dim };
  settle(r: { missionId: string; costUsd: number; clientId: string; siteId?: string; provider?: string }): void;
  cancel(r: { missionId: string }): void;
  snapshot(): {
    reserved: Record<Dim, Record<string, number>>;
    spent: Record<Dim, Record<string, number>>;
    caps: MultiBudgetCaps;
  };
}

export function createMultiBudgetGuard(caps: MultiBudgetCaps): MultiBudgetGuard {
  const reserved: Used = { global: { "*": 0 }, client: {}, site: {}, provider: {} };
  const spent: Used = { global: { "*": 0 }, client: {}, site: {}, provider: {} };
  const reservations = new Map<string, BudgetReservationScoped>();

  function capOf(dim: Dim, key: string): number | undefined {
    if (dim === "global") return caps.globalUsd;
    if (dim === "client") return caps.perClientUsd?.[key];
    if (dim === "site") return caps.perSiteUsd?.[key];
    if (dim === "provider") return caps.perProviderUsd?.[key];
    return undefined;
  }

  function usedOn(dim: Dim, key: string): number {
    return (reserved[dim][key] ?? 0) + (spent[dim][key] ?? 0);
  }

  function addOn(where: Used, dim: Dim, key: string, amount: number): void {
    where[dim][key] = (where[dim][key] ?? 0) + amount;
  }

  function subOn(where: Used, dim: Dim, key: string, amount: number): void {
    where[dim][key] = Math.max(0, (where[dim][key] ?? 0) - amount);
  }

  function dimensionsOf(r: BudgetReservationScoped): Array<[Dim, string]> {
    const dims: Array<[Dim, string]> = [["global", "*"], ["client", r.clientId]];
    if (r.siteId) dims.push(["site", r.siteId]);
    if (r.provider) dims.push(["provider", r.provider]);
    return dims;
  }

  return {
    reserve(r) {
      if (reservations.has(r.missionId)) return { ok: true }; // idempotent
      for (const [dim, key] of dimensionsOf(r)) {
        const cap = capOf(dim, key);
        if (cap === undefined) continue;
        if (usedOn(dim, key) + r.amountUsd > cap) return { ok: false, blockedBy: dim };
      }
      reservations.set(r.missionId, r);
      for (const [dim, key] of dimensionsOf(r)) addOn(reserved, dim, key, r.amountUsd);
      return { ok: true };
    },
    settle(r) {
      const prior = reservations.get(r.missionId);
      reservations.delete(r.missionId);
      // Release reservations.
      if (prior) for (const [dim, key] of dimensionsOf(prior)) subOn(reserved, dim, key, prior.amountUsd);
      // Count real spent.
      const dims: Array<[Dim, string]> = [["global", "*"], ["client", r.clientId]];
      if (r.siteId) dims.push(["site", r.siteId]);
      if (r.provider) dims.push(["provider", r.provider]);
      for (const [dim, key] of dims) addOn(spent, dim, key, r.costUsd);
    },
    cancel(r) {
      const prior = reservations.get(r.missionId);
      reservations.delete(r.missionId);
      if (prior) for (const [dim, key] of dimensionsOf(prior)) subOn(reserved, dim, key, prior.amountUsd);
    },
    snapshot: () => ({ reserved: structuredClone(reserved), spent: structuredClone(spent), caps }),
  };
}

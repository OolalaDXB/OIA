import { describe, expect, it } from "vitest";
import { alerteDepense, estimerDepense } from "@/lib/visibility-couts";
import { depensesMoteurs, moteurs } from "@/data/visibility";

describe("Dépenses Visibility", () => {
  it("conserve le plafond de 30 dollars", () => expect(depensesMoteurs.plafond).toBe(30));
  it("ne déclenche pas à exactement 80 %", () => expect(alerteDepense(24, 30)).toBe(false));
  it("déclenche strictement au-delà de 80 %", () => expect(alerteDepense(24.01, 30)).toBe(true));
  it("exclut les assistants non suivis de l'estimation", () => expect(estimerDepense(10, 2, [{ estime: 0.1, suivi: true }, { estime: 9, suivi: false }])).toBe(2));
  it("calcule le panel fictif actuel", () => expect(estimerDepense(9, 20, moteurs)).toBe(11.34));
});
import { describe, expect, it } from "vitest";
import { risqueAnnulation } from "@/lib/money-import";
describe("clés de l’aperçu d’annulation OIA", () => {
  it("compte chaque élément modifié, pas les propriétés de l’objet", () => {
    expect(risqueAnnulation({ modifies_depuis_import: [{ table: "notes", id: "a", id_origine: "old-a" }], non_verifiables: 0 })).toEqual({ modifies: 1, nonVerifiables: 0 });
  });
  it("préserve le risque des éléments non vérifiables", () => {
    expect(risqueAnnulation({ modifies_depuis_import: [], non_verifiables: 3 })).toEqual({ modifies: 0, nonVerifiables: 3 });
  });
});
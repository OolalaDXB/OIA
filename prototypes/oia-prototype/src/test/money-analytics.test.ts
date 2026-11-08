import { describe, expect, it } from "vitest";
import { enregistrerEvenementMoney, MONEY_ANALYTICS_KEY } from "@/lib/money-analytics";

function stockage() {
  const valeurs = new Map<string, string>();
  return { getItem: (cle: string) => valeurs.get(cle) ?? null, setItem: (cle: string, valeur: string) => { valeurs.set(cle, valeur); } };
}

describe("Suivi Money Lookup local", () => {
  it("conserve un événement et ses propriétés non personnelles dans le navigateur", () => {
    const local = stockage();
    enregistrerEvenementMoney("project.money_tab_selected", { tab: "montants" }, local);
    const sauvegarde = JSON.parse(local.getItem(MONEY_ANALYTICS_KEY) ?? "{}");
    expect(sauvegarde.version).toBe(1);
    expect(sauvegarde.evenements[0]).toMatchObject({ nom: "project.money_tab_selected", proprietes: { tab: "montants" } });
  });

  it("remplace un stockage corrompu au lieu d'envoyer l'événement ailleurs", () => {
    const local = stockage();
    local.setItem(MONEY_ANALYTICS_KEY, "invalide");
    enregistrerEvenementMoney("project.money_export_requested", { format: "csv", count: 2, view: "Toutes" }, local);
    const sauvegarde = JSON.parse(local.getItem(MONEY_ANALYTICS_KEY) ?? "{}");
    expect(sauvegarde.evenements).toHaveLength(1);
    expect(sauvegarde.evenements[0].proprietes.count).toBe(2);
  });
});

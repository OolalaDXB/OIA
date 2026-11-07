// Test du prototype Lovable « OIA Dashoard » (commit c6470e86), repris tel quel.
import { describe, it, expect } from "vitest";
import { lireVisibility, donneesFictives } from "@/lib/donnees-visibility";
describe("source visibility.json", () => {
  it("accepte un fichier de même structure et le marque réel", () => {
    const { reel, ...brut } = donneesFictives;
    const d = lireVisibility({ ...brut, agents: ["Réel"] });
    expect(d?.reel).toBe(true);
    expect(d?.agents).toEqual(["Réel"]);
  });
  it("refuse une structure différente", () => {
    expect(lireVisibility({ sites: [] })).toBeNull();
  });
  it("les données par défaut restent fictives", () => {
    expect(donneesFictives.reel).toBe(false);
  });
});

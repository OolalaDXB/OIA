import { describe, expect, it } from "vitest";
import { chargerDonnees } from "@/lib/donnees/source";
import { lireDemoAccueil, sourceReelleAccueil, sourceAccueil } from "@/lib/donnees/accueil";
import { lireDemoMoney, sourceReelleMoney, sourceMoney } from "@/lib/donnees/money";
import { lireDemoShyrka, sourceReelleShyrka, sourceShyrka } from "@/lib/donnees/shyrka";
import { lireDemoVisibility, sourceReelleVisibility, sourceVisibility } from "@/lib/donnees/visibility";

describe("couche unique de données", () => {
  it("Accueil conserve la démonstration actuelle", () => { expect(sourceAccueil()).toEqual(lireDemoAccueil()); });
  it("Money Lookup conserve les sept opportunités fictives", () => { expect(sourceMoney()).toEqual(lireDemoMoney()); expect(lireDemoMoney().opportunites).toHaveLength(7); });
  it("Shyrka conserve ses données simulées", () => { expect(sourceShyrka()).toEqual(lireDemoShyrka()); });
  it("Visibility conserve la démonstration actuelle", () => { expect(sourceVisibility()).toEqual(lireDemoVisibility()); expect(lireDemoVisibility().reel).toBe(false); });
  it("les quatre emplacements réels restent non branchés", () => { expect([sourceReelleAccueil, sourceReelleMoney, sourceReelleShyrka, sourceReelleVisibility]).toEqual([null, null, null, null]); });
  it("une collection sans résultats donne un état vide", async () => { expect(await chargerDonnees(() => [], (d) => d.length === 0)).toEqual({ statut: "vide" }); });
  it("une source en échec donne un état erreur", async () => { expect((await chargerDonnees(() => { throw Error("échec"); }, () => false)).statut).toBe("erreur"); });
  it("une source résolue fournit ses données", async () => { expect(await chargerDonnees(async () => ["m1"], (d) => d.length === 0)).toEqual({ statut: "pret", donnees: ["m1"] }); });
});
import { describe, expect, it } from "vitest";
import { appliquerCommandeVoix, commandeVoix, DEBIT_NORMAL, type ReglagesVoix } from "../src/passerelle/voix.js";

describe("commandes de voix", () => {
  it("reconnaît les demandes de volume et de débit, pas une phrase ordinaire", () => {
    expect(["Peux-tu parler plus fort, s'il te plaît ?", "Parle moins fort", "Parle plus lentement", "Plus vite !", "Reprends ta voix normale"].map(commandeVoix)).toEqual(["plus_fort", "moins_fort", "plus_lent", "plus_vite", "normal"]);
    expect(["Quel est le projet le plus fort de la roadmap et pourquoi le juges-tu prioritaire aujourd'hui ?", "Bonsoir"].map(commandeVoix)).toEqual([null, null]);
  });
  it("règle le volume de sa voix (borné) et le débit, puis revient à la normale", () => {
    const r: ReglagesVoix = {};
    expect(appliquerCommandeVoix("plus_fort", r)).toBe("D'accord, je parle plus fort.");
    expect(r.volume).toBe(1.5);
    appliquerCommandeVoix("plus_fort", r); appliquerCommandeVoix("plus_fort", r);
    expect(appliquerCommandeVoix("plus_fort", r)).toMatch(/déjà au plus fort/);
    expect(r.volume).toBe(2.5);
    appliquerCommandeVoix("plus_lent", r);
    expect(r.debit).toBe(DEBIT_NORMAL - 25);
    appliquerCommandeVoix("normal", r);
    expect(r).toEqual({});
  });
});

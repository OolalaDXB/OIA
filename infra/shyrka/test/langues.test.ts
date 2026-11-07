import { describe, expect, it } from "vitest";
import { bonScript, cer, verdictDe } from "../src/executive/eval/langues.js";
import { classeCorrecte } from "../src/executive/eval/modeles.js";

/** Mandat v11, blocs B4 et D : notation déterministe des langues et des méthodes. */

describe("langues", () => {
  it("ukrainien et russe ne se confondent pas", () => {
    expect(bonScript("cyrillique-uk", "Гарного дня, Мікаелю!")).toBe(true);
    expect(bonScript("cyrillique-uk", "Хорошего дня, Микаэль!")).toBe(false);
    expect(bonScript("cyrillique-ru", "Хорошего дня, Микаэль!")).toBe(true);
    expect(bonScript("cyrillique-ru", "Гарного дня, Мікаелю!")).toBe(false);
  });
  it("scripts RTL et géorgien", () => {
    expect(bonScript("hebreu", "יום טוב, מיקאל")).toBe(true);
    expect(bonScript("arabe", "يوما سعيدا يا ميكائيل")).toBe(true);
    expect(bonScript("georgien", "კარგი დღე, მიქაელ")).toBe(true);
    expect(bonScript("latin", "יום טוב")).toBe(false);
  });
  it("CER", () => {
    expect(cer("Tamar habite à Batoumi.", "Tamar habite à Batoumi")).toBe(0);
    expect(cer("abcd", "abce")).toBe(0.25);
  });
  it("jamais VALIDE sous 3 essais ; 0 réussite = NON_SUPPORTE ; aucun essai = NON_TESTE", () => {
    expect(verdictDe(1, 1)).toBe("PARTIEL");
    expect(verdictDe(3, 3)).toBe("VALIDE");
    expect(verdictDe(2, 3)).toBe("PARTIEL");
    expect(verdictDe(0, 3)).toBe("NON_SUPPORTE");
    expect(verdictDe(0, 0)).toBe("NON_TESTE");
  });
});

describe("comparaison des méthodes", () => {
  it("une liste prédite pour une question est fausse ; les paramètres comptent", () => {
    expect(classeCorrecte({ genre: "pas_liste" }, { genre: "liste", depuis: "debut", n: 1 })).toBe(false);
    expect(classeCorrecte({ genre: "pas_liste" }, { genre: "explication", id: "D01" })).toBe(true);
    expect(classeCorrecte({ genre: "liste", depuis: "debut", n: 3 }, { genre: "liste", depuis: "fin", n: 3 })).toBe(false);
    expect(classeCorrecte({ genre: "explication", id: "D03" }, null)).toBe(false);
  });
});

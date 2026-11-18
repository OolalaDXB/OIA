import { describe, expect, it } from "vitest";
import { comparerMesures, departEtAujourdhui, reperesResolution, tendanceScoreIa, variation, type EfficaciteJourV3, type EfficaciteMesureV3 } from "@/lib/donnees/visibility-efficacite";

const m = (id: string, realise_le: string, score: number | null, lien: string | null): EfficaciteMesureV3 => ({ id, subject_id: "s", realise_le, score, moteurs: [], citations_sans_nom: 1, reponses_sans_nom: 10, cout_reel_usd: 1, mensuelle: true, memes_questions_que: lien });

describe("efficacité : variations", () => {
  it("une hausse d'impressions est une amélioration", () => expect(variation(100, 150, "hausse")).toEqual({ delta: 50, tendance: "amelioration" }));
  it("une baisse du score est une dégradation", () => expect(variation(80, 70, "hausse")).toEqual({ delta: -10, tendance: "degradation" }));
  it("une baisse des écarts ouverts est une amélioration", () => expect(variation(6, 2, "baisse")).toEqual({ delta: -4, tendance: "amelioration" }));
  it("une hausse des écarts ouverts est une dégradation", () => expect(variation(2, 5, "baisse").tendance).toBe("degradation"));
  it("une valeur null rend la variation non mesurable, jamais zéro", () => {
    expect(variation(null, 120, "hausse")).toEqual({ delta: null, tendance: "inconnue" });
    expect(variation(10, null, "hausse").delta).toBeNull();
  });
  it("prend la première et la dernière ligne par jour", () => {
    const l = (jour: string) => ({ subject_id: "s", jour } as EfficaciteJourV3);
    const r = departEtAujourdhui([l("2026-11-10"), l("2026-11-01"), l("2026-11-05")], "s");
    expect(r.depart?.jour).toBe("2026-11-01"); expect(r.aujourdhui?.jour).toBe("2026-11-10");
  });
});

describe("efficacité : mesures IA", () => {
  it("compare seulement si memes_questions_que relie la précédente", () => {
    const r = comparerMesures([m("a", "2026-09-01", 10, null), m("b", "2026-10-01", 15, null), m("c", "2026-11-01", 18, "b")]);
    expect(r.map((x) => x.comparable)).toEqual([false, false, true]);
    expect(r[1]?.deltaScore).toBeNull(); expect(r[2]?.deltaScore).toBe(3);
  });
  it("refuse un lien vers une mesure qui n'est pas la précédente", () => {
    const r = comparerMesures([m("a", "2026-09-01", 10, null), m("b", "2026-10-01", 15, null), m("c", "2026-11-01", 18, "a")]);
    expect(r[2]?.comparable).toBe(false);
  });
  it("pas de tendance d'accueil entre mesures non comparables", () => {
    expect(tendanceScoreIa([m("a", "2026-10-01", 10, null), m("b", "2026-11-01", 20, null)], "s").comparable).toBe(false);
    expect(tendanceScoreIa([m("a", "2026-10-01", 20, null), m("b", "2026-11-01", 12, "a")], "s")).toMatchObject({ comparable: true, delta: -8, tendance: "degradation" });
  });
});

describe("efficacité : repères de résolution", () => {
  it("retient les constats résolus du site, par date unique", () => {
    expect(reperesResolution([
      { subject_id: "s", etat: "resolu", derniere_fois: "2026-11-09T10:00:00Z" },
      { subject_id: "s", etat: "resolu", derniere_fois: "2026-11-09T18:00:00Z" },
      { subject_id: "s", etat: "ouvert", derniere_fois: "2026-11-10T10:00:00Z" },
      { subject_id: "autre", etat: "resolu", derniere_fois: "2026-11-11T10:00:00Z" },
      { subject_id: "s", etat: "resolu", derniere_fois: "2026-11-03T10:00:00Z" },
    ], "s")).toEqual(["2026-11-03", "2026-11-09"]);
  });
});

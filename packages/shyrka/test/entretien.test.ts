import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerProgramme } from "../src/entretien/programme.js";
import { SessionEntretien } from "../src/entretien/session.js";
import { ecrireSeance, ficheMarkdown } from "../src/entretien/fiche.js";
import { SimulatedTextModel } from "../src/adapters/simulated.js";

const md = readFileSync(fileURLToPath(new URL("../../../docs/shyrka/entretiens.md", import.meta.url)), "utf8");
const programme = chargerProgramme(md);

describe("programme des séances (docs/shyrka/entretiens.md)", () => {
  it("dix séances, numérotées de 1 à 10, chacune avec des questions", () => {
    expect(programme.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of programme) expect(s.questions.length).toBeGreaterThan(0);
    expect(programme[0]!.theme).toBe("Ce qui me guide");
  });

  it("garde les relances prévues et les consignes de séance", () => {
    expect(programme[0]!.questions[0]!.relance).toMatch(/^raconte le dernier projet/);
    expect(programme[3]!.consigne).toMatch(/aucun montant/);
  });

  it("la séance 7 reprend les douze messages fictifs", () => {
    expect(programme[6]!.questions).toHaveLength(12);
    expect(programme[6]!.questions[0]!.texte).toMatch(/^E-mail : Un prospect/);
  });
});

function session(reponses: string[], extraction = '{"regles":[{"texte":"Je lance quand l\'idée insiste.","theme":"décider"}],"exemples":[{"texte":"OIA"}],"formules":[]}') {
  const poses: string[] = [];
  const model = new SimulatedTextModel((m) => (m[0]?.content.startsWith("Extrais") ? extraction : m[0]?.content.startsWith("Résume") ? "Tu avances par conviction." : "pourquoi ?"));
  const s = new SessionEntretien({
    seance: { numero: 1, theme: "Ce qui me guide", questions: [{ texte: "Q1 ?", relance: "R1 ?" }, { texte: "Q2 ?" }] },
    model,
    poser: async (t) => {
      poses.push(t);
    },
    ecouter: async () => reponses.shift() ?? "passer",
    clock: (() => {
      let t = Date.parse("2026-11-10T09:00:00Z");
      return () => (t += 60_000);
    })(),
  });
  return { s, poses, model };
}

describe("mode entretien", () => {
  it("quatre temps : mise en route, thème avec relances, contre-pied, clôture", async () => {
    const { s, poses } = session(["Calme.", "R à Q1", "R à R1", "R à Q2", "R à la relance générée", "Tu te trompes sur X.", "Rien."]);
    const r = await s.mener();
    expect(r.echanges.map((e) => e.temps)).toEqual(["mise-en-route", "theme", "relance", "theme", "relance", "contre-pied", "cloture"]);
    expect(poses).toContain("R1 ?");
    expect(poses).toContain("Pourquoi ?");
    expect(poses.some((p) => p.startsWith("Voici ce que j'ai compris. Tu avances par conviction."))).toBe(true);
    expect(r.regles).toEqual([{ texte: "Je lance quand l'idée insiste.", theme: "décider", statut: "à valider" }]);
    expect(r.exemples[0]?.statut).toBe("à valider");
    expect(r.date).toBe("2026-11-10");
  });

  it("« passer » saute la question ; « retirer » efface la réponse précédente et ne garde que le motif", async () => {
    const { s } = session(["Calme.", "Une phrase regrettée", "retirer : trop personnel", "Version propre", "passer", "passer", "passer", "passer"]);
    const r = await s.mener();
    expect(r.retraits).toEqual([{ motif: "trop personnel" }]);
    const textes = r.echanges.map((e) => e.reponse);
    expect(textes).not.toContain("Une phrase regrettée");
    expect(textes).toContain("Version propre");
    expect(r.passees).toContain("Q2 ?");
  });

  it("signale une mention de Swift à nettoyer", async () => {
    const { s } = session(["Calme.", "Chez Swift on fait comme ça.", "passer", "passer", "passer", "passer"]);
    const r = await s.mener();
    expect(r.aNettoyer[0]).toMatch(/Swift.*Q1/);
    expect(ficheMarkdown(r, { transcription: "t.txt" })).toContain("Mention de Swift");
  });

  it("n'accepte qu'un modèle local", () => {
    expect(
      () =>
        new SessionEntretien({
          seance: programme[0]!,
          model: { name: "openai:gpt", chat: async () => "" },
          poser: async () => {},
          ecouter: async () => "",
        }),
    ).toThrow(/modèle local/);
  });

  it("écrit la séance hors du dépôt, sans jamais écraser", async () => {
    const { s } = session(["Calme.", "R", "passer", "passer", "passer", "passer"]);
    const r = await s.mener();
    const racine = mkdtempSync(join(tmpdir(), "corpus-"));
    try {
      const a = ecrireSeance(r, { racine, depot: "/home/user/OIA", transcription: s.transcription() });
      const b = ecrireSeance(r, { racine, depot: "/home/user/OIA", transcription: s.transcription() });
      expect(a.dossier).toMatch(/2026-11-10_seance-01_ce-qui-me-guide$/);
      expect(b.dossier).toMatch(/_2$/);
      expect(readFileSync(join(a.dossier, "fiche.md"), "utf8")).toMatch(/^# Séance 1 · Ce qui me guide/);
      expect(existsSync(join(a.dossier, "transcription.txt"))).toBe(true);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
    const depot = fileURLToPath(new URL("../../../", import.meta.url));
    expect(() => ecrireSeance(r, { racine: join(depot, "infra/shyrka"), depot, transcription: "" })).toThrow(/refus d'écrire dans le dépôt/);
  });
});

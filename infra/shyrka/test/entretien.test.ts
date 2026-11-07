import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerProgramme } from "../src/entretien/programme.js";
import { SessionEntretien, type Reponse } from "../src/entretien/session.js";
import { DOSSIER_ENTRETIENS, ecrireFiche, ficheMarkdown, preparerDossierSeance, volumeMonte } from "../src/entretien/fiche.js";
import { SimulatedTextModel, SimulatedTranscriber } from "../src/adapters/simulated.js";
import { RACINE_DEPOT } from "../src/local.js";

const md = readFileSync(fileURLToPath(new URL("../../../docs/shyrka/entretiens.md", import.meta.url)), "utf8");
const programme = chargerProgramme(md);

describe("programme des séances (docs/shyrka/entretiens.md)", () => {
  it("dix séances numérotées, chacune avec des questions", () => {
    expect(programme.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of programme) expect(s.questions.length).toBeGreaterThan(0);
  });
  it("garde relances et consignes ; la séance 7 reprend les douze messages", () => {
    expect(programme[0]!.questions[0]!.relance).toMatch(/^raconte le dernier projet/);
    expect(programme[3]!.consigne).toMatch(/aucun montant/);
    expect(programme[6]!.questions).toHaveLength(12);
  });
});

function seance(reponses: (Reponse | "prise")[], opts: { model?: boolean } = {}) {
  const poses: string[] = [];
  const supprimees: string[] = [];
  const enregistres: string[] = [];
  const transcriptions = ["Calme aujourd'hui.", "Parce que l'idée insiste.", "C'était OIA.", "Rien d'autre.", "En plus."];
  const s = new SessionEntretien({
    seance: { numero: 1, theme: "Ce qui me guide", questions: [{ texte: "Q1 ?", relance: "r1 ?" }, { texte: "Q2 ?" }] },
    poser: async (t) => {
      poses.push(t);
    },
    enregistrer: async (nom) => {
      const r = reponses.shift() ?? "passer";
      if (r === "prise") {
        enregistres.push(nom);
        return { prise: { path: `/vol/${nom}`, durationMs: 1000 } };
      }
      return r;
    },
    supprimer: (p) => supprimees.push(p.path),
    transcrire: new SimulatedTranscriber(transcriptions),
    ...(opts.model === false
      ? {}
      : { model: new SimulatedTextModel('{"regles":[{"texte":"Je lance quand l\'idée insiste.","theme":"décider"}],"exemples":[{"texte":"OIA"}],"formules":[],"compris":"Tu avances — par conviction."}') }),
    clock: (() => {
      let t = Date.parse("2026-11-10T09:00:00Z");
      return () => (t += 60_000);
    })(),
  });
  return { s, poses, supprimees, enregistres };
}

describe("mode entretien (mandat v6, B2)", () => {
  it("lit chaque question, enregistre chaque réponse dans un fichier, transcrit à la fin", async () => {
    const { s, poses, enregistres } = seance(["prise", "prise", "prise", "prise", "prise"]);
    const r = await s.mener();
    expect(enregistres).toEqual(["01-mise-en-route.wav", "02-theme.wav", "03-relance.wav", "04-theme.wav", "05-cloture.wav"]);
    expect(poses).toContain("Q1 ?");
    expect(poses).toContain("R1 ?");
    expect(r.echanges.map((e) => e.texte)).toEqual(["Calme aujourd'hui.", "Parce que l'idée insiste.", "C'était OIA.", "Rien d'autre.", "En plus."]);
    expect(r.regles).toEqual([{ texte: "Je lance quand l'idée insiste.", theme: "décider", statut: "à valider" }]);
    expect(r.contrePied).toBe("Tu avances, par conviction.");
  });

  it("passer saute la question et sa relance ; retirer supprime le fichier de la réponse précédente", async () => {
    const { s, supprimees } = seance(["prise", "prise", "passer", "retirer", "passer", "prise"]);
    const r = await s.mener();
    expect(supprimees).toEqual(["/vol/02-theme.wav"]);
    expect(r.retraits).toHaveLength(1);
    expect(r.passees).toEqual(["R1 ?", "Q2 ?"]);
  });

  it("sans modèle local, la fiche garde ses rubriques à extraire", async () => {
    const { s } = seance(["prise", "passer", "passer", "prise"], { model: false });
    const r = await s.mener();
    expect(r.extractionManquante).toBe(true);
    expect(ficheMarkdown(r, "/vol/x")).toContain("À extraire");
  });

  it("signale une mention de Swift à nettoyer", async () => {
    const poses: string[] = [];
    const s = new SessionEntretien({
      seance: { numero: 2, theme: "Comment je décide", questions: [{ texte: "Q ?" }] },
      poser: async (t) => {
        poses.push(t);
      },
      enregistrer: (() => {
        let n = 0;
        return async () => (n++ < 2 ? { prise: { path: "/vol/a.wav", durationMs: 1 } } : "passer");
      })(),
      supprimer: () => {},
      transcrire: new SimulatedTranscriber(["Rien.", "Chez Swift on fait comme ça."]),
    });
    const r = await s.mener();
    expect(r.aNettoyer[0]).toMatch(/Swift/);
  });

  it("n'accepte qu'un modèle local", () => {
    expect(
      () =>
        new SessionEntretien({
          seance: programme[0]!,
          poser: async () => {},
          enregistrer: async () => "passer",
          supprimer: () => {},
          transcrire: new SimulatedTranscriber([]),
          model: { name: "openai:gpt", chat: async () => "" },
        }),
    ).toThrow(/locaux/);
  });
});

describe("garde-fous du dossier de séance", () => {
  it("dossier par défaut sur le volume chiffré", () => {
    expect(DOSSIER_ENTRETIENS).toBe("/Volumes/Shyrka-corpus/brut/entretiens");
  });

  it("refuse de démarrer si le volume chiffré n'est pas monté", () => {
    expect(() => preparerDossierSeance({ numero: 1, theme: "T", date: "2026-11-10", volume: "/Volumes/Shyrka-corpus-absent" })).toThrow(/pas monté/);
    expect(volumeMonte("/Volumes/Shyrka-corpus-absent")).toBe(false);
    const t = mkdtempSync(join(tmpdir(), "vol-"));
    try {
      // Un simple dossier, sur le même disque que son parent, n'est pas un volume monté.
      expect(volumeMonte(t)).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });

  it("refuse d'écrire dans le dépôt, même par un lien symbolique depuis le volume", () => {
    const vol = mkdtempSync(join(tmpdir(), "vol-"));
    try {
      symlinkSync(join(RACINE_DEPOT, "docs"), join(vol, "piege"));
      expect(() => preparerDossierSeance({ numero: 1, theme: "T", date: "2026-11-10", volume: vol, sortie: join(vol, "piege"), estMonte: () => true })).toThrow(/dans le dépôt/);
      expect(() => preparerDossierSeance({ numero: 1, theme: "T", date: "2026-11-10", volume: join(RACINE_DEPOT, "docs"), estMonte: () => true })).toThrow(/dans le dépôt/);
    } finally {
      rmSync(vol, { recursive: true, force: true });
    }
  });

  it("refuse une sortie hors du volume chiffré", () => {
    const vol = mkdtempSync(join(tmpdir(), "vol-"));
    const ailleurs = mkdtempSync(join(tmpdir(), "ailleurs-"));
    try {
      expect(() => preparerDossierSeance({ numero: 1, theme: "T", date: "2026-11-10", volume: vol, sortie: ailleurs, estMonte: () => true })).toThrow(/pas sur le volume/);
    } finally {
      rmSync(vol, { recursive: true, force: true });
      rmSync(ailleurs, { recursive: true, force: true });
    }
  });

  it("crée un dossier neuf par séance, n'écrase jamais, écrit transcription et fiche", async () => {
    const vol = mkdtempSync(join(tmpdir(), "vol-"));
    try {
      mkdirSync(join(vol, "brut", "entretiens"), { recursive: true });
      const a = preparerDossierSeance({ numero: 1, theme: "Ce qui me guide", date: "2026-11-10", volume: vol, estMonte: () => true });
      const b = preparerDossierSeance({ numero: 1, theme: "Ce qui me guide", date: "2026-11-10", volume: vol, estMonte: () => true });
      expect(a).toMatch(/2026-11-10_seance-01_ce-qui-me-guide$/);
      expect(b).toMatch(/_2$/);
      const { s } = seance(["prise", "passer", "passer", "prise"]);
      const r = await s.mener();
      ecrireFiche(r, a, s.transcription());
      expect(readFileSync(join(a, "fiche.md"), "utf8")).toMatch(/^# Séance 1 · Ce qui me guide/);
      expect(existsSync(join(a, "transcription.txt"))).toBe(true);
      expect(() => ecrireFiche(r, a, s.transcription())).toThrow();
    } finally {
      rmSync(vol, { recursive: true, force: true });
    }
  });
});

import { describe, it, expect } from "vitest";
import { IDENTITY_V0 } from "../src/identity.js";
import { RecordingSpeaker, SimulatedMicrophone, SimulatedTextModel, SimulatedTranscriber } from "../src/adapters/simulated.js";
import { ShyrkaSession } from "../src/session.js";
import { SHYRKA_SYSTEM_PROMPT, applyStyle } from "../src/persona.js";

function setup(identity = IDENTITY_V0, lines = ["Bonjour Shyrka", "Et demain ?"]) {
  const printed: string[] = [];
  const speaker = new RecordingSpeaker();
  const model = new SimulatedTextModel((m) => `Réponse ${m.filter((x) => x.role === "user").length} — courte.`);
  const mic = new SimulatedMicrophone();
  let t = 0;
  const session = new ShyrkaSession({
    microphone: mic,
    transcriber: new SimulatedTranscriber(lines),
    model,
    speaker,
    identity,
    print: (l) => printed.push(l),
    clock: () => (t += 5),
  });
  return { session, printed, speaker, model, mic };
}

describe("Shyrka 1 « Te parle », boucle simulée", () => {
  it("sans voix en sortie (repli) : entend, répond en texte, ne parle pas", async () => {
    const { session, printed, speaker } = setup({ ...IDENTITY_V0, voixEnSortie: false });
    expect(session.voiceOutput).toBe(false);
    const r = await session.listenTurn();
    expect(r.heard).toBe("Bonjour Shyrka");
    expect(r.output).toBe("texte");
    expect(r.answer).toBe("Réponse 1, courte.");
    expect(printed).toEqual(["Shyrka · Réponse 1, courte."]);
    expect(speaker.spoken).toEqual([]);
    expect(r.events.map((e) => e.step)).toEqual(["ecoute", "transcription", "reflexion", "texte"]);
  });

  it("version 0 : voix Aurélie en sortie, la réponse est parlée", async () => {
    const { session, speaker } = setup();
    const r = await session.listenTurn();
    expect(r.output).toBe("voix");
    expect(speaker.spoken).toEqual(["Réponse 1, courte."]);
  });

  it("prise de parole volontaire : un tour = une prise, durée par défaut 8 s", async () => {
    const { session, mic } = setup({ ...IDENTITY_V0, voixEnSortie: false });
    await session.listenTurn();
    expect(mic.takes).toEqual([8]);
  });

  it("silence : aucune génération", async () => {
    const { session, model } = setup(IDENTITY_V0, [""]);
    const r = await session.listenTurn();
    expect(r.output).toBe("aucune");
    expect(model.calls).toHaveLength(0);
  });

  it("garde le fil de la conversation avec les consignes du cadre en tête", async () => {
    const { session, model } = setup();
    await session.listenTurn();
    await session.textTurn("Et après ?");
    const last = model.calls[1]!;
    expect(last[0]).toEqual({ role: "system", content: SHYRKA_SYSTEM_PROMPT });
    expect(last.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("historique borné", async () => {
    const printed: string[] = [];
    const model = new SimulatedTextModel("ok");
    const s = new ShyrkaSession({ model, identity: IDENTITY_V0, print: (l) => printed.push(l), historyTurns: 2 });
    for (let i = 0; i < 5; i++) await s.textTurn(`q${i}`);
    expect(model.calls[4]!.length).toBe(1 + 4 + 1);
  });

  it("sans micro, le tour à la voix est refusé clairement", async () => {
    const s = new ShyrkaSession({ model: new SimulatedTextModel(), identity: IDENTITY_V0, print: () => {} });
    await expect(s.listenTurn()).rejects.toThrow(/micro/);
  });

  it("style : pas de tiret cadratin", () => {
    expect(applyStyle("Oui — et non  —  peut-être")).toBe("Oui, et non, peut-être");
  });

  it("les consignes n'accordent aucune action", () => {
    expect(SHYRKA_SYSTEM_PROMPT).toMatch(/aucune action, aucun envoi, aucune écriture/);
    expect(SHYRKA_SYSTEM_PROMPT).toMatch(/tutoies/);
  });

  it("tour « pousser pour parler » : la prise fournie est transcrite puis traitée", async () => {
    const { session } = setup();
    const r = await session.clipTurn({ path: "/x.wav", durationMs: 1 });
    expect(r.heard).toBe("Bonjour Shyrka");
  });

  it("refuse un modèle distant", () => {
    expect(() => new ShyrkaSession({ model: { name: "anthropic:claude", chat: async () => "" }, identity: IDENTITY_V0, print: () => {} })).toThrow(/locaux/);
  });
});

describe("comparaison de modèles", () => {
  it("affiche la réponse du second modèle sans la parler ni la garder", async () => {
    const printed: string[] = [];
    const speaker = new RecordingSpeaker();
    const main = new SimulatedTextModel("Réponse principale.");
    const other = new SimulatedTextModel("Autre réponse.");
    const s = new ShyrkaSession({ model: main, compareModel: other, speaker, identity: { ...IDENTITY_V0, version: 1, voixEnSortie: true }, print: (l) => printed.push(l) });
    const r = await s.textTurn("Bonjour");
    expect(r.comparison?.answer).toBe("Autre réponse.");
    expect(speaker.spoken).toEqual(["Réponse principale."]);
    expect(printed[1]).toMatch(/comparaison simule:modele-texte .*Autre réponse\./);
    await s.textTurn("Et ensuite ?");
    expect(main.calls[1]!.filter((m) => m.role === "assistant").map((m) => m.content)).toEqual(["Réponse principale."]);
  });
});

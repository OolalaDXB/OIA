import { describe, expect, it } from "vitest";
import { consigneLangue, langueDuTexte, VoixMultilingue, voixParLocale, voixPourLangue } from "../src/passerelle/langues.js";
import { codeLangue } from "../src/adapters/whisper-server.js";
import type { Speaker } from "../src/types.js";

/** Langue du tour et voix du Mac (passerelle). */
const SORTIE = [
  "Aurélie             fr_FR    # Bonjour, je m’appelle Aurélie.",
  "Aurélie (Enhanced)  fr_FR    # Bonjour, je m’appelle Aurélie.",
  "Milena              ru_RU    # Здравствуйте! Меня зовут Милена.",
  "Samantha            en_US    # Hello, my name is Samantha.",
  "Ava (Premium)       en_US    # Hello, my name is Ava.",
].join("\n");

describe("langue et voix", () => {
  it("déduit la langue de l'alphabet, rien pour l'alphabet latin", () => {
    expect(langueDuTexte("Что я решил по проекту Силлон?")).toBe("ru");
    expect(langueDuTexte("Що я вирішив щодо проєкту?")).toBe("uk");
    expect(langueDuTexte("ماذا قررت؟")).toBe("ar");
    expect(langueDuTexte("Qu'avais-je décidé ?")).toBeNull();
    expect(langueDuTexte("123 ?")).toBeNull();
  });
  it("ramène les noms de Whisper au code ISO", () => {
    expect(codeLangue("russian")).toBe("ru");
    expect(codeLangue("French")).toBe("fr");
    expect(codeLangue("")).toBe("fr");
  });
  it("aucune consigne en français ; consigne explicite sinon", () => {
    expect(consigneLangue("fr")).toBe("");
    expect(consigneLangue("en")).toMatch(/réponds en anglais, pas en français/);
  });
  it("n'utilise jamais une voix gadget ; prend la voix préférée de la langue (Samantha plutôt qu'Albert)", () => {
    const v = voixParLocale(["Albert              en_US    # Hello! My name is Albert.", "Bad News            en_US    # x", "Samantha            en_US    # Hello", "Daniel              en_GB    # Hello"].join("\n"));
    expect(voixPourLangue("en", v)).toBe("Samantha");
    expect(voixPourLangue("en", voixParLocale("Albert              en_US    # x\nBubbles             en_US    # x"))).toBeNull();
  });
  it("choisit Premium, puis Enhanced, puis la première voix de la langue ; null sans voix", () => {
    const v = voixParLocale(SORTIE);
    expect(voixPourLangue("en", v)).toBe("Ava (Premium)");
    expect(voixPourLangue("fr", v)).toBe("Aurélie (Enhanced)");
    expect(voixPourLangue("ru", v)).toBe("Milena");
    expect(voixPourLangue("ja", v)).toBeNull();
  });
  it("la réplique choisit sa voix par son alphabet ; sans voix installée, rien n'est lu et c'est signalé", async () => {
    const dits: string[] = [];
    const signales: string[] = [];
    const v = new VoixMultilingue((c) => voixPourLangue(c, voixParLocale(SORTIE)), (voix): Speaker => ({ speak: async (t) => void dits.push(`${voix} : ${t}`) }), (m) => signales.push(m));
    v.langue("fr");
    await v.speak("Привет, Мишель.");
    await v.speak("Bonjour.");
    v.langue("ja");
    await v.speak("Konnichiwa");
    expect(dits).toEqual(["Milena : Привет, Мишель.", "Aurélie (Enhanced) : Bonjour."]);
    expect(signales).toEqual(["aucune voix japonais installée sur ce Mac : réponse affichée, non lue"]);
  });
});

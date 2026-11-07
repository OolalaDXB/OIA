import { describe, it, expect } from "vitest";
import { AgentMessages, empreinte } from "../src/messages/agent.js";
import { BOITE_FICTIVE, CanalSimule } from "../src/messages/simulated.js";
import { JournalMemoire } from "../src/messages/types.js";
import { PERMISSIONS_FERMEES, type Permissions, type Palier } from "../src/permissions.js";
import { SimulatedTextModel } from "../src/adapters/simulated.js";
import type { TextModel } from "../src/types.js";

function perms(email: Palier, whatsapp: Palier = "aucun", extra: Partial<Permissions> = {}): Permissions {
  return { ...PERMISSIONS_FERMEES, canaux: { email: { palier: email, delegations: [] }, whatsapp: { palier: whatsapp, delegations: [] } }, ...extra };
}

const modele = () =>
  new SimulatedTextModel((m) => (m[0]?.content.startsWith("Tu tries") ? '{"categorie":"prospect-tarifs","resume":"Demande de tarifs — audit."}' : "Bonjour — merci, je vous réponds lundi."));

function agent(p: Permissions, canal: "email" | "whatsapp" = "email", model: TextModel = modele()) {
  const boite = new CanalSimule(canal, BOITE_FICTIVE);
  const journal = new JournalMemoire();
  let n = 0;
  return { a: new AgentMessages({ canal: boite, model, permissions: p, journal, newId: () => `b${++n}` }), boite, journal, model };
}

describe("agent courrier et WhatsApp", () => {
  it("palier « aucun » : ne lit rien, refus journalisé", async () => {
    const { a, journal, model } = agent(PERMISSIONS_FERMEES);
    expect(await a.lireEtTrier()).toEqual({ refus: "email : palier aucun, lecture non accordée" });
    expect((model as SimulatedTextModel).calls).toHaveLength(0);
    expect(journal.evenements.map((e) => e.action)).toEqual(["refus"]);
  });

  it("n'accepte qu'un modèle local", () => {
    const distant: TextModel = { name: "anthropic:claude", chat: async () => "" };
    expect(() => agent(perms("lire"), "email", distant)).toThrow(/modèle local/);
  });

  it("écarte Swift sans lire le contenu, trie le reste", async () => {
    const { a, journal, model } = agent(perms("lire"));
    const r = await a.lireEtTrier();
    if ("refus" in r) throw new Error("inattendu");
    expect(r.exclus).toBe(1);
    expect(r.tries.map((t) => t.message.id)).toEqual(["f1", "f3", "f6"]);
    expect(r.tries[0]).toMatchObject({ categorie: "prospect-tarifs", resume: "Demande de tarifs, audit." });
    const vus = (model as SimulatedTextModel).calls.map((c) => c.map((m) => m.content).join(" "));
    expect(vus.some((t) => t.includes("ne doit jamais être lu"))).toBe(false);
    expect(journal.evenements.find((e) => e.action === "exclu")).toMatchObject({ messageId: "fx" });
  });

  it("palier « lire » : pas de brouillon", async () => {
    const { a } = agent(perms("lire"));
    const r = await a.lireEtTrier();
    if ("refus" in r) throw new Error("inattendu");
    expect(await a.preparer(r.tries[0]!)).toEqual({ refus: "email : palier lire, préparation non accordée" });
  });

  it("palier « préparer » : brouillon rangé, empreinte calculée, aucun envoi", async () => {
    const { a, boite } = agent(perms("preparer"));
    const r = await a.lireEtTrier();
    if ("refus" in r) throw new Error("inattendu");
    const b = await a.preparer(r.tries[0]!);
    if ("refus" in b) throw new Error("inattendu");
    expect(b).toMatchObject({ id: "b1", a: "prospect@exemple.fr", sujet: "Re: Audit de notre site", texte: "Bonjour, merci, je vous réponds lundi." });
    expect(b.empreinte).toBe(empreinte(b.texte));
    expect(boite.brouillons).toHaveLength(1);
    const e = await a.envoyer(b, { categorie: "prospect-tarifs" });
    expect(e).toMatchObject({ validationRequise: false });
    expect(boite.envoyes).toHaveLength(0);
  });

  it("palier « répondre après validation » : envoi seulement avec la validation de ce texte", async () => {
    const { a, boite, journal } = agent(perms("repondre-apres-validation"));
    const r = await a.lireEtTrier();
    if ("refus" in r) throw new Error("inattendu");
    const b = await a.preparer(r.tries[0]!);
    if ("refus" in b) throw new Error("inattendu");
    expect(await a.envoyer(b, { categorie: "prospect-tarifs" })).toMatchObject({ validationRequise: true });
    const modifie = { ...b, texte: `${b.texte} Et un prix de 50 €.` };
    expect(await a.envoyer(modifie, { categorie: "prospect-tarifs", validation: { brouillonId: b.id, empreinte: b.empreinte } })).toMatchObject({ refus: expect.stringMatching(/empreinte/) });
    expect(await a.envoyer(b, { categorie: "prospect-tarifs", validation: { brouillonId: b.id, empreinte: b.empreinte } })).toEqual({ envoyeLe: "simule" });
    expect(boite.envoyes.map((x) => x.id)).toEqual(["b1"]);
    expect(journal.evenements.filter((e) => e.action === "envoyer")).toHaveLength(1);
  });

  it("WhatsApp suit les mêmes règles, sur son propre palier", async () => {
    const { a, boite } = agent(perms("aucun", "envoyer-seule", {}), "whatsapp");
    const r = await a.lireEtTrier();
    if ("refus" in r) throw new Error("inattendu");
    expect(r.tries.map((t) => t.message.id)).toEqual(["f2", "f4", "f9"]);
    const b = await a.preparer(r.tries[0]!);
    if ("refus" in b) throw new Error("inattendu");
    expect(b.sujet).toBeUndefined();
    // Envoyer seule sans délégation écrite pour la catégorie : validation requise.
    expect(await a.envoyer(b, { categorie: "plainte-client" })).toMatchObject({ validationRequise: true });
    expect(boite.envoyes).toHaveLength(0);
  });

  it("réponse de tri non conforme : catégorie « ambigu »", async () => {
    const { a } = agent(perms("lire"), "email", new SimulatedTextModel("je ne sais pas"));
    const r = await a.lireEtTrier(1);
    if ("refus" in r) throw new Error("inattendu");
    expect(r.tries[0]).toMatchObject({ categorie: "ambigu", resume: "" });
  });
});

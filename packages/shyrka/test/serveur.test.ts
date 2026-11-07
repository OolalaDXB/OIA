import { describe, expect, it } from "vitest";
import { masquerSensibles, toucheSwift, filtrerLignes } from "../src/serveur/filtre.ts";
import {
  COUT_MAX_MESSAGE_USD,
  JETONS_ENTREE_MAX,
  estimerJetons,
  modeleMistral,
  repondre,
  type MessageModele,
  type Modele,
  type ReponseModele,
} from "../src/serveur/conversation.ts";
import { outilsPourLeModele, type Lecteur } from "../src/serveur/outils.ts";

/** Shyrka côté serveur (mandat v9, bloc G) : modèle simulé, données fictives. */
const MAINTENANT = "2026-11-08T06:00:00Z";

function lecteurFictif(lignes: Record<string, Record<string, unknown>[]>, appels: { vue: string; params: Record<string, string> }[] = []): Lecteur {
  return { lire: async (vue, params) => (appels.push({ vue, params }), lignes[vue] ?? []) };
}
const ecrivain = (ids: string[] = []) => ({ creerBrouillon: async (_t: string, titre: string) => (ids.push(titre), `brouillon-${ids.length}`) });

/** Modèle simulé : joue une suite de réponses, garde les requêtes reçues. */
function modeleScripte(etapes: Partial<ReponseModele["message"]>[], requetes: Parameters<Modele>[0][] = []): Modele {
  let i = 0;
  return async (req) => {
    requetes.push(JSON.parse(JSON.stringify(req)));
    const m = etapes[Math.min(i++, etapes.length - 1)]!;
    return { message: { content: m.content ?? null, tool_calls: m.tool_calls }, usage: { prompt_tokens: 1000, completion_tokens: 100 }, model: "mistral-large-test" };
  };
}
const appel = (name: string, args: Record<string, unknown> = {}, id = "c1") => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

describe("exclusions avant le modèle (tests adverses)", () => {
  it("Swift sous toutes ses formes", () => {
    for (const t of ["Point Swift demain", "SWIFT", "réunion s.w.i.f.t", "voir swift.com/x", "TR: Fwd: note de l'équipe Swift", "pièce jointe swift_rapport.pdf", "Ｓｗｉｆｔ"])
      expect(toucheSwift(t), t).toBe(true);
    for (const t of ["swiftly", "Swiftui-like", "rapide", "Le projet SILLON"]) expect(toucheSwift(t), t).toBe(false);
  });

  it("données sensibles masquées : compte, carte, passeport", () => {
    const r = masquerSensibles("IBAN FR76 3000 6000 0112 3456 7890 189, carte 4970 1012 3456 7890, passeport n° 12AB34567");
    expect(r.texte).not.toMatch(/3000 6000|4970|12AB34567/);
    expect(r.masques.sort()).toEqual(["carte", "iban", "passeport"]);
  });

  it("une ligne de données qui touche à Swift est retirée entière", () => {
    const r = filtrerLignes([{ titre: "Appel régional" }, { titre: "Partenariat", note: "via Swift" }]);
    expect(r).toEqual({ lignes: [{ titre: "Appel régional" }], retirees: 1 });
  });
});

describe("conversation", () => {
  it("un message sur Swift ne part jamais vers le modèle", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const journal: string[] = [];
    const r = await repondre(
      { message: "Résume le dossier Swift", historique: [], maintenant: MAINTENANT },
      { modele: modeleScripte([{ content: "x" }], requetes), lecteur: lecteurFictif({}), ecrivain: ecrivain(), journaliser: async (q, _c, res) => void journal.push(`${q}:${res}`) },
    );
    expect(requetes).toHaveLength(0);
    expect(r.local).toBe(true);
    expect(r.exclu).toBe(true);
    expect(r.coutUsd).toBe(0);
    expect(journal).toEqual(["exclusion.swift:refuse"]);
  });

  it("lit les données par les outils, cite les sources, plusieurs tours", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const appels: { vue: string; params: Record<string, string> }[] = [];
    const lecteur = lecteurFictif({
      vis_mesure_v1: [{ window_id: "sujet-j0", jours_mesures: 1, jours_prevus: 5, reponses: 47, etat: "mesure_en_cours" }],
      vis_apercu_v1: [{ window_id: "sujet-j0", moteur: "tous", indicateur: "presence", numerateur: 4, denominateur: 47 }],
    }, appels);
    const r = await repondre(
      { message: "Où en est la mesure ?", historique: [{ role: "mickael", contenu: "Salut" }, { role: "shyrka", contenu: "Salut." }], maintenant: MAINTENANT },
      { modele: modeleScripte([{ tool_calls: [appel("etat_visibility")] }, { content: "Jour 1 sur 5, 4 mentions sur 47 (source : vis_mesure_v1, sujet-j0, 2026-11-08)." }], requetes), lecteur, ecrivain: ecrivain() },
    );
    expect(r.reponse).toMatch(/Jour 1 sur 5/);
    expect(r.outils).toEqual(["etat_visibility"]);
    expect(r.sources.map((s) => s.vue)).toEqual(["vis_mesure_v1", "vis_apercu_v1"]);
    expect(appels.map((a) => a.vue)).toEqual(["vis_mesure_v1", "vis_apercu_v1"]);
    // Historique transmis, consignes de CADRE.md en tête.
    expect(requetes[0]!.messages.map((m: MessageModele) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(requetes[0]!.messages[0]!.content).toMatch(/tutoies/);
    expect(requetes[0]!.messages[0]!.content).toMatch(/N'invente jamais un lien/);
    // Le résultat de l'outil est renvoyé au modèle avec ses sources.
    expect(requetes[1]!.messages.at(-1)).toMatchObject({ role: "tool", name: "etat_visibility" });
    expect(r.coutUsd).toBeCloseTo((2000 * 0.7 + 200 * 2.1) / 1e6, 10);
    expect(r.coutUsd).toBeLessThanOrEqual(COUT_MAX_MESSAGE_USD);
  });

  it("opportunités d'un projet : filtre PostgREST sur le projet, lignes Swift retirées avant le modèle", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const appels: { vue: string; params: Record<string, string> }[] = [];
    const lecteur = lecteurFictif({ ml_toutes_v1: [{ id: "o1", titre: "Subvention fictive" }, { id: "o2", titre: "Programme Swift fictif" }] }, appels);
    await repondre(
      { message: "Quelles opportunités pour SILLON ?", historique: [], maintenant: MAINTENANT },
      { modele: modeleScripte([{ tool_calls: [appel("opportunites", { projet: "SILLON" })] }, { content: "Une." }], requetes), lecteur, ecrivain: ecrivain() },
    );
    expect(appels[0]!.params.projets_decouverte).toBe("cs.{sillon}");
    expect(appels[1]!.params).toEqual({ projets_decouverte: "cs.{sillon}", select: "id", limit: "5000" }); // total exact
    expect(JSON.stringify(requetes[1]!.messages.at(-1))).toContain('total_correspondantes\\":1');
    const envoye = JSON.stringify(requetes[1]!.messages.filter((m: MessageModele) => m.role === "tool"));
    expect(envoye).toContain("Subvention fictive");
    expect(envoye).not.toMatch(/swift/i);
  });

  it("un message préparé reste un brouillon ; aucun outil d'envoi n'existe ; un outil inconnu est refusé", async () => {
    const titres: string[] = [];
    const journal: string[] = [];
    const r = await repondre(
      { message: "Prépare un message de relance", historique: [], maintenant: MAINTENANT },
      {
        modele: modeleScripte([
          { tool_calls: [appel("preparer_brouillon", { type: "message", titre: "Relance", contenu: "Bonjour, …" }), appel("envoyer_email", { a: "x@exemple.test" }, "c2")] },
          { content: "Brouillon prêt, rien n'est envoyé." },
        ]),
        lecteur: lecteurFictif({}),
        ecrivain: ecrivain(titres),
        journaliser: async (q, _c, res) => void journal.push(`${q}:${res}`),
      },
    );
    expect(titres).toEqual(["Relance"]);
    expect(r.brouillons).toEqual(["brouillon-1"]);
    expect(journal).toContain("outil.inconnu:refuse");
    expect(outilsPourLeModele().map((o) => o.function.name).filter((n) => /envoy|publi|supprim|modif/.test(n))).toEqual([]);
  });

  it("plafond d'entrée : chaque appel au modèle reste sous 4 000 jetons, même avec un long historique et de gros résultats", async () => {
    const requetes: Parameters<Modele>[0][] = [];
    const gros = Array.from({ length: 400 }, (_, i) => ({ id: `o${i}`, titre: "Opportunité fictive ".repeat(5) }));
    const historique = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? "shyrka" : "mickael") as "shyrka" | "mickael", contenu: "Un tour d'historique assez long. ".repeat(30) }));
    await repondre(
      { message: "Tout ?", historique, maintenant: MAINTENANT },
      { modele: modeleScripte([{ tool_calls: [appel("opportunites")] }, { tool_calls: [appel("projets", {}, "c2")] }, { content: "Fin." }], requetes), lecteur: lecteurFictif({ ml_toutes_v1: gros }), ecrivain: ecrivain() },
    );
    expect(requetes).toHaveLength(3); // jamais plus de trois appels par message
    for (const q of requetes) expect(estimerJetons(JSON.stringify(q.messages)) + estimerJetons(JSON.stringify(q.tools))).toBeLessThanOrEqual(JETONS_ENTREE_MAX);
    expect(requetes[2]!.tools).toEqual([]); // dernier appel : réponse obligatoire, sans outil
  });

  it("message trop long : refusé avant le modèle", async () => {
    await expect(repondre({ message: "x".repeat(20000), historique: [], maintenant: MAINTENANT }, { modele: modeleScripte([]), lecteur: lecteurFictif({}), ecrivain: ecrivain() }))
      .rejects.toThrow(/trop long/);
  });

  it("adaptateur Mistral : clé en en-tête seulement, erreur HTTP remontée", async () => {
    const vus: RequestInit[] = [];
    const ok = modeleMistral("cle-fictive", (async (_u: string, init: RequestInit) => (vus.push(init), new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 }, model: "m" })))) as typeof fetch);
    await ok({ model: "m", messages: [], tools: [], max_tokens: 1 });
    expect(String(vus[0]!.body)).not.toContain("cle-fictive");
    const ko = modeleMistral("cle-fictive", (async () => new Response("non", { status: 429 })) as typeof fetch);
    await expect(ko({ model: "m", messages: [], tools: [], max_tokens: 1 })).rejects.toThrow(/HTTP 429/);
  });

  it("garde des faits : une échéance inventée est signalée et journalisée ; une date des données passe", async () => {
    const journal: string[] = [];
    const d = { lecteur: lecteurFictif({ ml_toutes_v1: [{ id: "o1", titre: "Subvention fictive", echeance: "2027-04-03" }] }), ecrivain: ecrivain(), journaliser: async (q: string, _c: string | null, res: string) => void journal.push(`${q}:${res}`) };
    const invente = await repondre({ message: "Échéance ?", historique: [], maintenant: MAINTENANT },
      { ...d, modele: modeleScripte([{ tool_calls: [appel("opportunites")] }, { content: "J'ai vérifié la page : échéance le 12 mars 2027." }]) });
    expect(invente.nonSourcees).toEqual(["2027-03-12"]);
    expect(invente.reponse).toMatch(/Attention : aucune donnée d'OIA ne contient cette date \(2027-03-12\)/);
    expect(journal).toContain("garde.date_sans_source:refuse");
    const juste = await repondre({ message: "Échéance ?", historique: [], maintenant: MAINTENANT },
      { ...d, modele: modeleScripte([{ tool_calls: [appel("opportunites")] }, { content: "Échéance : 3 avril 2027 (source : ml_toutes_v1, o1, 2026-11-08)." }]) });
    expect(juste.nonSourcees).toEqual([]);
  });
});

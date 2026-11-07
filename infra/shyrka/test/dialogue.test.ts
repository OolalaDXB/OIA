import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RecordingSpeaker, SimulatedTextModel } from "../src/adapters/simulated.js";
import { contexteModele, decisionsOuvertes, etatOia, lectureAutorisee } from "../src/contexte.js";
import { detecterDemande, detecterOffre, estAccord, estRefus, sansRepetition } from "../src/dialogue.js";
import { IDENTITY_V0 } from "../src/identity.js";
import { RACINE_DEPOT } from "../src/local.js";
import { promptSysteme } from "../src/persona.js";
import { ShyrkaSession } from "../src/session.js";
import type { ChatMessage } from "../src/types.js";

/**
 * Non-régression du premier essai réel (Qwen3 8B, voix Aurélie) : Shyrka
 * reposait « Veux-tu que je te présente le cadre ? » malgré plusieurs « oui ».
 * Modèle simulé : il propose toujours de présenter le cadre, comme dans l'essai.
 */
const OFFRE = "Veux-tu que je te présente le cadre ?";
const CADRE = readFileSync(join(RACINE_DEPOT, "docs/shyrka/CADRE.md"), "utf8");
const ROADMAP = readFileSync(join(RACINE_DEPOT, "docs/roadmap-oia-shyrka-souffleur.md"), "utf8");

/** Modèle qui boucle : il reprend toujours la même offre, et synthétise si on lui donne un document. */
function modeleQuiBoucle() {
  return new SimulatedTextModel((m: ChatMessage[]) => {
    const dernier = m[m.length - 1]!.content;
    if (dernier.startsWith("Voici le texte intégral de")) return `Synthèse fidèle du document. ${OFFRE}`;
    return `Bonjour Mickaël. ${OFFRE}`;
  });
}

function session(model = modeleQuiBoucle()) {
  const dit: string[] = [];
  const speaker = new RecordingSpeaker();
  const s = new ShyrkaSession({ model, speaker, identity: IDENTITY_V0, print: (l) => dit.push(l) });
  return { s, model, speaker, dit };
}

describe("accords et offres, gérés par le code", () => {
  it("reconnaît les accords brefs, et seulement eux", () => {
    for (const a of ["oui", "Oui.", "OK", "ok !", "vas-y", "Vas-y !", "d'accord", "D’accord", "go", "oui vas-y", "ouais", "oui merci", "ok Shyrka", "bien sûr", "volontiers"]) expect(estAccord(a), a).toBe(true);
    for (const n of ["non", "pas maintenant", "oui mais pas le cadre", "parle-moi de J0", "", "ok alors explique-moi pourquoi le budget est à 30 dollars"]) expect(estAccord(n), n).toBe(false);
    expect(estRefus("Non merci")).toBe(true);
  });

  it("repère une offre de lecture dans une réponse, pas une question ouverte", () => {
    expect(detecterOffre(`Bonjour. ${OFFRE}`)).toMatchObject({ type: "presenter", sujet: "cadre" });
    expect(detecterOffre("Tu veux que je liste les décisions en attente ?")).toMatchObject({ type: "lister", sujet: "decisions" });
    expect(detecterOffre("Comment s'est passée ta journée ?")).toBeNull();
  });

  it("séquence « propose, oui, exécute » : le cadre est lu réellement, puis synthétisé", async () => {
    const { s, model, speaker } = session();
    const r1 = await s.textTurn("Bonjour Shyrka");
    expect(r1.answer).toContain(OFFRE);
    expect(s.offreEnAttente).toMatchObject({ type: "presenter", sujet: "cadre" });
    const r2 = await s.textTurn("oui");
    // Le modèle a reçu le texte intégral du cadre, lu sur disque par la liste blanche.
    const lecture = model.calls[1]!;
    expect(lecture[lecture.length - 1]!.content).toContain(CADRE);
    expect(r2.answer).toMatch(/^J'ai lu docs\/shyrka\/CADRE\.md\. Synthèse fidèle du document\.$/);
    expect(r2.answer).not.toContain("?");
    expect(s.offreEnAttente).toBeNull();
    // Voix Aurélie inchangée : la réponse est parlée.
    expect(r2.output).toBe("voix");
    expect(speaker.spoken[1]).toBe(r2.answer);
  });

  it("aucune boucle après trois accords successifs", async () => {
    const { s, model } = session();
    const reponses = [(await s.textTurn("Bonjour Shyrka")).answer!];
    for (const oui of ["oui", "oui", "oui"]) reponses.push((await s.textTurn(oui)).answer!);
    // Le cadre est lu une seule fois.
    expect(model.calls.filter((c) => c[c.length - 1]!.content.includes(CADRE))).toHaveLength(1);
    // L'offre n'apparaît qu'une fois, au premier tour.
    expect(reponses.filter((r) => r.includes(OFFRE))).toHaveLength(1);
    // Jamais deux fois de suite la même question.
    for (let i = 1; i < reponses.length; i++) {
      const avant = reponses[i - 1]!.match(/[^.!?]*\?/g) ?? [];
      for (const q of avant) expect(reponses[i], `tour ${i}`).not.toContain(q.trim());
    }
    expect(reponses[2]).toBe("Rien n'est en attente de mon côté. Dis-moi ce que tu veux voir.");
    expect(reponses[3]).toBe(reponses[2]);
  });

  it("un refus abandonne l'offre, et le modèle ne la repose pas au tour suivant", async () => {
    const { s } = session();
    await s.textTurn("Bonjour Shyrka");
    expect((await s.textTurn("non merci")).answer).toBe("Entendu, je laisse ça de côté.");
    expect(s.offreEnAttente).toBeNull();
    const r = await s.textTurn("Parle-moi de la météo des projets");
    expect(r.answer).toContain(OFFRE); // l'offre revient seulement après un autre échange, jamais d'affilée
  });

  it("une même question n'est jamais reposée deux fois de suite", () => {
    expect(sansRepetition(`Voilà. ${OFFRE}`, [OFFRE], [])).toBe("Voilà.");
    expect(sansRepetition("D'accord. Veux-tu que je résume le cadre ?", [], [{ type: "presenter", sujet: "cadre" }])).toBe("D'accord.");
    expect(sansRepetition("Autre chose ?", ["Veux-tu la suite ?"], [])).toBe("Autre chose ?");
  });
});

describe("contexte vérifiable", () => {
  it("liste des décisions strictement identique à la roadmap : intitulés exacts, identifiants, lignes", async () => {
    // Lecture indépendante de la roadmap, ligne par ligne.
    const lignes = ROADMAP.split("\n");
    const debut = lignes.indexOf("## Décisions ouvertes");
    const fin = lignes.findIndex((l, i) => i > debut && l.startsWith("## "));
    const attendues = lignes.slice(debut + 1, fin < 0 ? undefined : fin).filter((l) => l.startsWith("- [ ] ")).map((l) => l.slice(6).trim());
    expect(attendues.length).toBeGreaterThan(0);
    const d = decisionsOuvertes(ROADMAP);
    expect(d.map((x) => x.intitule)).toEqual(attendues);
    expect(d.map((x) => x.id)).toEqual(attendues.map((_, i) => `D${String(i + 1).padStart(2, "0")}`));
    for (const x of d) expect(lignes[x.ligne - 1]).toBe(`- [ ] ${x.intitule}`);

    // Demandée à Shyrka : la liste vient du code, mot pour mot, sans le modèle.
    const { s, model } = session(new SimulatedTextModel("Il y a 3 catégories de décisions."));
    const r = await s.textTurn("Liste-moi les décisions");
    expect(model.calls).toHaveLength(0);
    const rendues = r.answer!.split("\n").slice(1).map((l) => /^D\d{2} · (.+) \(roadmap, ligne \d+\)$/.exec(l)![1]);
    expect(rendues).toEqual(attendues);
    expect(r.answer!.split("\n")[0]).toBe(`Décisions ouvertes dans la roadmap (${attendues.length}) :`);
  });

  it("le modèle reçoit les intitulés exacts et leurs identifiants, pas leur seul nombre ; le prompt interdit l'invention", () => {
    const e = etatOia();
    const ctx = contexteModele(e, new Date("2026-11-09T10:00:00Z"));
    for (const x of e.decisionsDetail!) expect(ctx).toContain(`${x.id} · ${x.intitule}`);
    const p = promptSysteme(ctx);
    expect(p).toMatch(/aucune catégorie, aucun chiffre, aucun intitulé qui ne figure pas dans les sources fournies/);
    expect(p).toMatch(/identifiant et leur intitulé exact/);
  });
});

describe("lectures autorisées", () => {
  it("le cadre entre dans la liste ; le reste du périmètre ne change pas", () => {
    expect(lectureAutorisee(join(RACINE_DEPOT, "docs/shyrka/CADRE.md"))).toBe(true);
    for (const p of ["docs/shyrka/style.md", "docs/shyrka/entretiens.md", "infra/shyrka/permissions.json", "infra/visibility/elmo/.env", "infra/visibility/mandats/MANDAT-2026-11-07-v8-donnees-lovable-shyrka.md"])
      expect(lectureAutorisee(join(RACINE_DEPOT, p)), p).toBe(false);
  });

  it("refus honnête d'un document non autorisé : rien n'est lu, le modèle n'est pas appelé", async () => {
    const { s, model } = session(new SimulatedTextModel("J'ai bien lu le mandat, il dit que…"));
    for (const demande of ["Lis-moi infra/shyrka/permissions.json", "Présente-moi le mandat v9", "Résume le fichier .env d'Elmo", "Montre-moi docs/shyrka/style.md"]) {
      const r = await s.textTurn(demande);
      expect(r.answer, demande).toMatch(/n'est pas dans ma liste de lectures autorisées, et je ne l'ai pas lu/);
      expect(r.answer).not.toMatch(/J'ai lu/);
    }
    expect(model.calls).toHaveLength(0);
    expect(detecterDemande("Lis-moi infra/shyrka/permissions.json")).toEqual({ ok: false, document: "infra/shyrka/permissions.json" });
  });

  it("une demande directe de présenter le cadre le lit réellement", async () => {
    const { s, model } = session();
    const r = await s.textTurn("Présente-moi le cadre");
    expect(model.calls[0]![1]!.content).toContain(CADRE);
    expect(r.answer).toMatch(/^J'ai lu docs\/shyrka\/CADRE\.md\./);
  });

  it("une question ordinaire va au modèle, avec le contexte", async () => {
    const { s, model } = session(new SimulatedTextModel("Conclusion : J0 avance."));
    const r = await s.textTurn("Pourquoi le cadre interdit-il les données de Swift, à ton avis, et qu'est-ce que ça change pour moi ?");
    expect(model.calls).toHaveLength(1);
    expect(r.answer).toBe("Conclusion : J0 avance.");
  });
});

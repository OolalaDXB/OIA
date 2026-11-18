import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MacSaySpeaker, ErreurVoix } from "../src/adapters/macos-say.js";
import { SimulatedTextModel } from "../src/adapters/simulated.js";
import { Clavier, toucheDe } from "../src/clavier.js";
import { decisionsOuvertes } from "../src/contexte.js";
import { estArret, idsDecision, nombreDemande, routerDecision, texteVocal } from "../src/dialogue.js";
import { tauxEcho, verdictEcho } from "../src/echo.js";
import { IDENTITY_V0 } from "../src/identity.js";
import { RACINE_DEPOT } from "../src/local.js";
import { execFileRunner, resultatDErreur, type CommandRunner } from "../src/runner.js";
import { ShyrkaSession, type EtatSession } from "../src/session.js";
import type { ChatMessage, Speaker } from "../src/types.js";

/**
 * Non-régression du test réel du 8 novembre : Shyrka ne pouvait pas être
 * interrompue, l'arrêt oral ne fermait pas la CLI, toute phrase avec
 * « décision » donnait la liste complète, et 21 décisions partaient à `say`.
 */
const ROADMAP = readFileSync(join(RACINE_DEPOT, "docs/roadmap-oia-shyrka-souffleur.md"), "utf8");
const DECISIONS = decisionsOuvertes(ROADMAP);
const CADRE = readFileSync(join(RACINE_DEPOT, "docs/shyrka/CADRE.md"), "utf8");

/** Voix simulée qui parle jusqu'à ce qu'on l'interrompe (ou qu'on la laisse finir). */
class VoixLente implements Speaker {
  readonly dits: string[] = [];
  readonly interrompus: string[] = [];
  private couper: (() => void) | null = null;
  finirSeule = false;
  async speak(text: string): Promise<void | "interrompu"> {
    this.dits.push(text);
    if (this.finirSeule) return;
    return new Promise((resolve) => {
      this.couper = () => {
        this.interrompus.push(text);
        resolve("interrompu");
      };
    });
  }
  interrompre(): void {
    this.couper?.();
    this.couper = null;
  }
}

function session(model = new SimulatedTextModel((m: ChatMessage[]) => `Réponse à : ${m[m.length - 1]!.content.slice(0, 40)}`), speaker: Speaker = Object.assign(new VoixLente(), { finirSeule: true })) {
  const etats: EtatSession[] = [];
  const s = new ShyrkaSession({ model, speaker, identity: IDENTITY_V0, print: () => {}, onEtat: (e) => etats.push(e) });
  return { s, model, speaker, etats };
}

describe("arrêt oral, sans modèle et sans confirmation", () => {
  it("reconnaît les demandes d'arrêt, et seulement elles", () => {
    for (const a of ["Arrête Shyrka", "Arrête, Shyrka.", "Termine la session", "Termine la session.", "Au revoir", "Au revoir Shyrka !", "Shyrka, au revoir.", "Stop Shyrka", "Fin de session", "q", "Bonne nuit Shyrka"])
      expect(estArret(a), a).toBe(true);
    for (const n of ["Arrête de parler de J0 et explique le budget", "Termine la phrase", "Quand termine la fenêtre J0 ?", "au revoir à la console actuelle, c'est prévu quand ?", ""]) expect(estArret(n), n).toBe(false);
  });

  it("« Termine la session » : arrêt rendu à l'appelant, sans appel au modèle ni à la voix", async () => {
    const { s, model, speaker, etats } = session();
    const r = await s.textTurn("Termine la session");
    expect(r).toMatchObject({ arret: true, answer: null, output: "aucune" });
    expect(model.calls).toHaveLength(0);
    expect((speaker as VoixLente).dits).toEqual([]);
    expect(etats).toEqual(["arret"]);
  });
});

describe("interruption de la parole", () => {
  it("une réponse longue s'interrompt ; elle n'est pas retenue comme achevée ; la conversation reprend", async () => {
    const voix = new VoixLente();
    const { s, model, etats } = session(new SimulatedTextModel("Synthèse fidèle et longue du cadre."), voix);
    const tour = s.textTurn("Présente-moi le cadre");
    // Attendre que Shyrka parle, puis couper.
    while (s.etat !== "parole") await new Promise((r) => setTimeout(r, 1));
    expect(s.interrompre()).toBe(true);
    const r = await tour;
    expect(r.interrompue).toBe(true);
    expect(voix.interrompus).toHaveLength(1);
    expect(etats).toEqual(["reflexion", "parole", "interrompue"]);
    expect(s.interrompre()).toBe(false); // plus rien à couper
    // Non achevée : redemander relit vraiment le cadre (pas « déjà fait »).
    voix.finirSeule = true;
    const r2 = await s.textTurn("Présente-moi le cadre");
    expect(r2.interrompue).toBeUndefined();
    expect(model.calls.filter((c) => c[c.length - 1]!.content.includes(CADRE))).toHaveLength(2);
    // L'historique dit que la première réponse a été interrompue.
    expect(model.calls[1]!.some((m) => m.role === "assistant" && /interrompue par Mickaël/.test(m.content))).toBe(false); // la lecture du cadre ne reprend pas l'historique
    const r3 = await s.textTurn("Et maintenant ?");
    expect(r3.answer).toBeTruthy();
    const dernier = model.calls[model.calls.length - 1]!;
    expect(dernier.some((m) => m.role === "assistant" && /interrompue par Mickaël/.test(m.content))).toBe(true);
  });

  it("une offre faite dans une réponse interrompue n'attend pas d'accord", async () => {
    const voix = new VoixLente();
    const { s } = session(new SimulatedTextModel("Bonjour. Veux-tu que je te présente le cadre ?"), voix);
    const tour = s.textTurn("Bonjour");
    while (s.etat !== "parole") await new Promise((r) => setTimeout(r, 1));
    s.interrompre();
    await tour;
    expect(s.offreEnAttente).toBeNull();
  });

  it("un vrai processus s'arrête tout de suite sur interruption, sans attendre sa fin", async () => {
    const ctrl = new AbortController();
    const t0 = Date.now();
    const p = execFileRunner("sleep", ["30"], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 50);
    const r = await p;
    expect(r.aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe("échecs de say, décrits précisément", () => {
  it("délai dépassé, annulation, commande absente, signal : jamais le seul code 127", async () => {
    const t0 = Date.now();
    const lent = await execFileRunner("sleep", ["5"], { timeoutMs: 100 });
    expect(lent).toMatchObject({ code: 124, timedOut: true, signal: "SIGTERM" });
    expect(Date.now() - t0).toBeLessThan(4000);
    const absent = await execFileRunner("commande-qui-n-existe-pas-shyrka", []);
    expect(absent).toMatchObject({ code: 127, errno: "ENOENT" });
    expect(resultatDErreur(Object.assign(new Error("x"), { signal: "SIGKILL" as NodeJS.Signals }), "", "")).toMatchObject({ code: 128, signal: "SIGKILL" });
    expect(resultatDErreur(Object.assign(new Error("x"), { code: 1 }), "", "voice not found")).toMatchObject({ code: 1 });
  });

  it("MacSaySpeaker : interruption rendue, erreurs typées et explicites", async () => {
    const opts = { voice: "Aurélie", dir: "/t", writeFile: () => {}, removeFile: () => {}, timeoutMs: 120_000 };
    const reponses: Record<string, Awaited<ReturnType<CommandRunner>>> = {
      delai: { code: 124, stdout: "", stderr: "", timedOut: true, signal: "SIGTERM" },
      absent: { code: 127, stdout: "", stderr: "", errno: "ENOENT" },
      signal: { code: 128, stdout: "", stderr: "", signal: "SIGKILL" },
      code: { code: 1, stdout: "", stderr: "Voice `X' not found." },
    };
    for (const [motif, res] of Object.entries(reponses)) {
      const s = new MacSaySpeaker(async () => res, opts);
      const e = await s.speak("Bonjour").catch((x: unknown) => x);
      expect(e, motif).toBeInstanceOf(ErreurVoix);
      expect((e as ErreurVoix).motif).toBe(motif === "absent" ? "introuvable" : motif);
    }
    const e = (await new MacSaySpeaker(async () => reponses.delai!, opts).speak("x").catch((x: unknown) => x)) as ErreurVoix;
    expect(e.message).toMatch(/délai dépassé \(120 s\), say arrêté par SIGTERM/);
    expect(e.detail).toMatchObject({ code: 124, signal: "SIGTERM", delaiMs: 120_000 });

    // Interruption : le signal d'annulation atteint la commande, la réplique rend « interrompu ».
    let vu: AbortSignal | undefined;
    const s = new MacSaySpeaker(
      (_c, _a, o) =>
        new Promise((resolve) => {
          vu = o?.signal;
          o?.signal?.addEventListener("abort", () => resolve({ code: 130, stdout: "", stderr: "", aborted: true }));
        }),
      opts,
    );
    const p = s.speak("Une très longue réponse");
    expect(s.parle).toBe(true);
    s.interrompre();
    expect(await p).toBe("interrompu");
    expect(vu?.aborted).toBe(true);
    expect(s.parle).toBe(false);
  });
});

describe("clavier", () => {
  function entree(tty: boolean) {
    const e = new EventEmitter() as EventEmitter & { isTTY: boolean; raw: boolean[]; setRawMode(r: boolean): void };
    e.isTTY = tty;
    e.raw = [];
    e.setRawMode = (r) => void e.raw.push(r);
    return e;
  }

  it("Entrée ou Espace interrompt, Ctrl+C ferme, les autres touches sont ignorées", () => {
    expect([" ", "\r", "\n", "\u0003", "a"].map(toucheDe)).toEqual(["interrompre", "interrompre", "interrompre", "fermer", "autre"]);
  });

  it("pendant la parole : mode brut, une touche agit tout de suite et ne devient pas une ligne", async () => {
    const e = entree(true);
    const k = new Clavier(e, () => {});
    const actions: string[] = [];
    let finir!: () => void;
    const parole = new Promise<void>((r) => (finir = r));
    const p = k.pendantParole(parole, { interrompre: () => actions.push("interrompre"), fermer: () => actions.push("fermer") });
    e.emit("data", " ");
    e.emit("data", "x");
    e.emit("data", "\r");
    e.emit("data", "\u0003");
    finir();
    await p;
    expect(actions).toEqual(["interrompre", "interrompre", "fermer"]);
    expect(e.raw).toEqual([true, false]);
    e.emit("data", "bonjour\n");
    expect(await k.lire("")).toBe("bonjour");
    k.fermer();
  });

  it("hors parole : lecture par ligne ; fin de flux rend null", async () => {
    const e = entree(false);
    const k = new Clavier(e, () => {});
    e.emit("data", "un\r\ndeux\n");
    expect(await k.lire("")).toBe("un");
    expect(await k.lire("")).toBe("deux");
    e.emit("end");
    expect(await k.lire("")).toBeNull();
  });
});

describe("routage des décisions et références", () => {
  it("identifiants, nombres et sens", () => {
    expect(idsDecision("Explique D01 et d 7")).toEqual(["D01", "D07"]);
    expect(nombreDemande("Liste les trois premières décisions")).toEqual({ n: 3, depuis: "debut" });
    expect(nombreDemande("les 2 dernières décisions")).toEqual({ n: 2, depuis: "fin" });
  });

  it("une explication ne devient jamais une liste", () => {
    expect(routerDecision("Liste les décisions", DECISIONS, null)).toMatchObject({ liste: DECISIONS });
    expect(routerDecision("Explique D01", DECISIONS, null)).toMatchObject({ expliquer: DECISIONS[0] });
    expect(routerDecision("Explique les décisions", DECISIONS, null)).toBeNull();
    expect(routerDecision("Quelle décision est la plus urgente ?", DECISIONS, null)).toBeNull();
    expect(routerDecision("Explique D99", DECISIONS, null)).toMatchObject({ texte: expect.stringMatching(/D99 n'existe pas/) });
  });

  it("limitation à trois éléments : D01 à D03, sans le modèle", async () => {
    const { s, model } = session();
    const r = await s.textTurn("Liste les trois premières décisions");
    expect(model.calls).toHaveLength(0);
    const lignes = r.answer!.split("\n");
    expect(lignes[0]).toBe(`Les 3 premières décisions ouvertes de la roadmap (3 sur ${DECISIONS.length}) :`);
    expect(lignes.slice(1).map((l) => l.slice(0, 3))).toEqual(["D01", "D02", "D03"]);
    expect(lignes.slice(1)).toEqual(DECISIONS.slice(0, 3).map((d) => `${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})`));
  });

  it("nombre demandé sans verbe de liste (« donne-moi les 3 premières décisions ») : D01 à D03, sans le modèle", async () => {
    for (const phrase of ["Donne-moi les 3 premières décisions", "Donne moi les trois premières décisions", "Quelles sont les 3 premières décisions ?", "Les 2 dernières décisions"]) {
      const { s, model } = session();
      const r = await s.textTurn(phrase);
      expect(model.calls, phrase).toHaveLength(0);
      const n = /2 dernières/.test(phrase) ? 2 : 3;
      const attendu = /dernières/.test(phrase) ? DECISIONS.slice(-n) : DECISIONS.slice(0, n);
      expect(r.answer!.split("\n").slice(1), phrase).toEqual(attendu.map((d) => `${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})`));
    }
    // Une question sur des décisions, sans liste demandée, reste au modèle.
    expect(routerDecision("Pourquoi les 3 premières décisions sont-elles bloquées ?", DECISIONS, null)).toBeNull();
    expect(routerDecision("Comment avancer sur les deux premières décisions ?", DECISIONS, null)).toBeNull();
  });

  it("suivi D01 → « pourquoi cette décision ? » : la dernière décision discutée, avec sa source", async () => {
    const { s, model } = session(new SimulatedTextModel("La roadmap ne donne pas la raison ; à mon avis, elle conditionne Shyrka 2."));
    const r1 = await s.textTurn("Explique D01");
    expect(r1.answer!.split("\n")[0]).toBe(`D01 · ${DECISIONS[0]!.intitule} (roadmap, ligne ${DECISIONS[0]!.ligne})`);
    expect(r1.answer).not.toMatch(/D02/);
    expect(s.derniereEntite).toEqual({ genre: "decision", id: "D01", intitule: DECISIONS[0]!.intitule, source: `docs/roadmap-oia-shyrka-souffleur.md, ligne ${DECISIONS[0]!.ligne}` });
    const r2 = await s.textTurn("Pourquoi cette décision est-elle importante ?");
    const consigne = model.calls[1]![model.calls[1]!.length - 1]!.content;
    expect(consigne).toContain("Pourquoi cette décision est-elle importante ?");
    expect(consigne).toContain(`D01, dans docs/roadmap-oia-shyrka-souffleur.md, ligne ${DECISIONS[0]!.ligne}`);
    expect(consigne).toContain(DECISIONS[0]!.intitule);
    expect(r2.answer!.startsWith("D01 · ")).toBe(true);
    expect(r2.answer!.split("\n").filter((l) => /^D\d{2} · /.test(l))).toHaveLength(1);
  });

  it("« cette décision » sans décision discutée : Shyrka demande laquelle, sans inventer", async () => {
    const { s, model } = session();
    const r = await s.textTurn("Pourquoi cette décision est-elle importante ?");
    expect(model.calls).toHaveLength(0);
    expect(r.answer).toMatch(/^Je ne sais pas de quelle décision tu parles/);
  });
});

describe("voix adaptée au dialogue", () => {
  it("la liste complète s'affiche ; la voix lit un résumé et trois éléments, jamais les 21", async () => {
    const { s, speaker } = session();
    const r = await s.textTurn("Liste les décisions");
    expect(r.answer!.split("\n")).toHaveLength(DECISIONS.length + 1);
    const dit = (speaker as VoixLente).dits[0]!;
    expect(dit).toBe(r.spoken);
    expect(dit).toMatch(new RegExp(`^${DECISIONS.length} éléments, tous affichés à l'écran\\. Les 3 premiers : D01 : `));
    expect(dit.match(/D\d{2} :/g)).toEqual(["D01 :", "D02 :", "D03 :"]);
    expect(dit).toMatch(new RegExp(`Il en reste ${DECISIONS.length - 3} : veux-tu la suite \\?$`));
    expect(dit).not.toMatch(/`|ligne \d+/);
    // « oui » : les cinq suivantes, avec une question différente.
    const r2 = await s.textTurn("oui");
    expect(r2.spoken!.match(/D\d{2} :/g)).toEqual(["D04 :", "D05 :", "D06 :", "D07 :", "D08 :"]);
    expect(r2.spoken).toMatch(new RegExp(`Il en reste ${DECISIONS.length - 8} : veux-tu la suite \\?$`));
    // « non » : la lecture s'arrête, rien n'attend.
    await s.textTurn("non");
    expect((await s.textTurn("oui")).answer).toBe("Rien n'est en attente de mon côté. Dis-moi ce que tu veux voir.");
  });

  it("une réponse longue du modèle : la voix lit les deux premières phrases, l'écran garde tout", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Phrase numéro ${i + 1} de la réponse, avec un peu de détail pour la rendre longue.`).join(" ");
    const v = texteVocal(long);
    expect(v.parle).toBe("Phrase numéro 1 de la réponse, avec un peu de détail pour la rendre longue. Phrase numéro 2 de la réponse, avec un peu de détail pour la rendre longue. Le détail est à l'écran.");
    expect(texteVocal("Réponse courte.").parle).toBe("Réponse courte.");
  });

  it("la lecture du cadre reste réelle", async () => {
    const { s, model } = session(new SimulatedTextModel("Synthèse."));
    const r = await s.textTurn("Présente-moi le cadre");
    expect(model.calls[0]![1]!.content).toContain(CADRE);
    expect(r.answer).toBe("J'ai lu docs/shyrka/CADRE.md. Synthèse.");
  });
});

describe("mesure d'écho (étude du barge-in)", () => {
  it("part des mots d'Aurélie retrouvés au micro", () => {
    expect(tauxEcho("Bonjour Mickaël, ceci est un contrôle", "bonjour mickael ceci est un controle")).toBe(1);
    expect(tauxEcho("Bonjour Mickaël, ceci est un contrôle", "")).toBe(0);
    expect(verdictEcho(0.9)).toMatch(/Écho fort/);
    expect(verdictEcho(0.05)).toMatch(/Écho faible/);
  });
});

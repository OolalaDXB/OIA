import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ecrireResume, lireStyle, resumeMarkdown, trierLeMatin } from "../src/agent.js";
import { palierCourrier } from "../src/palier.js";
import { RACINE_DEPOT, horsDepot } from "../src/chemins.js";
import { verifierEntete, verifierMessage } from "../src/exclusions.js";
import { BoiteFictive, ClasseurFictif, MESSAGES_FICTIFS, RedacteurFictif } from "../src/fictif.js";
import { BoiteGmail, GMAIL_API, PERIMETRES_GMAIL } from "../src/gmail.js";
import { ClasseurOllama, urlLocale } from "../src/ollama.js";
import type { Message } from "../src/types.js";

const msg = (p: Partial<Message>): Message => ({ id: "x", de: "Ami <ami@exemple.fr>", a: ["moi@exemple.fr"], cc: [], objet: "Bonjour", date: "2026-11-08", piecesJointes: [], autresEntetes: {}, corps: "Salut.", ...p });

async function trier(messages: Message[], palier: 0 | 1 | 2 = 1) {
  const boite = new BoiteFictive(messages);
  const classeur = new ClasseurFictif();
  const redacteur = new RedacteurFictif();
  const r = await trierLeMatin({ boite, classeur, redacteur, style: "", palier, date: "2026-11-08" });
  return { r, boite, classeur, redacteur };
}

describe("exclusions avant tout modèle (amendement, § 4) : tests adverses", () => {
  const cas: [string, Partial<Message>][] = [
    ["expéditeur Swift", { de: "X <x@swift.com>" }],
    ["sous-domaine Swift", { de: "x@mail.swift.com" }],
    ["destinataire Swift", { a: ["moi@exemple.fr", "equipe@swift.com"] }],
    ["copie Swift", { cc: ["y@swift.com"] }],
    ["Swift dans l'objet", { objet: "Re: réunion Swift" }],
    ["Swift dans le corps", { corps: "Comme convenu chez Swift, voici…" }],
    ["message transféré depuis une adresse Swift", { corps: "---------- Forwarded message ---------\nFrom: Collègue <c@swift.com>\nSubject: point" }],
    ["adresse personnelle évoquant Swift", { de: "Moi <mickael.swift.work@gmail.com>" }],
    ["pièce jointe au nom révélateur", { piecesJointes: ["budget-SWIFT-2027.xlsx"] }],
    ["en-tête falsifié : From propre, Reply-To Swift", { autresEntetes: { "Reply-To": ["x@swift.com"] } }],
    ["en-tête falsifié : Return-Path Swift", { autresEntetes: { "Return-Path": ["<bounce@swift.com>"] } }],
    ["en-tête falsifié : Received depuis Swift", { autresEntetes: { Received: ["from smtp.swift.com by mx.exemple.fr"] } }],
    ["mot écrit en morceaux", { corps: "réunion s.w.i.f.t demain" }],
    ["mot en pleine chasse", { objet: "ＳＷＩＦＴ" }],
    ["expéditeur illisible (doute)", { de: "" }],
  ];
  it.each(cas)("%s : exclu, jamais lu par le classeur ni le rédacteur, ni résumé", async (_nom, p) => {
    const m = msg({ id: "piege", objet: "Question piège", ...p });
    expect(verifierMessage(m).exclu).toBe(true);
    const { r, classeur, redacteur } = await trier([m, msg({ id: "ok", objet: "Question normale" })]);
    expect(r.exclus).toBe(1);
    expect(classeur.vus.map((x) => x.id)).toEqual(["ok"]);
    expect(redacteur.vus.map((x) => x.id)).toEqual(["ok"]);
    const md = resumeMarkdown(r);
    expect(md).not.toContain("piège");
    expect(md).not.toMatch(/swift/i);
  });

  it("un en-tête exclu n'entraîne même pas la lecture du corps", async () => {
    const { boite } = await trier([msg({ id: "a", de: "x@swift.com" })]);
    expect(boite.lus).toEqual([]);
    expect(verifierEntete(msg({ de: "x@swift.com" })).exclu).toBe(true);
  });

  it("un message ordinaire passe", () => {
    expect(verifierMessage(msg({})).exclu).toBe(false);
  });
});

describe("tri du matin", () => {
  it("quatre groupes, brouillons pour les réponses simples, résumé Markdown", async () => {
    const { r, boite } = await trier(MESSAGES_FICTIFS);
    expect(Object.fromEntries(Object.entries(r.groupes).map(([g, l]) => [g, l.length]))).toEqual({ "pour-toi": 1, "reponse-simple": 1, information: 1, bruit: 1 });
    expect(r.exclus).toBe(1);
    expect(boite.brouillons).toHaveLength(1);
    expect(boite.brouillons[0]).toMatchObject({ a: expect.stringContaining("camille@exemple.fr"), objet: "Re: Question sur le rendez-vous de jeudi", enReponseA: "m1" });
    expect(resumeMarkdown(r)).toMatch(/^Courrier : 1 pour toi, 1 réponses simples \(1 brouillons prêts, rien n'est envoyé\)/m);
  });

  it("palier 0 : aucun brouillon", async () => {
    const { r, boite } = await trier(MESSAGES_FICTIFS, 0);
    expect(r.brouillons).toBe(0);
    expect(boite.brouillons).toHaveLength(0);
  });

  it("le palier se lit dans permissions.json ; tout doute donne le palier 0", () => {
    expect(palierCourrier(fileURLToPath(new URL("../../../infra/shyrka/permissions.json", import.meta.url)))).toBe(1);
    expect(palierCourrier("/nulle/part.json")).toBe(0);
  });

  it("style.md : seul ce que Mickaël a écrit compte, le gabarit est ignoré", () => {
    const gabarit = readFileSync(fileURLToPath(new URL("../../../docs/shyrka/style.md", import.meta.url)), "utf8");
    expect(lireStyle(gabarit)).toBe("");
    expect(lireStyle(gabarit + "\nJe tutoie mes associés.\n")).toBe("Je tutoie mes associés.");
  });
});

describe("aucune fonction d'envoi (mandat v6, B3)", () => {
  it("l'interface et les adaptateurs n'ont que lister, lire, créer un brouillon", () => {
    for (const C of [BoiteGmail, BoiteFictive]) {
      const methodes = Object.getOwnPropertyNames(C.prototype).filter((n) => n !== "constructor" && !n.startsWith("appeler"));
      expect(methodes.sort()).toEqual(["creerBrouillon", "lire", "lister"]);
    }
  });

  it("aucun chemin du code n'appelle une route d'envoi", () => {
    const dossier = fileURLToPath(new URL("../src", import.meta.url));
    for (const f of readdirSync(dossier)) {
      const s = readFileSync(join(dossier, f), "utf8");
      expect(s, f).not.toMatch(/messages\/send|drafts\/send|\/send\b|smtp|nodemailer|sendmail/i);
    }
  });

  it("à l'exécution, l'adaptateur Gmail n'appelle que les routes de liste, de lecture et de brouillon", async () => {
    const appels: { url: string; method: string }[] = [];
    const g = new BoiteGmail({
      jeton: async () => "faux-jeton",
      fetch: async (url, init) => {
        appels.push({ url, method: init?.method ?? "GET" });
        if (url.includes("/messages?")) return { ok: true, status: 200, json: async () => ({ messages: [{ id: "1" }] }) };
        if (url.includes("/drafts")) return { ok: true, status: 200, json: async () => ({ id: "d1" }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ payload: { headers: [{ name: "From", value: "Ami <ami@exemple.fr>" }, { name: "Subject", value: "Question" }], parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Bonjour").toString("base64url") } }, { filename: "a.pdf" }] } }),
        };
      },
    });
    const liste = await g.lister({ limite: 5 });
    expect(liste[0]).toMatchObject({ de: "Ami <ami@exemple.fr>", objet: "Question", piecesJointes: ["a.pdf"] });
    expect((await g.lire("1")).corps).toBe("Bonjour");
    expect(await g.creerBrouillon({ a: "ami@exemple.fr", objet: "Re: Question", corps: "Merci", enReponseA: "1" })).toEqual({ id: "d1" });
    for (const a of appels) {
      expect(a.url.startsWith(GMAIL_API)).toBe(true);
      expect(a.url).not.toMatch(/send/);
    }
    expect(appels.filter((a) => a.method === "POST").map((a) => a.url)).toEqual([`${GMAIL_API}/drafts`]);
  });

  it("périmètres demandés à Google : lecture et brouillons", () => {
    expect([...PERIMETRES_GMAIL]).toEqual(["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"]);
  });
});

describe("jetons et résumés hors du dépôt (amendement, § 4)", () => {
  it("refuse un jeton ou un résumé dans le dépôt, y compris par un lien symbolique", () => {
    expect(() => BoiteGmail.jetonDepuisFichier(join(RACINE_DEPOT, "gmail-jeton.json"))).toThrow(/dans le dépôt/);
    const t = mkdtempSync(join(tmpdir(), "mail-"));
    try {
      symlinkSync(RACINE_DEPOT, join(t, "piege"));
      expect(() => horsDepot(join(t, "piege", "jeton.json"))).toThrow(/dans le dépôt/);
      expect(() => ecrireResume({ date: "2026-11-08", exclus: 0, brouillons: 0, groupes: { "pour-toi": [], "reponse-simple": [], information: [], bruit: [] } }, join(t, "piege", "courrier"))).toThrow(/dans le dépôt/);
      const ok = ecrireResume({ date: "2026-11-08", exclus: 0, brouillons: 0, groupes: { "pour-toi": [], "reponse-simple": [], information: [], bruit: [] } }, join(t, "courrier"));
      expect(existsSync(ok)).toBe(true);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
});

describe("classeur local", () => {
  it("n'accepte qu'Ollama en local", () => {
    expect(() => urlLocale("https://api.exemple.com")).toThrow(/locale/);
    expect(() => new ClasseurOllama({ url: "http://10.0.0.2:11434" })).toThrow(/locale/);
  });

  it("en cas de doute, le message remonte à Mickaël", async () => {
    const c = new ClasseurOllama({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ message: { content: "je ne sais pas" } }) }) });
    expect(await c.classer(msg({}))).toBe("pour-toi");
    const c2 = new ClasseurOllama({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ message: { content: "<think>hmm</think>bruit" } }) }) });
    expect(await c2.classer(msg({}))).toBe("bruit");
  });
});

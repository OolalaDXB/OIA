import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { analyserParole, inviteWhisper, verdictApres, verdictAvant } from "../src/passerelle/audio.js";
import { motInterruption } from "../src/passerelle/interruption.js";
import { appelleLeCorpus, consignesDuTour, estSalutation, salutationDeLHeure, Passerelle, type Connaissances, type DepsPasserelle, type SessionLike } from "../src/passerelle/serveur.js";
import type { ServiceMemoire } from "../src/memoire/commandes.js";
import type { EtatSession, TurnResult } from "../src/session.js";

/** Passerelle locale (issue #11) : faux noyau, vrai serveur HTTP sur 127.0.0.1, aucun modèle ni micro. */
const JETON = "a".repeat(64);
const INVITE = inviteWhisper([{ noms: ["SILLON", "Sillon"] }]);

/** WAV PCM 16 bits mono : `parole` ms de son à `amplitude`, le reste en silence. */
function wav(dureeMs: number, paroleMs: number, amplitude = 0.3, bruit = 0): Buffer {
  const f = 16000;
  const n = Math.round((f * dureeMs) / 1000);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(f, 24); b.writeUInt32LE(f * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  const debut = Math.round(((dureeMs - paroleMs) / 2 / 1000) * f);
  for (let i = 0; i < n; i++) {
    const p = i >= debut && i < debut + (paroleMs / 1000) * f ? amplitude * Math.sin((2 * Math.PI * 220 * i) / f) : 0;
    const v = p + (bruit ? bruit * (Math.random() * 2 - 1) : 0);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  return b;
}

function memoireFictive(journal: string[]): ServiceMemoire {
  return {
    traiter: (p: string) => {
      journal.push(p);
      if (/souviens/.test(p)) return { texte: "1. [abcd1234] souvenir fictif", sensible: true };
      if (/décidé pour/.test(p)) return { texte: "Je n'ai aucune décision enregistrée pour « sillon » (projet:sillon).", sensible: true };
      return null;
    },
    contexteModele: () => "",
  } as unknown as ServiceMemoire;
}

interface Banc {
  url: string;
  serveur: Server;
  passerelle: Passerelle;
  appels: { transcrire: number; textes: string[]; prive: string[]; ouvertures: number; langues: string[]; contextes: string[] };
  volume: { monte: boolean };
}
let banc: Banc | null = null;
afterEach(async () => {
  if (banc) {
    banc.passerelle.fermer();
    await new Promise((r) => banc!.serveur.close(r));
  }
  banc = null;
});

async function demarrer(over: Partial<DepsPasserelle> & { repondre?: (t: string) => Promise<TurnResult>; transcription?: string; langue?: string; presenceAuDemarrage?: boolean } = {}): Promise<Banc> {
  const appels = { transcrire: 0, textes: [] as string[], prive: [] as string[], ouvertures: 0, langues: [] as string[], contextes: [] as string[] };
  const volume = { monte: true };
  let etat: ((e: EtatSession) => void) | null = null;
  let print: ((l: string) => void) | null = null;
  let contexte: ((h: string) => string) | null = null;
  let memoire: ServiceMemoire | null = null;
  const deps: DepsPasserelle = {
    jeton: JETON,
    port: 0,
    etatVolume: () => String(volume.monte),
    connaissances: (): Connaissances => {
      appels.ouvertures++;
      return volume.monte
        ? { memoire: memoireFictive(appels.prive), chercher: (t) => (/sillon/i.test(t) ? [{ source: "roadmap", chemin: "docs/roadmap.md", section: "SILLON", ligne: 42, ref: "ligne 42", citation: "docs/roadmap.md:42", titre: "Roadmap", version: "abc123def456", dateSource: "2026-11-01T00:00:00Z", indexeLe: "2026-11-08T00:00:00Z", statut: "valide", compartiment: "projet:sillon", connecteur: "depot-git", niveau: "interne", nature: "document", extrait: "SILLON : décision fictive", mode: "mots", score: 0, identifiant: false, nonFiable: true }] : []), etat: { memoire: "active", corpus: "actif", detail: "monté" }, fermer: () => undefined }
        : { memoire: memoireFictive(appels.prive), chercher: null, etat: { memoire: "indisponible", corpus: "indisponible", detail: "volume démonté" }, fermer: () => undefined };
    },
    creerSession: (h): SessionLike => {
      etat = h.onEtat;
      print = h.print;
      memoire = h.memoire;
      contexte = h.contexteTour;
      return {
        textTurn: async (t) => {
          appels.textes.push(t);
          if (over.repondre) return over.repondre(t);
          // Comme la vraie session : les commandes de mémoire passent avant tout modèle.
          const mem = memoire!.traiter(t);
          if (mem) {
            print!(`Shyrka · ${mem.texte}`);
            etat!("attente");
            return { heard: t, answer: mem.texte, output: "texte", events: [] };
          }
          const ctx = contexte!(t);
          appels.contextes.push(ctx);
          etat!("reflexion");
          const answer = ctx.includes("docs/roadmap.md:42") ? `D'après docs/roadmap.md:42, réponse sur ${t}` : `Réponse à ${t}`;
          print!(`Shyrka · ${answer}`);
          etat!("parole");
          etat!("attente");
          return { heard: t, answer, output: "voix", events: [{ at: "", step: "reflexion", ms: 5 }] };
        },
        interrompre: () => true,
      };
    },
    convertir: async (e, s) => copyFileSync(e, s),
    transcrire: async () => (appels.transcrire++, { texte: over.transcription ?? "Qu'avais-je décidé pour Sillon ?", langue: over.langue ?? "fr" }),
    definirLangue: (code) => appels.langues.push(code),
    invite: INVITE,
    modele: { nom: "ollama:fictif", disponible: async () => true },
    voix: "Aurélie",
    ...over,
  };
  const passerelle = new Passerelle(deps);
  const serveur = passerelle.serveur();
  await new Promise<void>((r) => serveur.listen(0, "127.0.0.1", r));
  const port = (serveur.address() as AddressInfo).port;
  // Le serveur n'accepte que son propre port dans Host : on le recrée avec le port réel.
  serveur.close();
  const p2 = new Passerelle({ ...deps, port });
  const s2 = p2.serveur();
  await new Promise<void>((r) => s2.listen(port, "127.0.0.1", r));
  // Les tests de conversation supposent Mickaël seul ; ceux de la présence gardent le mode du démarrage.
  if (!over.presenceAuDemarrage) p2.changerPresence("seul", "test");
  banc = { url: `http://127.0.0.1:${port}`, serveur: s2, passerelle: p2, appels, volume };
  return banc;
}

const H = { "x-shyrka-jeton": JETON, "content-type": "application/json" };
const post = (b: Banc, chemin: string, corps: unknown, en: Record<string, string> = H) => fetch(`${b.url}${chemin}`, { method: "POST", headers: en, body: typeof corps === "string" || corps instanceof Uint8Array ? (corps as string) : JSON.stringify(corps) });

describe("parole réelle ou silence (avant et après Whisper)", () => {
  const a = (buf: Buffer) => {
    const s = new Float32Array((buf.length - 44) / 2);
    for (let i = 0; i < s.length; i++) s[i] = buf.readInt16LE(44 + i * 2) / 32768;
    return analyserParole(s, 16000);
  };
  it("un silence et un souffle ne passent pas ; une voix passe", () => {
    expect(verdictAvant(a(wav(4000, 0))).verdict).toBe("silence");
    expect(verdictAvant(a(wav(4000, 0, 0, 0.003))).verdict).toBe("silence");
    expect(verdictAvant(a(wav(4000, 1500, 0.2, 0.003))).verdict).toBe("parole");
    expect(a(wav(4000, 1500, 0.2)).paroleMs).toBeGreaterThan(1300);
  });
  it("la reprise de l'invite et les sous-titres appris sur une prise pauvre en parole sont douteux, pas une vraie phrase", () => {
    const pauvre = a(wav(4000, 600, 0.2));
    const riche = a(wav(4000, 2500, 0.2));
    expect(verdictApres("Noms : Mickaël, Shyrka, OIA, Souffleur, SEO Command.", riche, INVITE).verdict).toBe("douteux");
    expect(verdictApres("Sous-titrage Société Radio-Canada", pauvre, INVITE).verdict).toBe("douteux");
    expect(verdictApres("Qu'avais-je décidé pour SILLON ?", pauvre, INVITE).verdict).toBe("parole");
    expect(verdictApres("", riche, INVITE).verdict).toBe("silence");
  });
  it("l'invite de vocabulaire porte les noms des projets (« Sillon » et non « Sion »)", () => {
    expect(INVITE).toContain("SILLON");
  });
});

describe("passerelle locale : défenses", () => {
  it("santé minimale sans jeton, détaillée avec ; tout le reste exige le jeton", async () => {
    const b = await demarrer();
    expect(await (await fetch(`${b.url}/v1/sante`)).json()).toEqual({ ok: true, service: "shyrka-passerelle", version: 1 });
    const d = (await (await fetch(`${b.url}/v1/sante`, { headers: H })).json()) as Record<string, unknown>;
    expect(d).toMatchObject({ memoire: "active", corpus: "actif", transcription: "whisper-local", modele: { local: true, disponible: true } });
    expect((await post(b, "/v1/tour/texte", { texte: "x" }, { "content-type": "application/json" })).status).toBe(401);
    expect((await post(b, "/v1/tour/texte", { texte: "x" }, { ...H, "x-shyrka-jeton": "b".repeat(64) })).status).toBe(401);
    expect((await fetch(`${b.url}/v1/evenements`)).status).toBe(401);
    expect(b.appels.textes).toEqual([]);
  });
  it("refuse une origine étrangère, un hôte étranger (rebinding DNS), un formulaire non JSON, un texte trop long", async () => {
    const b = await demarrer();
    expect((await post(b, "/v1/tour/texte", { texte: "x" }, { ...H, origin: "https://exemple.test" })).status).toBe(403);
    expect((await post(b, "/v1/tour/texte", { texte: "x" }, { ...H, origin: "http://localhost:8080" })).status).toBe(200);
    expect((await post(b, "/v1/tour/texte", "texte=x", { ...H, "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post(b, "/v1/tour/texte", { texte: "x".repeat(2001) })).status).toBe(413);
    expect((await post(b, "/v1/tour/texte", "{pas du json", H)).status).toBe(400);
    const { request } = await import("node:http");
    const statut = await new Promise<number>((ok) => request(`${b.url}/v1/sante`, { headers: { host: "attaquant.test" } }, (r) => ok(r.statusCode!)).end());
    expect(statut).toBe(421);
  });
  it("modèle local absent : refus explicite, aucun repli en ligne", async () => {
    const b = await demarrer({ modele: { nom: "ollama:fictif", disponible: async () => false } });
    const r = await post(b, "/v1/tour/texte", { texte: "bonjour" });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: "modele_indisponible" });
    expect(b.appels.textes).toEqual([]);
  });
  it("un seul tour à la fois, débit limité", async () => {
    let finir!: () => void;
    const b = await demarrer({ repondre: (t) => new Promise((ok) => (finir = () => ok({ heard: t, answer: "fini", output: "texte", events: [] }))) });
    const premier = post(b, "/v1/tour/texte", { texte: "long" });
    await new Promise((r) => setTimeout(r, 30));
    expect((await post(b, "/v1/tour/texte", { texte: "second" })).status).toBe(409);
    finir();
    expect((await premier).status).toBe(200);
    const b2 = await demarrer();
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await post(b2, "/v1/tour/texte", { texte: `t${i}` })).status);
    expect(codes.slice(0, 60).every((c) => c === 200)).toBe(true);
    expect(codes[60]).toBe(429);
  });
});

describe("passerelle locale : tours", () => {
  it("tour texte : réponse sourcée par le corpus, états réels diffusés dans l'ordre", async () => {
    const b = await demarrer();
    const flux = await fetch(`${b.url}/v1/evenements`, { headers: H });
    const lecteur = flux.body!.getReader();
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Où en est SILLON ?" })).json()) as Record<string, unknown>;
    expect(r).toMatchObject({ reponse: expect.stringContaining("docs/roadmap.md:42"), sources: [{ chemin: "docs/roadmap.md", ligne: 42, version: "abc123def456" }], memoire: "active", corpus: "actif" });
    let texte = "";
    while (!texte.includes("event: fin")) texte += new TextDecoder().decode((await lecteur.read()).value);
    await lecteur.cancel();
    const etats = [...texte.matchAll(/event: etat\ndata: \{"etat":"(\w+)"\}/g)].map((m) => m[1]);
    expect(etats).toEqual(["repos", "reflexion", "reflexion", "parle", "repos", "repos"]);
    expect(texte.indexOf("event: reponse")).toBeLessThan(texte.indexOf("event: fin"));
  });
  it("question sur une décision : la mémoire répond, puis le corpus donne ses passages sourcés, présentés comme tels", async () => {
    const b = await demarrer();
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Qu'avais-je décidé pour SILLON ?" }, H)).json()) as Record<string, unknown>;
    // Première ligne, celle qui est dite : la mémoire ET le corpus, avec le nombre de passages et la source principale.
    expect(String(r.reponse).split("\n")[0]).toBe("Aucune décision enregistrée dans ma mémoire pour SILLON. Le corpus en parle : 1 passage, source principale roadmap, section SILLON.");
    expect(r.reponse).toContain("Passages du corpus (à lire ; ce ne sont pas des souvenirs) :\n- docs/roadmap.md:42 § SILLON · version abc123def456 · 2026-11-01");
    expect(r.sources).toEqual([{ chemin: "docs/roadmap.md", ligne: 42, ref: "ligne 42", citation: "docs/roadmap.md:42", titre: "Roadmap", section: "SILLON", version: "abc123def456", date: "2026-11-01" }]);
  });
  it("volume démonté en cours de route : mémoire et corpus déclarés indisponibles, aucune source inventée", async () => {
    const b = await demarrer();
    b.volume.monte = false;
    for (const q of ["Qu'avais-je décidé pour SILLON ?", "Où en est SILLON ?"]) {
      const r = (await (await post(b, "/v1/tour/texte", { texte: q })).json()) as Record<string, unknown>;
      expect(r).toMatchObject({ memoire: "indisponible", corpus: "indisponible", sources: [] });
      expect(r.reponse).not.toContain("roadmap");
      if (q.startsWith("Qu'avais")) expect(r.reponse).toContain("Le corpus est indisponible : je ne peux pas vérifier ce qu'il en dit.");
    }
    expect(b.appels.ouvertures).toBe(3); // banc : 2 ouvertures au démarrage, puis la réouverture
  });
  it("mode privé : la mémoire passe en privé, aucun extrait du corpus n'est donné au modèle", async () => {
    const b = await demarrer();
    expect(await (await post(b, "/v1/prive", { actif: true })).json()).toEqual({ prive: true });
    expect(b.appels.prive).toContain("active le mode privé");
    for (const q of ["Qu'avais-je décidé pour SILLON ?", "Où en est SILLON ?"]) {
      const r = (await (await post(b, "/v1/tour/texte", { texte: q })).json()) as Record<string, unknown>;
      expect(r).toMatchObject({ prive: true, sources: [] });
      expect(r.reponse).not.toContain("Le corpus en parle");
      if (q.startsWith("Qu'avais")) expect(r.reponse).toContain("Mode privé : je n'ai pas consulté le corpus.");
    }
  });
  it("audio : un silence n'atteint pas Whisper ; une prise parlée est transcrite pour relecture, jamais envoyée ; aucune prise conservée", async () => {
    const avant = readdirSync(tmpdir()).filter((f) => f.startsWith("shyrka-passerelle-")).length;
    const b = await demarrer();
    const audio = (buf: Buffer) => post(b, "/v1/tour/audio", new Uint8Array(buf), { "x-shyrka-jeton": JETON, "content-type": "audio/wav" });
    expect(await (await audio(wav(3000, 0))).json()).toMatchObject({ verdict: "silence", transcription: "" });
    expect(b.appels.transcrire).toBe(0);
    expect(await (await audio(wav(3000, 1500, 0.2))).json()).toMatchObject({ verdict: "parole", transcription: "Qu'avais-je décidé pour Sillon ?" });
    expect(b.appels.transcrire).toBe(1);
    expect(b.appels.textes).toEqual([]); // la transcription n'est pas un tour
    expect((await post(b, "/v1/tour/audio", new Uint8Array(wav(1000, 500)), { "x-shyrka-jeton": JETON, "content-type": "video/mp4" })).status).toBe(415);
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith("shyrka-passerelle-")).length).toBe(avant);
  });
  it("audio : les sous-titres appris de Whisper sur une prise presque vide sont signalés douteux", async () => {
    const b = await demarrer({ transcription: "Sous-titrage Société Radio-Canada" });
    const r = await post(b, "/v1/tour/audio", new Uint8Array(wav(3000, 450, 0.2)), { "x-shyrka-jeton": JETON, "content-type": "audio/wav" });
    expect(await r.json()).toMatchObject({ verdict: "douteux", raison: expect.stringContaining("sous-titrage") });
  });
  it("sans Whisper : l'audio est refusé explicitement, le clavier reste disponible", async () => {
    const b = await demarrer({ transcrire: null });
    expect((await post(b, "/v1/tour/audio", new Uint8Array(wav(1000, 500)), { "x-shyrka-jeton": JETON, "content-type": "audio/wav" })).status).toBe(503);
    expect((await post(b, "/v1/tour/texte", { texte: "bonjour" })).status).toBe(200);
    expect(existsSync(tmpdir())).toBe(true);
  });
});

describe("langue du tour (Shyrka ne parlait que français)", () => {
  it("une prise en russe rend sa langue ; le tour suivant donne au modèle la consigne de répondre en russe et choisit la voix russe", async () => {
    const b = await demarrer({ transcription: "Что я решил по проекту Силлон?", langue: "ru" });
    const prise = (await (await post(b, "/v1/tour/audio", new Uint8Array(wav(3000, 1500, 0.2)), { "x-shyrka-jeton": JETON, "content-type": "audio/wav" })).json()) as Record<string, unknown>;
    expect(prise).toMatchObject({ verdict: "parole", langue: "ru" });
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Где сейчас проект?", langue: "ru" })).json()) as Record<string, unknown>;
    expect(r.langue).toBe("ru");
    expect(b.appels.langues.at(-1)).toBe("ru");
    expect(b.appels.contextes.at(-1)).toMatch(/Langue de ce tour : Mickaël te parle en russe\. Pour ce tour, réponds en russe/);
  });
  it("l'alphabet d'un texte tapé décide ; un texte latin sans langue indiquée reste en français, sans consigne", async () => {
    const b = await demarrer();
    expect(((await (await post(b, "/v1/tour/texte", { texte: "Привет, Ширка" })).json()) as Record<string, unknown>).langue).toBe("ru");
    expect(((await (await post(b, "/v1/tour/texte", { texte: "Où en est le projet ?" })).json()) as Record<string, unknown>).langue).toBe("fr");
    expect(b.appels.contextes.at(-1)).not.toMatch(/Langue de ce tour/);
    expect((await post(b, "/v1/tour/texte", { texte: "x", langue: "russe; drop" })).status).toBe(400);
  });
});

describe("salutation", () => {
  it("une salutation seule n'appelle ni corpus ni briefing ; une vraie demande, si", async () => {
    expect(["Bonsoir, Shyrka.", "Salut", "Bonjour Shyrka, ça va ?"].map(estSalutation)).toEqual([true, true, true]);
    expect(["Bonjour, où en est SILLON ?", "Bonsoir, dis-moi le budget", "Où en est J0 ?"].map(estSalutation)).toEqual([false, false, false]);
    const b = await demarrer();
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Bonsoir, Shyrka." })).json()) as Record<string, unknown>;
    expect(r.sources).toEqual([]);
    expect(b.appels.contextes.at(-1)).toMatch(/Mickaël te salue seulement : réponds par « (Bonjour|Bonsoir) »/);
  });
});

describe("interruption par mot d'arrêt seulement", () => {
  it("reconnaît Stop, Attends, Excuse-moi et leurs équivalents ; pas une phrase qui contient le mot, pas un mot courant", () => {
    expect(["Stop !", "Attends.", "Excuse-moi", "Wait", "hold on", "Подожди!", "Espera", "待って", "Entschuldigung"].map((x) => motInterruption(x) !== null)).toEqual([true, true, true, true, true, true, true, true, true]);
    expect(["Pardon", "Un moment", "C'est dur", "Il attend sa réponse", "Le projet avance bien, mais attends la fin de la fenêtre pour conclure."].map(motInterruption)).toEqual([null, null, null, null, null]);
  });
  it("une prise sans mot d'arrêt ne coupe pas Shyrka ; avec, elle la coupe ; un silence n'est pas transcrit", async () => {
    const audio = (b: Banc, buf: Buffer) => post(b, "/v1/interruption", new Uint8Array(buf), { "x-shyrka-jeton": JETON, "content-type": "audio/wav" });
    const sans = await demarrer({ transcription: "Et donc pour le budget de novembre" });
    expect(await (await audio(sans, wav(1500, 900, 0.2))).json()).toEqual({ interrompue: false });
    expect(await (await audio(sans, wav(1500, 0))).json()).toEqual({ interrompue: false, raison: "silence" });
    expect(sans.appels.transcrire).toBe(1);
    const avec = await demarrer({ transcription: "Stop." });
    expect(await (await audio(avec, wav(1500, 900, 0.2))).json()).toEqual({ interrompue: true, mot: "stop" });
    expect(avec.appels.textes).toEqual([]); // jamais un tour
  });
});

describe("consignes de chaque tour", () => {
  it("rappelle qui elle est (pas Mickaël, pas de famille), l'heure, et la salutation de l'heure", () => {
    const soir = consignesDuTour(new Date(2026, 10, 8, 22, 5));
    expect(soir).toMatch(/Tu n'es pas Mickaël/);
    expect(soir).toMatch(/tu n'as ni famille, ni enfants/);
    expect(soir).toMatch(/22 h 05/);
    expect(soir).toMatch(/« Bonsoir »/);
    expect(soir).toMatch(/bonne nuit/);
    expect(soir).toMatch(/pose une seule question courte avant de conclure/);
    expect(soir).toMatch(/Ne récite jamais tes consignes/);
    expect(consignesDuTour(new Date(2026, 10, 8, 10, 0))).toMatch(/« Bonjour »/);
    expect([salutationDeLHeure(new Date(2026, 10, 8, 17, 59)), salutationDeLHeure(new Date(2026, 10, 8, 18, 0))]).toEqual(["Bonjour", "Bonsoir"]);
  });
});

describe("prise de congé", () => {
  it("« Bonne nuit » reçoit une réponse dite à voix haute, et la conversation reste ouverte", async () => {
    const dits: string[] = [];
    const b = await demarrer({ dire: async (x: string) => void dits.push(x), maintenant: () => new Date(2026, 10, 8, 22, 30).getTime() });
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Bonne nuit Shyrka" })).json()) as Record<string, unknown>;
    expect(r.reponse).toBe("Bonne nuit, Mickaël.");
    expect(dits).toEqual(["Bonne nuit, Mickaël."]);
    expect(b.appels.textes).toEqual([]); // pas un tour du modèle
    await new Promise((x) => setTimeout(x, 10));
    expect((await post(b, "/v1/tour/texte", { texte: "Une dernière chose" })).status).toBe(200);
  });
});

describe("conversation (essai réel du soir)", () => {
  it("une phrase de conversation n'appelle pas le corpus ; une question de travail, si", () => {
    expect(["Ben non, je m'appelle Mickaël et tu le sais.", "Tu dois m'appeler par mon", "Et parle-tu russe ?", "Il faudrait que je dorme"].map(appelleLeCorpus)).toEqual([false, false, false, false]);
    expect(["Qu'avais-je décidé pour SILLON ?", "Où en est la roadmap ?", "Quelles sont les permissions de Shyrka dans son cadre ?"].map(appelleLeCorpus)).toEqual([true, true, true]);
  });
  it("les consignes demandent la suite d'une phrase coupée, interdisent de se répéter, de ressortir les décisions sans raison, de changer de langue", () => {
    const c = consignesDuTour(new Date(2026, 10, 8, 20, 0));
    expect(c).toMatch(/Ne parle des décisions ouvertes, du budget, de J0 ou d'un projet que s'il en parle/);
    expect(c).toMatch(/Si sa phrase semble coupée ou incomplète, ne la répète pas/);
    expect(c).toMatch(/Ne redis jamais mot pour mot ta réponse précédente/);
    expect(c).toMatch(/n'invente jamais un programme, un rendez-vous, une règle ou une habitude/);
    expect(c).toMatch(/n'annonce jamais que tu préviens, bloques ou programmes quelque chose/);
    expect(c).toMatch(/une seule langue, celle de Mickaël, du premier au dernier mot/);
    expect(c).toMatch(/réponds « Tu t'appelles Mickaël » \(tu peux ajouter « je t'appellerai désormais ainsi »\), jamais « je t'appelle Mickaël »/);
  });
});

describe("commande de voix dans la passerelle", () => {
  it("« parle plus fort » est traité par le code, dit à voix haute, sans tour du modèle", async () => {
    const dits: string[] = [];
    const reglagesVoix = {};
    const b = await demarrer({ dire: async (x: string) => void dits.push(x), reglagesVoix });
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Peux-tu parler plus fort, s'il te plaît ?" })).json()) as Record<string, unknown>;
    expect(r.reponse).toBe("D'accord, je parle plus fort.");
    expect(dits).toEqual(["D'accord, je parle plus fort."]);
    expect(reglagesVoix).toEqual({ volume: 1.5 });
    expect(b.appels.textes).toEqual([]);
  });
});

describe("passerelle locale : routes du Corpus (défenses)", () => {
  const ouvrirCorpus = async () => {
    const { mkdtempSync, mkdirSync, realpathSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { CataloguePrive } = await import("../src/corpus/catalogue-prive.js");
    const { DepotCorpus } = await import("../src/corpus/depot.js");
    const { Surveillance } = await import("../src/corpus/surveillance.js");
    const { Corpus, composer } = await import("../src/executive/corpus.js");
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-corpus-http-")));
    const v = (s: string) => ({ chemin: join(dir, s), volume: { point: dir, monte: true, chiffre: true, image: "t", inscriptible: true, detail: "t" } });
    for (const s of ["brut/depots", "journal"]) mkdirSync(join(dir, s), { recursive: true });
    return (h: { prive: () => boolean }): Connaissances => {
      const cat = new CataloguePrive(v("connaissances"));
      const corpus = new Corpus(v("connaissances"), () => composer([], cat.sourcesCorpus()), () => null);
      const surveillance = new Surveillance(() => dir);
      const depot = new DepotCorpus({ corpus, catalogue: cat, memoire: null, brut: join(dir, "brut/depots"), journal: join(dir, "journal"), vectoriser: async () => [], generer: null, surveillance, prive: h.prive });
      return {
        memoire: memoireFictive([]), chercher: null, etat: { memoire: "active", corpus: "actif", detail: "t" },
        corpus: { depot, surveillance, vecteur: async () => null, etat: () => ({ volume: "chiffre", sourcesPrivees: cat.lister().length }) },
        fermer: () => (surveillance.arreter(), corpus.fermer(), cat.fermer()),
      };
    };
  };
  const OCTETS = { "x-shyrka-jeton": JETON, "content-type": "application/octet-stream", "x-corpus-nom": "note.md" };

  it("jeton, hôte et origine exigés ; aucun en-tête CORS ; corps typés ; 25 Mo au plus ; identifiants opaques seulement", async () => {
    const b = await demarrer({ connaissances: await ouvrirCorpus() });
    const md = new TextEncoder().encode("# Note fictive\n\nTexte fictif.\n");
    expect((await fetch(`${b.url}/v1/corpus/etat`)).status).toBe(401);
    expect((await post(b, "/v1/corpus/preparer", md, { "content-type": "application/octet-stream", "x-corpus-nom": "note.md" })).status).toBe(401);
    expect((await fetch(`${b.url}/v1/corpus/etat`, { headers: { ...H, origin: "https://exemple.test" } })).status).toBe(403);
    const r = await fetch(`${b.url}/v1/corpus/etat`, { headers: H });
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect((await post(b, "/v1/corpus/preparer", md, { ...OCTETS, "content-type": "text/plain" })).status).toBe(415);
    expect((await post(b, "/v1/corpus/confirmer", "jeton=x", { ...H, "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post(b, "/v1/corpus/preparer", new Uint8Array(25 * 1024 * 1024 + 1), OCTETS)).status).toBe(413);
    expect((await post(b, "/v1/corpus/sources/..%2F..%2Fetc/retirer", { confirmer: true })).status).toBe(404);
    expect((await post(b, "/v1/corpus/surveillance/f-..%2Fx/examiner", {})).status).toBe(404);
    const a = (await (await post(b, "/v1/corpus/preparer", md, OCTETS)).json()) as { jeton: string; etat: string };
    expect(a.etat).toBe("pret");
    expect((await post(b, "/v1/corpus/confirmer", { jeton: a.jeton, compartiment: "personnel" })).status).toBe(400); // droits à choisir explicitement
    expect((await post(b, "/v1/corpus/sources/prive-000000000000/retirer", {})).status).toBe(400); // confirmation explicite
  });

  it("mode privé : préparer et activer le dossier surveillé refusés (423)", async () => {
    const b = await demarrer({ connaissances: await ouvrirCorpus() });
    await post(b, "/v1/prive", { actif: true });
    expect((await post(b, "/v1/corpus/preparer", new TextEncoder().encode("# x\n\ny"), OCTETS)).status).toBe(423);
    expect((await post(b, "/v1/corpus/note", { titre: "t", texte: "x" })).status).toBe(423);
    expect((await post(b, "/v1/corpus/surveillance", { action: "activer" })).status).toBe(423);
  });

  it("hors du mode « seul » : noms du dossier de dépôt masqués, examen refusé", async () => {
    const b = await demarrer({ connaissances: await ouvrirCorpus() });
    await post(b, "/v1/presence", { mode: "entre_proches" });
    const r = (await (await fetch(`${b.url}/v1/corpus/surveillance`, { headers: H })).json()) as { aExaminer: unknown[]; masques?: boolean };
    expect(r).toMatchObject({ aExaminer: [], masques: true });
    expect((await post(b, "/v1/corpus/surveillance/f-0123456789abcdef/examiner", {})).status).toBe(423);
  });

  it("volume absent : le Corpus le dit (503), rien n'est écrit ailleurs", async () => {
    const b = await demarrer();
    b.volume.monte = false;
    const r = await fetch(`${b.url}/v1/corpus/etat`, { headers: H });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { message: string }).message).toMatch(/volume démonté/);
  });
});

describe("passerelle locale : mode de présence", () => {
  it("phrases reconnues (et pas une phrase qui contient le mot)", async () => {
    const { commandePresence } = await import("../src/passerelle/presence.js");
    expect(commandePresence("Je suis seul.")).toBe("seul");
    expect(commandePresence("Shyrka, je suis seule")).toBe("seul");
    expect(commandePresence("On est entre nous")).toBe("entre_proches");
    expect(commandePresence("Je suis avec quelqu'un")).toBe("externe");
    expect(commandePresence("Je suis seul responsable du projet")).toBeNull();
  });

  it("« entre proches » au démarrage ; à la voix ou d'un clic ; retour après 30 minutes sans action ; les sondages ne comptent pas", async () => {
    let t = 1_000_000;
    const b = await demarrer({ maintenant: () => t, inactiviteMs: 30 * 60_000, presenceAuDemarrage: true });
    const mode = async () => ((await (await fetch(`${b.url}/v1/presence`, { headers: H })).json()) as { mode: string }).mode;
    expect(await mode()).toBe("entre_proches");
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Je suis seul" })).json()) as { reponse: string };
    expect(r.reponse).toMatch(/tu es seul/);
    expect(b.appels.textes).toEqual([]); // aucun tour du modèle
    expect(await mode()).toBe("seul");
    t += 29 * 60_000;
    expect(await mode()).toBe("seul"); // sonder n'est pas une action
    t += 2 * 60_000;
    expect(await mode()).toBe("entre_proches");
    expect((await post(b, "/v1/presence", { mode: "externe" })).status).toBe(200);
    expect(await mode()).toBe("externe");
    expect((await post(b, "/v1/presence", { mode: "tous" })).status).toBe(400);
  });

  it("mode protégé : une question qui ne trouve rien de visible reçoit toujours la même réponse, sans modèle", async () => {
    const extrait = { source: "s", chemin: "prive/s", section: "S", ligne: 1, ref: "ligne 1", citation: "dossier · ligne 1", titre: "dossier", version: "v", dateSource: "2026-11-08T00:00:00Z", indexeLe: "2026-11-08T00:00:00Z", statut: "valide" as const, compartiment: "personnel", connecteur: "fichier-local" as const, niveau: "confidentiel" as const, nature: "document" as const, extrait: "budget fictif du dossier Orion", mode: "sens" as const, score: 0.7, identifiant: false, nonFiable: true as const };
    const b = await demarrer({
      presenceAuDemarrage: true,
      connaissances: (h) => ({
        memoire: memoireFictive([]), etat: { memoire: "active", corpus: "actif", detail: "t" }, fermer: () => undefined,
        chercher: (t) => (/orion/i.test(t) && h.niveaux().includes("confidentiel") ? [extrait] : []),
      }),
    });
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Quel est le budget du dossier Orion pour le projet ?" })).json()) as { reponse: string; sources: unknown[] };
    expect(r).toMatchObject({ reponse: "Je t'en parlerai quand tu seras seul.", sources: [] });
    expect(b.appels.textes).toEqual([]);
    // Même formulation quand rien n'existe : la réponse ne trahit pas qu'une information est masquée.
    const rien = (await (await post(b, "/v1/tour/texte", { texte: "Quel est le budget du dossier Andromède pour le projet ?" })).json()) as { reponse: string };
    expect(rien.reponse).toBe(r.reponse);
    await post(b, "/v1/presence", { mode: "seul" });
    const r2 = (await (await post(b, "/v1/tour/texte", { texte: "Quel est le budget du dossier Orion pour le projet ?" })).json()) as { sources: unknown[] };
    expect(r2.sources).toHaveLength(1);
  });
});

describe("essai réel du 9 novembre : langue, voix et réponse protégée", () => {
  it("une demande à Shyrka (voix, langue) n'est jamais une question protégée ; une question sur Mickaël l'est", async () => {
    const { questionDeConnaissance } = await import("../src/passerelle/serveur.js");
    expect(questionDeConnaissance("Tu peux utiliser ta voix anglaise, tu n'es pas obligé de parler avec un accent français.")).toBe(false);
    expect(questionDeConnaissance("Peux-tu me parler en anglais ?")).toBe(false);
    expect(questionDeConnaissance("Unheit.")).toBe(false);
    expect(questionDeConnaissance("Que représente Vannes pour moi, la ville de Vannes ?")).toBe(true);
    expect(questionDeConnaissance("Ok, j'ai des comptes bancaires dans quelle banque ?")).toBe(true);
    expect(questionDeConnaissance("Quel est mon projet le plus intéressant dans tous les projets que tu as dans le repos GitHub ?")).toBe(true);
  });

  it("langue demandée et langue de la réponse", async () => {
    const { langueDemandee, langueLatine } = await import("../src/passerelle/langues.js");
    expect(langueDemandee("Peux-tu me parler en anglais ?")).toBe("en");
    expect(langueDemandee("Tu peux utiliser ta voix anglaise, tu n'es pas obligé de parler avec un accent français.")).toBe("en");
    expect(langueDemandee("Parle en français maintenant")).toBe("fr");
    expect(langueDemandee("Quel temps fait-il en Angleterre ?")).toBeNull();
    expect(langueLatine("Of course, Mickaël. I'll switch to English for you.")).toBe("en");
    expect(langueLatine("Bonsoir, Mickaël. Je t'écoute, dis-moi ce que tu veux faire.")).toBe("fr");
  });

  it("« parle-moi en anglais » vaut pour les tours suivants ; la voix suit la langue de la réponse", async () => {
    const b = await demarrer({ repondre: async (t) => ({ heard: t, answer: "", output: "texte", events: [] }) });
    await post(b, "/v1/tour/texte", { texte: "Peux-tu me parler en anglais ?" });
    await post(b, "/v1/tour/texte", { texte: "Et ensuite, qu'est-ce qu'on fait ?" });
    expect(b.appels.langues.slice(-1)).toEqual(["en"]); // préférence gardée, malgré une phrase en français
    await post(b, "/v1/tour/texte", { texte: "Parle en français maintenant" });
    expect(b.appels.langues.slice(-1)).toEqual(["fr"]);
  });
});

describe("passerelle locale : essais de voix", () => {
  it("liste les moteurs ; joue un échantillon sur un clic ; « interrompre » le coupe ; ElevenLabs refusé sans confirmation ni clé", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { EventEmitter } = await import("node:events");
    const { LecteurEchantillons } = await import("../src/passerelle/moteurs-voix.js");
    const d = mkdtempSync(join(tmpdir(), "shyrka-voix-http-"));
    writeFileSync(join(d, "shyrka-en-v1-elevenlabs.mp3"), "x");
    const tues: string[] = [];
    const lecteur = new LecteurEchantillons(d, () => Object.assign(new EventEmitter(), { kill: (s: string) => (tues.push(s), true) }) as never);
    const b = await demarrer({ echantillons: lecteur, moteurReponses: "macOS (local)", cleElevenLabs: () => null });
    const v = (await (await fetch(`${b.url}/v1/voix`, { headers: H })).json()) as { reponses: string; elevenlabs: string; echantillons: { id: string }[] };
    expect(v).toMatchObject({ reponses: "macOS (local)", echantillons: [{ id: "elevenlabs" }] });
    expect((await post(b, "/v1/voix/echantillon", { id: "elevenlabs" })).status).toBe(200);
    expect(lecteur.joue?.id).toBe("elevenlabs");
    await post(b, "/v1/interrompre", {});
    expect(tues).toEqual(["SIGTERM"]);
    expect((await post(b, "/v1/voix/echantillon", { id: "inconnu" })).status).toBe(404);
    expect((await post(b, "/v1/voix/elevenlabs-demonstration", {})).status).toBe(400);
    expect((await post(b, "/v1/voix/elevenlabs-demonstration", { confirmer: true })).status).toBe(503); // sans clé : rien n'est envoyé
    expect(v.elevenlabs).toBe("désactivé (aucune clé)");
  });
});

describe("essai réel du 9 novembre (2) : français dit avec l'accent anglais", () => {
  it("le texte décide de la langue, même court ; Whisper ne décide qu'en dernier recours", async () => {
    const { langueProbable } = await import("../src/passerelle/langues.js");
    for (const t of ["Je suis seul.", "C'est quoi ?", "Très bien, merci.", "Où en est le projet ?", "Bonsoir, Mickaël.", "Je t'écoute."]) expect(langueProbable(t), t).toBe("fr");
    for (const t of ["What's my schedule today?", "Of course, I'll switch to English.", "I'm here, what do you need?"]) expect(langueProbable(t), t).toBe("en");
    expect(langueProbable("Привет, как дела?")).toBe("ru");
    expect(langueProbable("OK.")).toBeNull();
  });

  it("une phrase française que Whisper croit anglaise : tour en français, voix française, aucune consigne anglaise", async () => {
    const b = await demarrer({ transcription: "Où en est le projet Sillon ?", langue: "en" });
    const r = (await (await post(b, "/v1/tour/texte", { texte: "Où en est le projet Sillon ?", langue: "en" })).json()) as { langue: string };
    expect(r.langue).toBe("fr");
    expect(b.appels.langues.at(-1)).toBe("fr");
    expect(b.appels.contextes.at(-1) ?? "").not.toMatch(/Langue de ce tour/);
  });
});

import { describe, it, expect } from "vitest";
import { EnregistreurFfmpeg } from "../src/adapters/enregistreur.js";
import { WhisperServer, WHISPER_PORT } from "../src/adapters/whisper-server.js";
import { WhatsAppFictif } from "../src/whatsapp.js";

function fauxProcessus() {
  const ecrit: string[] = [];
  let tue = false;
  let surFin: ((c: number) => void) | null = null;
  const proc = {
    stdin: {
      write: (s: string) => {
        ecrit.push(s);
        surFin?.(255);
      },
      end: () => {},
    },
    once: (_e: string, cb: (c: number) => void) => {
      surFin = cb;
      return proc;
    },
    kill: () => {
      tue = true;
      return true;
    },
  };
  return { proc, ecrit, estTue: () => tue };
}

describe("serveur Whisper local (port 8178), lancé puis arrêté", () => {
  it("démarre sur 127.0.0.1:8178, transcrit, s'arrête", async () => {
    const lances: string[][] = [];
    const appels: string[] = [];
    const p = fauxProcessus();
    const w = new WhisperServer({
      model: "/m/ggml.bin",
      spawn: (c, a) => {
        lances.push([c, ...a]);
        return p.proc as never;
      },
      fetch: async (url) => {
        appels.push(url);
        return { ok: true, status: 200, text: async () => " Bonjour Shyrka.\n" };
      },
      readFile: () => new Uint8Array([1, 2, 3]),
      pause: async () => {},
    });
    await expect(w.transcribe({ path: "/a.wav", durationMs: 1 }, { language: "fr" })).rejects.toThrow(/arrêté/);
    await w.demarrer();
    expect(WHISPER_PORT).toBe(8178);
    expect(lances[0]).toEqual(["whisper-server", "-m", "/m/ggml.bin", "--host", "127.0.0.1", "--port", "8178"]);
    expect(await w.transcribe({ path: "/a.wav", durationMs: 1 }, { language: "fr" })).toEqual({ text: "Bonjour Shyrka.", language: "fr" });
    expect(appels.at(-1)).toBe("http://127.0.0.1:8178/inference");
    w.arreter();
    expect(p.estTue()).toBe(true);
    expect(w.enMarche).toBe(false);
  });

  it("serveur qui ne répond pas : arrêt et erreur claire", async () => {
    const p = fauxProcessus();
    const w = new WhisperServer({ model: "m", spawn: () => p.proc as never, fetch: async () => { throw new Error("refusé"); }, pause: async () => {}, attendreMs: 500 });
    await expect(w.demarrer()).rejects.toThrow(/injoignable/);
    expect(p.estTue()).toBe(true);
  });
});

describe("pousser pour parler (ffmpeg)", () => {
  it("démarre une prise bornée, l'arrête sur demande en envoyant « q »", async () => {
    const p = fauxProcessus();
    const lances: string[][] = [];
    let t = 0;
    const e = new EnregistreurFfmpeg({ device: ":0", plafondSecondes: 30, spawn: (c, a) => { lances.push([c, ...a]); return p.proc as never; }, now: () => (t += 2000) });
    const prise = e.demarrer("/tmp/x.wav");
    const clip = await prise.arreter();
    expect(lances[0]).toContain("-t");
    expect(lances[0]![lances[0]!.indexOf("-t") + 1]).toBe("30");
    expect(p.ecrit).toEqual(["q"]);
    expect(clip).toEqual({ path: "/tmp/x.wav", durationMs: 2000 });
  });
});

describe("WhatsApp (mandat v6, B4) : interface et version fictive seulement", () => {
  it("liste les messages d'un numéro professionnel et propose une réponse sans l'envoyer", async () => {
    const w = new WhatsAppFictif("+33 1 00 00 00 00", [{ id: "1", numeroPro: "+33 1 00 00 00 00", de: "+33 6 00 00 00 01", texte: "Bonjour", recuLe: "2026-11-08" }]);
    expect(await w.lister(10)).toHaveLength(1);
    expect(await w.proposerReponse("1", "Bonjour, je reviens vers vous.")).toEqual({ proposition: "Bonjour, je reviens vers vous." });
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(w))).not.toContain("envoyer");
  });
});

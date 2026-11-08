import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleElevenLabs, genererDemonstrationElevenLabs, LecteurEchantillons, lireCle, PHRASE_DEMONSTRATION, VOIX_ELEVENLABS } from "../src/passerelle/moteurs-voix.js";

/** Moteurs de voix (mandat Shyrka English Voice V1) : échantillons locaux, arrêt immédiat, ElevenLabs jamais sans clé ni avec un autre texte. */

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "shyrka-voix-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fauxLecteur() {
  const lancés: { fichier: string; volume: number; p: EventEmitter & { kill: (s: string) => boolean } }[] = [];
  const lecteur = (fichier: string, volume: number) => {
    const p = Object.assign(new EventEmitter(), { kill: (s: string) => (p.emit("exit", null, s), true) });
    lancés.push({ fichier, volume, p });
    return p as unknown as ChildProcess;
  };
  return { lancés, lecteur };
}

describe("échantillons de voix", () => {
  it("ne propose que les fichiers présents ; joue sur un appel, s'arrête tout de suite", async () => {
    writeFileSync(join(dir, "shyrka-en-v1-elevenlabs.mp3"), "x");
    const f = fauxLecteur();
    const l = new LecteurEchantillons(dir, f.lecteur);
    expect(l.disponibles().map((e) => [e.id, e.moteurLibelle])).toEqual([["elevenlabs", "Original ElevenLabs"]]);
    expect(() => l.jouer("chatterbox")).toThrow(/absent/);
    const { fin } = l.jouer("elevenlabs", 0.8);
    expect(f.lancés[0]).toMatchObject({ fichier: join(dir, "shyrka-en-v1-elevenlabs.mp3"), volume: 0.8 });
    expect(l.joue?.id).toBe("elevenlabs");
    expect(l.arreter()).toBe(true);
    expect(await fin).toBe("interrompu");
    expect(l.joue).toBeNull();
    expect(l.arreter()).toBe(false);
  });
});

describe("API ElevenLabs", () => {
  it("désactivée sans clé ; fichier de clé lisible par d'autres refusé", () => {
    expect(cleElevenLabs({}, () => null)).toBeNull();
    expect(cleElevenLabs({ ELEVENLABS_API_KEY: " k " }, () => null)).toBe("k");
    const f = join(dir, "cle");
    writeFileSync(f, "secret\n");
    chmodSync(f, 0o644);
    expect(lireCle(f)).toBeNull();
    chmodSync(f, 0o600);
    expect(lireCle(f)).toBe("secret");
  });

  it("n'envoie que la phrase de démonstration, à la voix Shyrka EN V1", async () => {
    const appels: { url: string; corps: { text: string; model_id: string } }[] = [];
    const faux = (async (url: string, init: RequestInit) => {
      appels.push({ url, corps: JSON.parse(String(init.body)) });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await genererDemonstrationElevenLabs("cle", join(dir, "demo.mp3"), faux);
    expect(r.octets).toBe(3);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toContain(`/v1/text-to-speech/${VOIX_ELEVENLABS}`);
    expect(appels[0]!.corps.text).toBe(PHRASE_DEMONSTRATION);
  });
});

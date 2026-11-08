import { describe, it, expect } from "vitest";
import { FfmpegMicrophone, MAX_RECORD_SECONDS } from "../src/adapters/microphone-ffmpeg.js";
import { WhisperCppTranscriber, cleanWhisperOutput } from "../src/adapters/whisper-cpp.js";
import { COMPARISON_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL, OllamaTextModel, assertLoopback, stripThinking } from "../src/adapters/ollama.js";
import { MacSaySpeaker, choisirVoix, voixInstallees } from "../src/adapters/macos-say.js";
import { fakeRunner } from "./fakes.js";

describe("micro (ffmpeg avfoundation)", () => {
  it("enregistre une prise WAV 16 kHz mono, durée bornée", async () => {
    const { run, calls } = fakeRunner();
    const mic = new FfmpegMicrophone(run, { device: ":0", dir: "/tmp/s", now: () => 42 });
    const clip = await mic.record({ maxSeconds: 8 });
    expect(clip).toEqual({ path: "/tmp/s/prise-42.wav", durationMs: 8000 });
    expect(calls[0]?.cmd).toBe("ffmpeg");
    expect(calls[0]?.args).toEqual(["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", ":0", "-t", "8", "-ac", "1", "-ar", "16000", "-y", "/tmp/s/prise-42.wav"]);
  });

  it("plafonne la durée : jamais d'écoute longue", async () => {
    const { run, calls } = fakeRunner();
    await new FfmpegMicrophone(run, { device: ":0", dir: "/t" }).record({ maxSeconds: 3600 });
    expect(calls[0]?.args[calls[0].args.indexOf("-t") + 1]).toBe(String(MAX_RECORD_SECONDS));
  });

  it("signale un échec (accès micro refusé par macOS, par exemple)", async () => {
    const { run } = fakeRunner(() => ({ code: 1, stderr: "Input/output error" }));
    await expect(new FfmpegMicrophone(run, { device: ":0", dir: "/t" }).record({ maxSeconds: 5 })).rejects.toThrow(/ffmpeg a échoué.*Input\/output/);
  });
});

describe("transcription (whisper.cpp)", () => {
  it("appelle whisper-cli en local, langue imposée, sans horodatage", async () => {
    const { run, calls } = fakeRunner(() => ({ stdout: " Bonjour Shyrka.\n" }));
    const t = new WhisperCppTranscriber(run, { model: "/m/ggml.bin" });
    const out = await t.transcribe({ path: "/t/a.wav", durationMs: 1 }, { language: "fr" });
    expect(out).toEqual({ text: "Bonjour Shyrka.", language: "fr" });
    expect(calls[0]).toEqual({ cmd: "whisper-cli", args: ["-m", "/m/ggml.bin", "-f", "/t/a.wav", "-l", "fr", "-nt", "-np"] });
  });

  it("nettoie horodatages et marqueurs de silence", () => {
    expect(cleanWhisperOutput("[00:00:00.000 --> 00:00:02.000]  Bonjour\n[BLANK_AUDIO]\n\n  ça va ?")).toBe("Bonjour ça va ?");
    expect(cleanWhisperOutput("[BLANK_AUDIO]\n")).toBe("");
  });

  it("remonte une erreur lisible", async () => {
    const { run } = fakeRunner(() => ({ code: 2, stderr: "failed to open model" }));
    await expect(new WhisperCppTranscriber(run, { model: "x" }).transcribe({ path: "a", durationMs: 1 }, { language: "fr" })).rejects.toThrow(/Whisper.*failed to open model/);
  });
});

describe("modèle texte (Ollama local)", () => {
  it("n'accepte qu'une adresse locale", () => {
    expect(assertLoopback("http://127.0.0.1:11434").hostname).toBe("127.0.0.1");
    expect(assertLoopback("http://localhost:11434").hostname).toBe("localhost");
    expect(assertLoopback("http://[::1]:11434").hostname).toBe("[::1]");
    for (const bad of ["http://192.168.1.10:11434", "https://api.ollama.com", "http://127.0.0.1.nip.io:11434", "http://ollama.example.com", "file:///etc/passwd", "pas une url"]) {
      expect(() => assertLoopback(bad)).toThrow();
    }
    expect(() => new OllamaTextModel({ model: "m", url: "http://10.0.0.2:11434" })).toThrow(/locale/);
  });

  it("exige un nom de modèle explicite", () => {
    expect(() => new OllamaTextModel({ model: "" })).toThrow(/modèle requis/);
  });

  it("envoie /api/chat sans streaming et lit message.content", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const m = new OllamaTextModel({
      model: "qwen3:8b",
      fetch: async (url, init) => {
        seen.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ message: { role: "assistant", content: "Oui." } }), text: async () => "" };
      },
    });
    expect(m.name).toBe("ollama:qwen3:8b");
    await expect(m.chat([{ role: "user", content: "Tu m'entends ?" }])).resolves.toBe("Oui.");
    expect(seen[0]?.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(seen[0]?.body).toMatchObject({ model: "qwen3:8b", stream: false, think: false, messages: [{ role: "user", content: "Tu m'entends ?" }] });
  });

  it("signale un HTTP en erreur ou une réponse sans contenu", async () => {
    const http404 = new OllamaTextModel({ model: "m", fetch: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "model not found" }) });
    await expect(http404.chat([])).rejects.toThrow(/HTTP 404.*model not found/);
    const empty = new OllamaTextModel({ model: "m", fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }) });
    await expect(empty.chat([])).rejects.toThrow(/message.content/);
  });
});

describe("voix macOS (say)", () => {
  it("passe le texte par fichier : un texte qui commence par un tiret n'est pas une option", async () => {
    const { run, calls } = fakeRunner();
    const files = new Map<string, string>();
    const removed: string[] = [];
    const s = new MacSaySpeaker(run, { voice: "Aurélie", dir: "/t", now: () => 7, writeFile: (p, t) => files.set(p, t), removeFile: (p) => removed.push(p) });
    await s.speak("-o /etc/x ; rm -rf ~");
    expect(calls[0]).toEqual({ cmd: "say", args: ["-v", "Aurélie", "-f", "/t/replique-7.txt"] });
    expect(files.get("/t/replique-7.txt")).toBe("-o /etc/x ; rm -rf ~");
    expect(removed).toEqual(["/t/replique-7.txt"]);
  });

  it("supprime le fichier même en cas d'échec", async () => {
    const { run } = fakeRunner(() => ({ code: 1, stderr: "voice not found" }));
    const removed: string[] = [];
    const s = new MacSaySpeaker(run, { voice: "Aurélie", dir: "/t", writeFile: () => {}, removeFile: (p) => removed.push(p) });
    await expect(s.speak("Bonjour")).rejects.toThrow(/voice not found/);
    expect(removed).toHaveLength(1);
  });
});

describe("modèle texte : Ollama éteint", () => {
  it("dit comment le lancer", async () => {
    const m = new OllamaTextModel({
      model: "m",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(m.chat([])).rejects.toThrow(/injoignable sur http:\/\/127\.0\.0\.1:11434.*ollama serve/);
  });
});

describe("modèles Ollama par défaut", () => {
  it("qwen3:8b par défaut, mistral-small en comparaison", () => {
    expect(DEFAULT_OLLAMA_MODEL).toBe("qwen3:8b");
    expect(COMPARISON_OLLAMA_MODEL).toBe("mistral-small");
  });

  it("retire un raisonnement <think> resté dans la réponse", async () => {
    expect(stripThinking("<think>je réfléchis\nlongtemps</think>\n\nBonjour.")).toBe("Bonjour.");
    const m = new OllamaTextModel({
      model: "qwen3:8b",
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ message: { content: "<think>x</think>Oui." } }), text: async () => "" }),
    });
    await expect(m.chat([])).resolves.toBe("Oui.");
  });

  it("le raisonnement peut être demandé explicitement", async () => {
    let body: { think?: boolean } = {};
    const m = new OllamaTextModel({
      model: "qwen3:8b",
      think: true,
      fetch: async (_u, init) => {
        body = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ message: { content: "ok" } }), text: async () => "" };
      },
    });
    await m.chat([]);
    expect(body.think).toBe(true);
  });
});

describe("choix de la voix macOS (Aurélie Enhanced)", () => {
  const sortie = "Aurélie             fr_FR    # Bonjour, je m’appelle Aurélie.\nAurélie (Enhanced)  fr_FR    # Bonjour, je m’appelle Aurélie.\nLaura               sk_SK    # Ahoj.";
  it("lit les noms exacts de `say -v ?`", () => {
    expect(voixInstallees(sortie)).toEqual(["Aurélie", "Aurélie (Enhanced)", "Laura"]);
  });
  it("prend la variante Enhanced quand elle est installée, sinon la voix de base, avec un avertissement", () => {
    expect(choisirVoix("Aurélie", voixInstallees(sortie))).toEqual({ voix: "Aurélie (Enhanced)" });
    const repli = choisirVoix("Aurélie", ["Aurélie", "Laura"]);
    expect(repli.voix).toBe("Aurélie");
    expect(repli.avertissement).toMatch(/« Aurélie \(Enhanced\) » absente de ce Mac : « Aurélie » utilisée/);
  });
});

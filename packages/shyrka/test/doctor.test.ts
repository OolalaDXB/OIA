import { describe, it, expect } from "vitest";
import { diagnose, formatChecks } from "../src/doctor.js";
import { fakeRunner } from "./fakes.js";

const cfg = { ffmpeg: "ffmpeg", whisperBin: "whisper-cli", whisperModel: "/m/ggml-large-v3-turbo.bin", ollamaUrl: "http://127.0.0.1:11434", ollamaModel: "qwen3:8b", compareModel: "mistral-small", voice: "Aurélie" };

describe("diagnostic du Mac (lecture seule)", () => {
  it("tout présent : tout est ok", async () => {
    const { run } = fakeRunner((c) => (c.cmd === "say" ? { stdout: "Aurélie (Enhanced)  fr_FR    # Bonjour\nThomas fr_FR # Bonjour\n" } : { stdout: "ffmpeg version 7.1\n" }));
    const checks = await diagnose(cfg, {
      run,
      platform: "darwin",
      exists: () => true,
      fetchJson: async () => ({ ok: true, status: 200, json: async () => ({ models: [{ name: "qwen3:8b" }, { name: "mistral-small:latest" }] }) }),
    });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("rien d'installé : dit quoi faire, sans rien installer", async () => {
    const { run, calls } = fakeRunner(() => ({ code: 127 }));
    const checks = await diagnose({ ...cfg, whisperModel: "", ollamaModel: "" }, {
      run,
      platform: "linux",
      exists: () => false,
      fetchJson: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(checks.every((c) => !c.ok)).toBe(true);
    const text = formatChecks(checks);
    expect(text).toContain("brew install whisper-cpp");
    expect(text).toContain("ollama pull");
    // Lecture seule : seules des commandes d'inspection sont lancées.
    expect(calls.map((c) => [c.cmd, ...c.args].join(" "))).toEqual(["ffmpeg -hide_banner -version", "whisper-cli -h", "say -v ?"]);
  });

  it("refuse une adresse Ollama distante", async () => {
    const { run } = fakeRunner();
    let fetched = false;
    const checks = await diagnose({ ...cfg, ollamaUrl: "http://192.168.1.4:11434" }, {
      run,
      platform: "darwin",
      exists: () => true,
      fetchJson: async () => {
        fetched = true;
        return { ok: true, status: 200, json: async () => ({}) };
      },
    });
    expect(fetched).toBe(false);
    expect(checks.find((c) => c.name === "Ollama (local)")?.ok).toBe(false);
  });
});

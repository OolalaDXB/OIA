import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { FfmpegMicrophone } from "./adapters/microphone-ffmpeg.js";
import { MacSaySpeaker } from "./adapters/macos-say.js";
import { OllamaTextModel } from "./adapters/ollama.js";
import { RecordingSpeaker, SimulatedMicrophone, SimulatedTextModel, SimulatedTranscriber } from "./adapters/simulated.js";
import { WhisperCppTranscriber } from "./adapters/whisper-cpp.js";
import { diagnose, formatChecks } from "./doctor.js";
import { loadIdentity, voiceOutputAllowed } from "./identity.js";
import { execFileRunner } from "./runner.js";
import { ShyrkaSession, type TurnResult } from "./session.js";

/**
 * pnpm --filter @oia/shyrka diagnostic          vérifie le Mac (lecture seule)
 * pnpm --filter @oia/shyrka parle               dialogue réel (micro, Whisper, Ollama)
 * pnpm --filter @oia/shyrka parle -- --texte    sans micro : on tape, Shyrka répond
 * pnpm --filter @oia/shyrka parle -- --simule   tout simulé, aucun matériel requis
 */
const env = process.env;
const DEFAULT_IDENTITY = fileURLToPath(new URL("../../../infra/shyrka/identite.json", import.meta.url));

const cfg = {
  ffmpeg: env.SHYRKA_FFMPEG ?? "ffmpeg",
  device: env.SHYRKA_MICRO ?? ":0",
  seconds: Number(env.SHYRKA_DUREE ?? "8"),
  whisperBin: env.SHYRKA_WHISPER_BIN ?? "whisper-cli",
  whisperModel: env.SHYRKA_WHISPER_MODEL ?? "",
  ollamaUrl: env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: env.SHYRKA_OLLAMA_MODEL ?? "",
  voice: env.SHYRKA_VOIX ?? "Aurélie",
  language: env.SHYRKA_LANGUE ?? "fr",
  identityPath: env.SHYRKA_IDENTITE ?? DEFAULT_IDENTITY,
};

function timings(r: TurnResult): string {
  return r.events.filter((e) => e.ms > 0).map((e) => `${e.step} ${e.ms} ms`).join(" · ");
}

async function parle(flags: Set<string>): Promise<void> {
  const simulated = flags.has("--simule");
  const textOnly = flags.has("--texte");
  const { identity, warning } = loadIdentity(cfg.identityPath);
  if (warning) console.log(`! ${warning}`);
  console.log(`Identité v${identity.version} (${identity.date}, ${identity.decidePar}) · voix en sortie : ${voiceOutputAllowed(identity) ? `oui (${cfg.voice})` : "non, réponses en texte"}`);

  const dir = mkdtempSync(join(tmpdir(), "shyrka-"));
  const purge = () => {
    for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
  };

  const session = simulated
    ? new ShyrkaSession({
        microphone: new SimulatedMicrophone(),
        transcriber: new SimulatedTranscriber(["Bonjour Shyrka, tu m'entends ?", "Résume-moi la journée.", ""]),
        model: new SimulatedTextModel((m) => `Réponse simulée à : « ${m[m.length - 1]?.content ?? ""} »`),
        speaker: new RecordingSpeaker(),
        identity,
        print: (l) => console.log(`${l}  [simulé]`),
        language: cfg.language,
      })
    : new ShyrkaSession({
        ...(textOnly
          ? {}
          : {
              microphone: new FfmpegMicrophone(execFileRunner, { device: cfg.device, dir, ffmpeg: cfg.ffmpeg }),
              transcriber: new WhisperCppTranscriber(execFileRunner, { model: cfg.whisperModel, bin: cfg.whisperBin }),
            }),
        model: new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl }),
        speaker: new MacSaySpeaker(execFileRunner, { voice: cfg.voice, dir }),
        identity,
        print: (l) => console.log(l),
        language: cfg.language,
        maxSeconds: cfg.seconds,
      });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(textOnly ? "Tape une phrase (q pour quitter) : " : `Entrée pour parler ${cfg.seconds} s, ou tape une phrase (q pour quitter) : `);
  rl.prompt();
  try {
    // Itération ligne à ligne : fonctionne au clavier comme en entrée redirigée, s'arrête proprement en fin de flux.
    for await (const raw of rl) {
      const line = raw.trim();
      if (line === "q" || line === "quit") break;
      try {
        const r = line || textOnly ? await session.textTurn(line) : await session.listenTurn();
        if (r.heard && !line) console.log(`Toi · ${r.heard}`);
        const t = timings(r);
        if (t) console.log(`  (${t})`);
      } catch (e) {
        console.log(`! ${(e as Error).message}`);
      } finally {
        purge(); // aucune prise audio n'est conservée
      }
      rl.prompt();
    }
  } finally {
    rl.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a !== "--"));
  if (cmd === "diagnostic") {
    const checks = await diagnose(
      { ffmpeg: cfg.ffmpeg, whisperBin: cfg.whisperBin, whisperModel: cfg.whisperModel, ollamaUrl: cfg.ollamaUrl, ollamaModel: cfg.ollamaModel, voice: cfg.voice },
      { run: execFileRunner },
    );
    console.log(formatChecks(checks));
    process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
    return;
  }
  if (cmd === "parle") return parle(flags);
  console.log("Usage : cli.ts diagnostic | parle [--texte] [--simule]");
  process.exitCode = 2;
}

void main();

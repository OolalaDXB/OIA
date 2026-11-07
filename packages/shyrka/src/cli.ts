import { mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { FfmpegMicrophone } from "./adapters/microphone-ffmpeg.js";
import { MacSaySpeaker } from "./adapters/macos-say.js";
import { COMPARISON_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL, OllamaTextModel } from "./adapters/ollama.js";
import { RecordingSpeaker, SimulatedMicrophone, SimulatedTextModel, SimulatedTranscriber } from "./adapters/simulated.js";
import { WhisperCppTranscriber } from "./adapters/whisper-cpp.js";
import { diagnose, formatChecks } from "./doctor.js";
import { loadIdentity, voiceOutputAllowed } from "./identity.js";
import { execFileRunner } from "./runner.js";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { FfmpegMicrophone as Micro, MAX_ENTRETIEN_SECONDS } from "./adapters/microphone-ffmpeg.js";
import { chargerProgramme } from "./entretien/programme.js";
import { SessionEntretien } from "./entretien/session.js";
import { ecrireSeance } from "./entretien/fiche.js";
import { loadPermissions } from "./permissions.js";
import { AgentMessages } from "./messages/agent.js";
import { BOITE_FICTIVE, CanalSimule } from "./messages/simulated.js";
import { JournalMemoire } from "./messages/types.js";
import { ShyrkaSession, type TurnResult } from "./session.js";

/**
 * pnpm --filter @oia/shyrka diagnostic          vérifie le Mac (lecture seule)
 * pnpm --filter @oia/shyrka parle               dialogue réel (micro, Whisper, Ollama)
 * pnpm --filter @oia/shyrka parle -- --texte    sans micro : on tape, Shyrka répond
 * pnpm --filter @oia/shyrka parle -- --simule   tout simulé, aucun matériel requis
 * pnpm --filter @oia/shyrka parle -- --comparer chaque réponse aussi demandée à mistral-small
 */
const env = process.env;
const DEFAULT_IDENTITY = fileURLToPath(new URL("../../../infra/shyrka/identite.json", import.meta.url));
const DEFAULT_PERMISSIONS = fileURLToPath(new URL("../../../infra/shyrka/permissions.json", import.meta.url));
const ENTRETIENS_MD = fileURLToPath(new URL("../../../docs/shyrka/entretiens.md", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const cfg = {
  ffmpeg: env.SHYRKA_FFMPEG ?? "ffmpeg",
  device: env.SHYRKA_MICRO ?? ":0",
  seconds: Number(env.SHYRKA_DUREE ?? "8"),
  whisperBin: env.SHYRKA_WHISPER_BIN ?? "whisper-cli",
  whisperModel: env.SHYRKA_WHISPER_MODEL ?? "",
  ollamaUrl: env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: env.SHYRKA_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
  compareModel: env.SHYRKA_OLLAMA_COMPARAISON ?? COMPARISON_OLLAMA_MODEL,
  think: env.SHYRKA_OLLAMA_REFLEXION === "oui",
  voice: env.SHYRKA_VOIX ?? "Aurélie",
  language: env.SHYRKA_LANGUE ?? "fr",
  identityPath: env.SHYRKA_IDENTITE ?? DEFAULT_IDENTITY,
  permissionsPath: env.SHYRKA_PERMISSIONS ?? DEFAULT_PERMISSIONS,
  entretienSeconds: Number(env.SHYRKA_ENTRETIEN_DUREE ?? "120"),
  corpus: env.SHYRKA_CORPUS ?? (existsSync("/Volumes/Shyrka-corpus") ? "/Volumes/Shyrka-corpus/brut/entretiens" : join(homedir(), "oia-shyrka-data", "entretiens")),
};

function valeur(args: string[], nom: string): string | undefined {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
}

async function entretien(args: string[]): Promise<void> {
  const flags = new Set(args);
  const simulated = flags.has("--simule");
  const textOnly = flags.has("--texte");
  const numero = Number(valeur(args, "--seance") ?? "1");
  const seance = chargerProgramme(readFileSync(ENTRETIENS_MD, "utf8")).find((s) => s.numero === numero);
  if (!seance) throw new Error(`Séance ${numero} introuvable dans docs/shyrka/entretiens.md.`);
  const { identity } = loadIdentity(cfg.identityPath);
  const dir = mkdtempSync(join(tmpdir(), "shyrka-entretien-"));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lignes = rl[Symbol.asyncIterator]();
  const lire = async (invite: string): Promise<string> => {
    process.stdout.write(invite);
    const n = await lignes.next();
    return n.done ? "passer" : String(n.value);
  };
  const speaker = new MacSaySpeaker(execFileRunner, { voice: cfg.voice, dir });
  const micro = new Micro(execFileRunner, { device: cfg.device, dir, ffmpeg: cfg.ffmpeg, capSeconds: MAX_ENTRETIEN_SECONDS });
  const whisper = new WhisperCppTranscriber(execFileRunner, { model: cfg.whisperModel, bin: cfg.whisperBin });
  let reponsesSimulees = ["8 novembre, plutôt en forme, J0 qui tourne.", "Parce que l'idée ne me lâche pas.", "Le dernier, c'était OIA.", "passer"];
  try {
    const session = new SessionEntretien({
      seance: simulated ? { ...seance, questions: seance.questions.slice(0, 2) } : seance,
      model: simulated
        ? new SimulatedTextModel((m) => (m[0]?.content.startsWith("Extrais") ? '{"regles":[{"texte":"Je lance quand l\u0027idée ne me lâche pas.","theme":"décider"}],"exemples":[],"formules":[]}' : "Et la dernière fois, concrètement ?"))
        : new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl, think: cfg.think }),
      poser: async (t) => {
        console.log(`Shyrka · ${t}${simulated ? "  [simulé]" : ""}`);
        if (!simulated && voiceOutputAllowed(identity)) await speaker.speak(t);
      },
      ecouter: async () => {
        if (simulated) {
          const r = reponsesSimulees.shift() ?? "passer";
          console.log(`Toi · ${r}`);
          return r;
        }
        if (textOnly) return lire("Toi (passer, retirer) : ");
        const l = await lire(`Entrée pour répondre (${cfg.entretienSeconds} s), ou tape ta réponse : `);
        if (l.trim()) return l;
        const clip = await micro.record({ maxSeconds: cfg.entretienSeconds });
        const t = await whisper.transcribe(clip, { language: cfg.language });
        for (const f of readdirSync(dir)) unlinkSync(join(dir, f));
        console.log(`Toi · ${t.text}`);
        return t.text;
      },
    });
    const r = await session.mener();
    if (simulated) {
      console.log(`\n${r.regles.length} règle(s), ${r.echanges.length} échange(s), ${r.passees.length} passée(s). Mode simulé : rien n'est écrit.`);
      return;
    }
    const { dossier } = ecrireSeance(r, { racine: cfg.corpus, depot: REPO_ROOT, transcription: session.transcription() });
    console.log(`\nSéance enregistrée dans ${dossier} (transcription.txt, fiche.md). Tout est « à valider ».`);
  } finally {
    rl.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Démonstration de l'agent courrier et WhatsApp sur la boîte fictive de la séance 7. Aucun envoi réel n'existe. */
async function courrier(args: string[]): Promise<void> {
  const { permissions, warning } = loadPermissions(cfg.permissionsPath);
  if (warning) console.log(`! ${warning}`);
  const simulated = args.includes("--simule");
  const model = simulated
    ? new SimulatedTextModel((m) => (m[0]?.content.startsWith("Tu tries") ? '{"categorie":"ambigu","resume":"Message fictif."}' : "Merci pour votre message, je reviens vers vous rapidement."))
    : new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl, think: cfg.think });
  for (const canal of ["email", "whatsapp"] as const) {
    console.log(`\n== ${canal} · palier ${permissions.canaux[canal].palier} (boîte fictive)`);
    const journal = new JournalMemoire();
    const agent = new AgentMessages({ canal: new CanalSimule(canal, BOITE_FICTIVE), model, permissions, journal });
    const lu = await agent.lireEtTrier();
    if ("refus" in lu) {
      console.log(`Refus : ${lu.refus}`);
      continue;
    }
    if (lu.exclus) console.log(`${lu.exclus} message(s) écarté(s) sans lecture (expéditeur exclu).`);
    for (const t of lu.tries) {
      console.log(`- [${t.categorie}] ${t.message.nom ?? t.message.de} · ${t.resume}`);
      const b = await agent.preparer(t);
      if ("refus" in b) {
        console.log(`  brouillon : refusé (${b.refus})`);
        continue;
      }
      console.log(`  brouillon ${b.id} : ${b.texte}`);
      const e = await agent.envoyer(b, { categorie: t.categorie });
      console.log(`  envoi : ${"refus" in e ? `non (${e.refus})` : "fait (simulé)"}`);
    }
  }
}

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
        model: new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl, think: cfg.think }),
        ...(flags.has("--comparer") ? { compareModel: new OllamaTextModel({ model: cfg.compareModel, url: cfg.ollamaUrl, think: cfg.think }) } : {}),
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
      { ffmpeg: cfg.ffmpeg, whisperBin: cfg.whisperBin, whisperModel: cfg.whisperModel, ollamaUrl: cfg.ollamaUrl, ollamaModel: cfg.ollamaModel, compareModel: cfg.compareModel, voice: cfg.voice },
      { run: execFileRunner },
    );
    console.log(formatChecks(checks));
    process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
    return;
  }
  if (cmd === "parle") return parle(flags);
  if (cmd === "entretien") return entretien(rest.filter((a) => a !== "--"));
  if (cmd === "courrier") return courrier(rest.filter((a) => a !== "--"));
  console.log("Usage : cli.ts diagnostic | parle [--texte] [--simule] [--comparer] | entretien --seance N [--texte] [--simule] | courrier [--simule]");
  process.exitCode = 2;
}

main().catch((e: unknown) => {
  console.error(`! ${(e as Error).message}`);
  process.exitCode = 1;
});

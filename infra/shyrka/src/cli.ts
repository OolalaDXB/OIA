import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { EnregistreurFfmpeg, EnregistreurSimule, type Enregistreur } from "./adapters/enregistreur.js";
import { MacSaySpeaker } from "./adapters/macos-say.js";
import { lireCleMistral, MistralTextModel, ollamaPresent } from "./adapters/mistral.js";
import { MAX_ENTRETIEN_SECONDS, MAX_RECORD_SECONDS } from "./adapters/microphone-ffmpeg.js";
import { COMPARISON_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL, OllamaTextModel } from "./adapters/ollama.js";
import { RecordingSpeaker, SimulatedTextModel, SimulatedTranscriber } from "./adapters/simulated.js";
import { PROMPT_WHISPER, WhisperServer } from "./adapters/whisper-server.js";
import { contexteModele, etatOia, resumeDuJour } from "./contexte.js";
import { diagnose, formatChecks } from "./doctor.js";
import { preparerDossierSeance, ecrireFiche } from "./entretien/fiche.js";
import { chargerProgramme } from "./entretien/programme.js";
import { SessionEntretien } from "./entretien/session.js";
import { loadIdentity, voiceOutputAllowed } from "./identity.js";
import { RACINE_DEPOT } from "./local.js";
import { promptSysteme } from "./persona.js";
import { execFileRunner } from "./runner.js";
import { ShyrkaSession, type TurnResult } from "./session.js";
import type { Speaker, Transcriber } from "./types.js";

/**
 * pnpm shyrka:parler            pousser pour parler (Entrée pour commencer, Entrée pour finir)
 * pnpm shyrka:parler -- --texte au clavier, sans micro
 * pnpm shyrka:parler -- --simule tout simulé, aucun matériel
 * pnpm shyrka:resume            résumé du jour, lu à voix haute
 * pnpm --filter @oia/shyrka entretien -- --seance 1
 * pnpm --filter @oia/shyrka diagnostic
 */
const env = process.env;
const ICI = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

function modeleWhisperParDefaut(): string {
  const dossier = join(RACINE_DEPOT, "local-models", "whisper");
  if (!existsSync(dossier)) return "";
  const bins = readdirSync(dossier).filter((f) => f.endsWith(".bin")).sort();
  return bins.length ? join(dossier, bins[0]!) : "";
}

const cfg = {
  ffmpeg: env.SHYRKA_FFMPEG ?? "ffmpeg",
  device: env.SHYRKA_MICRO ?? ":0",
  whisperBin: env.SHYRKA_WHISPER_BIN ?? "whisper-server",
  whisperModel: env.SHYRKA_WHISPER_MODEL ?? modeleWhisperParDefaut(),
  ollamaUrl: env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: env.SHYRKA_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
  compareModel: env.SHYRKA_OLLAMA_COMPARAISON ?? COMPARISON_OLLAMA_MODEL,
  think: env.SHYRKA_OLLAMA_REFLEXION === "oui",
  identityPath: env.SHYRKA_IDENTITE ?? ICI("../identite.json"),
  entretiensMd: ICI("../../../docs/shyrka/entretiens.md"),
  entretiensDir: env.SHYRKA_ENTRETIENS_DIR,
  resumeCourrierDir: env.SHYRKA_COURRIER_DIR ?? join(homedir(), "oia-shyrka-data", "courrier"),
};

/** Lit les lignes du clavier une par une ; renvoie null en fin de flux. */
function clavier() {
  const rl = createInterface({ input: process.stdin });
  const file: string[] = [];
  const attente: ((l: string | null) => void)[] = [];
  let fini = false;
  rl.on("line", (l) => (attente.length ? attente.shift()!(l) : file.push(l)));
  rl.on("close", () => {
    fini = true;
    while (attente.length) attente.shift()!(null);
  });
  return {
    lire(invite: string): Promise<string | null> {
      process.stdout.write(invite);
      if (file.length) return Promise.resolve(file.shift()!);
      if (fini) return Promise.resolve(null);
      return new Promise((r) => attente.push(r));
    },
    fermer: () => rl.close(),
  };
}

function voix(simule: boolean, dir: string): Speaker {
  const { identity, warning } = loadIdentity(cfg.identityPath);
  if (warning) console.log(`! ${warning}`);
  if (simule || !voiceOutputAllowed(identity)) return new RecordingSpeaker();
  return new MacSaySpeaker(execFileRunner, { voice: identity.voix, dir });
}

function etatDuJour() {
  const e = etatOia();
  const courrier = dernierResumeCourrier();
  return courrier ? { ...e, resumeCourrier: courrier } : e;
}

/** Résumé lu à voix haute. */
function contexte(): string {
  return resumeDuJour(etatDuJour());
}

/** Contexte donné au modèle : résumé, puis intitulés exacts et identifiants des décisions, rapports. */
function contexteDuModele(): string {
  return contexteModele(etatDuJour());
}

/** Dernier résumé du matin de l'agent courrier (packages/shyrka-mail), s'il existe. Hors du dépôt. */
function dernierResumeCourrier(): string | undefined {
  if (!existsSync(cfg.resumeCourrierDir)) return undefined;
  const f = readdirSync(cfg.resumeCourrierDir).filter((n) => /^resume-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort().pop();
  if (!f) return undefined;
  const premiere = readFileSync(join(cfg.resumeCourrierDir, f), "utf8").split("\n").find((l) => l.startsWith("Courrier :"));
  return premiere;
}

function timings(r: TurnResult): string {
  return r.events.filter((e) => e.ms > 0).map((e) => `${e.step} ${e.ms} ms`).join(" · ");
}

/**
 * Ollama d'abord (local). S'il est absent, ou si SHYRKA_MODELE=mistral, Mistral
 * par son API (mandat v9, G5), avec la clé de ~/.oia/mistral.env.
 */
async function modeleTexte() {
  const forcer = env.SHYRKA_MODELE === "mistral";
  if (!forcer && (await ollamaPresent(cfg.ollamaUrl))) return new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl, think: cfg.think });
  const cle = lireCleMistral();
  if (!cle) {
    throw new Error(
      `${forcer ? "Mistral demandé" : "Ollama absent"} et aucune clé Mistral : poser MISTRAL_API_KEY=… dans ~/.oia/mistral.env (chmod 600), ou lancer Ollama.`,
    );
  }
  console.log(forcer ? "Modèle : Mistral (demandé)." : "Ollama absent : modèle Mistral (API). Le texte de la conversation part chez Mistral ; rien de ce qui touche à Swift.");
  return new MistralTextModel({ cle });
}

async function parler(flags: Set<string>): Promise<void> {
  const simule = flags.has("--simule");
  const texte = flags.has("--texte");
  const dir = mkdtempSync(join(tmpdir(), "shyrka-"));
  const speaker = voix(simule, dir);
  const whisper = simule || texte ? null : new WhisperServer({ model: cfg.whisperModel, bin: cfg.whisperBin, prompt: PROMPT_WHISPER });
  const transcriber: Transcriber | undefined = simule ? new SimulatedTranscriber(["Bonjour Shyrka, tu m'entends ?", "Où en est J0 ?"]) : whisper ?? undefined;
  const enregistreur: Enregistreur = simule ? new EnregistreurSimule() : new EnregistreurFfmpeg({ device: cfg.device, plafondSecondes: MAX_RECORD_SECONDS, ffmpeg: cfg.ffmpeg });
  const session = new ShyrkaSession({
    model: simule ? new SimulatedTextModel((m) => `Réponse simulée à : « ${m[m.length - 1]?.content ?? ""} »`) : await modeleTexte(),
    mistralAutorise: true,
    ...(flags.has("--comparer") && !simule ? { compareModel: new OllamaTextModel({ model: cfg.compareModel, url: cfg.ollamaUrl, think: cfg.think }) } : {}),
    ...(transcriber ? { transcriber } : {}),
    speaker,
    identity: loadIdentity(cfg.identityPath).identity,
    system: promptSysteme(contexteDuModele()),
    print: (l) => console.log(simule ? `${l}  [simulé]` : l),
  });
  const k = clavier();
  const arret = () => whisper?.arreter();
  process.once("SIGINT", () => {
    arret();
    process.exit(130);
  });
  try {
    if (whisper) {
      console.log("Démarrage du serveur Whisper local (port 8178)…");
      await whisper.demarrer();
    }
    for (let n = 1; ; n++) {
      const l = await k.lire(texte ? "Toi (q pour quitter) : " : "Entrée pour parler, ou tape une phrase (q pour quitter) : ");
      if (l === null || l.trim() === "q") break;
      try {
        let r: TurnResult;
        if (l.trim() || texte) r = await session.textTurn(l);
        else {
          const prise = enregistreur.demarrer(join(dir, `prise-${n}.wav`));
          await k.lire(`J'écoute (${MAX_RECORD_SECONDS} s au plus). Entrée pour finir… `);
          r = await session.clipTurn(await prise.arreter());
          if (r.heard) console.log(`Toi · ${r.heard}`);
        }
        const t = timings(r);
        if (t) console.log(`  (${t})`);
      } catch (e) {
        console.log(`! ${(e as Error).message}`);
      } finally {
        for (const f of readdirSync(dir)) unlinkSync(join(dir, f)); // aucune prise conservée
      }
    }
  } finally {
    arret();
    k.fermer();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function resume(flags: Set<string>): Promise<void> {
  const simule = flags.has("--simule");
  const dir = mkdtempSync(join(tmpdir(), "shyrka-"));
  try {
    const texte = contexte();
    console.log(texte);
    await voix(simule, dir).speak(texte);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function entretien(args: string[]): Promise<void> {
  const flags = new Set(args);
  const simule = flags.has("--simule");
  const i = args.indexOf("--seance");
  const numero = Number(i >= 0 ? args[i + 1] : "1");
  const seance = chargerProgramme(readFileSync(cfg.entretiensMd, "utf8")).find((s) => s.numero === numero);
  if (!seance) throw new Error(`Séance ${numero} introuvable dans docs/shyrka/entretiens.md.`);
  const date = new Date().toISOString().slice(0, 10);
  const tmp = mkdtempSync(join(tmpdir(), "shyrka-entretien-"));
  // Mode simulé : rien n'est écrit, aucun volume requis. Mode réel : volume chiffré monté, sinon refus.
  const dossier = simule ? tmp : preparerDossierSeance({ numero, theme: seance.theme, date, ...(cfg.entretiensDir ? { sortie: cfg.entretiensDir } : {}) });
  const speaker = voix(simule, tmp);
  const whisper = simule ? null : new WhisperServer({ model: cfg.whisperModel, bin: cfg.whisperBin, prompt: PROMPT_WHISPER });
  const enregistreur: Enregistreur = simule ? new EnregistreurSimule() : new EnregistreurFfmpeg({ device: cfg.device, plafondSecondes: MAX_ENTRETIEN_SECONDS, ffmpeg: cfg.ffmpeg });
  const k = clavier();
  const reponsesSimulees = ["", "", "p", "", "r", "", "p"];
  try {
    const session = new SessionEntretien({
      seance: simule ? { ...seance, questions: seance.questions.slice(0, 2) } : seance,
      poser: async (t) => {
        console.log(`Shyrka · ${t}`);
        await speaker.speak(t);
      },
      enregistrer: async (nom) => {
        const l = simule ? (reponsesSimulees.shift() ?? "p") : await k.lire("Entrée pour répondre, p pour passer, r pour retirer ta dernière réponse : ");
        if (l === null || l.trim() === "p") return "passer";
        if (l.trim() === "r") return "retirer";
        const prise = enregistreur.demarrer(join(dossier, nom));
        if (!simule) await k.lire(`J'enregistre (${Math.round(MAX_ENTRETIEN_SECONDS / 60)} min au plus). Entrée pour finir… `);
        return { prise: await prise.arreter() };
      },
      supprimer: (prise) => {
        if (existsSync(prise.path)) unlinkSync(prise.path);
      },
      transcrire: simule ? new SimulatedTranscriber(["Réponse simulée.", "Autre réponse simulée.", "Encore une."]) : whisper!,
      ...(simule ? {} : { model: new OllamaTextModel({ model: cfg.ollamaModel, url: cfg.ollamaUrl, think: cfg.think }) }),
    });
    const r = await (async () => {
      if (whisper) await whisper.demarrer();
      try {
        return await session.mener();
      } finally {
        whisper?.arreter();
      }
    })();
    if (simule) {
      console.log(`\n${r.echanges.length} réponse(s), ${r.passees.length} passée(s), ${r.retraits.length} retrait(s). Mode simulé : rien n'est écrit.`);
      return;
    }
    ecrireFiche(r, dossier, session.transcription());
    console.log(`\nSéance enregistrée dans ${dossier} (enregistrements, transcription.txt, fiche.md). Tout est « à valider ».`);
  } finally {
    k.fermer();
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = rest.filter((a) => a !== "--");
  const flags = new Set(args);
  if (cmd === "diagnostic") {
    const checks = await diagnose(
      { ffmpeg: cfg.ffmpeg, whisperBin: cfg.whisperBin, whisperModel: cfg.whisperModel, ollamaUrl: cfg.ollamaUrl, ollamaModel: cfg.ollamaModel, compareModel: cfg.compareModel, voice: "Aurélie" },
      { run: execFileRunner },
    );
    console.log(formatChecks(checks));
    process.exitCode = checks.every((c) => c.ok || c.name.includes("facultatif")) ? 0 : 1;
    return;
  }
  if (cmd === "parler") return parler(flags);
  if (cmd === "resume") return resume(flags);
  if (cmd === "entretien") return entretien(args);
  console.log("Usage : cli.ts parler [--texte] [--simule] [--comparer] | resume [--simule] | entretien --seance N [--simule] | diagnostic");
  process.exitCode = 2;
}

main().catch((e: unknown) => {
  console.error(`! ${(e as Error).message}`);
  process.exitCode = 1;
});

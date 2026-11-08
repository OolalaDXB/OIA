import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MacSaySpeaker } from "../adapters/macos-say.js";
import { ollamaPresent } from "../adapters/mistral.js";
import { DEFAULT_OLLAMA_MODEL, OllamaTextModel } from "../adapters/ollama.js";
import { WhisperServer } from "../adapters/whisper-server.js";
import { contexteModele, etatOia } from "../contexte.js";
import { Corpus } from "../executive/corpus.js";
import { projetsConnus } from "../executive/config.js";
import { loadIdentity, voiceOutputAllowed } from "../identity.js";
import { RACINE_DEPOT } from "../local.js";
import { ServiceMemoire } from "../memoire/commandes.js";
import { MemoireLocale } from "../memoire/sqlite.js";
import { dossierVerifie, etatVolume } from "../memoire/volume.js";
import { promptSysteme } from "../persona.js";
import { execFileRunner } from "../runner.js";
import { ShyrkaSession } from "../session.js";
import { inviteWhisper } from "./audio.js";
import { Passerelle, PORT_PASSERELLE, type Connaissances } from "./serveur.js";

/**
 * pnpm shyrka:passerelle   lance la passerelle locale de Shyrka sur 127.0.0.1:8179
 *
 * Modèle local seulement (Ollama) : aucun repli en ligne, la mémoire
 * personnelle et le corpus restent sur le Mac. Whisper local pour la
 * transcription, `say` pour la voix (sur le Mac). Le jeton du jour est écrit
 * dans ~/oia-shyrka-data/passerelle/jeton (chmod 600) ; le proxy de
 * développement de la page le lit et le pose sur chaque requête.
 */
const env = process.env;
const ICI = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
export const FICHIER_JETON = join(homedir(), "oia-shyrka-data", "passerelle", "jeton");

function modeleWhisper(): string {
  if (env.SHYRKA_WHISPER_MODEL) return env.SHYRKA_WHISPER_MODEL;
  const dossier = join(RACINE_DEPOT, "local-models", "whisper");
  if (!existsSync(dossier)) return "";
  const bins = readdirSync(dossier).filter((f) => f.endsWith(".bin")).sort();
  return bins.length ? join(dossier, bins[0]!) : "";
}

/** Mémoire et corpus du volume chiffré ; indisponibles, et dits tels, s'il n'est pas monté. */
function connaissances(): Connaissances {
  const projets = projetsConnus();
  let memoire: MemoireLocale | null = null;
  let corpus: Corpus | null = null;
  const raisons: string[] = [];
  try {
    memoire = new MemoireLocale(dossierVerifie("memoire"));
  } catch (e) {
    raisons.push((e as Error).message);
  }
  try {
    corpus = new Corpus(dossierVerifie("connaissances"));
    corpus.indexer();
  } catch (e) {
    corpus?.fermer();
    corpus = null;
    raisons.push(`corpus : ${(e as Error).message}`);
  }
  const c = corpus;
  return {
    memoire: new ServiceMemoire(memoire, { projets, ...(memoire ? {} : { indisponible: raisons[0] ?? "volume indisponible" }) }),
    chercher: c ? (texte) => c.chercher(texte, { type: "conversation", modele: "local" }, 4) : null,
    etat: { memoire: memoire ? "active" : "indisponible", corpus: c ? "actif" : "indisponible", detail: raisons.join(" ; ") || `volume ${etatVolume().point} monté et chiffré` },
    fermer: () => {
      memoire?.fermer();
      c?.fermer();
    },
  };
}

async function main(): Promise<void> {
  const port = Number(env.SHYRKA_PASSERELLE_PORT ?? PORT_PASSERELLE);
  const ollamaUrl = env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const modeleNom = env.SHYRKA_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const { identity, warning } = loadIdentity(env.SHYRKA_IDENTITE ?? ICI("../../identite.json"));
  if (warning) console.log(`! ${warning}`);
  const dir = mkdtempSync(join(tmpdir(), "shyrka-voix-"));
  const speaker = voiceOutputAllowed(identity) ? new MacSaySpeaker(execFileRunner, { voice: identity.voix, dir }) : undefined;
  const invite = inviteWhisper(projetsConnus());
  const modele = modeleWhisper();
  const whisper = modele ? new WhisperServer({ model: modele, bin: env.SHYRKA_WHISPER_BIN ?? "whisper-server", prompt: invite }) : null;
  const jeton = randomBytes(32).toString("hex");
  mkdirSync(join(homedir(), "oia-shyrka-data", "passerelle"), { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER_JETON, `${jeton}\n`, { mode: 0o600 });
  chmodSync(FICHIER_JETON, 0o600);

  if (whisper) {
    console.log(`Whisper local : démarrage (${modele.split("/").pop()})…`);
    await whisper.demarrer();
  } else console.log("! Aucun modèle Whisper dans local-models/whisper : saisie au clavier seulement.");

  const passerelle = new Passerelle({
    jeton,
    port,
    connaissances,
    etatVolume: () => {
      const v = etatVolume();
      return `${v.monte}:${v.chiffre}:${v.inscriptible}`;
    },
    creerSession: (h) =>
      new ShyrkaSession({
        model: new OllamaTextModel({ model: modeleNom, url: ollamaUrl, think: env.SHYRKA_OLLAMA_REFLEXION === "oui" }),
        memoire: h.memoire,
        contexteTour: h.contexteTour,
        ...(speaker ? { speaker } : {}),
        identity,
        system: promptSysteme(contexteModele(etatOia())),
        print: h.print,
        onEtat: h.onEtat,
      }),
    convertir: (entree, sortie) =>
      new Promise((ok, ko) =>
        execFile(env.SHYRKA_FFMPEG ?? "ffmpeg", ["-loglevel", "error", "-y", "-i", entree, "-t", "60", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", sortie], { timeout: 30_000 }, (e) =>
          e ? ko(new Error(`conversion audio impossible (${e.message.split("\n")[0]})`)) : ok(),
        ),
      ),
    transcrire: whisper ? async (wav) => (await whisper.transcribe({ path: wav, durationMs: 0 }, { language: "fr" })).text : null,
    invite,
    modele: { nom: `ollama:${modeleNom}`, disponible: () => ollamaPresent(ollamaUrl) },
    voix: speaker ? identity.voix : null,
    journal: (l) => console.log(l),
  });
  const serveur = passerelle.serveur();
  let ferme = false;
  const fermer = async (code: number) => {
    if (ferme) return;
    ferme = true;
    speaker?.interrompre();
    passerelle.fermer();
    serveur.close();
    await whisper?.arreterEtAttendre();
    rmSync(dir, { recursive: true, force: true });
    rmSync(FICHIER_JETON, { force: true });
    console.log("Passerelle arrêtée (Whisper compris).");
    process.exit(code);
  };
  process.once("SIGINT", () => void fermer(130));
  process.once("SIGTERM", () => void fermer(143));
  serveur.listen(port, "127.0.0.1", async () => {
    const s = await passerelle.sante(true);
    console.log(`Passerelle de Shyrka : http://127.0.0.1:${port}/v1 (127.0.0.1 seulement)`);
    console.log(`  modèle ${modeleNom} ${(s.modele as { disponible: boolean }).disponible ? "disponible" : "INDISPONIBLE (lancer Ollama)"} · transcription ${s.transcription} · voix ${speaker ? `${identity.voix}, sur le Mac` : "aucune"}`);
    console.log(`  mémoire ${s.memoire} · corpus ${s.corpus}${s.memoire === "active" ? "" : ` (${s.detail})`}`);
    console.log("  Ctrl+C pour arrêter.");
  });
}

main().catch((e) => {
  console.error(`! ${(e as Error).message}`);
  process.exit(1);
});

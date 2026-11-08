import { execFile, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { choisirVoix, MacSaySpeaker, voixInstallees } from "../adapters/macos-say.js";
import { ollamaPresent } from "../adapters/mistral.js";
import { DEFAULT_OLLAMA_MODEL, OllamaTextModel } from "../adapters/ollama.js";
import { WhisperServer } from "../adapters/whisper-server.js";
import { chargerCatalogue, composer, Corpus } from "../executive/corpus.js";
import { CataloguePrive } from "../corpus/catalogue-prive.js";
import { DepotCorpus } from "../corpus/depot.js";
import { generateurOllama } from "../corpus/propositions.js";
import { vectoriseurOllama, type Vectoriseur } from "../corpus/sens.js";
import { Surveillance } from "../corpus/surveillance.js";
import { projetsConnus } from "../executive/config.js";
import { loadIdentity, voiceOutputAllowed } from "../identity.js";
import { RACINE_DEPOT } from "../local.js";
import { ServiceMemoire } from "../memoire/commandes.js";
import { MemoireLocale } from "../memoire/sqlite.js";
import type { Niveau } from "@oia/shyrka-noyau";
import { dossierVerifie, etatVolume, VOLUME_SHYRKA } from "../memoire/volume.js";
import { promptSysteme } from "../persona.js";
import { execFileRunner } from "../runner.js";
import { ShyrkaSession } from "../session.js";
import { inviteWhisper } from "./audio.js";
import { VoixMultilingue, voixParLocale, voixPourLangue } from "./langues.js";
import type { ReglagesVoix } from "./voix.js";
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

/**
 * Mémoire et corpus du volume chiffré ; indisponibles, et dits tels, s'il n'est pas monté.
 * Corpus : catalogue Git + catalogue privé, recherche par le sens (bge-m3) et les identifiants
 * exacts (ADR 0005), module de dépôt et de validation (mandat Corpus local).
 */
/** Recette : `SHYRKA_RECETTE=recette/<nom>` place mémoire, corpus, fichiers admis et journaux sous ce sous-dossier du volume (essais sans toucher la vraie mémoire). */
const sous = (d: string) => (env.SHYRKA_RECETTE ? `${env.SHYRKA_RECETTE.replace(/\/+$/, "")}/${d}` : d);

function connaissances(modeleConversation: string, h: { prive: () => boolean; niveaux: () => Niveau[] }): Connaissances {
  const projets = projetsConnus();
  let memoire: MemoireLocale | null = null;
  let corpus: Corpus | null = null;
  let cataloguePrive: CataloguePrive | null = null;
  let depot: DepotCorpus | null = null;
  const raisons: string[] = [];
  const vectoriser: Vectoriseur = vectoriseurOllama();
  const surveillance = new Surveillance(() => (etatVolume().chiffre ? (env.SHYRKA_RECETTE ? `${VOLUME_SHYRKA}/${env.SHYRKA_RECETTE}` : VOLUME_SHYRKA) : null));
  try {
    memoire = new MemoireLocale(dossierVerifie(sous("memoire")));
    // Décision du 9 novembre 2026 : les faits très privés existants passent au niveau « personnel ».
    const n = memoire.migrerNiveaux({ type: "mickael", via: "migration-niveaux" });
    if (n) console.log(`Mémoire : ${n} fait(s) très privé(s) passé(s) au niveau « personnel ».`);
  } catch (e) {
    raisons.push((e as Error).message);
  }
  try {
    const cp = new CataloguePrive(dossierVerifie(sous("connaissances")));
    cataloguePrive = cp;
    corpus = new Corpus(dossierVerifie(sous("connaissances")), () => composer(chargerCatalogue(), cp.sourcesCorpus()));
    if (corpus.reconstruit) console.log("Index du corpus reconstruit (schéma 2 : références, sens, identifiants) ; les sources se réindexent.");
    corpus.indexer();
    const brut = dossierVerifie(sous("brut/depots"));
    const journal = dossierVerifie(sous("journal"));
    for (const x of [brut, journal]) mkdirSync(x.chemin, { recursive: true, mode: 0o700 });
    depot = new DepotCorpus({ corpus, catalogue: cp, memoire, brut: brut.chemin, journal: journal.chemin, vectoriser, generer: generateurOllama(modeleConversation), surveillance, prive: h.prive, niveaux: h.niveaux });
    // En fond : sens des extraits qui n'en ont pas encore, sources privées à réindexer après une reconstruction.
    const c0 = corpus;
    const d0 = depot;
    void d0
      .rattraper()
      .then(() => c0.calculerSens(vectoriser))
      .then((r) => r.total && console.log(`Corpus : sens calculé pour ${r.total} extrait(s) (${r.calcules} nouveaux).`))
      .catch((e: Error) => console.log(`! Corpus : sens non calculé (${e.message}) ; la recherche se fait par les mots en attendant.`));
  } catch (e) {
    corpus?.fermer();
    cataloguePrive?.fermer();
    corpus = null;
    depot = null;
    raisons.push(`corpus : ${(e as Error).message}`);
  }
  const c = corpus;
  const d = depot;
  // Sens de la question du tour, calculé juste avant : `chercher` (synchrone) le reprend.
  const questions = new Map<string, Float32Array | null>();
  const vecteur = async (texte: string): Promise<Float32Array | null> => {
    try {
      return (await Promise.race([vectoriser([texte]), new Promise<never>((_, ko) => setTimeout(() => ko(new Error("délai")), 3000))]))[0] ?? null;
    } catch {
      return null;
    }
  };
  return {
    memoire: new ServiceMemoire(memoire, { projets, niveaux: h.niveaux, ...(memoire ? {} : { indisponible: raisons[0] ?? "volume indisponible" }) }),
    chercher: c ? (texte) => c.chercher(texte, { type: "conversation", modele: "local" }, 4, { vecteur: questions.get(texte) ?? null, niveaux: h.niveaux() }) : null,
    chercherTout: c ? (texte) => c.chercher(texte, { type: "conversation", modele: "local" }, 1, { vecteur: questions.get(texte) ?? null }) : null,
    preparerQuestion: async (texte) => {
      if (questions.size > 20) questions.clear();
      questions.set(texte, await vecteur(texte));
    },
    corpus:
      c && d && cataloguePrive
        ? {
            depot: d,
            surveillance,
            vecteur,
            etat: () => {
              // Les 18 documents du dépôt sont « interne » : visibles en « seul » et « entre proches », pas « avec un externe ».
              const git = h.niveaux().includes("interne") ? chargerCatalogue().filter((s) => s.statut !== "revoque").length : 0;
              return {
                volume: "chiffre", sourcesOia: git, modeleSens: "bge-m3 (local)",
                // Comptes d'extraits : seulement en « seul » (en mode protégé, ils trahiraient le volume de ce qui est masqué).
                ...(h.niveaux().length === 4 ? c.comptes() : {}),
                surveillance: { etat: surveillance.etat, aExaminer: surveillance.aExaminer().length },
                taches: Object.fromEntries([...d.taches].filter(([id]) => d.sources().some((x) => x.id === id))),
              };
            },
          }
        : null,
    etat: { memoire: memoire ? "active" : "indisponible", corpus: c ? "actif" : "indisponible", detail: raisons.join(" ; ") || `volume ${etatVolume().point} monté et chiffré` },
    fermer: () => {
      surveillance.arreter();
      memoire?.fermer();
      c?.fermer();
      cataloguePrive?.fermer();
    },
  };
}

/**
 * Modèle de conversation : qwen3 30b-a3b « instruct » (comparaison du 8 novembre 2026 sur les mêmes
 * phrases : bien meilleur que qwen3:8b, aussi rapide ; la variante « thinking » raisonne à voix haute
 * et met 12 à 22 s). Absent d'Ollama : qwen3:8b, signalé.
 */
export const MODELE_CONVERSATION = "qwen3:30b-a3b-instruct-2507-q4_K_M";
async function modeleConversation(url: string): Promise<string> {
  try {
    const r = (await (await fetch(`${url}/api/tags`)).json()) as { models?: { name: string }[] };
    if (r.models?.some((m) => m.name === MODELE_CONVERSATION)) return MODELE_CONVERSATION;
  } catch {
    /* Ollama injoignable : signalé au démarrage */
  }
  console.log(`! ${MODELE_CONVERSATION} absent d'Ollama : ${DEFAULT_OLLAMA_MODEL} utilisé (ollama pull ${MODELE_CONVERSATION}).`);
  return DEFAULT_OLLAMA_MODEL;
}

async function main(): Promise<void> {
  const port = Number(env.SHYRKA_PASSERELLE_PORT ?? PORT_PASSERELLE);
  const ollamaUrl = env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const modeleNom = env.SHYRKA_OLLAMA_MODEL ?? (await modeleConversation(ollamaUrl));
  const { identity, warning } = loadIdentity(env.SHYRKA_IDENTITE ?? ICI("../../identite.json"));
  if (warning) console.log(`! ${warning}`);
  const dir = mkdtempSync(join(tmpdir(), "shyrka-voix-"));
  const listeVoix = execFileSync("say", ["-v", "?"], { encoding: "utf8" });
  const voixMac = choisirVoix(identity.voix, voixInstallees(listeVoix));
  if (voixMac.avertissement) console.log(`! ${voixMac.avertissement}`);
  // Français : la voix de l'identité ; autres langues : la meilleure voix installée pour la langue.
  const installees = voixParLocale(listeVoix);
  const reglagesVoix: ReglagesVoix = {};
  const speaker = voiceOutputAllowed(identity) && voixMac.voix
    ? new VoixMultilingue((code) => (code === "fr" ? voixMac.voix : voixPourLangue(code, installees)), (voix) => new MacSaySpeaker(execFileRunner, { voice: voix, dir, prerendu: true, reglages: reglagesVoix }), (m) => console.log(`! ${m}`))
    : undefined;
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
    connaissances: (h) => connaissances(modeleNom, h),
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
        // Pas de point du jour à chaque tour : le modèle le prenait pour un programme (« 26 décisions… »).
        // Les décisions restent servies par le code (routage) et les documents par le corpus.
        system: promptSysteme(),
        print: h.print,
        onEtat: h.onEtat,
      }),
    convertir: (entree, sortie) =>
      new Promise((ok, ko) =>
        execFile(env.SHYRKA_FFMPEG ?? "ffmpeg", ["-loglevel", "error", "-y", "-i", entree, "-t", "60", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", sortie], { timeout: 30_000 }, (e) =>
          e ? ko(new Error(`conversion audio impossible (${e.message.split("\n")[0]})`)) : ok(),
        ),
      ),
    // Détection de la langue, puis, en français, seconde passe avec l'invite de vocabulaire (« Sillon », pas « Sion »).
    transcrire: whisper
      ? async (wav) => {
          const auto = await whisper.transcribe({ path: wav, durationMs: 0 }, { language: "auto" });
          if (auto.language !== "fr") return { texte: auto.text, langue: auto.language };
          return { texte: (await whisper.transcribe({ path: wav, durationMs: 0 }, { language: "fr" })).text, langue: "fr" };
        }
      : null,
    definirLangue: (code) => speaker?.langue(code),
    reglagesVoix,
    ...(speaker ? { dire: (texte: string) => speaker.speak(texte) } : {}),
    invite,
    modele: { nom: `ollama:${modeleNom}`, disponible: () => ollamaPresent(ollamaUrl) },
    voix: speaker ? voixMac.voix : null,
    journal: (l) => console.log(l),
    // Recette seulement : délai d'inactivité raccourci (par défaut 30 minutes).
    ...(env.SHYRKA_PRESENCE_INACTIVITE_MS ? { inactiviteMs: Number(env.SHYRKA_PRESENCE_INACTIVITE_MS) } : {}),
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
    console.log(`  modèle ${modeleNom} ${(s.modele as { disponible: boolean }).disponible ? "disponible" : "INDISPONIBLE (lancer Ollama)"} · transcription ${s.transcription} · voix ${speaker ? `${voixMac.voix} (français), sur le Mac` : "aucune"}`);
    console.log(`  mémoire ${s.memoire} · corpus ${s.corpus}${s.memoire === "active" ? "" : ` (${s.detail})`}`);
    console.log("  Ctrl+C pour arrêter.");
  });
}

main().catch((e) => {
  console.error(`! ${(e as Error).message}`);
  process.exit(1);
});

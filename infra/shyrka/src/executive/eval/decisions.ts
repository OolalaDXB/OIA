import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RecordingSpeaker, SimulatedTextModel } from "../../adapters/simulated.js";
import { loadIdentity } from "../../identity.js";
import { ServiceMemoire } from "../../memoire/commandes.js";
import { MemoireLocale } from "../../memoire/sqlite.js";
import { dossierVerifie } from "../../memoire/volume.js";
import type { EtatCorpus } from "../../passerelle/decision.js";
import { memoireDeleguee } from "../../passerelle/serveur.js";
import { ShyrkaSession } from "../../session.js";
import { Corpus } from "../corpus.js";
import { projetsConnus } from "../config.js";
import { intervalleWilson, type Mesure } from "./stats.js";

/**
 * Banc « question sur une décision » (essai réel du 8 novembre 2026) : à
 * « Qu'avais-je décidé pour SILLON ? », Shyrka a dit qu'il n'y avait rien,
 * vrai pour la mémoire mais trompeur, le corpus ayant quatre passages sur
 * SILLON. Ce banc passe par la vraie session (ShyrkaSession, voix
 * enregistrée) : il note ce qui est DIT à voix haute, et ce qui s'affiche.
 *
 * Mémoire : sous-dossier de recette du volume chiffré, vidé à la fin (la
 * mémoire personnelle n'est pas lue). Corpus : l'index réel du volume, en
 * lecture, ou un état imposé (vide, indisponible, mode privé).
 */
export const JeuDecisions = z.object({
  format: z.literal("shyrka.eval.decisions"),
  version: z.literal(1),
  ensemble: z.string(),
  cas: z.array(z.object({
    id: z.string(),
    famille: z.enum(["positif", "negatif", "adverse"]),
    question: z.string(),
    /** Phrases dites avant la question (« Retiens que … », « Active le mode privé »). */
    avant: z.array(z.string()).default([]),
    corpus: z.enum(["reel", "vide", "indisponible", "prive"]),
    attendu: z.object({
      /** Expressions régulières que la phrase DITE doit toutes vérifier. */
      dit: z.array(z.string()).min(1),
      ne_dit_pas: z.array(z.string()).default([]),
      /** Expressions que l'écran doit vérifier (ligne par ligne, drapeau m). */
      ecran: z.array(z.string()).default([]),
    }),
  })).min(1),
});

export interface ResultatDecisions {
  exactitude: Mesure;
  echecs: string[];
  sousDossier: string;
}

export async function evaluerDecisions(jeu: z.infer<typeof JeuDecisions>, identite = fileURLToPath(new URL("../../../identite.json", import.meta.url))): Promise<ResultatDecisions> {
  const sous = `recette/decisions-${Date.now()}`;
  const corpus = new Corpus(dossierVerifie("connaissances"));
  corpus.indexer();
  const echecs: string[] = [];
  let k = 0;
  try {
    for (const c of jeu.cas) {
      const dossier = dossierVerifie(`${sous}/${c.id}`);
      const memoire = new MemoireLocale(dossier);
      try {
        const service = new ServiceMemoire(memoire, { projets: projetsConnus() });
        const etat = (q: string): EtatCorpus => (c.corpus === "reel" ? corpus.chercher(q, { type: "conversation", modele: "local" }, 4) : c.corpus === "vide" ? [] : c.corpus);
        const voix = new RecordingSpeaker();
        const session = new ShyrkaSession({
          model: new SimulatedTextModel(() => "(le modèle ne doit pas être appelé)"),
          memoire: memoireDeleguee(() => service, etat),
          speaker: voix,
          identity: { ...loadIdentity(identite).identity, voixEnSortie: true },
          print: () => undefined,
        });
        // Les phrases préparatoires ne sont pas notées.
        for (const p of c.avant) await session.textTurn(p);
        voix.spoken.length = 0;
        const fautes: string[] = [];
        const r = await session.textTurn(c.question);
        const dit = voix.spoken[0] ?? "";
        for (const e of c.attendu.dit) if (!new RegExp(e).test(dit)) fautes.push(`dit ne vérifie pas /${e}/`);
        for (const e of c.attendu.ne_dit_pas) if (new RegExp(e, "i").test(dit)) fautes.push(`dit contient /${e}/`);
        for (const e of c.attendu.ecran) if (!new RegExp(e, "m").test(r.answer ?? "")) fautes.push(`écran ne vérifie pas /${e}/`);
        if (fautes.length) echecs.push(`${c.id} : ${fautes.join(" ; ")} (dit : « ${dit} »)`);
        else k++;
      } finally {
        memoire.fermer();
      }
    }
  } finally {
    corpus.fermer();
    rmSync(dossierVerifie(sous).chemin, { recursive: true, force: true });
  }
  return { exactitude: intervalleWilson(k, jeu.cas.length), echecs, sousDossier: sous };
}

// Processus séparé (le registre est synchrone) : tsx decisions.ts <jeu.json> → JSON du résultat.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  evaluerDecisions(JeuDecisions.parse(JSON.parse(readFileSync(process.argv[2]!, "utf8"))))
    .then((r) => process.stdout.write(JSON.stringify(r)))
    .catch((e: unknown) => {
      process.stderr.write(`decisions : ${(e as Error).message}\n`);
      process.exit(1);
    });
}

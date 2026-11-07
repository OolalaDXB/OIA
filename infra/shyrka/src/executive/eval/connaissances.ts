import { spawnSync } from "node:child_process";
import { z } from "zod";
import { RACINE_DEPOT } from "../../local.js";
import { intervalleWilson, type Mesure } from "./stats.js";

/**
 * Bancs de la mémoire et de la recherche sourcée (mandat v11, A2, T01, T02).
 * Réels : vrai volume chiffré, un processus par commande (retenir, relancer,
 * rappeler, oublier, restaurer). Faits fictifs, dans un sous-dossier de
 * recette du volume ; la mémoire personnelle n'est pas lue.
 */

export const JeuMemoire = z.object({
  format: z.literal("shyrka.eval.memoire"),
  version: z.literal(1),
  ensemble: z.string(),
  faits: z.array(z.object({ id: z.string(), contenu: z.string(), requete: z.string(), indice: z.string() })).min(1),
  oublier: z.array(z.string()),
});
export const JeuRecherche = z.object({
  format: z.literal("shyrka.eval.recherche"),
  version: z.literal(1),
  ensemble: z.string(),
  cas: z.array(z.object({
    id: z.string(),
    famille: z.enum(["positif", "negatif"]),
    question: z.string(),
    attendu: z.union([z.object({ source: z.string(), rang_max: z.number().int().positive() }), z.object({ aucune_source: z.literal(true) })]),
  })).min(1),
});

function cli(args: string[], env: NodeJS.ProcessEnv = {}): { code: number; sortie: string } {
  const tsx = `${RACINE_DEPOT}/infra/shyrka/node_modules/.bin/tsx`;
  const r = spawnSync(tsx, [`${RACINE_DEPOT}/infra/shyrka/src/executive/cli.ts`, ...args], { cwd: RACINE_DEPOT, encoding: "utf8", env: { ...process.env, ...env }, timeout: 60_000 });
  return { code: r.status ?? -1, sortie: (r.stdout ?? "").trim() };
}

export interface ResultatMemoire {
  rappel: Mesure;
  premierRang: Mesure;
  oublisRespectes: Mesure;
  restaurationEcartee: boolean;
  sousDossier: string;
  processus: number;
}

export function evaluerMemoire(jeu: z.infer<typeof JeuMemoire>): ResultatMemoire {
  const sous = `recette/eval-${Date.now()}`;
  const env = { SHYRKA_MEMOIRE_SOUS_DOSSIER: sous };
  let processus = 0;
  const run = (...a: string[]) => (processus++, cli(["memoire", ...a], env));
  const ids = new Map<string, string>();
  for (const f of jeu.faits) {
    const r = run("retenir", f.contenu);
    ids.set(f.id, (JSON.parse(r.sortie) as { id: string }).id);
  }
  let rappel = 0;
  let premier = 0;
  for (const f of jeu.faits) {
    const lignes = run("chercher", f.requete).sortie.split("\n").filter((l) => l.startsWith("{"));
    const trouves = lignes.map((l) => JSON.parse(l) as { id: string; contenu: string; provenance: string });
    const i = trouves.findIndex((t) => t.id === ids.get(f.id) && t.contenu.includes(f.indice) && Boolean(t.provenance));
    if (i >= 0) rappel++;
    if (i === 0) premier++;
  }
  const sauvegarde = `/Volumes/Shyrka-corpus/${sous}/sauvegarde-eval.json`;
  run("exporter", sauvegarde);
  for (const o of jeu.oublier) run("oublier", ids.get(o)!.slice(0, 8));
  const restauration = run("restaurer", sauvegarde).sortie;
  let respectes = 0;
  for (const o of jeu.oublier) {
    const f = jeu.faits.find((x) => x.id === o)!;
    const s = run("chercher", f.requete).sortie;
    if (!s.includes(ids.get(o)!) && !s.includes(f.indice)) respectes++;
  }
  const ecartes = /"ecartes":\s*(\d+)/.exec(restauration)?.[1];
  return {
    rappel: intervalleWilson(rappel, jeu.faits.length), premierRang: intervalleWilson(premier, jeu.faits.length), oublisRespectes: intervalleWilson(respectes, jeu.oublier.length),
    restaurationEcartee: Number(ecartes ?? -1) >= jeu.oublier.length, sousDossier: sous, processus,
  };
}

export interface ResultatRecherche {
  sourceTrouvee: Mesure;
  sansPreuveRefuse: Mesure;
  referencesCompletes: Mesure;
  echecs: string[];
}

export function evaluerRecherche(jeu: z.infer<typeof JeuRecherche>): ResultatRecherche {
  let trouve = 0, pos = 0, neg = 0, refuse = 0, refs = 0;
  const echecs: string[] = [];
  for (const c of jeu.cas) {
    const s = cli(["cherche", c.question]).sortie;
    const corpus = s.split("\nMémoire :")[0]!;
    // Format de renduExtraits : « - chemin:ligne § section · version <sha> · source du <date> · <statut> ».
    const extraits = [...corpus.matchAll(/^- ([\w./-]+\.md):(\d+) § .*· version ([0-9a-f]{7,}) · source du \d{4}-\d{2}-\d{2}/gm)];
    const chemins = extraits.map((m) => m[1]!);
    if ("source" in c.attendu) {
      pos++;
      const rang = [...new Set(chemins)].indexOf(c.attendu.source);
      if (rang >= 0 && rang < c.attendu.rang_max) trouve++;
      else echecs.push(`${c.id} : source attendue absente du top ${c.attendu.rang_max}`);
      // Référence complète : chaque extrait rendu porte chemin, ligne, version et date de source.
      if (extraits.length && extraits.length === (corpus.match(/^- /gm) ?? []).length) refs++;
    } else {
      neg++;
      if (chemins.length === 0) refuse++;
      else echecs.push(`${c.id} : ${chemins.length} extrait(s) rendus pour une question hors corpus`);
    }
  }
  return { sourceTrouvee: intervalleWilson(trouve, pos), sansPreuveRefuse: intervalleWilson(refuse, neg), referencesCompletes: intervalleWilson(refs, pos), echecs };
}

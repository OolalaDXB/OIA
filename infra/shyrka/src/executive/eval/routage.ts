import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { RACINE_DEPOT } from "../../local.js";
import type { Decision } from "../../contexte.js";
import { envExpurge } from "../verification.js";
import type { Observation, Replique } from "./harnais-routage.js";
import { intervalleWilson, type Mesure } from "./stats.js";

/**
 * Banc du routage des décisions (mandat v11, A2, cas obligatoires de la
 * PR #6). Les réponses attendues ne quittent jamais ce processus : le
 * harnais enfant ne reçoit que les répliques.
 */

const Attendu = z.discriminatedUnion("genre", [
  /** Une liste exacte : les n premières ou dernières décisions de la source, sans appel au modèle. */
  z.object({ genre: z.literal("liste"), depuis: z.enum(["debut", "fin"]), n: z.number().int().positive() }),
  /** Toutes les décisions ouvertes. */
  z.object({ genre: z.literal("liste_complete") }),
  /** L'explication d'une seule décision, nommée par son identifiant. */
  z.object({ genre: z.literal("explication"), id: z.string().regex(/^D\d{2}$/) }),
  /** Tout sauf une liste : question au modèle, explication, ou texte. */
  z.object({ genre: z.literal("pas_liste") }),
]);
export const CasRoutage = z.object({
  id: z.string(),
  famille: z.enum(["positif", "negatif", "adverse", "continuite"]),
  avant: z.array(z.string()).optional(),
  texte: z.string(),
  attendu: Attendu,
  note: z.string().optional(),
});
export type CasRoutage = z.infer<typeof CasRoutage>;
export const JeuRoutage = z.object({ format: z.literal("shyrka.eval.routage"), version: z.literal(1), ensemble: z.enum(["developpement", "regression", "tenu"]), cas: z.array(CasRoutage).min(1) });

export type Genre = "liste" | "explication" | "autre";

/** Ce que la réponse a été, lu dans le texte rendu (format de renduListe et de l'explication). */
export function genreObserve(o: Observation): { genre: Genre; ids: string[] } {
  const lignes = o.reponse.split("\n");
  const ids = lignes.map((l) => /^(D\d{2}) · /.exec(l)?.[1]).filter((x): x is string => Boolean(x));
  if (/^(Décisions ouvertes dans la roadmap \(\d+\) :|.+ de la roadmap \(\d+ sur \d+\) :)$/.test(lignes[0] ?? "") && o.appelsModele === 0) return { genre: "liste", ids };
  if (/^D\d{2} · .+\(roadmap, ligne \d+\)$/.test(lignes[0] ?? "") && o.appelsModele === 1) return { genre: "explication", ids: ids.slice(0, 1) };
  return { genre: "autre", ids: [] };
}

export interface Verdict {
  id: string;
  famille: CasRoutage["famille"];
  correct: boolean;
  attendu: CasRoutage["attendu"]["genre"];
  observe: Genre;
  fauxPositifListe: boolean;
  fauxNegatifListe: boolean;
  appelInutile: boolean;
  intitulesExacts: boolean;
}

/** Note un cas contre la source réelle des décisions (identifiants ET intitulés exacts). */
export function noter(c: CasRoutage, o: Observation, decisions: Decision[]): Verdict {
  const g = genreObserve(o);
  const attendList = c.attendu.genre === "liste" || c.attendu.genre === "liste_complete";
  const ligne = (d: Decision) => `${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})`;
  let attenduIds: string[] = [];
  if (c.attendu.genre === "liste") attenduIds = (c.attendu.depuis === "fin" ? decisions.slice(-c.attendu.n) : decisions.slice(0, c.attendu.n)).map((d) => d.id);
  if (c.attendu.genre === "liste_complete") attenduIds = decisions.map((d) => d.id);
  if (c.attendu.genre === "explication") attenduIds = [c.attendu.id];
  const lignesRendues = o.reponse.split("\n").filter((l) => /^D\d{2} · /.test(l));
  const intitulesExacts = lignesRendues.every((l) => decisions.some((d) => l === ligne(d) || l.startsWith(`${d.id} · ${d.intitule} (roadmap, ligne ${d.ligne})`)));
  let correct: boolean;
  if (attendList) correct = g.genre === "liste" && JSON.stringify(g.ids) === JSON.stringify(attenduIds) && intitulesExacts;
  else if (c.attendu.genre === "explication") correct = g.genre === "explication" && g.ids[0] === c.attendu.id && intitulesExacts;
  else correct = g.genre !== "liste";
  return {
    id: c.id, famille: c.famille, correct, attendu: c.attendu.genre, observe: g.genre,
    fauxPositifListe: !attendList && g.genre === "liste",
    fauxNegatifListe: attendList && g.genre !== "liste",
    appelInutile: attendList && o.appelsModele > 0,
    intitulesExacts,
  };
}

/**
 * Profil du bac à sable de l'évaluation : réseau coupé ; lecture refusée de
 * ~/.oia (où vit le jeu tenu à l'écart et les clés), du volume, de ~/.ssh,
 * du Trousseau et de gh ; écriture seulement dans un dossier jetable.
 */
export function profilEvaluation(ecriture: string): string {
  const h = homedir();
  const q = (p: string) => JSON.stringify(p);
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(allow network* (local unix))",
    "(deny file-write*)",
    `(allow file-write* (subpath ${q(ecriture)}) (literal "/dev/null") (literal "/dev/tty"))`,
    `(deny file-read* (subpath ${q(`${h}/.oia`)}) (subpath "/Volumes/Shyrka-corpus") (subpath ${q(`${h}/.ssh`)}) (subpath ${q(`${h}/Library/Keychains`)}) (subpath ${q(`${h}/.config/gh`)}) (subpath ${q(`${h}/.claude`)}))`,
  ].join("");
}

export interface ResultatBanc {
  ensemble: string;
  code: string;
  n: number;
  correct: number;
  exactitude: Mesure;
  fauxPositifsListe: number;
  fauxNegatifsListe: number;
  appelsInutiles: number;
  parFamille: Record<string, { n: number; correct: number }>;
  verdicts: Verdict[];
  isole: boolean;
  erreur?: string;
}

/**
 * Joue un jeu de cas contre le code de `racineCode` (main par défaut), dans
 * un processus enfant isolé, et note dans ce processus.
 */
export function evaluerRoutage(cas: CasRoutage[], decisions: Decision[], opts: { racineCode?: string; ensemble: string; isoler?: boolean } = { ensemble: "?" }): ResultatBanc {
  const racine = realpathSync(opts.racineCode ?? RACINE_DEPOT);
  const repliques: Replique[] = cas.map((c) => ({ id: c.id, texte: c.texte, ...(c.avant ? { avant: c.avant } : {}) }));
  const jetable = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-eval-")));
  const tsx = join(RACINE_DEPOT, "infra/shyrka/node_modules/.bin/tsx");
  const harnais = join(RACINE_DEPOT, "infra/shyrka/src/executive/eval/harnais-routage.ts");
  const isoler = opts.isoler !== false;
  const cmd = isoler ? "sandbox-exec" : tsx;
  const args = isoler ? ["-p", profilEvaluation(jetable), tsx, harnais, "--code", racine] : [harnais, "--code", racine];
  try {
    const r = spawnSync(cmd, args, { input: JSON.stringify(repliques), encoding: "utf8", env: { ...envExpurge(), TMPDIR: jetable, HOME: jetable }, cwd: jetable, timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
    let obs: Observation[] = [];
    let erreur: string | undefined;
    try {
      obs = JSON.parse(r.stdout) as Observation[];
    } catch {
      erreur = `harnais : code ${r.status}, ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400)}`;
    }
    const parId = new Map(obs.map((o) => [o.id, o]));
    const verdicts = cas.map((c) => noter(c, parId.get(c.id) ?? { id: c.id, reponse: "", appelsModele: 0, erreur: "absent" }, decisions));
    const correct = verdicts.filter((v) => v.correct).length;
    const parFamille: ResultatBanc["parFamille"] = {};
    for (const v of verdicts) {
      const f = (parFamille[v.famille] ??= { n: 0, correct: 0 });
      f.n++;
      if (v.correct) f.correct++;
    }
    return {
      ensemble: opts.ensemble, code: racine, n: cas.length, correct, exactitude: intervalleWilson(correct, cas.length),
      fauxPositifsListe: verdicts.filter((v) => v.fauxPositifListe).length, fauxNegatifsListe: verdicts.filter((v) => v.fauxNegatifListe).length,
      appelsInutiles: verdicts.filter((v) => v.appelInutile).length, parFamille, verdicts, isole: isoler, ...(erreur ? { erreur } : {}),
    };
  } finally {
    rmSync(jetable, { recursive: true, force: true });
  }
}

/**
 * Banc comparatif du prototype (version 2).
 *
 * Huit modes sur les mêmes extraits et les mêmes vecteurs : fts5 (référence
 * actuelle), sqlite-sens (bge-m3, calcul exact), sqlite-combine, sqlite-sens-id, et Postgres
 * mots, sens, combine, sens-id. Mesures par famille : rappel@1, rappel@3, rang
 * réciproque moyen, abstention hors corpus. Les seuils d'abstention sont
 * calibrés sur le jeu de mise au point puis appliqués tels quels au jeu tenu à
 * l'écart, dont seuls les agrégats sont affichés.
 *
 *   bun banc.ts [--public N]
 */
import { SQL } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { jeuOia, jeuPublic, plongements, RACINE, texteAIndexer } from "./corpus.ts";
import { CACHE, DOSSIER, LISTE_PUBLIQUE, ROLE } from "./charger.ts";
import { rechercher, retenir, type Candidat, type ModePg, type Seuils } from "./recherche.ts";
import { referenceSqlite } from "./reference-sqlite.ts";

interface Cas { id: string; famille: string; question: string; source?: string }
type Mode = "fts5" | "sqlite-sens" | "sqlite-combine" | "sqlite-sens-id" | ModePg;
const MODES: Mode[] = ["fts5", "sqlite-sens", "sqlite-combine", "sqlite-sens-id", "mots", "sens", "combine", "sens-id"];

export function jeuMiseAuPoint(): Cas[] {
  const reg = JSON.parse(readFileSync(join(RACINE, "infra/shyrka/executive/eval/recherche.regression.json"), "utf8")) as { cas: { id: string; famille: string; question: string; attendu: { source?: string } }[] };
  const plus = JSON.parse(readFileSync(join(import.meta.dir, "cas.json"), "utf8")) as Cas[];
  const fam = (f: string) => (f === "positif" ? "fr" : f === "negatif" ? "negatif" : f === "paraphrase" ? "fr" : f === "multilingue" ? "autres-langues" : f);
  return [...reg.cas.map((c) => ({ id: c.id, famille: fam(c.famille), question: c.question, source: c.attendu.source })), ...plus.map((c) => ({ ...c, famille: fam(c.famille) }))].filter((c) => c.famille !== "confidentialite");
}

const centile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;
const rangDe = (c: Candidat[], source: string) => c.findIndex((x) => x.source === source) + 1;

/** Seuils qui maximisent la justesse (bonne source dans les 3 premières, ou abstention) sur le jeu donné. */
function calibrer(mode: Mode, cas: Cas[], cands: Candidat[][]): Seuils {
  const cle = mode === "mots" || mode === "fts5" ? "mots" : "sens";
  const valeurs = [...new Set(cands.map((c) => c[0]?.[cle] ?? 0))].sort((a, b) => a - b);
  let meilleur = { s: 0, juste: -1 };
  for (const s of [0, ...valeurs]) {
    const seuils = { sens: cle === "sens" ? s : 0, mots: cle === "mots" ? s : 0 };
    const juste = cas.reduce((n, c, i) => { const r = retenir(mode, cands[i]!, seuils); const rg = c.source ? rangDe(r, c.source) : 0; return n + (c.source ? (rg >= 1 && rg <= 3 ? 1 : 0) : r.length === 0 ? 1 : 0); }, 0);
    if (juste > meilleur.juste) meilleur = { s, juste };
  }
  return { sens: cle === "sens" ? meilleur.s : 0, mots: cle === "mots" ? meilleur.s : 0 };
}

function mesurer(mode: Mode, cas: Cas[], cands: Candidat[][], seuils: Seuils) {
  const parFamille: Record<string, { n: number; r1: number; r3: number; rr: number; abstention?: number }> = {};
  cas.forEach((c, i) => {
    const r = retenir(mode, cands[i]!, seuils);
    const f = (parFamille[c.famille] ??= { n: 0, r1: 0, r3: 0, rr: 0 });
    f.n++;
    if (c.source) { const rg = rangDe(r, c.source); if (rg === 1) f.r1++; if (rg >= 1 && rg <= 3) f.r3++; if (rg >= 1) f.rr += 1 / rg; }
    else f.abstention = (f.abstention ?? 0) + (r.length === 0 ? 1 : 0);
  });
  return Object.fromEntries(Object.entries(parFamille).map(([k, v]) => [k, v.abstention !== undefined ? { n: v.n, abstention: v.abstention } : { n: v.n, rappel1: v.r1, rappel3: v.r3, rrm: +(v.rr / v.n).toFixed(3) }]));
}

async function main() {
  const i = process.argv.indexOf("--public");
  const nPublic = i > 0 ? Number(process.argv[i + 1]) : 0;
  const extraits = [...jeuOia(), ...(nPublic ? jeuPublic(LISTE_PUBLIQUE, nPublic) : [])];
  const vecteurs = await plongements(extraits.map(texteAIndexer), CACHE);
  const sqlite = referenceSqlite(extraits, vecteurs);
  const shyrka = new SQL(ROLE("ke_shyrka"));
  const fichierTenu = join(DOSSIER, "tenu.json");
  const jeux: Record<string, Cas[]> = { mise_au_point: jeuMiseAuPoint(), ...(existsSync(fichierTenu) ? { tenu: JSON.parse(readFileSync(fichierTenu, "utf8")) as Cas[] } : {}) };

  // Calcul du sens d'une question, hors cache (questions uniques) : temps réel.
  const t0 = performance.now();
  for (let k = 0; k < 5; k++) await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", body: JSON.stringify({ model: "bge-m3", input: [`question unique de mesure ${Date.now()} ${k}`], keep_alive: "30m" }) });
  const plongementQuestionMs = Math.round((performance.now() - t0) / 5);

  const resultats: Record<string, Record<string, unknown>> = {};
  const seuilsParMode: Record<string, Seuils> = {};
  const latence: Record<string, { p50: number; p95: number }> = {};
  for (const [nom, cas] of Object.entries(jeux)) {
    const qvs = await plongements(cas.map((c) => c.question), CACHE);
    resultats[nom] = {};
    for (const mode of MODES) {
      const ts: number[] = [];
      const cands: Candidat[][] = [];
      for (const [k, c] of cas.entries()) {
        const t1 = performance.now();
        cands.push(mode === "fts5" || mode.startsWith("sqlite") ? sqlite(mode as "fts5", c.question, qvs[k]!) : await rechercher(shyrka, mode as ModePg, c.question, qvs[k]!));
        ts.push(performance.now() - t1);
      }
      if (nom === "mise_au_point") { seuilsParMode[mode] = calibrer(mode, cas, cands); latence[mode] = { p50: +centile(ts, 50).toFixed(2), p95: +centile(ts, 95).toFixed(2) }; }
      resultats[nom]![mode] = mesurer(mode, cas, cands, seuilsParMode[mode]!);
    }
  }
  await shyrka.close();
  console.log(JSON.stringify({ extraits: extraits.length, publics: nPublic, plongementQuestionMs, seuils: seuilsParMode, latence, resultats }, null, 1));
}

if (import.meta.main) await main();

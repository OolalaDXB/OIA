/**
 * Banc comparatif du prototype : qualité de recherche (source attendue dans
 * les 3 premières, abstention hors corpus), latence (p50, p95) et
 * confidentialité (un agent ne voit jamais « mickael_seulement »), pour
 * quatre modes : SQLite FTS5 (référence actuelle), Postgres lexical,
 * Postgres sémantique (pgvector), Postgres hybride (fusion des rangs).
 *
 *   bun banc.ts natif|docker
 */
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jeuDEssai, plongements, RACINE } from "./corpus.ts";
import { CACHE, VARIANTES, type Variante } from "./charger.ts";

export const SEUIL_SEMANTIQUE = 0.5;
type Mode = "fts5" | "lexical" | "semantique" | "hybride";
interface Resultat { source: string; classification: string; score: number }

const pv = (v: number[]) => `[${v.join(",")}]`;

export async function chercher(db: SQL, mode: Exclude<Mode, "fts5">, q: string, qv: number[], k = 3): Promise<Resultat[]> {
  await db`set hnsw.ef_search = 100`;
  await db`set hnsw.iterative_scan = relaxed_order`;
  if (mode === "lexical")
    return db`select source_id as source, classification, ts_rank_cd(tsv, ke_ou(${q}))::float as score
      from ke.extrait where tsv @@ ke_ou(${q}) order by score desc limit ${k}`;
  if (mode === "semantique")
    return db`select source_id as source, classification, score from (
        select source_id, classification, 1 - (embedding <=> ${pv(qv)}::vector) as score from ke.extrait
        order by embedding <=> ${pv(qv)}::vector limit ${k}) x where score >= ${SEUIL_SEMANTIQUE}`;
  // Hybride : la proximité de sens décide de ce qui est retenu (abstention sous le seuil) ;
  // les mots communs départagent (RRF, k = 60, poids 0,5). Un OU lexical seul ramène du bruit.
  return db`with lex as (
      select id, row_number() over (order by ts_rank_cd(tsv, ke_ou(${q})) desc) as r
      from ke.extrait where tsv @@ ke_ou(${q}) limit 40),
    sem as (
      select id, 1 - (embedding <=> ${pv(qv)}::vector) as sim, row_number() over (order by embedding <=> ${pv(qv)}::vector) as r
      from (select id, embedding from ke.extrait order by embedding <=> ${pv(qv)}::vector limit 40) s),
    fus as (
      select s.id, 1.0 / (60 + s.r) + coalesce(0.5 / (60 + l.r), 0) as rrf, s.sim
      from sem s left join lex l on l.id = s.id)
    select e.source_id as source, e.classification, f.rrf::float as score
    from fus f join ke.extrait e on e.id = f.id
    where f.sim >= ${SEUIL_SEMANTIQUE}
    order by f.rrf desc limit ${k}`;
}

/** Référence : la recherche actuelle du Corpus de Shyrka (FTS5, mots de 3 lettres et plus, OU, bm25). */
function baseFts5() {
  const db = new Database(":memory:");
  db.run("create virtual table x using fts5(corps, titre, source unindexed, classification unindexed, tokenize = 'unicode61 remove_diacritics 2')");
  const ins = db.prepare("insert into x values (?, ?, ?, ?)");
  for (const e of jeuDEssai()) ins.run(e.texte, e.section, e.source, e.classification);
  return (q: string, k = 3): Resultat[] => {
    const mots = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
    if (!mots.length) return [];
    return db.prepare("select source, classification, bm25(x, 1.0, 3.0) as score from x where x match ? order by score limit ?").all(mots.map((m) => `"${m}"`).join(" OR "), k) as Resultat[];
  };
}

interface Cas { id: string; famille: string; question: string; source?: string }
function cas(): Cas[] {
  const reg = JSON.parse(readFileSync(join(RACINE, "infra/shyrka/executive/eval/recherche.regression.json"), "utf8")) as { cas: { id: string; famille: string; question: string; attendu: { source?: string } }[] };
  const plus = JSON.parse(readFileSync(join(import.meta.dir, "cas.json"), "utf8")) as Cas[];
  return [...reg.cas.map((c) => ({ id: c.id, famille: c.famille, question: c.question, source: c.attendu.source })), ...plus];
}

const centile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

async function main() {
  const variante = process.argv[2] as Variante;
  const liste = cas();
  const tq0 = performance.now();
  const qvs = await plongements(liste.map((c) => c.question), CACHE);
  const plongementRequeteMs = Math.round((performance.now() - tq0) / liste.length);
  const shyrka = new SQL(VARIANTES[variante].role("ke_shyrka"));
  const agent = new SQL(VARIANTES[variante].role("ke_agent"));
  const fts = baseFts5();
  const modes: Mode[] = ["fts5", "lexical", "semantique", "hybride"];
  const qualite: Record<string, Record<string, { ok: number; n: number; echecs: string[] }>> = {};
  for (const m of modes) {
    qualite[m] = {};
    for (const [i, c] of liste.entries()) {
      if (c.famille === "confidentialite") continue;
      const r = m === "fts5" ? fts(c.question) : await chercher(shyrka, m, c.question, qvs[i]!);
      const fam = (qualite[m]![c.famille] ??= { ok: 0, n: 0, echecs: [] });
      fam.n++;
      // Une copie synthétique (test de montée en charge) compte pour son document d'origine.
      const ok = c.source ? r.slice(0, 3).some((x) => x.source.replace(/^copie-\d+\//, "") === c.source) : r.length === 0;
      if (ok) fam.ok++;
      else fam.echecs.push(`${c.id}${c.source ? "" : ` (${r.length} résultat(s))`}`);
    }
  }
  // Confidentialité : l'agent ne doit rien voir de « mickael_seulement », dans aucun mode ; Shyrka (modèle local) le retrouve.
  const conf: { mode: string; agentFuites: number; shyrkaTrouve: number; n: number }[] = [];
  for (const m of ["lexical", "semantique", "hybride"] as const) {
    let fuites = 0, trouve = 0, n = 0;
    for (const [i, c] of liste.entries()) {
      if (c.famille !== "confidentialite") continue;
      n++;
      fuites += (await chercher(agent, m, c.question, qvs[i]!, 20)).filter((x) => x.classification === "mickael_seulement").length;
      if ((await chercher(shyrka, m, c.question, qvs[i]!)).some((x) => x.classification === "mickael_seulement")) trouve++;
    }
    conf.push({ mode: m, agentFuites: fuites, shyrkaTrouve: trouve, n });
  }
  // Latence : chaque question 5 fois après échauffement (plongement de la requête mesuré à part).
  const latence: Record<string, { p50: number; p95: number }> = {};
  for (const m of modes) {
    const ts: number[] = [];
    for (let tour = 0; tour < 6; tour++)
      for (const [i, c] of liste.entries()) {
        const t0 = performance.now();
        if (m === "fts5") fts(c.question); else await chercher(shyrka, m, c.question, qvs[i]!);
        if (tour > 0) ts.push(performance.now() - t0);
      }
    latence[m] = { p50: +centile(ts, 50).toFixed(2), p95: +centile(ts, 95).toFixed(2) };
  }
  // Rappel de l'index approché (HNSW) : part des 10 plus proches voisins exacts qu'il retrouve.
  const admin = new SQL(VARIANTES[variante].admin);
  let rappel = 0;
  for (const qv of qvs) {
    await admin`set hnsw.ef_search = 100`;
    // Passage d'origine (une copie synthétique de montée en charge compte pour son passage).
    const approche = [...new Set((await admin`select regexp_replace(source_id, '^copie-[0-9]+/', '') || ':' || ligne as k from ke.extrait order by embedding <=> ${pv(qv)}::vector limit 10`).map((x: { k: string }) => x.k))];
    const exact = await admin.begin(async (tx) => {
      await tx`set local enable_indexscan = off`;
      return [...new Set((await tx`select regexp_replace(source_id, '^copie-[0-9]+/', '') || ':' || ligne as k from ke.extrait order by embedding <=> ${pv(qv)}::vector limit 10`).map((x: { k: string }) => x.k))];
    });
    rappel += exact.filter((k: string) => approche.includes(k)).length / exact.length;
  }
  const rappelHnsw = +(rappel / qvs.length).toFixed(3);
  const [taille] = await admin`select count(*)::int as extraits from ke.extrait`;
  await admin.close();
  await shyrka.close(); await agent.close();
  console.log(JSON.stringify({ variante, extraits: taille.extraits, plongementRequeteMs, rappelHnsw, qualite, confidentialite: conf, latence }, null, 1));
}

if (import.meta.main) await main();

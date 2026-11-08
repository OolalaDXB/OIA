/**
 * Rappel de l'index HNSW contre le calcul exact, selon ef_search (version 2),
 * sur les questions des deux jeux. Puis le cas filtré : un agent qui ne voit
 * qu'un petit compartiment (RLS) doit quand même recevoir ses 10 extraits,
 * ce qui exige iterative_scan (sinon l'index rend 10 voisins, que la RLS écarte).
 * L'index est forcé (enable_seqscan = off) : au-delà d'un certain ef_search,
 * le planificateur préfère le parcours complet, exact mais lent.
 *
 *   bun ef.ts
 */
import { SQL } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plongements } from "./corpus.ts";
import { ADMIN, CACHE, DOSSIER, ROLE } from "./charger.ts";
import { jeuMiseAuPoint } from "./banc.ts";

const fichierTenu = join(DOSSIER, "tenu.json");
const qs = [...jeuMiseAuPoint(), ...(existsSync(fichierTenu) ? (JSON.parse(readFileSync(fichierTenu, "utf8")) as { question: string }[]) : [])].map((c) => c.question);
const qvs = await plongements(qs, CACHE);
const pv = (v: number[]) => `'[${v.join(",")}]'::vector`;
const centile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

const db = new SQL(ADMIN);
const [{ n }] = await db`select count(*)::int as n from ke.extrait`;
const exact: number[][] = [];
const tExact: number[] = [];
for (const qv of qvs)
  exact.push(await db.begin(async (tx) => { await tx`set local enable_indexscan = off`; const t0 = performance.now(); const r = await tx.unsafe(`select id from ke.extrait order by embedding <=> ${pv(qv)} limit 10`); tExact.push(performance.now() - t0); return r.map((x: { id: number }) => Number(x.id)); }));
const lignes: Record<string, unknown>[] = [];
for (const ef of [40, 100, 200, 400, 800]) {
  let rappel = 0;
  const ts: number[] = [];
  for (const [i, qv] of qvs.entries()) {
    const r = await db.begin(async (tx) => { await tx.unsafe(`set local hnsw.ef_search = ${ef}; set local enable_seqscan = off`); const t0 = performance.now(); const x = await tx.unsafe(`select id from ke.extrait order by embedding <=> ${pv(qv)} limit 10`); ts.push(performance.now() - t0); return x.map((y: { id: number }) => Number(y.id)); });
    rappel += exact[i]!.filter((x) => r.includes(x)).length / 10;
  }
  lignes.push({ ef_search: ef, rappel10: +(rappel / qvs.length).toFixed(3), p50_ms: +centile(ts, 50).toFixed(2), p95_ms: +centile(ts, 95).toFixed(2) });
}
await db.close();

// Cas filtré par la RLS : l'agent Visibility.
const agent = new SQL(ROLE("ke_agent_visibility"));
const filtre: Record<string, number> = {};
for (const mode of ["off", "relaxed_order"]) {
  let rendus = 0;
  for (const qv of qvs) rendus += (await agent.begin(async (tx) => { await tx.unsafe(`set local hnsw.ef_search = 100; set local hnsw.iterative_scan = ${mode}`); return tx.unsafe(`select id from ke.extrait order by embedding <=> ${pv(qv)} limit 10`); })).length;
  filtre[`iterative_scan_${mode}_extraits_rendus_sur_10`] = +(rendus / qvs.length).toFixed(2);
}
await agent.close();
console.log(JSON.stringify({ extraits: n, questions: qs.length, exact_p50_ms: +centile(tExact, 50).toFixed(1), hnsw: lignes, agent_visibility: filtre }, null, 1));

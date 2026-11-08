// Rappel et latence de l'index HNSW selon ef_search (passage d'origine), variante native.
import { SQL } from "bun";
import { plongements } from "./corpus.ts";
import { CACHE, VARIANTES } from "./charger.ts";
const qs = (await Bun.file(new URL("./cas.json", import.meta.url)).json()).map((c: { question: string }) => c.question);
const qvs = await plongements(qs, CACHE);
const db = new SQL(VARIANTES[(process.argv[2] ?? "natif") as "natif"].admin);
const k = "regexp_replace(source_id, '^copie-[0-9]+/', '') || ':' || ligne";
const exact: string[][] = [];
for (const qv of qvs) exact.push(await db.begin(async (tx) => { await tx`set local enable_indexscan = off`; return [...new Set((await tx.unsafe(`select ${k} as k from ke.extrait order by embedding <=> '[${qv.join(",")}]'::vector limit 10`)).map((x: { k: string }) => x.k))]; }));
for (const ef of [40, 100, 400, 1000]) {
  let rappel = 0; const ts: number[] = [];
  for (const [i, qv] of qvs.entries()) {
    const r = await db.begin(async (tx) => { await tx.unsafe(`set local hnsw.ef_search = ${ef}`); const t0 = performance.now(); const x = await tx.unsafe(`select ${k} as k from ke.extrait order by embedding <=> '[${qv.join(",")}]'::vector limit 10`); ts.push(performance.now() - t0); return x; });
    const a = [...new Set(r.map((x: { k: string }) => x.k))];
    rappel += exact[i]!.filter((x) => a.includes(x)).length / exact[i]!.length;
  }
  ts.sort((a, b) => a - b);
  console.log(`ef_search ${ef} : rappel ${(rappel / qvs.length).toFixed(2)} · latence p50 ${ts[Math.floor(ts.length / 2)]!.toFixed(2)} ms`);
}
const t0 = performance.now(); await db.begin(async (tx) => { await tx`set local enable_indexscan = off`; for (const qv of qvs) await tx.unsafe(`select id from ke.extrait order by embedding <=> '[${qv.join(",")}]'::vector limit 10`); });
console.log(`recherche exacte (sans index) : ${((performance.now() - t0) / qvs.length).toFixed(1)} ms par requête`);
await db.close();

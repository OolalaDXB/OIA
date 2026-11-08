/**
 * Charge le jeu d'essai dans une variante (natif ou Docker) et mesure chaque
 * étape. `--facteur N` ajoute N copies synthétiques de chaque extrait interne
 * (vecteur légèrement bruité, source distincte) pour simuler la croissance.
 *
 *   bun charger.ts natif|docker [--facteur 40]
 */
import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jeuDEssai, plongements, texteAIndexer, type Extrait } from "./corpus.ts";

export const VARIANTES = {
  natif: { admin: "postgres://postgres@127.0.0.1:56432/postgres", role: (r: string) => `postgres://${r}:essai@127.0.0.1:56432/postgres` },
  docker: { admin: "postgres://supabase_admin:essai-local@127.0.0.1:56433/postgres", role: (r: string) => `postgres://${r}:essai@127.0.0.1:56433/postgres` },
} as const;
export type Variante = keyof typeof VARIANTES;

export const DROITS = [
  // Shyrka locale : tous les compartiments, modèle local (peut lire « mickael_seulement »).
  { role: "ke_shyrka", compartiments: ["oia", "shyrka", "interface", "visibility", "personnel"], modele_externe: false },
  // Un agent alimentant un modèle externe : compartiments limités, jamais le privé.
  { role: "ke_agent", compartiments: ["oia", "interface", "visibility", "personnel"], modele_externe: true },
];

export const CACHE = join(process.env.KE_DOSSIER ?? "/tmp", "plongements-bge-m3.json");

async function main() {
  const variante = process.argv[2] as Variante;
  if (!VARIANTES[variante]) throw new Error("usage : bun charger.ts natif|docker [--facteur N]");
  const i = process.argv.indexOf("--facteur");
  const facteur = i > 0 ? Number(process.argv[i + 1]) : 0;
  const db = new SQL(VARIANTES[variante].admin);
  const t: Record<string, number> = {};
  const chrono = async <T>(nom: string, fn: () => Promise<T>) => { const t0 = performance.now(); const r = await fn(); t[nom] = Math.round(performance.now() - t0); return r; };

  const extraits = jeuDEssai();
  const vecteurs = await chrono("plongements_ms", () => plongements(extraits.map(texteAIndexer), CACHE));
  await chrono("schema_ms", () => db.unsafe(readFileSync(join(import.meta.dir, "schema.sql"), "utf8")));
  for (const d of DROITS) await db`insert into ke.droits ${db(d)}`;

  // Sources et extraits ; les copies synthétiques simulent un corpus N fois plus grand.
  const lignes: (Extrait & { vec: number[] })[] = extraits.map((e, k) => ({ ...e, vec: vecteurs[k]! }));
  for (let c = 1; c <= facteur; c++)
    extraits.forEach((e, k) => {
      if (e.classification === "interne") lignes.push({ ...e, source: `copie-${c}/${e.source}`, vec: vecteurs[k]!.map((x) => x + (Math.random() - 0.5) * 0.02) });
    });

  await chrono("insertion_ms", async () => {
    const sources = new Map<string, Extrait>();
    for (const e of lignes) if (!sources.has(e.source)) sources.set(e.source, e);
    const ls = [...sources.values()].map((e) => ({ id: e.source, connecteur: e.source.startsWith("fictif/") ? "fichiers" : "depot-git", uri: `oia://${e.source}`, compartiment: e.compartiment, classification: e.classification, version: e.version, date_source: e.dateSource }));
    for (let k = 0; k < ls.length; k += 500) await db`insert into ke.source ${db(ls.slice(k, k + 500))}`;
    // Index construits après l'insertion (plus rapide) : on les retire, on insère, on les recrée.
    await db.unsafe("drop index ke.extrait_embedding; drop index ke.extrait_tsv;");
    for (let k = 0; k < lignes.length; k += 400) {
      const lot = lignes.slice(k, k + 400).map((e) => ({ source_id: e.source, compartiment: e.compartiment, classification: e.classification, section: e.section, ligne: e.ligne, texte: e.texte, embedding: `[${e.vec.join(",")}]`, date_source: e.dateSource }));
      await db`insert into ke.extrait ${db(lot)}`;
    }
  });
  await chrono("index_lexical_ms", () => db.unsafe("create index extrait_tsv on ke.extrait using gin (tsv)"));
  await chrono("index_vectoriel_ms", () => db.unsafe("create index extrait_embedding on ke.extrait using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64)"));
  await db.unsafe("analyze ke.extrait; analyze ke.source; checkpoint;");
  const [taille] = await db`select (select count(*) from ke.extrait)::int as extraits, (select count(*) from ke.source)::int as sources,
    pg_total_relation_size('ke.extrait') as total, pg_relation_size('ke.extrait') as table_seule,
    pg_relation_size('ke.extrait_embedding') as hnsw, pg_relation_size('ke.extrait_tsv') as gin, pg_database_size(current_database()) as base`;
  await db.close();
  console.log(JSON.stringify({ variante, facteur, ...taille, ...t }));
}

if (import.meta.main) await main();

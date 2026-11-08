/**
 * Charge le jeu d'essai (version 2) dans PostgreSQL natif et mesure toute la
 * chaîne : découpage, calcul du sens (bge-m3 local, hors cache pour les textes
 * nouveaux), insertion, index. `--public N` ajoute N extraits de documentation
 * publique distincte (montée en charge réaliste, distracteurs).
 *
 *   bun charger.ts [--public 30000]
 */
import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jeuOia, jeuPublic, plongements, texteAIndexer, type Extrait } from "./corpus.ts";

export const ADMIN = "postgres://postgres@127.0.0.1:56432/postgres";
export const ROLE = (r: string) => `postgres://${r}:essai@127.0.0.1:56432/postgres`;
export const DOSSIER = process.env.KE_DOSSIER ?? "/tmp";
export const CACHE = join(DOSSIER, "plongements-bge-m3.sqlite");
export const LISTE_PUBLIQUE = join(DOSSIER, "documents-publics.txt");

export const DROITS = [
  // Shyrka locale : tous les compartiments ; modèle local, peut lire « mickael_seulement ».
  { role: "ke_shyrka", compartiments: ["oia", "shyrka", "interface", "visibility", "personnel", "public"], modele_externe: false },
  // Agent qui alimente un modèle externe : jamais le privé, même dans un compartiment accordé.
  { role: "ke_agent", compartiments: ["oia", "interface", "visibility", "personnel", "public"], modele_externe: true },
  // Agent de module : Visibility seulement.
  { role: "ke_agent_visibility", compartiments: ["visibility"], modele_externe: false },
];

async function main() {
  const i = process.argv.indexOf("--public");
  const nPublic = i > 0 ? Number(process.argv[i + 1]) : 0;
  const db = new SQL(ADMIN);
  const t: Record<string, number> = {};
  const chrono = async <T>(nom: string, fn: () => T | Promise<T>) => { const t0 = performance.now(); const r = await fn(); t[nom] = Math.round(performance.now() - t0); return r; };

  const extraits: Extrait[] = await chrono("decoupage_ms", () => [...jeuOia(), ...(nPublic ? jeuPublic(LISTE_PUBLIQUE, nPublic) : [])]);
  const vecteurs = await chrono("plongements_ms", () => plongements(extraits.map(texteAIndexer), CACHE));
  await chrono("schema_ms", () => db.unsafe(readFileSync(join(import.meta.dir, "schema.sql"), "utf8")));
  for (const d of DROITS) await db`insert into ke.droits ${db(d)}`;
  await chrono("insertion_ms", async () => {
    const sources = new Map<string, Extrait>();
    for (const e of extraits) if (!sources.has(e.source)) sources.set(e.source, e);
    const connecteur = (s: string) => (s.startsWith("fictif/") ? "fichiers" : s.startsWith("public/") ? "public" : "depot-git");
    const ls = [...sources.values()].map((e) => ({ id: e.source, connecteur: connecteur(e.source), uri: `oia://${e.source}`, compartiment: e.compartiment, classification: e.classification, version: e.version, date_source: e.dateSource }));
    for (let k = 0; k < ls.length; k += 500) await db`insert into ke.source ${db(ls.slice(k, k + 500))}`;
    await db.unsafe("drop index ke.extrait_embedding; drop index ke.extrait_tsv_fr; drop index ke.extrait_tsv_simple; drop index ke.extrait_identifiants;");
    for (let k = 0; k < extraits.length; k += 400) {
      const lot = extraits.slice(k, k + 400).map((e, j) => ({ source_id: e.source, compartiment: e.compartiment, classification: e.classification, titre: e.titre, section: e.section, ligne: e.ligne, texte: e.texte, identifiants: `{${e.identifiants.map((x) => `"${x.replace(/"/g, "")}"`).join(",")}}`, embedding: `[${vecteurs[k + j]!.join(",")}]`, date_source: e.dateSource }));
      await db`insert into ke.extrait ${db(lot)}`;
    }
  });
  await chrono("index_lexical_ms", () => db.unsafe("create index extrait_tsv_fr on ke.extrait using gin (tsv_fr); create index extrait_tsv_simple on ke.extrait using gin (tsv_simple); create index extrait_identifiants on ke.extrait using gin (identifiants);"));
  await chrono("index_vectoriel_ms", () => db.unsafe("create index extrait_embedding on ke.extrait using hnsw (embedding vector_cosine_ops) with (m = 24, ef_construction = 200)"));
  await db.unsafe("analyze ke.extrait; analyze ke.source; checkpoint;");
  const [taille] = await db`select (select count(*) from ke.extrait)::int as extraits, (select count(*) from ke.source)::int as sources,
    (select count(*) from ke.extrait where compartiment = 'public')::int as extraits_publics,
    pg_total_relation_size('ke.extrait')::bigint as total, pg_relation_size('ke.extrait_embedding')::bigint as hnsw, pg_database_size(current_database())::bigint as base`;
  await db.close();
  console.log(JSON.stringify({ ...taille, ...t, extraits_par_seconde_bout_en_bout: Math.round(extraits.length / ((t.decoupage_ms! + t.plongements_ms! + t.insertion_ms! + t.index_lexical_ms! + t.index_vectoriel_ms!) / 1000)) }));
}

if (import.meta.main) await main();

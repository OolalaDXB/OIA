/**
 * Recherche du prototype (version 2), trois modes mesurés séparément :
 *
 *   mots     plein texte Postgres, français (racines) et neutre (sans racines,
 *            utile à l'anglais, au russe et aux termes techniques), mots reliés par OU ;
 *   sens     vecteurs bge-m3, index HNSW ;
 *   combine  canal des identifiants exacts d'abord (ml_toutes_v1, D07…),
 *            puis fusion des rangs (RRF) du sens et des mots ;
 *   sens-id  canal des identifiants exacts, puis le sens seul (sans les mots,
 *            trop bruyants sans pondération IDF dans Postgres).
 *
 * Les droits (RLS) filtrent AVANT le classement : la connexion porte le rôle.
 * Les résultats sont regroupés par document (meilleur extrait de chaque
 * document). Les seuils d'abstention sont appliqués par l'appelant, calibrés
 * sur le jeu de mise au point.
 */
import type { SQL } from "bun";
import { identifiants } from "./corpus.ts";

export type ModePg = "mots" | "sens" | "combine" | "sens-id";
export interface Candidat {
  source: string;
  classification: string;
  score: number;      // score du mode (rang fusionné pour « combine »)
  sens: number;       // proximité de sens du meilleur extrait (0 si inconnu)
  mots: number;       // score lexical du meilleur extrait (0 si aucun mot commun)
  identifiant: boolean; // un identifiant de la question figure dans l'extrait
}

const pv = (v: number[]) => `[${v.join(",")}]`;
const POIDS_MOTS = 0.35;
const K_RRF = 60;

/** Identifiants exacts de la question (même règle qu'à l'indexation). */
export const identifiantsQuestion = (q: string) => identifiants(q);

export async function rechercher(db: SQL, mode: ModePg, q: string, qv: number[], k = 10): Promise<Candidat[]> {
  await db`set hnsw.ef_search = 200`;
  await db`set hnsw.iterative_scan = relaxed_order`;
  const ids = identifiantsQuestion(q);
  const lignes = (await db`
    with mots as (
      select id, greatest(ts_rank_cd(tsv_fr, coalesce(ke_ou('french', ${q}), ''::tsquery)), ts_rank_cd(tsv_simple, coalesce(ke_ou('simple', ${q}), ''::tsquery))) as s
      from ke.extrait
      where ${mode === "mots" || mode === "combine"} and (tsv_fr @@ ke_ou('french', ${q}) or tsv_simple @@ ke_ou('simple', ${q}))
      order by s desc limit 60),
    mr as (select id, s, row_number() over (order by s desc) as r from mots),
    sens as (
      select id, 1 - (embedding <=> ${pv(qv)}::vector) as s
      from ke.extrait where ${mode !== "mots"}
      order by embedding <=> ${pv(qv)}::vector limit 60),
    sr as (select id, s, row_number() over (order by s desc) as r from sens),
    ident as (
      select id from ke.extrait where ${(mode === "combine" || mode === "sens-id") && ids.length > 0} and identifiants && ${`{${ids.map((x) => `"${x}"`).join(",")}}`}::text[]
      order by embedding <=> ${pv(qv)}::vector limit 60),
    cand as (select id from mr union select id from sr union select id from ident)
    select e.source_id as source, e.classification,
      coalesce(sr.s, 0)::float as sens, coalesce(mr.s, 0)::float as mots, (i.id is not null) as identifiant,
      (case ${mode}::text
        when 'mots' then coalesce(mr.s, 0)
        when 'sens' then coalesce(sr.s, 0)
        else (case when i.id is not null then 1 else 0 end) + coalesce(1.0 / (${K_RRF} + sr.r), 0) + coalesce(${POIDS_MOTS} / (${K_RRF} + mr.r), 0)
      end)::float as score
    from cand c join ke.extrait e on e.id = c.id
    left join mr on mr.id = c.id left join sr on sr.id = c.id left join ident i on i.id = c.id`) as Candidat[];
  // Un document = son meilleur extrait.
  const parDoc = new Map<string, Candidat>();
  for (const l of lignes) {
    const d = parDoc.get(l.source);
    if (!d) parDoc.set(l.source, { ...l });
    else {
      if (l.score > d.score) d.score = l.score;
      d.sens = Math.max(d.sens, l.sens);
      d.mots = Math.max(d.mots, l.mots);
      d.identifiant ||= l.identifiant;
    }
  }
  return [...parDoc.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

export interface Seuils {
  sens: number;  // proximité minimale du meilleur document pour répondre (modes sens et combine)
  mots: number;  // score lexical minimal (mode mots)
}

/** Résultats retenus après abstention : rien si le meilleur document n'atteint pas le seuil (sauf identifiant exact). */
export function retenir(mode: ModePg | "fts5" | "sqlite-sens" | "sqlite-combine" | "sqlite-sens-id", c: Candidat[], s: Seuils): Candidat[] {
  if (!c.length) return [];
  const haut = c[0]!;
  const ok = mode === "mots" || mode === "fts5" ? haut.mots >= s.mots : haut.identifiant || haut.sens >= s.sens;
  return ok ? c : [];
}

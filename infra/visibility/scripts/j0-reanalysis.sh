#!/usr/bin/env bash
# Réanalyse des réponses complètes d'une fenêtre (src/j0-reanalysis.ts), en
# LECTURE SEULE : session Postgres default_transaction_read_only=on, aucun
# changement dans Elmo, aucun appel à un fournisseur d'IA.
#
#   ./scripts/j0-reanalysis.sh <subjectId> [concurrents.yaml]
#
# Sortie hors du dépôt (données de client) : ~/oia-visibility-data/<sujet>/
# reanalyse-<date>.md, plus l'exportation brute à côté.
# OIA_VIS_REANALYSIS_EXPORT=<fichier> remplace la lecture d'Elmo (tests).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-reanalysis.sh <subjectId> [concurrents.yaml]" >&2; exit 2; }
candidates="${2:-}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
mkdir -p "$data/$subject"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tsx="$VIS_ROOT/node_modules/.bin/tsx"

export_file="${OIA_VIS_REANALYSIS_EXPORT:-}"
if [ -z "$export_file" ]; then
  export_file="$data/$subject/reanalyse-export-$stamp.json"
  elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
    psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 -v sid="$subject" > "$export_file" <<'SQL'
select json_build_object(
  'exportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'runs', coalesce((select json_agg(json_build_object(
      'id', r.id, 'model', r.model, 'version', r.version,
      'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'promptValue', p.value, 'promptTags', p.tags,
      'text', x.text_content,
      'brandMentioned', m.brand_mentioned,
      'citations', coalesce((select array_agg(c.url order by c.citation_index) from citations c where c.prompt_run_id = r.id), '{}')
    ) order by r.created_at)
    from prompt_runs r
    join prompts p on p.id = r.prompt_id
    left join run_extractions x on x.run_id = r.id
    left join run_mentions m on m.run_id = r.id
    where r.brand_id = :'sid'), '[]'::json)
);
SQL
fi

# Liens de redirection de Gemini → vrais sites (src/redirects.ts : safeFetch, sans suivre,
# cache hors du dépôt). OIA_VIS_NO_RESOLVE=1 : aucune requête réseau.
cache="$data/$subject/redirects-cache.json"
if [ -z "${OIA_VIS_NO_RESOLVE:-}" ]; then "$tsx" "$VIS_ROOT/src/redirects.ts" "$export_file" "$cache" || echo "résolution des redirections en échec : liens laissés tels quels" >&2; fi
out="$data/$subject/reanalyse-$stamp.md"
"$tsx" "$VIS_ROOT/src/j0-reanalysis.ts" "$subject" "$export_file" "${candidates:-/dev/null}" "$cache" > "$out"
echo "$out"

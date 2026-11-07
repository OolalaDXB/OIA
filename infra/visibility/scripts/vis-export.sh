#!/usr/bin/env bash
# Exporte les données d'Elmo pour un sujet, en LECTURE SEULE, puis construit
# visibility.json au format du prototype (src/vis-export.ts).
#
#   ./scripts/vis-export.sh <subjectId> [fichier de sortie]
#
# Lecture seule : la session Postgres est ouverte avec
# default_transaction_read_only=on (toute écriture serait refusée par
# Postgres) ; aucun rôle ni aucun schéma d'Elmo n'est modifié ; aucun appel à
# un fournisseur d'IA. Sortie par défaut : ~/oia-visibility-data/<sujet>/
# visibility.json, hors du dépôt (données de client, jamais commitées).
# OIA_VIS_ELMO_EXPORT=<fichier> remplace la lecture d'Elmo par une
# exportation déjà faite (tests, exportation fictive).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: vis-export.sh <subjectId> [sortie]" >&2; exit 2; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
out="${2:-$data/$subject/visibility.json}"
mkdir -p "$(dirname "$out")"
tsx="$VIS_ROOT/node_modules/.bin/tsx"

export_file="${OIA_VIS_ELMO_EXPORT:-}"
if [ -z "$export_file" ]; then
  export_file="$(mktemp "${TMPDIR:-/tmp}/elmo-export.XXXXXX")"
  trap 'rm -f "$export_file"' EXIT
  # Identifiant du sujet passé en variable psql (:'sid'), jamais collé dans le SQL.
  elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
    psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 -v sid="$subject" > "$export_file" <<'SQL'
select json_build_object(
  'exportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'brand', (select json_build_object('id', id, 'name', name, 'website', website) from brands where id = :'sid'),
  'competitors', coalesce((select json_agg(json_build_object('name', name) order by name) from competitors where brand_id = :'sid'), '[]'::json),
  'prompts', coalesce((select json_agg(json_build_object('id', id, 'value', value, 'enabled', enabled, 'tags', tags) order by created_at) from prompts where brand_id = :'sid'), '[]'::json),
  'runs', coalesce((select json_agg(json_build_object(
      'id', r.id, 'promptId', r.prompt_id, 'model', r.model, 'version', r.version,
      'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'brandMentioned', m.brand_mentioned,
      'competitorsMentioned', coalesce(m.competitors_mentioned, '{}'),
      'citedDomains', coalesce((select array_agg(distinct c.domain) from citations c where c.prompt_run_id = r.id and c.domain is not null), '{}')
    ) order by r.created_at)
    from prompt_runs r left join run_mentions m on m.run_id = r.id
    where r.brand_id = :'sid'), '[]'::json),
  'failed', coalesce((select json_agg(json_build_object('model', model, 'count', n)) from
      (select model, count(*) as n from usage_events where brand_id = :'sid' and event_type = 'prompt_run_failed' group by model) f), '[]'::json)
);
SQL
fi

# Journal tenu par cost-guard.sh (même emplacement que lui).
"$tsx" "$VIS_ROOT/src/vis-export.ts" "$subject" "$export_file" "$data/cost-journal.csv" > "$out.tmp"
mv "$out.tmp" "$out"
echo "$out"

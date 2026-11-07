#!/usr/bin/env bash
# Exportation complète d'une fenêtre depuis Elmo (pour src/j0-evidence.ts), en
# LECTURE SEULE (default_transaction_read_only=on) : réponses complètes,
# versions servies, compteurs, citations, jugement de Jev, échecs. JSON sur stdout.
#   ./scripts/j0-export.sh <subjectId>
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-export.sh <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
started="$(cat "$data/$window/started-at.txt" 2>/dev/null || true)"
[ -n "$started" ] || { echo "début de fenêtre inconnu : $data/$window/started-at.txt absent" >&2; exit 1; }
days="${OIA_VIS_WINDOW_DAYS:-5}"
elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
  psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 -v sid="$subject" -v started="$started" -v days="$days" <<'SQL'
select json_build_object(
  'exportedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'subjectId', :'sid',
  'startedAt', :'started',
  'days', (:'days')::int,
  'runs', coalesce((select json_agg(json_build_object(
      'id', r.id, 'promptTags', p.tags, 'model', r.model, 'provider', r.provider, 'version', r.version,
      'webSearch', r.web_search_enabled,
      'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'text', x.text_content,
      'usage', r.raw_output->'usage',
      'searchItems', (select count(*) from json_array_elements(case
          when json_typeof(r.raw_output->'output')='array' then r.raw_output->'output'
          when json_typeof(r.raw_output->'outputs')='array' then r.raw_output->'outputs'
          else '[]'::json end) e
        where e->>'type'='web_search_call' or (e->>'type'='tool.execution' and e->>'name'='web_search')),
      'citations', coalesce((select array_agg(c.url order by c.citation_index) from citations c where c.prompt_run_id = r.id), '{}'),
      'brandMentioned', m.brand_mentioned,
      'competitorsMentioned', coalesce(m.competitors_mentioned, '{}')
    ) order by r.created_at)
    from prompt_runs r
    join prompts p on p.id = r.prompt_id
    left join run_extractions x on x.run_id = r.id
    left join run_mentions m on m.run_id = r.id
    where r.brand_id = :'sid'), '[]'::json),
  'failed', coalesce((select json_agg(json_build_object('model', model,
      'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by created_at)
    from usage_events where brand_id = :'sid' and event_type = 'prompt_run_failed'), '[]'::json)
);
SQL

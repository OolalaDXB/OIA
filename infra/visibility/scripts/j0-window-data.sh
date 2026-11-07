#!/usr/bin/env bash
# Données d'une fenêtre en cours, pour src/window-watch.ts : runs réussis et
# échoués par moteur, versions servies, nombre de questions actives.
# LECTURE SEULE (session Postgres default_transaction_read_only=on) ; ne
# démarre, n'arrête ni ne modifie Elmo. JSON sur stdout.
#   ./scripts/j0-window-data.sh <subjectId>
# Début : ~/oia-visibility-data/<fenêtre>/started-at.txt (écrit par j0-launch.sh).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-window-data.sh <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
started="$(cat "$data/$window/started-at.txt" 2>/dev/null || true)"
[ -n "$started" ] || { echo "début de fenêtre inconnu : $data/$window/started-at.txt absent" >&2; exit 1; }
days="${OIA_VIS_WINDOW_DAYS:-5}"
engines="$(node -e 'const t=process.argv[1].split(",").filter(Boolean).map(x=>x.split(":")[0]);process.stdout.write(JSON.stringify(t))' \
  "$(awk -F= '$1=="SCRAPE_TARGETS"{print substr($0,16); exit}' "$ELMO_ENV_FILE")")"
elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
  psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 -v sid="$subject" -v started="$started" -v days="$days" -v engines="$engines" <<'SQL'
select json_build_object(
  'now', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'startedAt', :'started',
  'days', (:'days')::int,
  'engines', (:'engines')::json,
  'prompts', (select count(*) from prompts where brand_id = :'sid' and enabled),
  'runs', coalesce((select json_agg(json_build_object('model', model, 'version', version,
      'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by created_at)
    from prompt_runs where brand_id = :'sid' and created_at >= (:'started')::timestamptz), '[]'::json),
  'failed', coalesce((select json_agg(json_build_object('model', model,
      'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) order by created_at)
    from usage_events where brand_id = :'sid' and event_type = 'prompt_run_failed' and created_at >= (:'started')::timestamptz), '[]'::json)
);
SQL

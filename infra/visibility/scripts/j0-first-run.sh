#!/usr/bin/env bash
# Contrôle du premier run de chaque moteur après le lancement d'une fenêtre.
# Lecture seule : ne démarre, n'arrête et ne modifie rien ; aucun appel à un
# fournisseur d'IA. N'affiche aucune valeur de elmo/.env.
#
#   ./scripts/j0-first-run.sh <subjectId>
#
# Par moteur : runs réussis et échoués, version servie, coût estimé par Elmo,
# coût selon la grille de prix (src/cost-grid.ts), réponses jugées par Jev,
# erreurs du worker. Écrit aussi le résultat dans ~/oia-visibility-data/<fenêtre>/.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-first-run.sh <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data/$window"
out="$data/$window/first-run-$(date -u +%Y%m%dT%H%M%SZ).txt"
sql() { elmo_dc exec -T postgres psql -U elmo -d elmo -tA -F ' | ' -c "$1" 2>/dev/null; }
brand="$(sql "select id from brands where id = '$subject'" | tr -d '[:space:]')"
[ -n "$brand" ] || { echo "marque $subject absente d'Elmo" >&2; exit 1; }

{
  echo "# Premier run · $window · $subject · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Début de fenêtre : $(cat "$data/$window/started-at.txt" 2>/dev/null || echo inconnu)"
  echo
  echo "## Runs par moteur (modèle | fournisseur | réussis | version(s) servie(s) | estimation Elmo $)"
  sql "select r.model, r.provider, count(*), string_agg(distinct r.version, ', '),
         coalesce((select round(sum(u.estimated_cost_usd)::numeric, 4) from usage_events u
                   where u.brand_id = r.brand_id and u.model = r.model and u.event_type = 'prompt_run'), 0)
       from prompt_runs r where r.brand_id = '$brand' group by r.brand_id, r.model, r.provider order by r.model"
  echo
  echo "## Échecs par moteur (modèle | fournisseur | échecs)"
  sql "select model, provider, count(*) from usage_events where brand_id = '$brand' and event_type = 'prompt_run_failed' group by model, provider order by model" | sed 's/^$/aucun/'
  echo
  echo "## Coût selon la grille de prix, par moteur"
  for model in $(sql "select distinct model from prompt_runs where brand_id = '$brand' union select distinct model from usage_events where brand_id = '$brand' and event_type = 'prompt_run_failed'" | sort -u); do
    lines="$(elmo_dc exec -T postgres psql -U elmo -d elmo -tAc "
      select json_build_object('kind','run','provider',provider,'version',version,'webSearch',web_search_enabled,
        'usage',raw_output->'usage',
        'searchItems',(select count(*) from json_array_elements(case
            when json_typeof(raw_output->'output')='array' then raw_output->'output'
            when json_typeof(raw_output->'outputs')='array' then raw_output->'outputs'
            else '[]'::json end) e
          where e->>'type'='web_search_call' or (e->>'type'='tool.execution' and e->>'name'='web_search')))::text
      from prompt_runs where brand_id = '$brand' and model = '$model'
      union all
      select json_build_object('kind','failed','provider',provider,'count',count(*))::text
      from usage_events where brand_id = '$brand' and model = '$model' and event_type = 'prompt_run_failed' group by provider" 2>/dev/null)"
    cost="$(printf '%s\n' "$lines" | "$tsx" "$VIS_ROOT/src/cost-grid.ts" 2>&1)" || true
    echo "$model : $cost"
  done
  echo
  echo "## Jev (réponses jugées / runs)"
  sql "select r.model, count(m.run_id) filter (where m.assessments is not null), count(*)
       from prompt_runs r left join run_mentions m on m.run_id = r.id where r.brand_id = '$brand' group by r.model order by r.model"
  echo
  echo "## Erreurs du worker (30 dernières lignes contenant error, sans valeur de .env)"
  elmo_dc logs --no-color --tail 2000 worker 2>/dev/null | grep -iE 'error|failed|refus|401|402|403|429' | grep -viE 'key=|bearer|sk-' | tail -30 || echo "aucune"
  echo
  echo "## Onboarding Mistral"
  echo "La marque est créée par l'API : aucun onboarding, aucune analyse « Opportunités »"
  echo "n'est déclenchée. Le modèle d'onboarding (mistral-large-latest, codé en dur dans"
  echo "Elmo 0.7.7) n'est donc appelé que si quelqu'un utilise l'assistant ou Opportunités."
} | tee "$out"
echo
echo "Écrit dans $out"

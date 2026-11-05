#!/usr/bin/env bash
# Relevé d'un jour de fenêtre de mesure (jour UTC, défaut aujourd'hui) : nombre
# de réponses par sujet (marque Elmo) et par cible (modèle, fournisseur, version,
# recherche web), et cibles attendues sans réponse. Ajouté au journal (hors repo).
# Un jour sans run est consigné tel quel, jamais comblé.
#   ./scripts/window-day.sh [YYYY-MM-DD]
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env "$ELMO_ENV_FILE"
day="${1:-$(date -u +%Y-%m-%d)}"
[[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "date attendue : YYYY-MM-DD" >&2; exit 2; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data/window"
out="$data/window/$day.txt"
{
  echo "# Jour $day (UTC) — relevé $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "## Réponses par sujet et par cible"
  elmo_dc exec -T postgres psql -U elmo -d elmo -P pager=off -c "
    select b.slug as sujet, r.model, coalesce(r.provider,'') as fournisseur, r.version, r.web_search_enabled as web,
           count(*) as reponses, count(distinct r.prompt_id) as questions
    from prompt_runs r join brands b on b.id = r.brand_id
    where r.created_at >= '$day'::date and r.created_at < '$day'::date + 1
    group by 1,2,3,4,5 order by 1,2,3;"
  echo "## Questions actives sans aucune réponse ce jour (par sujet)"
  elmo_dc exec -T postgres psql -U elmo -d elmo -P pager=off -c "
    select b.slug as sujet, count(*) as questions_sans_reponse
    from prompts p join brands b on b.id = p.brand_id
    where p.enabled and b.enabled and not exists (
      select 1 from prompt_runs r where r.prompt_id = p.id
        and r.created_at >= '$day'::date and r.created_at < '$day'::date + 1)
    group by 1 order by 1;"
  echo "## Coût estimé Elmo ce jour, par fournisseur / modèle"
  elmo_dc exec -T postgres psql -U elmo -d elmo -P pager=off -c "
    select coalesce(provider,'') as fournisseur, coalesce(model,'') as modele, event_type, sum(units) as unites,
           round(sum(estimated_cost_usd)::numeric, 4) as usd_estime
    from usage_events where created_at >= '$day'::date and created_at < '$day'::date + 1
    group by 1,2,3 order by 1,2,3;"
  echo "## Version d'Elmo"
  elmo_dc config --images | grep elmo-worker
} | tee "$out"
echo "-> $out"

#!/usr/bin/env bash
# Plafond de coût MENSUEL (mois UTC). Arrête le worker Elmo dès que le coût
# du mois atteint le plafond, et émet une alerte quand il passe le seuil
# OIA_VIS_MONTHLY_ALERT_USD. Chaque relevé est ajouté au journal (hors repo).
#   ./scripts/cost-guard.sh             un relevé
#   ./scripts/cost-guard.sh --watch 60  relevé toutes les 60 s (pendant une fenêtre)
#   ./scripts/cost-guard.sh --check     relevé et alerte, SANS JAMAIS arrêter le worker
#                                       (tâche quotidienne : seul vis:j0-close arrête Elmo)
#
# Coût retenu = max(estimation Elmo, grille de prix, coût réel connu), où :
#   - estimation Elmo : somme de usage_events.estimated_cost_usd du mois UTC
#     (forfait par fournisseur : sous-estime claude-sonnet-5-5) ;
#   - grille de prix : coût de chaque run du mois recalculé à partir de ses
#     compteurs de tokens et de recherches (prompt_runs.raw_output) et des prix
#     officiels des modèles retenus (src/cost-grid.ts). Un modèle absent de la
#     grille arrête le worker ; un run échoué compte au majorant ;
#   - réel OpenRouter : GET /api/v1/key -> usage (Gemini, Perplexity, Jev).
#     OpenRouter ne distingue pas aujourd'hui "mois en cours" sur /key : la
#     valeur lue est le cumul retourné par l'API, utilisé comme borne basse.
#   - réel OpenAI / Anthropic / Mistral : NON lus par ce script -> à relever
#     à la main dans les consoles, à reporter dans la colonne manual_usd du
#     journal (variable OIA_VIS_MANUAL_COST_USD).
#
# Plafond : OIA_VIS_MONTHLY_CAP_USD (défaut 30 $). Alerte : OIA_VIS_MONTHLY_ALERT_USD
# (défaut 24 $, 0 = aucune alerte). Le worker est arrêté dès que le coût
# retenu DÉPASSE le plafond, ou que le coût du mois devient illisible
# (sécurité).
#
# Source du coût retenu : OIA_VIS_COST_SOURCE = max (défaut), estimate ou real.
# N'affiche ni ne journalise aucune clé. Le plafond logiciel n'est PAS une
# garantie : la vraie garantie est d'avoir des crédits prépayés sans recharge
# automatique chez chaque fournisseur (voir FOURNISSEURS.md).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ -n "${OIA_VIS_COST_GUARD_DRYRUN:-}" ] || require_env "$ELMO_ENV_FILE"
envval() { awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ELMO_ENV_FILE"; }
cap="${OIA_VIS_MONTHLY_CAP_USD:-$(envval OIA_VIS_MONTHLY_CAP_USD)}"; cap="${cap:-30}"
alert="${OIA_VIS_MONTHLY_ALERT_USD:-$(envval OIA_VIS_MONTHLY_ALERT_USD)}"; alert="${alert:-24}"
source_mode="${OIA_VIS_COST_SOURCE:-$(envval OIA_VIS_COST_SOURCE)}"; source_mode="${source_mode:-max}"
case "$source_mode" in max|estimate|real) ;; *) echo "OIA_VIS_COST_SOURCE: max, estimate ou real" >&2; exit 2;; esac
# Dry run: no docker, no network, no DB. Just evaluate the policy on fake inputs.
# OIA_VIS_COST_GUARD_DRYRUN_RUNS = fichier de lignes JSON (format de src/cost-grid.ts)
# passé à la grille de prix à la place des runs lus dans Postgres.
dryrun="${OIA_VIS_COST_GUARD_DRYRUN:-}"
checkonly=""; [ "${1:-}" = "--check" ] && checkonly=1
# Arrêt du worker : jamais à blanc, jamais en contrôle seul.
stop_worker() { [ -n "$dryrun" ] || [ -n "$checkonly" ] || elmo_dc stop worker >/dev/null 2>&1 || true; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data"
journal="$data/cost-journal.csv"
header="utc_time,month_utc,elmo_estimate_usd,grid_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action"
# Journal d'un format antérieur : mis de côté, jamais réécrit.
if [ -s "$journal" ] && [ "$(head -n 1 "$journal")" != "$header" ]; then
  mv "$journal" "$data/cost-journal.$(date -u +%Y%m%dT%H%M%SZ).old.csv"
fi
[ -s "$journal" ] || echo "$header" > "$journal"
tsx_bin="$VIS_ROOT/node_modules/.bin/tsx"
month_start="date_trunc('month', now() at time zone 'utc') at time zone 'utc'"
# Une ligne JSON par run du mois, puis une par fournisseur pour les runs échoués.
runs_sql="select json_build_object('kind','run','provider',provider,'version',version,'webSearch',web_search_enabled,
  'usage',raw_output->'usage',
  'searchItems',(select count(*) from json_array_elements(case
      when json_typeof(raw_output->'output')='array' then raw_output->'output'
      when json_typeof(raw_output->'outputs')='array' then raw_output->'outputs'
      else '[]'::json end) e
    where e->>'type'='web_search_call' or (e->>'type'='tool.execution' and e->>'name'='web_search')))::text
  from prompt_runs where created_at >= $month_start
  union all
  select json_build_object('kind','failed','provider',provider,'count',count(*))::text
  from usage_events where event_type='prompt_run_failed' and created_at >= $month_start group by provider"

stop_unreadable() { # reason est grid
  # À blanc : jamais de Docker (les tests passent par ici).
  stop_worker
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),$2,$3,n/a,n/a,n/a,$cap,$alert,$([ -n "$checkonly" ] && echo "check-only" || echo "stop-worker")($1)" | tee -a "$journal"
}

# Coût du mois selon la grille de prix. Sort 3 si un modèle est absent de la grille.
grid_cost() {
  if [ -n "$dryrun" ]; then
    [ -n "${OIA_VIS_COST_GUARD_DRYRUN_RUNS:-}" ] || { printf '0'; return 0; }
    "$tsx_bin" "$VIS_ROOT/src/cost-grid.ts" < "$OIA_VIS_COST_GUARD_DRYRUN_RUNS"
  else
    local lines
    lines="$(elmo_dc exec -T postgres psql -U elmo -d elmo -tAc "$runs_sql" 2>/dev/null)" || return 4
    printf '%s\n' "$lines" | "$tsx_bin" "$VIS_ROOT/src/cost-grid.ts"
  fi
}

month_tag() { date -u +%Y-%m; }

# Returns 0 = under the cap, 2 = alert emitted (over soft threshold),
#         3 = cap reached (worker stopped), 4 = cost unreadable (worker stopped).
# Fails CLOSED: if the monthly cost cannot be read, the worker is stopped too.
once() {
  local est grid grid_rc orr manual retained action="none" status=0
  if [ -n "$dryrun" ]; then
    est="${OIA_VIS_COST_GUARD_DRYRUN_EST:-0}"
    orr="${OIA_VIS_COST_GUARD_DRYRUN_ORR:-0}"
    manual="${OIA_VIS_COST_GUARD_DRYRUN_MANUAL:-0}"
  else
    est="$(elmo_dc exec -T postgres psql -U elmo -d elmo -tAc \
      "select coalesce(sum(estimated_cost_usd),0) from usage_events where created_at >= $month_start" 2>/dev/null | tr -d '[:space:]')" || est=""
    if ! [[ "$est" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
      stop_unreadable cost-unreadable unreadable n/a
      return 4
    fi
    orr=""
    key="$(envval OPENROUTER_API_KEY)"
    if [ -n "$key" ]; then
      orr="$(printf 'Authorization: Bearer %s\n' "$key" | curl -sS -m 20 -H @- https://openrouter.ai/api/v1/key 2>/dev/null |
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).data?.usage;process.stdout.write(typeof v==="number"?String(v):"")}catch{}})' || true)"
    fi
    unset key
    manual="${OIA_VIS_MANUAL_COST_USD:-0}"
  fi
  grid_rc=0
  grid="$(grid_cost)" || grid_rc=$?
  if [ "$grid_rc" = 3 ]; then
    stop_unreadable model-not-in-price-grid "$est" unreadable
    return 4
  fi
  if [ "$grid_rc" != 0 ] || ! [[ "$grid" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    stop_unreadable cost-unreadable "$est" unreadable
    return 4
  fi
  case "$source_mode" in
    estimate) pick=("$est" "$grid" "$manual") ;;
    real)
      if [ -z "$orr" ] && [ -z "$dryrun" ]; then
        stop_worker
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),$est,$grid,unreadable,$manual,n/a,$cap,$alert,$([ -n "$checkonly" ] && echo "check-only" || echo "stop-worker")(cost-unreadable)" | tee -a "$journal"
        return 4
      fi
      pick=("$orr" "$manual") ;;
    *) pick=("$est" "$grid" "$orr" "$manual") ;;
  esac
  retained="$(node -e 'const a=process.argv.slice(1).filter(x=>x!=="").map(Number);console.log(Math.max(0,...a).toFixed(4))' "${pick[@]}")"
  if node -e 'process.exit(Number(process.argv[1])>Number(process.argv[2])?0:1)' "$retained" "$cap"; then
    action="$([ -n "$checkonly" ] && echo "check-only" || echo "stop-worker")(cap-reached)"
    stop_worker
    status=3
  elif [ "$alert" != "0" ] && node -e 'process.exit(Number(process.argv[1])>Number(process.argv[2])?0:1)' "$retained" "$alert"; then
    action="alert(monthly-80pct)"
    echo "ALERTE : coût mensuel $retained $ > $alert $ (plafond $cap $). Journal : $journal" >&2
    status=2
  fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),$est,$grid,${orr:-n/a},$manual,$retained,$cap,$alert,$action" | tee -a "$journal"
  return $status
}

rc=0
if [ "${1:-}" = "--watch" ]; then
  every="${2:-60}"
  while true; do
    once || rc=$?
    case $rc in 3|4) break ;; esac
    sleep "$every"
    rc=0
  done
else
  once || rc=$?
fi
case $rc in
  2) echo "Alerte émise : coût mensuel au-dessus du seuil d'alerte." >&2 ;;
  3) echo "Plafond mensuel atteint : worker arrêté. Journal : $journal" >&2 ;;
  4) echo "Coût du mois illisible : worker arrêté par sécurité. Journal : $journal" >&2 ;;
esac
exit $rc

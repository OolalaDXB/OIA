#!/usr/bin/env bash
# Plafond de coût MENSUEL (mois UTC). Arrête le worker Elmo dès que le coût
# du mois atteint le plafond, et émet une alerte quand il passe le seuil
# OIA_VIS_MONTHLY_ALERT_USD. Chaque relevé est ajouté au journal (hors repo).
#   ./scripts/cost-guard.sh             un relevé
#   ./scripts/cost-guard.sh --watch 60  relevé toutes les 60 s (pendant une fenêtre)
#
# Coût retenu = max(estimation Elmo du mois, coût réel connu du mois), où :
#   - estimation Elmo : somme de usage_events.estimated_cost_usd du mois UTC ;
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
require_env "$ELMO_ENV_FILE"
envval() { awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ELMO_ENV_FILE"; }
cap="${OIA_VIS_MONTHLY_CAP_USD:-$(envval OIA_VIS_MONTHLY_CAP_USD)}"; cap="${cap:-30}"
alert="${OIA_VIS_MONTHLY_ALERT_USD:-$(envval OIA_VIS_MONTHLY_ALERT_USD)}"; alert="${alert:-24}"
source_mode="${OIA_VIS_COST_SOURCE:-$(envval OIA_VIS_COST_SOURCE)}"; source_mode="${source_mode:-max}"
case "$source_mode" in max|estimate|real) ;; *) echo "OIA_VIS_COST_SOURCE: max, estimate ou real" >&2; exit 2;; esac
# Dry run: no docker, no network, no DB. Just evaluate the policy on fake inputs.
dryrun="${OIA_VIS_COST_GUARD_DRYRUN:-}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data"
journal="$data/cost-journal.csv"
[ -s "$journal" ] || echo "utc_time,month_utc,elmo_estimate_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action" > "$journal"

month_tag() { date -u +%Y-%m; }

# Returns 0 = under the cap, 2 = alert emitted (over soft threshold),
#         3 = cap reached (worker stopped), 4 = cost unreadable (worker stopped).
# Fails CLOSED: if the monthly cost cannot be read, the worker is stopped too.
once() {
  local est orr manual retained action="none" status=0
  if [ -n "$dryrun" ]; then
    est="${OIA_VIS_COST_GUARD_DRYRUN_EST:-0}"
    orr="${OIA_VIS_COST_GUARD_DRYRUN_ORR:-0}"
    manual="${OIA_VIS_COST_GUARD_DRYRUN_MANUAL:-0}"
  else
    est="$(elmo_dc exec -T postgres psql -U elmo -d elmo -tAc \
      "select coalesce(sum(estimated_cost_usd),0) from usage_events where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'" 2>/dev/null | tr -d '[:space:]')" || est=""
    if ! [[ "$est" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
      elmo_dc stop worker >/dev/null 2>&1 || true
      echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),unreadable,n/a,n/a,n/a,$cap,$alert,stop-worker(cost-unreadable)" | tee -a "$journal"
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
  case "$source_mode" in
    estimate) pick=("$est" "$manual") ;;
    real)
      if [ -z "$orr" ] && [ -z "$dryrun" ]; then
        elmo_dc stop worker >/dev/null 2>&1 || true
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),$est,unreadable,$manual,n/a,$cap,$alert,stop-worker(cost-unreadable)" | tee -a "$journal"
        return 4
      fi
      pick=("$orr" "$manual") ;;
    *) pick=("$est" "$orr" "$manual") ;;
  esac
  retained="$(node -e 'const a=process.argv.slice(1).filter(x=>x!=="").map(Number);console.log(Math.max(0,...a).toFixed(4))' "${pick[@]}")"
  if node -e 'process.exit(Number(process.argv[1])>Number(process.argv[2])?0:1)' "$retained" "$cap"; then
    action="stop-worker(cap-reached)"
    [ -z "$dryrun" ] && elmo_dc stop worker >/dev/null 2>&1 || true
    status=3
  elif [ "$alert" != "0" ] && node -e 'process.exit(Number(process.argv[1])>Number(process.argv[2])?0:1)' "$retained" "$alert"; then
    action="alert(monthly-80pct)"
    echo "ALERTE : coût mensuel $retained $ > $alert $ (plafond $cap $). Journal : $journal" >&2
    status=2
  fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$(month_tag),$est,${orr:-n/a},$manual,$retained,$cap,$alert,$action" | tee -a "$journal"
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

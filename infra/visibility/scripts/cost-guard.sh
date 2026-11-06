#!/usr/bin/env bash
# Plafond de coût journalier (jour UTC). Arrête le worker Elmo dès que le coût du
# jour atteint le plafond ; chaque relevé est ajouté au journal (hors repo).
#   ./scripts/cost-guard.sh             un relevé
#   ./scripts/cost-guard.sh --watch 60  relevé toutes les 60 s (à laisser tourner pendant la fenêtre)
# Coût retenu = max(estimation Elmo du jour, coût réel connu du jour), où :
#   - estimation Elmo : somme de usage_events.estimated_cost_usd (tous fournisseurs, Jev compris) ;
#   - réel OpenRouter : GET /api/v1/key -> usage_daily (Gemini, Perplexity et Jev) ;
#   - réel OpenAI / Anthropic / Mistral : pas lu par ce script -> relevé à la main
#     dans les consoles, à reporter dans le journal (colonne manual_usd, voir README).
# Plafond : OIA_VIS_DAILY_CAP_USD dans elmo/.env (défaut 5). Le worker est arrêté
# dès que le coût retenu DÉPASSE le plafond (0 = arrêt au premier centime réel).
# Source du coût retenu : OIA_VIS_COST_SOURCE = max (défaut : max des deux),
# estimate (estimation Elmo seule) ou real (coût réel OpenRouter seul ; à utiliser
# en configuration zéro coût, où Elmo estime un coût pour des appels gratuits).
# N'affiche ni ne journalise aucune clé.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env "$ELMO_ENV_FILE"
envval() { awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ELMO_ENV_FILE"; }
cap="$(envval OIA_VIS_DAILY_CAP_USD)"; cap="${cap:-5}"
source_mode="${OIA_VIS_COST_SOURCE:-$(envval OIA_VIS_COST_SOURCE)}"; source_mode="${source_mode:-max}"
case "$source_mode" in max|estimate|real) ;; *) echo "OIA_VIS_COST_SOURCE: max, estimate ou real" >&2; exit 2;; esac
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data"
journal="$data/cost-journal.csv"
[ -s "$journal" ] || echo "utc_time,elmo_estimate_usd,openrouter_daily_usd,retained_usd,cap_usd,action" > "$journal"

# Returns 0 = under the cap, 3 = cap reached (worker stopped), 4 = cost unreadable.
# Fails CLOSED: if today's cost cannot be read, the worker is stopped too
# (a guard that cannot see the spend must not let the spend continue).
once() {
  local est orr retained action="none"
  est="$(elmo_dc exec -T postgres psql -U elmo -d elmo -tAc \
    "select coalesce(sum(estimated_cost_usd),0) from usage_events where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'" 2>/dev/null | tr -d '[:space:]')" || est=""
  if ! [[ "$est" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    elmo_dc stop worker >/dev/null 2>&1 || true
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),unreadable,n/a,n/a,$cap,stop-worker(cost-unreadable)" | tee -a "$journal"
    return 4
  fi
  orr=""
  key="$(envval OPENROUTER_API_KEY)"
  if [ -n "$key" ]; then
    orr="$(printf 'Authorization: Bearer %s\n' "$key" | curl -sS -m 20 -H @- https://openrouter.ai/api/v1/key 2>/dev/null |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).data?.usage_daily;process.stdout.write(typeof v==="number"?String(v):"")}catch{}})' || true)"
  fi
  unset key
  case "$source_mode" in
    estimate) pick=("$est") ;;
    real)
      # Fails closed: in "real" mode an unreadable OpenRouter cost stops the worker.
      if [ -z "$orr" ]; then
        elmo_dc stop worker >/dev/null 2>&1 || true
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$est,unreadable,n/a,$cap,stop-worker(cost-unreadable)" | tee -a "$journal"
        return 4
      fi
      pick=("$orr") ;;
    *) pick=("$est" "$orr") ;;
  esac
  retained="$(node -e 'const a=process.argv.slice(1).filter(x=>x!=="").map(Number);console.log(Math.max(0,...a).toFixed(4))' "${pick[@]}")"
  if node -e 'process.exit(Number(process.argv[1])>Number(process.argv[2])?0:1)' "$retained" "$cap"; then
    action="stop-worker"
    elmo_dc stop worker >/dev/null 2>&1 || true
  fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$est,${orr:-n/a},$retained,$cap,$action" | tee -a "$journal"
  [ "$action" = none ] || return 3
}

rc=0
if [ "${1:-}" = "--watch" ]; then
  every="${2:-60}"
  while once; do sleep "$every"; done
  # `while` swallows the status: read it back from the journal's last action.
  tail -1 "$journal" | grep -q 'cost-unreadable' && rc=4 || rc=3
else
  once || rc=$?
fi
case $rc in
  3) echo "Plafond atteint : worker arrêté. Journal : $journal" >&2 ;;
  4) echo "Coût du jour illisible : worker arrêté par sécurité. Journal : $journal" >&2 ;;
esac
exit $rc

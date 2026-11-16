#!/usr/bin/env bash
# Lancement d'une fenêtre de suivi (J1, J2…) dans l'Elmo existant (mandat v13, bloc B),
# appelé par `pnpm vis launch <sujet> <fenêtre> [--dry-run]`.
#
#   --dry-run : instantané d'Elmo en LECTURE SEULE, contrôles 1 à 8 (src/window-launch.ts),
#               GO / NO-GO ; rien n'est écrit.
#   sans --dry-run, et seulement après le GO de Mickaël : mêmes contrôles, puis, à 5 min
#               au plus de runTimeUtc : gel freeze-<fenêtre> déclaré, worker démarré,
#               fenêtre passée en running, suivi quotidien installé, Mac maintenu éveillé,
#               cost-guard.sh --watch. Premier contrôle ensuite : j0-first-run.sh.
#
# Ne crée, ne supprime ni ne modifie aucune question ni aucun concurrent dans Elmo : les
# contrôles disent ce qui doit être activé ou désactivé (depuis l'interface d'Elmo,
# jamais de suppression). N'affiche aucune valeur secrète de elmo/.env.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"; window="${2:-}"; mode="${3:-}"
[ -n "$subject" ] && [ -n "$window" ] || { echo "usage: window-launch.sh <sujet> <fenêtre> [--dry-run]" >&2; exit 2; }
tsx="$VIS_ROOT/node_modules/.bin/tsx"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
wdir="$(window_dir "$data" "$subject" "$window")"
export OIA_VIS_WINDOW="$window"
require_env "$ELMO_ENV_FILE"
envval() { awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ELMO_ENV_FILE"; }
sqlj() { elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 -v sid="$subject"; }

echo "# Lancement $window · $subject · $(date -u +%Y-%m-%dT%H:%M:%SZ)${mode:+ ($mode)}"
state="$(mktemp "${TMPDIR:-/tmp}/elmo-state.XXXXXX")"; trap 'rm -f "$state"' EXIT
elmo="$(sqlj <<'SQL'
select json_build_object(
  'brandExists', exists(select 1 from brands where id = :'sid'),
  'prompts', coalesce((select json_agg(json_build_object('id', id, 'tags', tags, 'enabled', enabled)) from prompts where brand_id = :'sid'), '[]'::json),
  'competitors', coalesce((select json_agg(name order by name) from competitors where brand_id = :'sid'), '[]'::json),
  'pendingJobs', coalesce((select json_agg(json_build_object('promptId', substr(singleton_key, 8),
      'startAfter', to_char(start_after at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    from pgboss.job where name = 'process-prompt' and state in ('created', 'retry') and singleton_key like 'prompt-%'), '[]'::json)
);
SQL
)"
worker=false
[ "$(elmo_dc ps --status running -q worker 2>/dev/null | wc -l | tr -d ' ')" = 0 ] || worker=true
month="$(date -u +%Y-%m)"
# Dépense retenue du mois : dernier relevé du mois dans le journal ; aucun relevé ce mois-ci = 0 ;
# journal présent mais illisible (en-tête inattendu) = inconnue, donc NO-GO.
spend=0
if [ -f "$data/cost-journal.csv" ]; then
  spend="$(awk -F, -v m="$month" 'NR==1 && $7!="retained_usd" {bad=1} NR>1 && $2==m {v=$7} END{print (bad ? "null" : (v=="" ? 0 : v))}' "$data/cost-journal.csv" 2>/dev/null || echo null)"
fi
other="$(launchctl list 2>/dev/null | awk -v p="com.oia.visibility.$subject." -v me="com.oia.visibility.$subject.$window.watch" 'index($3,p)==1 && $3!=me {print $3; exit}')"
node -e '
const [elmo, now, worker, targets, cap, alert, spend, month, other] = process.argv.slice(1);
const num = (s) => (s === "" || s === "null" ? null : Number(s));
process.stdout.write(JSON.stringify({ ...JSON.parse(elmo), now, workerRunning: worker === "true", scrapeTargets: targets,
  capUsd: num(cap), alertUsd: num(alert), monthSpendUsd: num(spend), monthUtc: month, otherWatch: other || null }));
' "$elmo" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$worker" "$(envval SCRAPE_TARGETS)" \
  "${OIA_VIS_MONTHLY_CAP_USD:-$(envval OIA_VIS_MONTHLY_CAP_USD)}" "${OIA_VIS_MONTHLY_ALERT_USD:-$(envval OIA_VIS_MONTHLY_ALERT_USD)}" \
  "$spend" "$month" "$other" > "$state"

"$tsx" "$VIS_ROOT/src/window-launch.ts" check "$subject" "$window" "$state" || exit 1
[ "$mode" != --dry-run ] || exit 0

# ---- Lancement (après le GO de Mickaël) -----------------------------------------------
run_time="$("$tsx" "$VIS_ROOT/src/window-gate.ts" info "$subject" "$window" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).window.runTimeUtc))')"
node -e '
const [h, m] = process.argv[1].split(":").map(Number); const n = new Date();
const d = Math.abs((n.getUTCHours() * 60 + n.getUTCMinutes()) - (h * 60 + m));
process.exit(Math.min(d, 1440 - d) <= 5 ? 0 : 1);' "$run_time" \
  || { echo "NO-GO : lancement à faire à ${run_time} UTC (± 5 min) : au démarrage du worker, tous les travaux en retard partent aussitôt" >&2; exit 1; }
mkdir -p "$wdir"
"$tsx" "$VIS_ROOT/src/window-launch.ts" add-freeze "$subject" "$window" "$(date -u +%Y-%m-%d)"
elmo_dc up -d worker >/dev/null 2>&1
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "$started" > "$wdir/started-at.txt"
echo "ok    worker démarré à $started"
"$tsx" "$VIS_ROOT/src/elmo-load.ts" start-window "$subject" "$window"
"$VIS_ROOT/scripts/j0-watch.sh" install "$subject"
if command -v caffeinate >/dev/null; then
  nohup caffeinate -ims >/dev/null 2>&1 &
  echo $! > "$wdir/caffeinate.pid"
fi
nohup "$VIS_ROOT/scripts/cost-guard.sh" --watch 60 >> "$wdir/cost-guard.log" 2>&1 &
echo $! > "$wdir/cost-guard.pid"
echo "ok    cost-guard.sh --watch 60 actif (journal $wdir/cost-guard.log)"
echo
echo "$window lancé. Dans 10 à 15 minutes : OIA_VIS_WINDOW=$window ./scripts/j0-first-run.sh $subject"

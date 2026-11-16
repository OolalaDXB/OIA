#!/usr/bin/env bash
# Commande unique d'une fenêtre de mesure (mandat v13, bloc A) :
#
#   pnpm vis <action> <sujet> <fenêtre> [--dry-run]
#
# Actions : launch (--dry-run : GO / NO-GO sans rien écrire), status, view, close,
# report, verify, compare, page. Aucun sujet ni fenêtre codé en dur : tout vient de
# subjects/<sujet>/measurement.yaml. Chaque action refuse une fenêtre absente, ou dans
# un statut incompatible (src/window-gate.ts). Les vis:j0-* de package.json restent des
# alias de la fenêtre j0 du sujet pilote.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
action="${1:-}"; subject="${2:-}"; window="${3:-}"; flag="${4:-}"
usage="usage: pnpm vis launch|status|view|close|report|verify|compare|page <sujet> <fenêtre> [--dry-run]"
[ -n "$action" ] && [ -n "$subject" ] && [ -n "$window" ] || { echo "$usage" >&2; exit 2; }
[ -z "$flag" ] || { [ "$action" = launch ] && [ "$flag" = --dry-run ]; } || { echo "option inconnue « $flag » ($usage)" >&2; exit 2; }
tsx="$VIS_ROOT/node_modules/.bin/tsx"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
subjects_dir="${OIA_VIS_SUBJECTS_DIR:-$VIS_ROOT/subjects}"
export OIA_VIS_WINDOW="$window"

"$tsx" "$VIS_ROOT/src/window-gate.ts" gate "$subject" "$window" "$action"
info="$("$tsx" "$VIS_ROOT/src/window-gate.ts" info "$subject" "$window")"
field() { printf '%s' "$info" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o==null?o:o[k],JSON.parse(s));process.stdout.write(v==null?"":Array.isArray(v)?v.join(","):String(v))})' "$1"; }
export OIA_VIS_WINDOW_DAYS="$(field window.days)"
reference="$(field window.comparesWith)"
wdir="$(window_dir "$data" "$subject" "$window")"
reports="$subjects_dir/$subject/reports"

case "$action" in
  launch)
    if [ "$(field window.kind)" = baseline ]; then
      OIA_VIS_J0_TARGETS="$(field window.targets)" exec "$VIS_ROOT/scripts/j0-launch.sh" "$subject" ${flag:+"$flag"}
    fi
    exec "$VIS_ROOT/scripts/window-launch.sh" "$subject" "$window" ${flag:+"$flag"} ;;
  status)
    # Elmo n'est lu que pendant la fenêtre ; les recommandations, toujours.
    [ "$(field window.status)" != running ] || "$VIS_ROOT/scripts/j0-status.sh" "$subject"
    exec "$tsx" "$VIS_ROOT/src/recommendation-status.ts" "$subject" "$window" ;;
  view) exec "$VIS_ROOT/scripts/j0-view.sh" "$subject" ;;
  close) exec "$VIS_ROOT/scripts/j0-close.sh" "$subject" ;;
  report|verify) exec "$VIS_ROOT/scripts/j0-report.sh" "$action" "$subject" ;;
  compare)
    rdir="$(window_dir "$data" "$subject" "$reference")"
    exec "$tsx" "$VIS_ROOT/src/window-compare.ts" "$subject" "$window" \
      "$data/$subject/evidence/$reference.jsonl" "$data/$subject/evidence/$window.jsonl" \
      "$rdir/close/failed.json" "$wdir/close/failed.json" "$reports/$window" "$wdir/close/redirects.json" ;;
  page)
    comparison=""
    [ -z "$reference" ] || comparison="$reports/$window/comparaison-$window-$reference.json"
    [ -z "$comparison" ] || [ -f "$comparison" ] || { echo "refus : comparaison absente ($comparison) : lancer d'abord pnpm vis compare $subject $window" >&2; exit 1; }
    exec "$tsx" "$VIS_ROOT/src/client-page.ts" "$subject" "$window" "$reports/$window/figures.json" "$reports/$window" ${comparison:+"$comparison"} ;;
esac

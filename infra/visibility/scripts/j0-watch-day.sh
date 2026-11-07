#!/usr/bin/env bash
# Tâche quotidienne d'une fenêtre de mesure (lancée par launchd, une heure
# après le run d'Elmo ; installée par j0-watch.sh). Ne démarre, n'arrête ni ne
# reconfigure jamais Elmo : lecture seule, et cost-guard.sh en --check.
#  1. fiche du jour : subjects/<sujet>/reports/<fenêtre>/jour-N.md ;
#  2. visibility.json mis à jour (vis-export.sh) ;
#  3. preuves du jour synchronisées vers la base OIA (vis-sync.sh, mandat v9) ;
#  4. dépense vérifiée (cost-guard.sh --check, sans arrêt du worker) ;
#  5. notification macOS SEULEMENT en cas de problème ;
#  6. après la fin de la fenêtre : la tâche se retire d'elle-même.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-watch-day.sh <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
subjects_dir="${OIA_VIS_SUBJECTS_DIR:-$VIS_ROOT/subjects}"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
notify() {
  if [ -n "${OIA_VIS_NOTIFY_LOG:-}" ]; then echo "$1" >> "$OIA_VIS_NOTIFY_LOG"; return; fi
  command -v osascript >/dev/null && osascript -e "display notification \"$(printf '%s' "$1" | tr '"' "'")\" with title \"OIA Visibility · $subject\"" >/dev/null 2>&1 || true
}
echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ) tâche quotidienne $subject/$window"

wd="$(mktemp "${TMPDIR:-/tmp}/window-data.XXXXXX")"; trap 'rm -f "$wd"' EXIT
if [ -n "${OIA_VIS_WINDOW_DATA:-}" ]; then cp "$OIA_VIS_WINDOW_DATA" "$wd"
elif ! "$VIS_ROOT/scripts/j0-window-data.sh" "$subject" > "$wd"; then
  notify "Lecture d'Elmo impossible : fiche du jour non produite."; exit 1
fi

out="$("$tsx" "$VIS_ROOT/src/window-watch.ts" day "$subject" "$wd" "$data/cost-journal.csv")"; rc=$?
[ "$rc" = 0 ] || [ "$rc" = 3 ] || { notify "Fiche du jour en erreur."; exit 1; }
day="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).day)))')"
dir="$subjects_dir/$subject/reports/$window"; mkdir -p "$dir"
printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).markdown))' > "$dir/jour-$day.md"
echo "fiche : $dir/jour-$day.md"

if [ -z "${OIA_VIS_SKIP_EXPORT:-}" ]; then "$VIS_ROOT/scripts/vis-export.sh" "$subject" >/dev/null || notify "visibility.json non mis à jour."; fi
if [ -z "${OIA_VIS_SKIP_SYNC:-}" ] && [ -z "${OIA_VIS_SKIP_EXPORT:-}" ]; then
  "$VIS_ROOT/scripts/vis-sync.sh" "$subject" >/dev/null || notify "Base OIA non mise à jour (vis-sync)."
fi
if [ -z "${OIA_VIS_SKIP_COST:-}" ]; then
  "$VIS_ROOT/scripts/cost-guard.sh" --check >/dev/null 2>&1; crc=$?
  case $crc in 2|3) notify "Dépense : seuil d'alerte ou plafond atteint (voir cost-journal.csv).";; 4) notify "Dépense du mois illisible.";; esac
fi

if [ "$rc" = 3 ]; then
  problems="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).problems.join(" ; ")))')"
  notify "Jour $day : $problems"
fi

# Fin de fenêtre (5 jours + 2 h) : retrait de la tâche.
if node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit(Date.parse(d.now)>=Date.parse(d.startedAt)+d.days*864e5+72e5?0:1)' "$wd"; then
  "$VIS_ROOT/scripts/j0-watch.sh" remove "$subject" && echo "fenêtre terminée : tâche retirée"
fi
exit 0

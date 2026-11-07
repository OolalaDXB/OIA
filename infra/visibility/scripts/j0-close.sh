#!/usr/bin/env bash
# Clôture d'une fenêtre de mesure (pnpm vis:j0-close), à lancer par Mickaël
# après le dernier run. SEULE commande autorisée à arrêter le worker d'Elmo
# pendant une fenêtre (amendement du 2026-11-07).
#
# Reprenable : chaque étape laisse un marqueur dans <data>/<fenêtre>/close/ ;
# une relance reprend à l'étape interrompue et ne refait rien. L'import des
# preuves ne duplique jamais une réponse (src/evidence-store.ts).
#
# Étapes, dans l'ordre :
#   1 completeness  fenêtre complète ? sinon, jours manquants consignés
#   2 freeze        intégrité du gel de la surface publique (scripts/freeze-check.sh)
#   3 stop-worker   `docker compose stop worker` : réversible, AUCUNE donnée supprimée
#                   (jamais down, jamais rm, jamais de volume touché)
#   4 backup        sauvegarde de la base d'Elmo (backup.sh, Elmo seul)
#   5 verify-backup empreintes SHA-256 et lecture de la sauvegarde par pg_restore
#   6 export        exportation complète de la fenêtre (lecture seule)
#   7 import        preuves ajoutées à la table locale, avec leur empreinte
#   8 remove-watch  retrait de la tâche quotidienne
# Aucun nettoyage ni arrêt définitif avant que la sauvegarde soit vérifiée.
#
#   ./scripts/j0-close.sh <subjectId>
# OIA_VIS_CLOSE_EARLY=1 : autorise une clôture avant la fin du dernier jour.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-close.sh <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
days="${OIA_VIS_WINDOW_DAYS:-5}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
state="$data/$window/close"; mkdir -p "$state"
evidence="$data/$subject/evidence/$window.jsonl"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
started="$(cat "$data/$window/started-at.txt" 2>/dev/null || true)"
[ -n "$started" ] || { echo "début de fenêtre inconnu : $data/$window/started-at.txt" >&2; exit 1; }

# Pas de clôture avant la fin des runs du dernier jour (début + (jours-1) × 24 h + 2 h).
if [ -z "${OIA_VIS_CLOSE_EARLY:-}" ] && ! node -e 'process.exit(Date.now()>=Date.parse(process.argv[1])+((+process.argv[2])-1)*864e5+72e5?0:1)' "$started" "$days"; then
  echo "Trop tôt : le dernier jour de la fenêtre n'est pas terminé (début $started, $days jours)." >&2
  echo "Relancer après le dernier run, ou OIA_VIS_CLOSE_EARLY=1 pour clôturer quand même." >&2
  exit 1
fi

step() { # nom, puis la commande
  local name="$1"; shift
  if [ -f "$state/$name.done" ]; then echo "= $name : déjà fait"; return 0; fi
  echo "> $name"
  [ "${OIA_VIS_CLOSE_FAIL_AT:-}" = "$name" ] && { echo "échec simulé à l'étape $name" >&2; exit 1; }
  "$@"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$state/$name.done"
}

completeness() {
  local wd; wd="$(mktemp "${TMPDIR:-/tmp}/window-data.XXXXXX")"
  if [ -n "${OIA_VIS_WINDOW_DATA:-}" ]; then cp "$OIA_VIS_WINDOW_DATA" "$wd"; else "$VIS_ROOT/scripts/j0-window-data.sh" "$subject" > "$wd"; fi
  "$tsx" "$VIS_ROOT/src/window-watch.ts" status "$subject" "$wd" "$data/cost-journal.csv" | tee "$state/completeness.txt"
  rm -f "$wd"
}
freeze() {
  local rc=0
  "$VIS_ROOT/scripts/freeze-check.sh" "$subject" "$started" > "$state/freeze.txt" 2>&1 || rc=$?
  cat "$state/freeze.txt"
  # Le contrôle ne bloque pas la clôture : son résultat va au rapport et à la porte P1.
  [ "$rc" = 0 ] || echo "(gel : voir $state/freeze.txt, à reprendre dans le rapport)"
}
stop_worker() { elmo_dc stop worker; }
backup() {
  local out
  # Journal plutôt que `tee /dev/stderr`, indisponible hors terminal (CI, launchd).
  OIA_VIS_ONLY=elmo "$VIS_ROOT/backup.sh" > "$state/backup.log" 2>&1 || { cat "$state/backup.log" >&2; return 1; }
  cat "$state/backup.log"
  out="$(sed -n 's/^Sauvegarde : //p' "$state/backup.log" | tail -1)"
  [ -n "$out" ] && [ -s "$out/elmo.dump" ] || { echo "sauvegarde introuvable ou vide" >&2; return 1; }
  echo "$out" > "$state/backup-dir.txt"
}
verify_backup() {
  local dir; dir="$(cat "$state/backup-dir.txt")"
  (cd "$dir" && { command -v sha256sum >/dev/null && sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; })
  local listing; listing="$(elmo_dc exec -T postgres pg_restore -l < "$dir/elmo.dump")"
  printf '%s' "$listing" | grep -q "TABLE DATA public prompt_runs" || { echo "sauvegarde illisible : prompt_runs absent du contenu" >&2; return 1; }
  echo "sauvegarde vérifiée : $dir"
}
export_window() {
  "$VIS_ROOT/scripts/j0-export.sh" "$subject" > "$state/export.json.tmp"
  mv "$state/export.json.tmp" "$state/export.json"
  node -e 'const e=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));require("fs").writeFileSync(process.argv[2],JSON.stringify({startedAt:e.startedAt,days:e.days,failed:e.failed},null,2))' \
    "$state/export.json" "$state/failed.json"
}
import_evidence() { "$tsx" "$VIS_ROOT/src/j0-evidence.ts" "$subject" "$window" "$state/export.json" "$evidence"; }
remove_watch() { "$VIS_ROOT/scripts/j0-watch.sh" remove "$subject"; }

step completeness completeness
step freeze freeze
step stop-worker stop_worker
step backup backup
step verify-backup verify_backup
step export export_window
step import import_evidence
step remove-watch remove_watch
echo
echo "Fenêtre $window clôturée. Preuves : $evidence"
echo "Ensuite : pnpm vis:j0-report, puis pnpm vis:j0-verify."

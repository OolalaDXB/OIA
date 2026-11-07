#!/usr/bin/env bash
# Rapport d'une fenêtre (pnpm vis:j0-report) ou sa vérification (pnpm vis:j0-verify),
# à partir de la table des preuves locale (après vis:j0-close). Aucun appel à un
# fournisseur d'IA, aucun accès à Elmo.
#   ./scripts/j0-report.sh report|verify <subjectId>
# Sortie : subjects/<sujet>/reports/<fenêtre>/rapport-<fenêtre>.{md,html} et figures.json.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
mode="${1:-}"; subject="${2:-}"
{ [ "$mode" = report ] || [ "$mode" = verify ]; } && [ -n "$subject" ] || { echo "usage: j0-report.sh report|verify <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
subjects_dir="${OIA_VIS_SUBJECTS_DIR:-$VIS_ROOT/subjects}"
exec "$VIS_ROOT/node_modules/.bin/tsx" "$VIS_ROOT/src/j0-report.ts" "$mode" "$subject" "$window" \
  "$data/$subject/evidence/$window.jsonl" "$subjects_dir/$subject/reports/$window" \
  "$data/$window/close/failed.json" "$subjects_dir/$subject/fact-keywords.yaml"

#!/usr/bin/env bash
# Lecture rapide d'une fenêtre en cours (pnpm vis:j0-status) : jour en cours,
# runs du jour par moteur, jours manquants, dépense retenue, consoles où lire
# la dépense réelle. Lecture seule ; ne touche pas à Elmo.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-status.sh <subjectId>" >&2; exit 2; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
tmp="$(mktemp "${TMPDIR:-/tmp}/window-data.XXXXXX")"; trap 'rm -f "$tmp"' EXIT
if [ -n "${OIA_VIS_WINDOW_DATA:-}" ]; then cp "$OIA_VIS_WINDOW_DATA" "$tmp"; else "$VIS_ROOT/scripts/j0-window-data.sh" "$subject" > "$tmp"; fi
"$VIS_ROOT/node_modules/.bin/tsx" "$VIS_ROOT/src/window-watch.ts" status "$subject" "$tmp" "$data/cost-journal.csv"

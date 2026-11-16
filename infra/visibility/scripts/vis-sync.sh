#!/usr/bin/env bash
# Synchronisation quotidienne d'une fenêtre vers la base OIA (mandat v9, bloc C ;
# toute fenêtre de tout sujet depuis le mandat v13, bloc F), appelée par
# j0-watch-day.sh après la fiche du jour. Elmo en LECTURE SEULE (j0-export.sh) ;
# liens de Gemini résolus (src/redirects.ts, cache hors dépôt) ; script SQL de
# src/vis-sync.ts, preuves en ajout seul, appliqué en une transaction sur la
# base OIA. Ne démarre, n'arrête ni ne reconfigure Elmo.
#   ./scripts/vis-sync.sh <subjectId> [windowId] [stateDir]
# windowId : défaut OIA_VIS_WINDOW, sinon j0 ; refusée si absente de measurement.yaml.
# stateDir (dossier d'état de la fenêtre, avec started-at.txt) : défaut window_dir de lib.sh
# (OIA_VIS_STATE_DIR, sinon $data/<sujet>/<fenêtre>, sinon l'ancien $data/<fenêtre> du J0 déjà clos).
# Script SQL dans <stateDir>/sync ; pour l'ancien dossier, $data/<sujet>/sync (J0) ou
# $data/<sujet>/sync-<fenêtre>.
# Mot de passe : ~/.oia/supabase.env (OIA_DB_PASSWORD), jamais affiché.
# OIA_VIS_SYNC_SQL=<commande> remplace psql (tests) ; OIA_VIS_SYNC_EXPORT=<fichier> remplace la lecture d'Elmo.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: vis-sync.sh <subjectId> [windowId] [stateDir]" >&2; exit 2; }
window="${2:-${OIA_VIS_WINDOW:-j0}}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
# Fenêtre inconnue de measurement.yaml : refus avant toute lecture d'Elmo.
days="$("$tsx" "$VIS_ROOT/src/vis-sync.ts" --jours "$subject" "$window")"
state="${3:-$(window_dir "$data" "$subject" "$window")}"
if [ "$state" = "$data/$window" ]; then
  # Ancienne disposition : $data/<sujet>/sync reste celui de J0 ; les autres fenêtres ont le leur.
  dir="$data/$subject/sync"; [ "$window" = j0 ] || dir="$data/$subject/sync-$window"
else dir="$state/sync"; fi
mkdir -p "$dir"; chmod 700 "$dir"
export_file="$dir/export.json"
if [ -n "${OIA_VIS_SYNC_EXPORT:-}" ]; then [ "$OIA_VIS_SYNC_EXPORT" -ef "$export_file" ] || cp "$OIA_VIS_SYNC_EXPORT" "$export_file"
else
  # j0-export.sh lit <dossier d'état>/started-at.txt (window_dir) : on le lui impose.
  OIA_VIS_STATE_DIR="$state" OIA_VIS_WINDOW="$window" OIA_VIS_WINDOW_DAYS="$days" \
    "$VIS_ROOT/scripts/j0-export.sh" "$subject" > "$export_file"
fi
cache="$data/$subject/redirects-cache.json"
[ -n "${OIA_VIS_SYNC_EXPORT:-}" ] || "$tsx" "$VIS_ROOT/src/redirects.ts" "$export_file" "$cache" >&2 || echo "liens de Gemini : résolution incomplète, on continue avec le cache" >&2
"$tsx" "$VIS_ROOT/src/vis-sync.ts" "$subject" "$window" "$export_file" "$cache" > "$dir/sync.sql"

appliquer() {
  if [ -n "${OIA_VIS_SYNC_SQL:-}" ]; then $OIA_VIS_SYNC_SQL; return; fi
  local mdp
  mdp="$(sed -n 's/^OIA_DB_PASSWORD=//p' "$HOME/.oia/supabase.env" | sed -e "s/^['\"]//" -e "s/['\"]$//")"
  [ -n "$mdp" ] || { echo "mot de passe de la base OIA absent" >&2; return 1; }
  PGPASSWORD="$mdp" PGSSLMODE=require psql -X -q -At -v ON_ERROR_STOP=1 \
    -h "${OIA_DB_HOST:-aws-0-eu-central-1.pooler.supabase.com}" -p 5432 -U "postgres.iywmvyebuikxyvnrcnoy" -d postgres
}
{ echo 'set client_min_messages = warning;'; cat "$dir/sync.sql"; } | appliquer

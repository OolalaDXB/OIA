#!/usr/bin/env bash
# Un passage du moteur (mandat v16, bloc B), lancé par launchd (scripts/engine-install.sh) :
#   ./scripts/engine-run.sh               file de demandes seulement
#   ./scripts/engine-run.sh --quotidien   file, puis le passage du jour sur les fenêtres en cours
# Clés : ~/.oia/visibility.env (OIA_VIS_KEYS_FILE), chargé par scripts/load-keys.sh (droits 600,
# noms connus seulement, aucune valeur affichée). Base : ~/.oia/bin/oia-psql (OIA_VIS_PSQL), qui
# porte la connexion ; ce script ne lit aucun mot de passe.
# Cache du moteur : OIA_VIS_ENGINE_DIR (défaut ~/oia-visibility-data/moteur), hors du dépôt.
# Un seul passage à la fois : verrou ~/oia-visibility-data/moteur.lock (un verrou laissé par un
# processus mort est repris).
# Journal : sortie standard (launchd l'écrit hors du dépôt) ; identifiants de demande et états
# seulement, aucune donnée client.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
source "$(dirname "$0")/load-keys.sh"
load_keys_file "${OIA_VIS_KEYS_FILE:-$HOME/.oia/visibility.env}" || exit 1
lock="${OIA_VIS_ENGINE_LOCK:-$HOME/oia-visibility-data/moteur.lock}"
mkdir -p "$(dirname "$lock")"
if ! mkdir "$lock" 2>/dev/null; then
  pid="$(cat "$lock/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) passage précédent encore en cours (processus $pid) : rien à faire"
    exit 0
  fi
  rm -rf "$lock"; mkdir "$lock"
fi
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT
export OIA_VIS_ENGINE_VERSION="${OIA_VIS_ENGINE_VERSION:-$(git -C "$VIS_ROOT" rev-parse --short HEAD 2>/dev/null || echo inconnue)}"
"$VIS_ROOT/node_modules/.bin/tsx" "$VIS_ROOT/src/engine/run.ts" "$@"

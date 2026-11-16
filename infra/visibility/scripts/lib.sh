# Shared helpers, sourced by the other scripts. No secret is ever echoed.
VIS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Suffix lets a second, isolated install (restore test) live next to the main
# one: separate compose projects => separate named volumes.
SUFFIX="${OIA_VIS_SUFFIX:-}"
ELMO_PROJECT="oia-elmo${SUFFIX}"
CRAWLSEO_PROJECT="oia-crawlseo${SUFFIX}"
# Compose reads `env_file: .env` next to each compose file, so each install
# (main, or a restore test) is its own checkout of the repo with its own .env
# files. A test checkout on the same Mac also sets OIA_VIS_SUFFIX.
# OIA_VIS_ELMO_ENV_FILE : seulement pour les tests (faux .env, faux docker).
ELMO_ENV_FILE="${OIA_VIS_ELMO_ENV_FILE:-$VIS_ROOT/elmo/.env}"
CRAWLSEO_ENV_FILE="$VIS_ROOT/crawlseo/.env"
# OIA_VIS_ONLY=elmo|crawlseo restricts backup/restore/verify to one tool.
ONLY="${OIA_VIS_ONLY:-}"
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

elmo_dc()     { docker compose -p "$ELMO_PROJECT"     --env-file "$ELMO_ENV_FILE"     -f "$VIS_ROOT/elmo/compose.yaml"     "$@"; }
crawlseo_dc() { docker compose -p "$CRAWLSEO_PROJECT" --env-file "$CRAWLSEO_ENV_FILE" -f "$VIS_ROOT/crawlseo/compose.yaml" "$@"; }

require_env() {
  [ -f "$1" ] || { echo "Fichier d'environnement absent : $1" >&2; exit 1; }
}

wait_healthy() { # project service
  local i cid
  for i in $(seq 1 60); do
    cid="$(docker ps -q --filter "label=com.docker.compose.project=$1" --filter "label=com.docker.compose.service=$2")"
    [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  echo "$1/$2 pas healthy après 120 s" >&2; return 1
}

# Dossier de travail d'une fenêtre (début, clôture, journaux) : <data>/<sujet>/<fenêtre>.
# Ancien emplacement <data>/<fenêtre>, d'avant les commandes génériques (mandat v13) :
# gardé seulement s'il porte le nom du sujet (<data>/<fenêtre>/subject.txt) et que le
# nouveau n'existe pas. OIA_VIS_STATE_DIR l'impose (tests).
window_dir() { # data subject window
  if [ -n "${OIA_VIS_STATE_DIR:-}" ]; then echo "$OIA_VIS_STATE_DIR"; return 0; fi
  if [ ! -d "$1/$2/$3" ] && [ "$(cat "$1/$3/subject.txt" 2>/dev/null)" = "$2" ]; then echo "$1/$3"; else echo "$1/$2/$3"; fi
}

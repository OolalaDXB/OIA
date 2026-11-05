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
ELMO_ENV_FILE="$VIS_ROOT/elmo/.env"
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

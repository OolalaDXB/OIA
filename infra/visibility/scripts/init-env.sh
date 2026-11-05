#!/usr/bin/env bash
# Crée elmo/.env et crawlseo/.env à partir des .env.example, avec des secrets
# générés localement. Refuse d'écraser un .env existant (un NEXTAUTH_SECRET ou
# une ELMO_ENCRYPTION_KEY régénérés rendraient les données chiffrées illisibles).
# N'affiche aucune valeur.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
umask 077

set_kv() { # file key value  (portable macOS/Linux, no sed -i)
  local f="$1" k="$2" v="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$k" -v v="$v" -F= 'BEGIN{OFS="="} $1==k{print k"="v; done=1; next} {print} END{if(!done) print k"="v}' "$f" > "$tmp"
  mv "$tmp" "$f"; chmod 600 "$f"
}

mk() { # dir
  local d="$here/$1"
  if [ -e "$d/.env" ]; then echo "$1/.env existe déjà : inchangé."; return 1; fi
  cp "$d/.env.example" "$d/.env"; chmod 600 "$d/.env"
  echo "$1/.env créé."
}

if mk elmo; then
  set_kv "$here/elmo/.env" ELMO_POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_kv "$here/elmo/.env" ELMO_ENCRYPTION_KEY    "$(openssl rand -base64 32)"
  set_kv "$here/elmo/.env" BETTER_AUTH_SECRET     "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  set_kv "$here/elmo/.env" DEPLOYMENT_ID          "$(uuidgen 2>/dev/null | tr 'A-Z' 'a-z' || cat /proc/sys/kernel/random/uuid)"
fi
if mk crawlseo; then
  set_kv "$here/crawlseo/.env" CRAWLSEO_POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_kv "$here/crawlseo/.env" NEXTAUTH_SECRET            "$(openssl rand -hex 32)"
fi
cat <<MSG

Étapes suivantes (à la main, jamais dans le repo) :
  1. Sauvegarder hors machine les secrets listés dans infra/visibility/SECRETS.md.
  2. Renseigner les clés API dans elmo/.env et l'OAuth Google dans crawlseo/.env.
MSG

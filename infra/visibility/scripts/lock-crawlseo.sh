#!/usr/bin/env bash
# À lancer juste après la première connexion Google dans CrawlSEO :
# ferme les inscriptions (DISABLE_REGISTRATION=true) et redémarre l'app.
set -euo pipefail
d="$(cd "$(dirname "$0")/../crawlseo" && pwd)"
tmp="$(mktemp)"
awk -F= 'BEGIN{OFS="="} $1=="DISABLE_REGISTRATION"{print "DISABLE_REGISTRATION=true"; done=1; next} {print} END{if(!done) print "DISABLE_REGISTRATION=true"}' "$d/.env" > "$tmp"
mv "$tmp" "$d/.env"; chmod 600 "$d/.env"
(cd "$d" && docker compose --env-file .env -f compose.yaml up -d app worker)
grep -q '^DISABLE_REGISTRATION=true$' "$d/.env" && echo "Inscriptions fermées."

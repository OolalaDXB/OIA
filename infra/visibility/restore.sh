#!/usr/bin/env bash
# Restauration sur une machine vierge (ou une installation de test séparée).
#   ./restore.sh <dossier de sauvegarde>
# Prérequis : elmo/.env et crawlseo/.env restaurés depuis le coffre de secrets
# avec les MÊMES ELMO_ENCRYPTION_KEY et NEXTAUTH_SECRET (sinon les clés et jetons
# Google stockés en base sont illisibles). Les volumes cibles doivent être vides :
# le script refuse d'écraser une base qui contient déjà des tables.
# Installation de test : clone séparé du repo + OIA_VIS_SUFFIX=-restoretest
# (projets et volumes Docker distincts). Arrêter l'installation principale pendant
# le test pour réutiliser les ports 1515/3100 et l'URI de redirection OAuth.
set -euo pipefail
source "$(dirname "$0")/scripts/lib.sh"
src="${1:?usage: restore.sh <dossier de sauvegarde>}"
src="$(cd "$src" && pwd)"
want elmo && { require_env "$ELMO_ENV_FILE"; [ -s "$src/elmo.dump" ] || { echo "$src/elmo.dump manquant" >&2; exit 1; }; }
want crawlseo && { require_env "$CRAWLSEO_ENV_FILE"; [ -s "$src/crawlseo.dump" ] || { echo "$src/crawlseo.dump manquant" >&2; exit 1; }; }
[ -s "$src/SHA256SUMS" ] || { echo "$src/SHA256SUMS manquant" >&2; exit 1; }
(cd "$src" && { command -v sha256sum >/dev/null && sha256sum -c SHA256SUMS || shasum -a 256 -c SHA256SUMS; })

empty_db() { # dc-func service user db
  local n
  n="$("$1" exec -T "$2" psql -U "$3" -d "$4" -tAc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
  [ "$(echo "$n" | tr -d '[:space:]')" = 0 ]
}

if want elmo; then
echo "== Elmo ($ELMO_PROJECT)"
# Postgres seul d'abord : db-migrate ne doit pas créer un schéma vide avant la restauration.
elmo_dc up -d postgres
wait_healthy "$ELMO_PROJECT" postgres
empty_db elmo_dc postgres elmo elmo || { echo "La base Elmo n'est pas vide : abandon." >&2; exit 1; }
elmo_dc exec -T postgres pg_restore -U elmo -d elmo --no-owner --exit-on-error < "$src/elmo.dump"
elmo_dc up -d
fi

if want crawlseo; then
echo "== CrawlSEO ($CRAWLSEO_PROJECT)"
# db seul d'abord : l'app lance les migrations Prisma à son démarrage.
crawlseo_dc up -d db
wait_healthy "$CRAWLSEO_PROJECT" db
empty_db crawlseo_dc db crawlseo crawlseo || { echo "La base CrawlSEO n'est pas vide : abandon." >&2; exit 1; }
crawlseo_dc exec -T db pg_restore -U crawlseo -d crawlseo --no-owner --exit-on-error < "$src/crawlseo.dump"
crawlseo_dc up -d
fi

echo "Restauration terminée. Vérifier : scripts/verify-restore.sh"

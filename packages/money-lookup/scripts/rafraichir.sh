#!/usr/bin/env bash
# Rafraîchissement quotidien de Money Lookup (mandat v9, bloc B), lancé par
# launchd (quotidien.sh). Lit le dernier instantané publié par le pipeline de
# découverte (origin/main:apps/web/src/data/console.json, workflow discovery.yml),
# produit le script du chargeur (idempotent, un lot par instantané) et
# l'applique sur la base OIA. Notification macOS SEULEMENT en cas d'échec.
#
# Mot de passe : ~/.oia/supabase.env (OIA_DB_PASSWORD), lu ici, jamais affiché.
# OIA_ML_SQL=<commande> remplace psql (tests) ; OIA_ML_SANS_FETCH=1 saute git fetch.
set -uo pipefail
racine="$(cd "$(dirname "$0")/../../.." && pwd)"
donnees="${OIA_ML_DATA:-$HOME/oia-money-lookup}"
mkdir -p "$donnees" && chmod 700 "$donnees"
jour="$(date -u +%Y-%m-%d)"
journal="$donnees/rafraichir.log"

echec() {
  echo "$(date -u +%FT%TZ) ÉCHEC : $1" >> "$journal"
  [ -z "${OIA_ML_SQL:-}" ] && osascript -e "display notification \"$1\" with title \"OIA · Money Lookup\" subtitle \"Rafraîchissement en échec\"" >/dev/null 2>&1
  exit 1
}

cd "$racine" || echec "dépôt introuvable"
[ -n "${OIA_ML_SANS_FETCH:-}" ] || git fetch -q origin main || echec "git fetch impossible"
source_json="$donnees/console-$jour.json"
git show origin/main:apps/web/src/data/console.json > "$source_json" || echec "instantané introuvable sur origin/main"
script="$donnees/chargement-$jour.sql"
pnpm -s --filter @oia/money-lookup charger -- --source "$source_json" --sortie "$script" 2>> "$journal" || echec "chargeur en échec"

appliquer() {
  if [ -n "${OIA_ML_SQL:-}" ]; then
    $OIA_ML_SQL
  else
    local mdp
    mdp="$(sed -n 's/^OIA_DB_PASSWORD=//p' "$HOME/.oia/supabase.env" | sed -e "s/^['\"]//" -e "s/['\"]$//")"
    [ -n "$mdp" ] || return 1
    PGPASSWORD="$mdp" PGSSLMODE=require psql -X -q -At -v ON_ERROR_STOP=1 \
      -h "${OIA_DB_HOST:-aws-0-eu-central-1.pooler.supabase.com}" -p 5432 \
      -U "postgres.iywmvyebuikxyvnrcnoy" -d postgres
  fi
}
{ echo 'set client_min_messages = warning;'; cat "$script"; } | appliquer >> "$journal" 2>&1 || echec "application sur la base OIA refusée"
echo "$(date -u +%FT%TZ) ok : $(head -1 "$script" | sed 's/^-- //')" >> "$journal"
# Projets du registre vers oia_projet (migration 0008), idempotent.
projets="$donnees/projets-$jour.sql"
pnpm -s --filter @oia/money-lookup charger -- --projets --sortie "$projets" 2>> "$journal" || echec "chargeur des projets en échec"
{ echo 'set client_min_messages = warning;'; cat "$projets"; } | appliquer >> "$journal" 2>&1 || echec "projets refusés par la base OIA"
echo "$(date -u +%FT%TZ) ok : projets du registre" >> "$journal"
# On garde les sept derniers jours.
find "$donnees" -name 'console-*.json' -mtime +7 -delete; find "$donnees" -name 'chargement-*.sql' -mtime +7 -delete; find "$donnees" -name 'projets-*.sql' -mtime +7 -delete

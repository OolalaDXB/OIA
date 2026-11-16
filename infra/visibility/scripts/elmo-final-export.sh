#!/usr/bin/env bash
# Export complet et final d'Elmo (mandat v14, bloc A), en LECTURE SEULE : rien n'est
# modifié ni supprimé dans Elmo.
#
#   ./scripts/elmo-final-export.sh            (OIA_VIS_FINAL_DIR : défaut ~/oia-sauvegardes/elmo-final)
#
# Produit <dossier>/<horodatage UTC>/ :
#   elmo.dump        pg_dump -Fc de toute la base
#   counts.tsv       nombre exact de lignes de chaque table (schéma.table, lignes), lu dans Elmo
#   restore.tsv      mêmes comptes, relus sur un Postgres jetable où la sauvegarde est restaurée
#   json/<table>.json  une table par fichier (json_agg), pour les tables qui ont une valeur de
#                    preuve ou de configuration ; `secrets` : noms seulement, jamais les valeurs
#   MANIFEST.txt     versions, horodatage, image Postgres
#   SHA256SUMS       empreintes de tous les fichiers ci-dessus
#
# Postgres jetable : un conteneur dédié, de la MÊME image que celui d'Elmo, sans réseau,
# supprimé à la fin ; aucun conteneur existant n'est touché.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
base="${OIA_VIS_FINAL_DIR:-$HOME/oia-sauvegardes/elmo-final}"
repo="$(git -C "$VIS_ROOT" rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"
case "$base/" in "$repo/"*) echo "le dossier d'export ne doit pas être dans le dépôt : $base" >&2; exit 2 ;; esac
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$base/$ts"; mkdir -p "$out/json"; chmod 700 "$base" "$out"
ro=(-e PGOPTIONS='-c default_transaction_read_only=on')
psql_ro() { elmo_dc exec -T "${ro[@]}" postgres psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 "$@"; }

# Comptes exacts de toutes les tables (count(*), pas l'estimation des statistiques).
COUNT_SQL="select format('select %L || chr(9) || count(*) from %I.%I', schemaname || '.' || relname, schemaname, relname)
  from pg_stat_user_tables order by schemaname, relname"
count_tables() { # commande psql (lit le SQL sur stdin)
  local q; q="$("$@" -c "$COUNT_SQL")"
  printf '%s\n' "$q" | sed 's/$/;/' | "$@"
}

echo "# Export final d'Elmo · $ts → $out"
elmo_dc exec -T postgres pg_dump -U elmo -d elmo -Fc --no-owner > "$out/elmo.dump"
[ -s "$out/elmo.dump" ] || { echo "sauvegarde vide" >&2; exit 1; }
count_tables psql_ro > "$out/counts.tsv"
echo "sauvegarde : $(wc -c < "$out/elmo.dump" | tr -d ' ') octets, $(wc -l < "$out/counts.tsv" | tr -d ' ') tables comptées"

# Tables à valeur de preuve ou de configuration, exportées en JSON.
for t in brands prompts competitors prompt_runs run_extractions run_mentions citations cited_pages \
         usage_events reports brand_opportunities organization_settings; do
  psql_ro -c "select coalesce(json_agg(t), '[]'::json) from public.$t t" > "$out/json/$t.json"
done
psql_ro -c "select coalesce(json_agg(json_build_object('name', name, 'created_at', created_at, 'updated_at', updated_at)), '[]'::json) from public.secrets" > "$out/json/secrets-noms.json"
# Contrôle : aucune clé reconnaissable dans les exports.
if grep -lE 'sk-(ant-|or-|proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY' "$out"/json/*.json; then
  echo "clé repérée dans un export : arrêt" >&2; exit 1
fi
echo "exports JSON : $(ls "$out/json" | wc -l | tr -d ' ') fichiers"

# Relecture sur un Postgres jetable de la même image.
image="$(docker inspect "$(elmo_dc ps -q postgres)" --format '{{.Image}}')"
name="oia-elmo-final-verif-$ts"; name="$(printf '%s' "$name" | tr 'A-Z' 'a-z')"
pw="$(openssl rand -hex 16)"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$name" --network none -e POSTGRES_PASSWORD="$pw" -e POSTGRES_USER=elmo -e POSTGRES_DB=elmo "$image" >/dev/null
for _ in $(seq 1 60); do docker exec "$name" pg_isready -U elmo -d elmo >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$name" pg_restore -U elmo -d elmo --no-owner --exit-on-error < "$out/elmo.dump"
count_tables docker exec -i "$name" psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 > "$out/restore.tsv"
cleanup; trap - EXIT
if ! diff -u "$out/counts.tsv" "$out/restore.tsv"; then echo "comptes différents après restauration : sauvegarde NON vérifiée" >&2; exit 1; fi
echo "sauvegarde relue sur un Postgres jetable ($image) : comptes identiques sur $(wc -l < "$out/restore.tsv" | tr -d ' ') tables"

{
  echo "exported_at=$ts"
  echo "elmo_images=$(elmo_dc config --images | tr '\n' ' ')"
  echo "elmo_pg=$(elmo_dc exec -T postgres postgres --version | tr -d '\r')"
  echo "verify_image=$image"
} > "$out/MANIFEST.txt"
(cd "$out" && find . -type f ! -name SHA256SUMS | sort | xargs shasum -a 256 > SHA256SUMS)
chmod -R go-rwx "$out"
echo "empreintes : $out/SHA256SUMS"
echo "$out"

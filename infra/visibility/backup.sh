#!/usr/bin/env bash
# Sauvegarde horodatée des bases Elmo et CrawlSEO, HORS du repo.
#   BACKUP_DIR (défaut : ~/oia-visibility-backups)
# Produit : <BACKUP_DIR>/<UTC timestamp>/{elmo.dump,crawlseo.dump,MANIFEST.txt,SHA256SUMS}
# Ne copie AUCUN secret : les .env se sauvegardent à part (voir SECRETS.md).
set -euo pipefail
source "$(dirname "$0")/scripts/lib.sh"
want elmo && require_env "$ELMO_ENV_FILE"; want crawlseo && require_env "$CRAWLSEO_ENV_FILE"; true

base="${BACKUP_DIR:-$HOME/oia-visibility-backups}"
mkdir -p "$base"; base="$(cd "$base" && pwd)"
repo="$(git -C "$VIS_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$repo" ]; then
  case "$base/" in "$repo/"*) echo "BACKUP_DIR est dans le repo ($repo) : refusé." >&2; exit 1;; esac
fi
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$base/$ts"
umask 077; mkdir -p "$out"

dumps=()
if want elmo; then
  echo "Dump Elmo…"
  elmo_dc exec -T postgres pg_dump -U elmo -d elmo -Fc --no-owner > "$out/elmo.dump"; dumps+=(elmo.dump)
fi
if want crawlseo; then
  echo "Dump CrawlSEO…"
  crawlseo_dc exec -T db pg_dump -U crawlseo -d crawlseo -Fc --no-owner > "$out/crawlseo.dump"; dumps+=(crawlseo.dump)
fi
for f in "${dumps[@]}"; do [ -s "$out/$f" ] || { echo "$f vide" >&2; exit 1; }; done

{
  echo "created_utc=$ts"
  echo "host_arch=$(uname -m)"
  if want elmo; then
    echo "elmo_images=$(elmo_dc config --images | tr '\n' ' ')"
    echo "elmo_pg=$(elmo_dc exec -T postgres postgres --version | tr -d '\r')"
  fi
  if want crawlseo; then
    echo "crawlseo_images=$(crawlseo_dc config --images | tr '\n' ' ')"
    echo "crawlseo_pg=$(crawlseo_dc exec -T db postgres --version | tr -d '\r')"
  fi
  echo "repo_commit=$(git -C "$VIS_ROOT" rev-parse --short HEAD 2>/dev/null || echo n/a)"
} > "$out/MANIFEST.txt"
(cd "$out" && { command -v sha256sum >/dev/null && sha256sum "${dumps[@]}" || shasum -a 256 "${dumps[@]}"; } > SHA256SUMS)

echo "Sauvegarde : $out"
ls -l "$out"
echo "Rappel : les secrets (SECRETS.md) ne sont PAS dans cette sauvegarde."

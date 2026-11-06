#!/usr/bin/env bash
# Crawlie v0.5.3 (épinglé, via npx : aucune installation globale) — crawl complet
# des sites de chaque sujet, rapports JSON bruts conservés HORS du repo.
#   ./scripts/crawlie-audit.sh            tous les sujets
#   ./scripts/crawlie-audit.sh <id>       un seul sujet
# Les URL viennent des définitions de sujets (subjects/ ou OIA_VIS_SUBJECTS_DIR) :
# l'URL principale et les URL additionnelles confirmées.
#   OIA_VIS_DATA (défaut : ~/oia-visibility-data) -> <data>/crawlie/<UTC>/<sujet>/<hôte>.json
# Lecture seule côté sites : requêtes GET, robots.txt respecté, concurrence réduite.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
CRAWLIE="crawlie@0.5.3"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$data/crawlie/$ts"; mkdir -p "$out"
npx -y "$CRAWLIE" --version > "$out/VERSION.txt" 2>&1 || true

targets="$(cd "$here" && pnpm -s subjects urls ${1:+"$1"})"
[ -n "$targets" ] || { echo "Aucun sujet trouvé." >&2; exit 1; }
while IFS=$'\t' read -r subject url; do
  host="$(echo "$url" | sed -E 's#https?://##; s#/.*##')"
  mkdir -p "$out/$subject"
  echo "[$subject] crawl ${url}..."
  npx -y "$CRAWLIE" crawl "$url" --format json --max-pages 5000 --concurrency 4 \
      -o "$out/$subject/$host.json" 2> "$out/$subject/$host.stderr.log" \
    && echo "  -> $out/$subject/$host.json" \
    || echo "  ÉCHEC (voir $out/$subject/$host.stderr.log)"
done <<< "$targets"

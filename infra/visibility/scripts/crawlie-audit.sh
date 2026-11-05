#!/usr/bin/env bash
# Crawlie v0.5.3 (épinglé, via npx : aucune installation globale) — crawl complet
# des deux sites, rapports JSON bruts conservés HORS du repo.
#   OIA_VIS_DATA (défaut : ~/oia-visibility-data)  ->  <data>/crawlie/<UTC>/<site>.json
# Lecture seule côté sites : requêtes GET, robots.txt respecté, concurrence réduite.
set -euo pipefail
CRAWLIE="crawlie@0.5.3"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$data/crawlie/$ts"; mkdir -p "$out"
sites=("https://coachgari28.com" "https://maisons.co")
npx -y "$CRAWLIE" --version > "$out/VERSION.txt" 2>&1 || true
for url in "${sites[@]}"; do
  name="$(echo "$url" | sed -E 's#https?://##; s#/.*##')"
  echo "Crawl $url…"
  npx -y "$CRAWLIE" crawl "$url" --format json --max-pages 5000 --concurrency 4 \
      -o "$out/$name.json" 2> "$out/$name.stderr.log" \
    && echo "  -> $out/$name.json" \
    || echo "  ÉCHEC (voir $out/$name.stderr.log)"
done

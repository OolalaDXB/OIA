#!/usr/bin/env bash
# Étape 0 — état des lieux de la machine. Lecture seule : n'installe, ne démarre
# et ne modifie rien. Ne lit aucun secret.
# Usage : infra/visibility/scripts/preflight.sh > ~/oia-visibility-data/preflight.txt
set -u
echo "# OIA Visibility — preflight $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "## Machine";  uname -sm; command -v sw_vers >/dev/null && sw_vers
echo "## Docker"
docker version --format 'client {{.Client.Version}} ({{.Client.Arch}}) / server {{.Server.Version}} ({{.Server.Arch}})' 2>&1
docker compose version 2>&1
docker info --format 'cpus={{.NCPU}} mem={{.MemTotal}} rootdir={{.DockerRootDir}}' 2>&1
echo "## Node / npm"; node --version 2>&1; npm --version 2>&1
echo "## Ports (1515, 3000, 3100, 5432-5435)"
for p in 1515 3000 3100 5432 5433 5434 5435; do
  if command -v lsof >/dev/null; then
    out=$(lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1" pid="$2" "$9}' | sort -u)
  else
    out=$(ss -ltnp "sport = :$p" 2>/dev/null | awk 'NR>1{print $4" "$6}')
  fi
  printf '%-5s %s\n' "$p" "${out:-libre}"
done
echo "## Conteneurs publiant ces ports"
docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E ':(1515|3000|3100|543[2-5])->' || echo "aucun"
echo "## Volumes Docker existants (oia-*)"
docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E '^oia-' || echo "aucun"
echo "## Images arm64 disponibles (manifestes multi-arch)"
for img in \
  elmohq/elmo-web:0.7.7 elmohq/elmo-worker:0.7.7 elmohq/elmo-db-migrate:0.7.7 \
  postgres:18-alpine ghcr.io/crawlseo/crawlseo:0.3.6 postgres:16-alpine; do
  archs=$(docker buildx imagetools inspect "$img" 2>/dev/null | awk '/Platform:/{print $2}' | grep -v unknown | tr '\n' ' ')
  printf '%-40s %s\n' "$img" "${archs:-INACCESSIBLE}"
done
echo "## Crawlie (npm)"
npm view crawlie@0.5.3 optionalDependencies 2>&1 | grep darwin-arm64 || echo "darwin-arm64 absent"
echo "## Mise en veille (Mac)"
command -v pmset >/dev/null && pmset -g | grep -E ' sleep|disksleep|displaysleep' || true

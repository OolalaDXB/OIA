#!/usr/bin/env bash
# Voir une fenêtre de mesure dans l'écran conçu avec Lovable, en local.
#
#   pnpm vis:j0-view                      (depuis la racine du dépôt)
#   ./scripts/j0-view.sh <subjectId>
#
# 1. Met à jour visibility.json (scripts/vis-export.sh, lecture seule d'Elmo).
# 2. Prépare un worktree temporaire de la branche du prototype, HORS du dépôt
#    (~/oia-visibility-data/prototype-worktree), en tête détachée : la branche
#    n'est jamais modifiée, rien n'y est commité.
# 3. Installe les dépendances du prototype une fois (sans scripts
#    d'installation), copie visibility.json dans public/data/ (données de
#    client : jamais commitées, voir .gitignore), sert l'écran sur 127.0.0.1
#    et l'ouvre dans le navigateur (OIA_VIS_NO_OPEN=1 pour ne pas l'ouvrir).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"
[ -n "$subject" ] || { echo "usage: j0-view.sh <subjectId>" >&2; exit 2; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
branch="${OIA_VIS_PROTOTYPE_BRANCH:-lovable/oia-visibility-prototype}"
wt="${OIA_VIS_PROTOTYPE_WORKTREE:-$data/prototype-worktree}"
app="$wt/prototypes/oia-prototype"
port="${OIA_VIS_VIEW_PORT:-4317}"
url="http://127.0.0.1:$port/"
repo="$(git -C "$VIS_ROOT" rev-parse --show-toplevel)"
case "$wt/" in "$repo"/*) echo "le worktree doit être hors du dépôt : $wt" >&2; exit 2 ;; esac

# 1. Données
json="$("$VIS_ROOT/scripts/vis-export.sh" "$subject")"
echo "données : $json"

# 2. Worktree en tête détachée sur la dernière version de la branche
git -C "$repo" fetch -q origin "$branch"
if [ -d "$wt/.git" ] || [ -f "$wt/.git" ]; then
  git -C "$wt" checkout -q --detach "origin/$branch"
else
  mkdir -p "$(dirname "$wt")"
  git -C "$repo" worktree add -q --detach "$wt" "origin/$branch"
fi
echo "prototype : $(git -C "$wt" rev-parse --short HEAD) ($branch, tête détachée)"
# Exclusion locale (info/exclude, jamais commitée) : la branche n'ignore pas
# encore ces fichiers ; aucun ne doit pouvoir être ajouté par mégarde.
exclude="$(git -C "$wt" rev-parse --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$exclude")"
for p in prototypes/oia-prototype/public/data/ prototypes/oia-prototype/pnpm-lock.yaml prototypes/oia-prototype/src/routeTree.gen.ts; do
  grep -qxF "$p" "$exclude" 2>/dev/null || echo "$p" >> "$exclude"
done

# 3. Dépendances (une fois), données, serveur
if [ ! -d "$app/node_modules" ]; then
  echo "installation des dépendances du prototype (une fois, sans scripts d'installation)…"
  (cd "$app" && pnpm install --ignore-workspace --ignore-scripts --reporter=silent)
fi
mkdir -p "$app/public/data"
cp "$json" "$app/public/data/visibility.json"

if ! curl -s -o /dev/null "$url"; then
  # Détaché du terminal (entrée, sorties) pour que la commande rende la main.
  (cd "$app" && nohup pnpm exec vite dev --host 127.0.0.1 --port "$port" --strictPort \
     < /dev/null > "$data/prototype-view.log" 2>&1 &
   echo $! > "$data/prototype-view.pid"; disown) < /dev/null > /dev/null 2>&1
  for _ in $(seq 1 60); do curl -s -o /dev/null "$url" && break; sleep 1; done
fi
curl -s -o /dev/null "$url" || { echo "l'écran ne répond pas sur $url (journal : $data/prototype-view.log)" >&2; exit 1; }
echo "écran : $url (arrêt : kill \$(cat $data/prototype-view.pid))"

if ! grep -rqs "visibility.json" "$app/src"; then
  echo
  echo "ATTENTION : le prototype ne lit pas encore public/data/visibility.json ; il affiche"
  echo "ses données de démonstration (src/data/demo.ts). Ajustement à demander à Lovable :"
  echo "charger /data/visibility.json au démarrage, à la place de src/data/demo.ts."
fi
[ -n "${OIA_VIS_NO_OPEN:-}" ] || { command -v open >/dev/null && open "$url"; } || true

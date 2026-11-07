#!/usr/bin/env bash
# Contrôle d'intégrité du gel en fin de fenêtre (mandat v7, bloc C), en
# lecture seule du dépôt local du site : aucun commit sur la surface publique
# depuis l'état de la branche au début de la fenêtre (le pin), et pages de
# service toujours en noindex. Ne modifie ni l'arbre de travail ni les
# branches locales ; met seulement à jour les références distantes (fetch).
#   ./scripts/freeze-check.sh <subjectId> <début de fenêtre ISO UTC>
# Code de sortie : 0 gel intact, 1 gel rompu, 2 contrôle impossible.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
subject="${1:-}"; started="${2:-}"
[ -n "$subject" ] && [ -n "$started" ] || { echo "usage: freeze-check.sh <subjectId> <début ISO UTC>" >&2; exit 2; }
subjects_dir="${OIA_VIS_SUBJECTS_DIR:-$VIS_ROOT/subjects}"
cfg="$subjects_dir/$subject/freeze-surface.yaml"
[ -f "$cfg" ] || { echo "contrôle impossible : $cfg absent"; exit 2; }
read_cfg() { node -e 'const y=require(process.argv[1]).parse(require("fs").readFileSync(process.argv[2],"utf8"));const v=y[process.argv[3]];process.stdout.write(Array.isArray(v)?v.join("\n"):String(v))' "$VIS_ROOT/node_modules/yaml" "$cfg" "$1"; }
repo="${OIA_VIS_FREEZE_REPO:-$(read_cfg repoPath)}"; repo="${repo/#\~/$HOME}"
branch="$(read_cfg branch)"
[ -d "$repo/.git" ] || { echo "contrôle impossible : dépôt local $repo absent"; exit 2; }
git -C "$repo" fetch -q origin "$branch" 2>/dev/null || echo "avertissement : fetch impossible, contrôle sur les références locales"
ref="origin/$branch"
pin="$(git -C "$repo" rev-list -1 --before="$started" "$ref")"
[ -n "$pin" ] || { echo "contrôle impossible : aucun commit de $ref avant $started"; exit 2; }
head="$(git -C "$repo" rev-parse "$ref")"
rc=0
echo "pin (état de $ref au début de la fenêtre) : ${pin:0:7} ; état actuel : ${head:0:7}"
files=(); while IFS= read -r f; do [ -n "$f" ] && files+=("$f"); done < <(read_cfg publicFiles; echo)
[ "${#files[@]}" -gt 0 ] || { echo "contrôle impossible : publicFiles vide"; exit 2; }
changed="$(git -C "$repo" diff --name-only "$pin" "$head" -- "${files[@]}")"
if [ -n "$changed" ]; then
  echo "GEL ROMPU PENDANT LA FENÊTRE : surface publique modifiée depuis le pin :"; printf '  %s\n' $changed
  git -C "$repo" log --format='  %h %ci %s' "$pin..$head" -- "${files[@]}"
  rc=1
else
  echo "surface publique inchangée pendant la fenêtre ($(git -C "$repo" rev-list --count "$pin..$head") commit(s) ailleurs)"
fi
since="$(read_cfg freezeSince 2>/dev/null || true)"
if [ -n "$since" ] && [ "$since" != "undefined" ]; then
  before="$(git -C "$repo" log --format='  %h %ci %s' --since="$since" "$pin" -- "${files[@]}")"
  if [ -n "$before" ]; then
    echo "GEL ROMPU AVANT LA FENÊTRE (depuis la décision du gel, $since) :"; printf '%s\n' "$before"
    rc=1
  fi
fi
noindex=(); while IFS= read -r f; do [ -n "$f" ] && noindex+=("$f"); done < <(read_cfg noindexFiles; echo)
for f in "${noindex[@]}"; do
  # Contenu lu d'abord : avec pipefail, `git show | grep -q` échoue sur SIGPIPE.
  content="$(git -C "$repo" show "$head:$f" 2>/dev/null || true)"
  at_pin="$(git -C "$repo" show "$pin:$f" 2>/dev/null || true)"
  if printf '%s' "$content" | grep -i 'noindex' >/dev/null; then echo "noindex conservé : $f"
  elif printf '%s' "$at_pin" | grep -i 'noindex' >/dev/null; then echo "GEL ROMPU : noindex retiré de $f pendant la fenêtre"; rc=1
  else echo "noindex déjà absent de $f au début de la fenêtre (voir les commits avant la fenêtre)"; rc=1; fi
done
[ "$rc" = 0 ] && echo "GEL INTACT"
exit $rc

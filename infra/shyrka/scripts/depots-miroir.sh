#!/bin/bash
# Copie en lecture seule des dépôts GitHub du compte OolalaDXB sur le volume chiffré
# (mandat du 9 novembre 2026). Dernière version seulement (--depth 1) : aucun historique.
# Rien n'est jamais écrit vers GitHub : clone et fetch seulement, crochets Git désactivés.
# Le volume doit être monté et chiffré, sinon rien n'est fait (aucun repli ailleurs).
# Ensuite, si la passerelle de Shyrka tourne, elle réindexe les dépôts déjà validés.
#   depots-miroir.sh            tous les dépôts
#   depots-miroir.sh SILLON OIA quelques dépôts
set -uo pipefail
VOLUME=/Volumes/Shyrka-corpus
DEST="$VOLUME/brut/depots-git"
COMPTE=OolalaDXB
JOURNAL="$VOLUME/journal/depots.md"

hdiutil info -plist | plutil -convert json -o - - | python3 -c "
import json,sys; d=json.load(sys.stdin)
ok=any(e.get('mount-point')=='$VOLUME' for i in d.get('images',[]) if i.get('image-encrypted') for e in i.get('system-entities',[]))
sys.exit(0 if ok else 1)" || { echo "Volume $VOLUME absent ou non chiffré : rien n'est copié."; exit 1; }
mkdir -p "$DEST" "$VOLUME/journal" && chmod 700 "$DEST"

depots=("$@")
[ $# -eq 0 ] && depots=()
if [ ${#depots[@]} -eq 0 ]; then
  while IFS= read -r n; do depots+=("$n"); done < <(gh repo list "$COMPTE" --limit 500 --json name,isArchived --jq '.[] | select(.isArchived | not) | .name')
fi
ok=0; ko=0; vides=0
for d in "${depots[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "nom refusé : $d"; continue; }
  cible="$DEST/$d"
  if [ -d "$cible/.git" ] && ! git -C "$cible" rev-parse -q --verify HEAD >/dev/null 2>&1 && [ -z "$(git -C "$cible" ls-remote --heads origin 2>/dev/null)" ]; then
    vides=$((vides + 1))  # dépôt vide sur GitHub : rien à copier
  elif [ -d "$cible/.git" ]; then
    git -C "$cible" -c core.hooksPath=/dev/null fetch --quiet --depth 1 origin HEAD && git -C "$cible" reset --quiet --hard FETCH_HEAD && git -C "$cible" clean -qfdx \
      && ok=$((ok + 1)) || { ko=$((ko + 1)); echo "échec : $d"; }
  else
    gh repo clone "$COMPTE/$d" "$cible" -- --quiet --depth 1 --single-branch -c core.hooksPath=/dev/null >/dev/null 2>&1 \
      && ok=$((ok + 1)) || { ko=$((ko + 1)); echo "échec : $d"; }
  fi
done
# Visibilité sur GitHub (public ou privé), pour proposer un niveau par dépôt.
gh repo list "$COMPTE" --limit 500 --json name,isPrivate --jq 'map({(.name): (.isPrivate | not)}) | add' > "$DEST/.visibilites.json" 2>/dev/null || true
chmod -R go-rwx "$DEST"
printf -- '- %s · copie des dépôts : %s à jour, %s vide(s), %s en échec\n' "$(date -u +%FT%TZ)" "$ok" "$vides" "$ko" >> "$JOURNAL"
echo "Dépôts : $ok à jour, $vides vide(s), $ko en échec ($(du -sh "$DEST" | cut -f1))."

# Réindexation par la passerelle (si elle tourne) : seuls les dépôts validés par Mickaël sont indexés.
JETON="$HOME/oia-shyrka-data/passerelle/jeton"
if [ -r "$JETON" ] && curl -fsS -m 2 http://127.0.0.1:8179/v1/sante >/dev/null 2>&1; then
  curl -fsS -m 600 -X POST -H "x-shyrka-jeton: $(cat "$JETON")" -H "content-type: application/json" -d '{}' http://127.0.0.1:8179/v1/corpus/collections/rafraichir >/dev/null \
    && echo "Passerelle : dépôts validés réindexés." || echo "Passerelle : réindexation non faite."
fi

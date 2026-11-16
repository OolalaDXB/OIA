#!/usr/bin/env bash
# Installation du moteur sur le Mac (mandat v16, bloc B) : deux tâches launchd du compte de
# l'utilisateur, à partir des gabarits de scripts/launchd/ :
#   com.oia.visibility.moteur            un passage toutes les 5 minutes (file de demandes)
#   com.oia.visibility.moteur.quotidien  le passage du jour, à runTimeUtc (heure locale calculée)
# Les deux se relancent seules après un plantage et au démarrage de la session.
# Journaux : ~/Library/Logs/oia-visibility/ (hors du dépôt ; aucune donnée client).
#
#   ./scripts/engine-install.sh install  [--heure-utc HH:MM]   écrit et charge les tâches
#   ./scripts/engine-install.sh remove                         décharge et retire les tâches
#   ./scripts/engine-install.sh preparer <dossier> [--heure-utc HH:MM]
#                                         écrit les plist dans <dossier>, sans rien charger
# Heure du passage quotidien : --heure-utc, sinon OIA_VIS_RUN_TIME_UTC, sinon 07:00 UTC.
# Réveil du Mac à cette heure : docs/moteur-mac.md (pmset), geste de Mickaël.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
action="${1:-}"; shift || true
out=""
if [ "$action" = preparer ]; then out="${1:-}"; shift || true; [ -n "$out" ] || { echo "usage: engine-install.sh preparer <dossier> [--heure-utc HH:MM]" >&2; exit 2; }; fi
utc="${OIA_VIS_RUN_TIME_UTC:-07:00}"
while [ $# -gt 0 ]; do
  case "$1" in
    --heure-utc) utc="${2:-}"; shift 2 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done
[[ "$utc" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "heure UTC invalide : $utc (HH:MM attendu)" >&2; exit 2; }
labels="com.oia.visibility.moteur com.oia.visibility.moteur.quotidien"
domain="gui/$(id -u)"
agents="$HOME/Library/LaunchAgents"
logs="$HOME/Library/Logs/oia-visibility"

if [ "$action" = remove ]; then
  for l in $labels; do launchctl bootout "$domain/$l" >/dev/null 2>&1 || true; rm -f "$agents/$l.plist"; echo "tâche $l retirée"; done
  exit 0
fi
{ [ "$action" = install ] || [ "$action" = preparer ]; } || { echo "usage: engine-install.sh install|remove|preparer <dossier> [--heure-utc HH:MM]" >&2; exit 2; }

# Heure locale du jour pour l'heure UTC donnée (launchd compte en heure locale).
read -r hour minute < <(node -e 'const [h,m]=process.argv[1].split(":").map(Number);const d=new Date();d.setUTCHours(h,m,0,0);process.stdout.write(`${d.getHours()} ${d.getMinutes()}\n`)' "$utc")
dest="${out:-$agents}"
mkdir -p "$dest"
for l in $labels; do
  sed -e "s#@VIS_ROOT@#$VIS_ROOT#g" -e "s#@PATH@#$PATH#g" -e "s#@HOME@#$HOME#g" -e "s#@LOGS@#$logs#g" -e "s#@HOUR@#$hour#g" -e "s#@MINUTE@#$minute#g" \
    "$VIS_ROOT/scripts/launchd/$l.plist.in" > "$dest/$l.plist"
  if command -v plutil >/dev/null; then plutil -lint "$dest/$l.plist" >/dev/null; fi
  echo "écrit : $dest/$l.plist"
done
if [ "$action" = preparer ]; then
  printf 'passage quotidien : %s UTC, soit %02d:%02d heure locale ; rien n'"'"'est chargé.\n' "$utc" "$hour" "$minute"
  exit 0
fi
mkdir -p "$logs"
for l in $labels; do
  launchctl bootout "$domain/$l" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$agents/$l.plist"
done
printf 'moteur installé : file toutes les 5 minutes, passage quotidien à %s UTC (%02d:%02d heure locale). Journaux : %s\n' "$utc" "$hour" "$minute" "$logs"
echo "Changement d'heure (été/hiver) : relancer cette commande pour recaler l'heure locale."

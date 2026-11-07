#!/usr/bin/env bash
# Installe ou retire la tâche quotidienne de Money Lookup (launchd, compte de
# l'utilisateur) : rafraichir.sh chaque jour à 11 h 30, heure du Mac, après le
# pipeline de découverte (lundi 06:00 UTC).
#   ./scripts/quotidien.sh install | remove
set -euo pipefail
action="${1:-}"
[ "$action" = install ] || [ "$action" = remove ] || { echo "usage: quotidien.sh install|remove" >&2; exit 2; }
ici="$(cd "$(dirname "$0")" && pwd)"
donnees="${OIA_ML_DATA:-$HOME/oia-money-lookup}"
label="com.oia.money-lookup.rafraichir"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"
launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
if [ "$action" = remove ]; then rm -f "$plist"; echo "tâche $label retirée"; exit 0; fi
mkdir -p "$(dirname "$plist")" "$donnees"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$ici/rafraichir.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>11</integer><key>Minute</key><integer>30</integer></dict>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>StandardOutPath</key><string>$donnees/launchd.log</string>
  <key>StandardErrorPath</key><string>$donnees/launchd.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "$domain" "$plist"
echo "tâche $label installée : chaque jour à 11:30 (heure locale), journal $donnees/rafraichir.log"

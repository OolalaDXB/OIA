#!/usr/bin/env bash
# Installe ou retire la tâche quotidienne d'une fenêtre (launchd, compte de
# l'utilisateur). Elle lance j0-watch-day.sh chaque jour, une heure après
# l'heure de démarrage du worker (heure locale du Mac).
#   ./scripts/j0-watch.sh install <subjectId>   (pnpm vis:j0-watch:install)
#   ./scripts/j0-watch.sh remove  <subjectId>   (pnpm vis:j0-watch:remove)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
action="${1:-}"; subject="${2:-}"
[ -n "$subject" ] && { [ "$action" = install ] || [ "$action" = remove ]; } || { echo "usage: j0-watch.sh install|remove <subjectId>" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
label="com.oia.visibility.$subject.$window.watch"
plist="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

if [ "$action" = remove ]; then
  launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
  rm -f "$plist"
  echo "tâche $label retirée"
  exit 0
fi

started="$(cat "$data/$window/started-at.txt" 2>/dev/null || true)"
[ -n "$started" ] || { echo "début de fenêtre inconnu ($data/$window/started-at.txt)" >&2; exit 1; }
read -r hour minute < <(node -e 'const t=new Date(Date.parse(process.argv[1])+36e5);process.stdout.write(`${t.getHours()} ${t.getMinutes()}\n`)' "$started")
mkdir -p "$(dirname "$plist")" "$data/$window"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$VIS_ROOT/scripts/j0-watch-day.sh</string><string>$subject</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$hour</integer><key>Minute</key><integer>$minute</integer></dict>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string><key>OIA_VIS_WINDOW</key><string>$window</string><key>OIA_VIS_DATA</key><string>$data</string></dict>
  <key>StandardOutPath</key><string>$data/$window/watch.log</string>
  <key>StandardErrorPath</key><string>$data/$window/watch.log</string>
</dict>
</plist>
PLIST
launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
launchctl bootstrap "$domain" "$plist"
printf 'tâche %s installée : chaque jour à %02d:%02d (heure locale), journal %s\n' "$label" "$hour" "$minute" "$data/$window/watch.log"

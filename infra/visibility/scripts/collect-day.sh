#!/usr/bin/env bash
# Collecte d'un jour d'une fenêtre par le collecteur OIA direct (mandat v14, bloc C),
# sans Elmo : un appel par question active, par moteur qui la mesure, pour le jour UTC
# en cours. Détail des réglages : docs/collecteur-oia-direct.md.
#   ./scripts/collect-day.sh <subjectId> <windowId>        plan du jour et coût au majorant, AUCUN appel
#   ./scripts/collect-day.sh <subjectId> <windowId> --go   collecte réelle (payante)
#   ./scripts/collect-day.sh <subjectId> <windowId> --juge aucun --go   sans juge des mentions (défaut : jev)
# Clés : OPENAI_API_KEY, ANTHROPIC_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY,
# TYPESAFE_API_KEY (juge jev), lues dans l'environnement du processus, complété par le
# fichier de clés OIA_VIS_KEYS_FILE (défaut ~/.oia/visibility.env) s'il existe : droits 600,
# lignes NOM=valeur aux noms connus seulement (scripts/load-keys.sh), sinon refus. Aucune clé
# n'est affichée. Plafond : OIA_VIS_MONTHLY_CAP_USD, obligatoire avec --go.
# Suite des conversations Mistral : OIA_VIS_MISTRAL_CONTINUATION=1 (désactivée par défaut).
# Données : OIA_VIS_DATA (défaut ~/oia-visibility-data) ; journal de cost-guard.sh :
# OIA_VIS_COST_JOURNAL (défaut $OIA_VIS_DATA/cost-journal.csv).
# Codes de sortie : 0 fait, 3 arrêt au plafond ou coût illisible, 1 erreur, 2 usage.
# Aucune tâche planifiée n'est installée : l'heure (runTimeUtc de la fenêtre) et
# l'activation sont une décision de Mickaël.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
source "$(dirname "$0")/load-keys.sh"
[ -n "${1:-}" ] && [ -n "${2:-}" ] || { echo "usage: collect-day.sh <subjectId> <windowId> [--juge jev|mistral|aucun] [--go]" >&2; exit 2; }
load_keys_file "${OIA_VIS_KEYS_FILE:-$HOME/.oia/visibility.env}" || exit 1
exec "$VIS_ROOT/node_modules/.bin/tsx" "$VIS_ROOT/src/collect-day.ts" "$@"

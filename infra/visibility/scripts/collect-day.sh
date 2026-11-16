#!/usr/bin/env bash
# Collecte d'un jour d'une fenêtre par le collecteur OIA direct (mandat v14, bloc C),
# sans Elmo : un appel par question active, par moteur qui la mesure, pour le jour UTC
# en cours. Détail des réglages : docs/collecteur-oia-direct.md.
#   ./scripts/collect-day.sh <subjectId> <windowId>        plan du jour et coût au majorant, AUCUN appel
#   ./scripts/collect-day.sh <subjectId> <windowId> --go   collecte réelle (payante)
# Clés : OPENAI_API_KEY, ANTHROPIC_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, lues
# dans l'environnement du processus seulement (ce script ne lit aucun fichier .env et
# n'affiche aucune clé). Plafond : OIA_VIS_MONTHLY_CAP_USD, obligatoire avec --go.
# Données : OIA_VIS_DATA (défaut ~/oia-visibility-data) ; journal de cost-guard.sh :
# OIA_VIS_COST_JOURNAL (défaut $OIA_VIS_DATA/cost-journal.csv).
# Codes de sortie : 0 fait, 3 arrêt au plafond ou coût illisible, 1 erreur, 2 usage.
# Aucune tâche planifiée n'est installée : l'heure (runTimeUtc de la fenêtre) et
# l'activation sont une décision de Mickaël.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ -n "${1:-}" ] && [ -n "${2:-}" ] || { echo "usage: collect-day.sh <subjectId> <windowId> [--go]" >&2; exit 2; }
exec "$VIS_ROOT/node_modules/.bin/tsx" "$VIS_ROOT/src/collect-day.ts" "$@"

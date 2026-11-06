#!/usr/bin/env bash
# Z2.1 · Réception technique bout-en-bout, sur données fictives. Dix étapes,
# une sortie PASS / FAIL par étape, code de sortie 0 si tout passe. Aucun
# appel réel, aucune activation de mission, aucun déploiement.
#
# Usage : bash infra/visibility/scripts/reception.sh
set -uo pipefail
VIS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$VIS_ROOT/.." || { echo "cd failed"; exit 2; }

pass() { echo "  PASS · $1" ; }
fail() { echo "  FAIL · $1 ($2)" ; failed=$((failed + 1)) ; }
step() { echo "" ; echo "## Étape $1 · $2" ; }

failed=0

step 1 "Création d'un client et d'un site (contrat TS)"
if pnpm --filter @oia/visibility-infra exec vitest run test/tenancy.test.ts 2>&1 | grep -qE "Tests[[:space:]]+6 passed"; then
  pass "6/6 tenancy"
else
  fail "tenancy" "voir vitest tenancy.test.ts"
fi

step 2 "Initialisation d'un sujet et proposition de panel"
if pnpm --filter @oia/visibility-infra exec vitest run test/panel-generator.test.ts 2>&1 | grep -qE "Tests[[:space:]]+12 passed"; then
  pass "12/12 panel generator"
else
  fail "panel generator" "voir vitest panel-generator.test.ts"
fi

step 3 "Création d'une mission SEO Command"
if pnpm --filter @oia/visibility-infra exec vitest run test/seo-command.test.ts 2>&1 | grep -qE "Tests[[:space:]]+21 passed"; then
  pass "21/21 seo-command (incluant mission end-to-end)"
else
  fail "seo-command" "voir vitest seo-command.test.ts"
fi

step 4 "Exécution par les agents fictifs"
# Le test E5 de seo-command.test.ts couvre spécifiquement la boucle planifiée → fake → done.
if pnpm --filter @oia/visibility-infra exec vitest run test/seo-command.test.ts -t "end-to-end" 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "exécution fake OK"
else
  fail "exec fake" "voir test 'end-to-end'"
fi

step 5 "Constats, preuves et recommandations"
if pnpm --filter @oia/visibility-infra exec vitest run test/recommendation.test.ts test/audit-e4.test.ts 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "schema E2 + 7 recommandations E4"
else
  fail "recommandations" "voir vitest recommendation / audit-e4"
fi

step 6 "Mise en attente de validation"
if pnpm --filter @oia/visibility-infra exec vitest run test/seo-command.test.ts -t "waiting-validation" 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "waiting-validation OK"
else
  fail "waiting-validation" "voir test 'waiting-validation'"
fi

step 7 "Approbation humaine simulée, agent refusé"
if pnpm --filter @oia/visibility-infra exec vitest run test/seo-command.test.ts -t "ackValidation" 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "ackValidation accepte humain, refuse agent (règle 16)"
else
  fail "règle 16" "voir test 'ackValidation refuses when caller is an agent'"
fi

step 8 "Demande de fusion simulée + garde-fou SEO CI"
if pnpm --filter @oia/visibility-infra exec vitest run test/repo-pr.test.ts test/ci-check.test.ts 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "PR simulation + CI guardrail"
else
  fail "PR + CI" "voir vitest repo-pr / ci-check"
fi

step 9 "Événement fictif de déploiement"
if pnpm --filter @oia/visibility-infra exec vitest run test/seo-command.test.ts -t "post-deploy" 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "trigger pr-merged → post-deploy-analysis"
else
  fail "post-deploy trigger" "voir test 'pr-merged'"
fi

step 10 "Contrôle après déploiement, remesure simulée et rapport final"
if pnpm --filter @oia/visibility-infra exec vitest run test/stats-engine.test.ts test/report-template.test.ts 2>&1 | grep -qE "passed \([0-9]+\)"; then
  pass "stats engine + rapport client"
else
  fail "stats + rapport" "voir vitest stats-engine / report-template"
fi

echo ""
if [ $failed -eq 0 ]; then
  echo "=== Z2.1 Réception : TOUTES LES ÉTAPES PASSENT ==="
  exit 0
fi
echo "=== Z2.1 Réception : $failed étape(s) en échec ==="
exit 1

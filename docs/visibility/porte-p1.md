# Porte P1 · dossier de franchissement

Gabarit à remplir **après** le rapport de la fenêtre de mesure de départ
(J0). P1 est franchie seulement si chaque critère a sa preuve. Un critère
sans preuve laisse la porte fermée ; un critère partiel est déclaré
partiel, avec sa cause.

Sujet : `________` · fenêtre : `j0` · dossier rempli le `____-__-__` par `________`

| Critère | Preuve attendue | Où la trouver | Résultat (fait / partiel / non fait) |
| --- | --- | --- | --- |
| Mesure réelle | Rapport J0 généré depuis les réponses réelles, et non une démonstration | `subjects/<sujet>/reports/j0/rapport-j0.md` et `figures.json` (`pnpm vis:j0-report`) | |
| Reproductible | `vis:j0-verify` au vert : chiffres recalculés à l'identique, empreinte de chaque réponse, versions servies, provenance | sortie de `pnpm vis:j0-verify` (« VÉRIFIÉ ») | |
| Complète ou expliquée | Jours manquants consignés avec leur cause ; runs échoués et perturbations | `~/oia-visibility-data/j0/close/completeness.txt`, section « Jours manquants » du rapport, note de la fenêtre dans `measurement.yaml` | |
| Coût maîtrisé | Dépense réelle relevée chez chaque fournisseur, sous le plafond de 30 $ ; limites par fournisseur respectées | consoles OpenAI, Anthropic, Mistral, OpenRouter, TypeSafe ; `cost-journal.csv` (colonne `manual_usd`) | |
| Gel respecté | Contrôle d'intégrité de la surface publique en fin de fenêtre : aucun commit sur la surface publique depuis le pin, `noindex` des pages de service inchangé | `~/oia-visibility-data/j0/close/freeze.txt` (étape `freeze` de `pnpm vis:j0-close`, `scripts/freeze-check.sh`) | |
| Validé | Rapport relu et validé par Mickaël | statut du rapport passé de « à valider par Mickaël » à « validé », date et nom | |

## Décision

- [ ] P1 franchie : tous les critères sont « fait ».
- [ ] P1 franchie avec réserves : critères partiels listés ci-dessous, acceptés par Mickaël.
- [ ] P1 non franchie : critères manquants listés ci-dessous, avec la prochaine action.

Réserves ou manques :

1.
2.

Signature : `________` · date : `____-__-__`

## Rappels

- Les chiffres du rapport sont des **indicateurs de visibilité mesurés par
  les API des assistants** (réponses d'API, recherche web de l'API, un run
  par jour, langue unique), et non une mesure exhaustive de ce que voient
  les utilisateurs des applications grand public.
- Un gel rompu n'annule pas forcément la mesure. Il se consigne avec la
  date, le commit et ce qui a changé pour Google et les assistants, et le
  rapport le dit.

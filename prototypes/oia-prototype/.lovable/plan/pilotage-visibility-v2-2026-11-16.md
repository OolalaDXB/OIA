# Pilotage Visibility v2

## À construire
- Ajouter une couche `visibility-pilotage.ts` en lecture paginée des vues v2 et appels RPC avec la session existante, sans clé de service ni écriture directe.
- Remplacer le portefeuille Sites par les lignes de `vis_portefeuille_v2`, l’état du moteur, les alertes et le formulaire « Ajouter un site ».
- Ajouter à la fiche site les étapes Revue, Lancer, Suivi et Rapport, avec sélection et modification des propositions, double confirmation des coûts, arrêt motivé, pages isolées et comparaisons.
- Compléter Recommandations avec la déclaration d’exécution, ajouter l’Activité du moteur et les réglages Budget réservés au propriétaire OIA.
- Brancher les jugements, sources de réponses et coûts v2 dans les écrans existants, en conservant « Non mesurable » et sa raison pour tout le reste.
- Réserver toute démonstration aux visiteurs non connectés et préserver le design actuel.

## Règles techniques
- Chaque mutation invalide puis relit les vues concernées, sans état optimiste.
- Les erreurs RPC restent visibles près du bouton, notamment « estimation changée, recharger ».
- Le GO est désactivé sans plafond ou plafond atteint. Les rapports utilisent `iframe srcDoc sandbox=""` sans script.
- Montants en dollars à deux décimales et alerte `MOTEUR_MUET` non acquittable.

## Vérification et livraison
- Tests unitaires des paramètres de chaque RPC, refus du GO sans plafond, isolation de l’iframe et absence de démonstration connectée.
- Tests de conversion v2 et de relecture après geste, puis contrôles du build et du parcours dans la preview avec données simulées.
- Documenter les écrans, fonctions et écarts restants, mettre à jour le suivi, faire un commit local uniquement, sans publication ni modification Supabase.

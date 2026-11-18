# Visibility : filtres, fenêtres et entités

## Écrans

- `FiltreSelect` est appliqué à toutes les listes déroulantes de Visibility : filtres de mesure, choix de site, appareil Lighthouse, constats, études, ajout de site et formulaires de réglages.
- Les filtres sont alignés à gauche, sur une ligne repliable. Chaque liste mesure 36 px de haut, entre 192 et 320 px de large, avec 36 px à droite et un chevron SVG à 12 px du bord.
- Un nouvel onglet **Concurrents** et **Réglages › Concurrents** utilisent le même écran : concurrents directs, plateformes et applications, annuaires et médias, puis les entités à classer si nécessaire.
- Chaque nature est modifiable sans état optimiste. L'origine moteur est indiquée par « classé par l'IA ». L'ajout d'un concurrent ne passe plus par le stockage local.

## Contrat utilisé

- Lecture : `vis_entites_v3` et la colonne `nature` de `vis_concurrents_v1`.
- Mutation : `vis_classer_entite(p_subject, p_entite, p_nature)` pour les changements de nature et les ajouts avec `concurrent`.
- Les lectures et mutations utilisent la session publique existante. Les vues actives sont invalidées après confirmation de la fonction.
- Les fenêtres de `vis_mesure_v1` sont limitées aux types `baseline`, `reconnaissance` et `remesure`. Les statuts `aborted` et les identifiants contenant `-audit-` sont exclus avant de produire les sélecteurs, moteurs, réponses et graphiques.
- La part de voix et la courbe concurrentielle ne retiennent que la marque et les concurrents directs. Lorsque d'autres natures sont présentes, les parts sont recalculées à partir de leurs mentions ; les intervalles devenus inapplicables ne sont pas réutilisés.

## Vérifications

- 173 tests automatisés réussis, dont dimensions et chevron, exclusions de fenêtres, groupes Coach Gari et arguments exacts de `vis_classer_entite`.
- Preview contrôlée sur 20 routes, sur ordinateur et mobile : 300 contrôles de listes, formulaires ouverts, trois groupes visibles, aucun débordement ni erreur JavaScript. L'application ne définit que son thème clair, qui a été contrôlé dans chaque passage.
- Deux sites connectés simulés vérifient l'isolation des entités, les fenêtres exclues, les coûts d'audit absents des moteurs, la part de voix directe et la relecture après ajout ou reclassement.
- L'audit a aussi corrigé le conteneur du chevron dans les grilles et le repli du formulaire de proposition sur mobile.
- Les permissions réelles de la fonction restent à confirmer en production. Aucune modification Supabase et aucune publication.

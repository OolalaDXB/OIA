# Visibility, deux scores et navigation par site

## Écrans

- Accueil Visibility : grande jauge « Visibilité dans les IA », jauge secondaire « Santé technique du site », composantes sans anciens poids, trois actions prioritaires et courbe des deux scores.
- Bandeau commun : nom, adresse, favicon, deux scores, dernière mesure, sélecteur de tous les sujets et lien vers l'ajout.
- Navigation : quatre groupes, Résultats, Agir, Études et Réglages.
- Rapports : avec une seule fenêtre, résumé J0 avec deux scores, visibilité sans le nom, notoriété avec le nom, concurrents, trois actions et gestes de lecture et validation. La comparaison avant et après apparaît seulement avec plusieurs fenêtres.
- Statuts et rôles : traduction française des valeurs techniques visibles, dont « À valider », « Propriétaire » et « Approbateur ».

## Données et fonctions

- Lecture inchangée de `vis_score_v3.score`, devenu la visibilité IA, et de `vis_score_v3.score_site`, santé technique séparée.
- Courbe alimentée par `vis_score_historique_v3`, composantes `score` et `score_site`.
- Actions prioritaires : `vis_recommandations_v2` à l'état `pending`, puis constats techniques ouverts de `vis_constats_v3`.
- Aucun nouvel appel RPC. La validation utilise toujours `vis_valider_rapport` avec `p_page`.
- Le paramètre `site` est retenu entre les onglets Visibility et mis à jour par le sélecteur.

## Vérifications

- 153 tests réussis, dont les scores Coach Gari 19 et 97, les seuils de couleur, les recommandations IA prioritaires, le résumé J0 à une fenêtre, la conservation du site dans la recherche et la traduction des statuts.
- Preview ordinateur et mobile : quatre groupes de navigation, deux jauges, deux courbes, conclusions chiffrées, absence de débordement et conservation de `?site=coach-gari` vers Rapports.
- Parcours connecté simulé avec deux sites : scores distincts, recommandations IA avant les constats, deux rapports J0 complets, validation avec `p_page`, ajout accessible et traduction des rôles et impacts.
- Les 17 écrans Visibility ont été ouverts aux deux largeurs avec un seul onglet actif, le même site et aucun sélecteur dupliqué. Le changement de site dans Rapports reste dans Rapports.
- Compilation de la preview : OK.

## Limites

- Aucune session de production externe n'est disponible ici. La lecture réelle de la migration 0014, le changement de site sur les comptes réels et la validation d'un rapport de production restent à confirmer sur l'environnement connecté.
- Aucune modification Supabase, aucune publication et aucun transfert vers le dépôt OIA.

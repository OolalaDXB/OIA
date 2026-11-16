# Pilotage Visibility, contrat v2

Date : 16 novembre 2026. Commit local uniquement, aucune publication et aucune modification Supabase.

## Écrans et fonctions

- **Sites / Portefeuille** : `vis_portefeuille_v2`, `vis_budget_v2`, `vis_moteur_v2`, ajout d'un site par `vis_demander_site`.
- **Fiche site, Revue** : `vis_propositions_v2`, modification et ajout par `vis_modifier_proposition` et `vis_ajouter_proposition`, décisions par `vis_valider_faits`, `vis_valider_panel` et `vis_valider_concurrents`. Le panel est validé une seule fois pour toutes les langues et les deux familles de questions.
- **Fiche site, Lancer** : `vis_fenetres_v2`, `vis_budget_v2`, double confirmation puis `vis_go_reconnaissance` ou `vis_go_fenetre` avec le montant affiché. Le bouton est bloqué sans plafond client ou global, au plafond atteint ou si l'estimation dépasse le restant.
- **Fiche site, Suivi** : jours et coûts de `vis_fenetres_v2`, arrêt motivé par `vis_annuler_fenetre`.
- **Fiche site, Rapport** : `vis_pages_client_v2`, validation par `vis_valider_rapport`, comparaisons par `vis_comparaisons_v2` et `vis_comparaison_moteurs_v2`. Le HTML est rendu avec `srcDoc` et `sandbox=""`, sans permission de script.
- **Recommandations** : `vis_recommandations_v2`, décisions par `vis_valider_recommandation` et `vis_rejeter_recommandation`, exécution par `vis_declarer_execution` avec preuve et date, remesure affichée.
- **Activité du moteur** : `vis_demandes_v2`, `vis_moteur_v2`, relance par `vis_relancer_demande`. L'état muet indique explicitement que les mesures ne tournent pas.
- **Cloche** : `vis_alertes_v2`, acquittement par `vis_acquitter_alerte`. `MOTEUR_MUET` n'est pas acquittable.
- **Réglages, Budget** : `vis_budget_v2`, plafond global puis plafonds clients par `vis_fixer_plafond`, réservés au propriétaire OIA identifié par la ligne `client_id=oia` du portefeuille.
- **Mesures existantes** : sentiment et position par `vis_jugements_v2` et `vis_jugements_moteurs_v2`, sources et recherches par `vis_reponses_sources_v2`, coûts par assistant par `vis_couts_moteurs_v2`. La mention `extrait (Jev 1.13)` accompagne les jugements.

Chaque geste utilise le client public et la session utilisateur, conserve le message RPC près du bouton puis invalide et relit les vues. Aucun état optimiste, aucune écriture directe et aucune clé de service.

## Vérifications

- 127 tests automatisés réussis, dont les paramètres des 16 fonctions de geste, le refus du GO sans plafond, les erreurs RPC, la relecture et l'isolation de l'iframe.
- Vérification TypeScript réussie.
- Parcours Playwright avec session et réponses réseau simulées, sur ordinateur et mobile : ajout de site, validation du panel, GO bloqué sans plafond, validation du rapport, déclaration d'exécution, relance et acquittement.
- Le navigateur a confirmé le blocage d'un script injecté dans le rapport simulé.
- Aucun libellé de démonstration dans les écrans connectés testés.
- Le scénario artificiel de fixation successive des deux plafonds n'a pas permis de valider le GO complet dans Playwright. Les paramètres des deux appels et la double confirmation sont couverts par les tests unitaires, mais le GO réel reste à vérifier avec le compte de production.
- La session Supabase externe de production n'est pas disponible ici. Aucun geste réel n'a été exécuté.

## Écarts et demandes de contrat

- Exactitude des faits cités : toujours non mesurable, le contrôle par les faits validés n'est pas en base.
- Intervalles par question, pages consultées mais non citées, opportunités de contenu, contrôles des profils sociaux, alias et plateformes non suivies : toujours non mesurables faute de données contractuelles.
- Coût facturé consolidé : hors Visibility, dans `oia_ia_couts_v1`, donc non affiché comme un coût Visibility.
- **Rôle OIA** : le contrat ne fournit pas de rôle global indépendant des sujets. Un propriétaire OIA sans ligne `client_id=oia` dans `vis_portefeuille_v2` ne peut pas être identifié. Une évolution doit exposer explicitement `mon_role_oia`, sans utiliser le rôle d'un client ordinaire comme substitut.
- Le défaut connu du portefeuille Coach Gari, « à valider (0 question) », n'a pas été modifié.

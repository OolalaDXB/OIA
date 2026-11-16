# Visibility v3, score et actions

Date : 16 novembre 2026. Travail limité au dépôt Lovable habituel. Aucune modification Supabase, aucune publication et aucun transfert vers `OolalaDXB/OIA`.

## Écrans

- **Vue d'ensemble** : pour chaque site visible, jauge du score, couleur rouge sous 50, orange de 50 à 79, verte à partir de 80, variation depuis le point précédent, sept composantes avec leur poids, trois actions prioritaires, bouton « Analyser maintenant » et courbe du score ou d'une composante. Les dates d'exécution de `vis_recommandations_v2` annotent la courbe.
- **Performance** : sélecteur Mobile / Ordinateur, quatre scores Lighthouse, LCP, CLS, TBT, FCP avec les seuils du brief, TTFB et Speed Index sans seuil inventé, opportunités en secondes et Ko, poids, requêtes et audit Crawlie. Une erreur d'analyse est affichée telle quelle, avec la dernière analyse réussie lorsqu'elle existe.
- **À corriger** : constats ouverts et résolus, cartes dépliables, explication, correction, impact, effort, responsable, valeur et documentation. Filtres par gravité, catégorie et responsable. Les recommandations IA de `vis_recommandations_v2` sont identifiées comme telles et renvoient à leur écran de preuve.
- **Rapport de site** : résumé avant l'iframe avec score, visibilité IA, notoriété IA, constats ouverts et trois actions. Téléchargement, validation et `sandbox=""` restent inchangés.
- **Sentiment** : répartition positif, neutre et négatif par assistant avec valeurs exactes et effectifs au survol. Les réponses utilisent un rendu Markdown sans HTML exécutable, sont tronquées avec « Lire la suite » et surlignent `passage` ainsi que la marque.
- **Réseaux sociaux** : profils de la marque séparés des autres profils cités, regroupement par plateforme et top 5. Sans correspondance avec les domaines ou profils déclarés, le profil reste dans « autres ».
- **SEO Command** : missions de `vis_seo_command_v1` et état de `vis_planificateur_v1`, ou « Aucune mission » lorsque les deux sont vides.

## Vues et fonctions appelées

Lectures v3 : `vis_score_v3`, `vis_score_historique_v3`, `vis_analyses_v3`, `vis_constats_v3`.

Compléments déjà contractuels : `vis_demandes_v2` pour la file et l'état de l'analyse, `vis_recommandations_v2` pour les actions IA et les annotations, `vis_jugements_moteurs_v2` pour le sentiment, `vis_seo_command_v1` et `vis_planificateur_v1` pour SEO Command. Les écrans conservent également leurs lectures v1 et v2 existantes.

Seul nouveau geste : `vis_demander_analyse({ p_subject })`. Il n'exige ni GO ni plafond. Après sa réponse, toutes les requêtes Visibility sont invalidées et relues. Aucun état optimiste, aucune écriture directe, aucune clé de service et aucun appel aux fonctions `service_role` du moteur.

La correction du propriétaire OIA est inchangée : `estProprietaireOia` lit toujours `vis_budget_v2.mon_role` sur la ligne `client_id=oia`, introduite dans `ef2b7d7`.

## Tests et vérifications

- Suite complète : 141 tests réussis dans 26 fichiers, et vérification TypeScript réussie. Un test couvre aussi un nouveau site sans fenêtre IA.
- Tests v3 : seuils de couleur, score Coach Gari 58, visibilité IA mesurée à 0, notoriété 64, Lighthouse mobile 88 et autres scores à 100, ordinateur à 100, 24 constats dont un critique, composante non mesurée, variation, tri gravité puis effort, seuils Google, appel RPC exact, suivi de demande, Markdown sans script, troncature, séparation et regroupement des profils.
- Parcours Playwright avec session et réponses Supabase entièrement simulées : score 58, 24 ouverts et noindex, aucun libellé fictif en mode connecté, Lighthouse mobile et ordinateur, appel `vis_demander_analyse` puis état « en file » relu, 24 actions ouvertes et une recommandation exécutée, sentiment, réseaux, SEO vide et rapport avec résumé et iframe sans script.
- Audit complémentaire : trois scores 58, 42 et 82 avec les trois couleurs, composantes absentes, variation négative, changement de site et d'appareil, dernière erreur verbatim, filtres de constats, constats résolus, SEO renseigné, téléchargement et validation du rapport. Les graphiques de présence, part de voix, concurrents, citations et sentiment comportent une conclusion d'action.
- Vérification ordinateur 1280 x 1800 et mobile 390 x 844 : sept écrans réels attendus après chargement, aucun débordement horizontal, y compris les tableaux sociaux de démonstration, et aucune erreur JavaScript.
- La session Supabase externe de production n'est pas disponible ici. Les valeurs de production n'ont donc pas été relues directement et aucune analyse réelle n'a été lancée.

## Écarts et demandes de contrat

- **TTFB** : le brief demande les signaux essentiels mais ne fournit pas de seuil pour le temps de réponse. La valeur est affichée sans « bon », « à améliorer » ou « mauvais ».
- **Visibilité IA et notoriété IA manquantes** : `vis_demander_analyse` lance Lighthouse et Crawlie, pas une fenêtre de mesure IA. Le bouton de ces composantes renvoie donc vers le pilotage d'une étude au lieu de prétendre les mesurer instantanément.
- **Effectifs de l'historique du score** : `vis_score_historique_v3` ne fournit pas d'effectif. Les info-bulles montrent la valeur exacte, l'origine et la référence, sans effectif inventé.
- **Profils sociaux de la marque** : les vues de sujet fournissent les domaines mais pas nécessairement les profils sociaux. À défaut de correspondance, tous les profils restent dans « autres profils cités », comme demandé.
- **Exactitude des faits cités** : toujours non mesurable, cette donnée n'est pas ajoutée par le contrat v3.

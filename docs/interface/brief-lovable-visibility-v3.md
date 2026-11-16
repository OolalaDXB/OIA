# Brief Lovable · Visibility v3 : score, analyse instantanée, actions

16 novembre 2026. Contrat de référence : `docs/interface/contrat-donnees-visibility-v3.md`
(vues et fonction appliquées en production), en plus des v1 et v2.

## Message pour Lovable

Bonjour. Visibility doit devenir un outil **orienté action** : en arrivant, on voit le score du
site, ce qui le fait baisser, quoi corriger d'abord et comment. Garde le design actuel
(typographie, couleurs de statut, composants). Ce brief demande des graphiques plus parlants et
des écrans plus interactifs, sans changer l'identité visuelle.

### Interdits (inchangés)

- Aucune modification de Supabase.
- Seulement les vues et les fonctions `rpc` du contrat.
- Aucune clé de service, aucun service tiers.
- Pas de publication.
- Pas de push vers un autre dépôt que le tien.

### Données nouvelles (v3, en production)

- `vis_score_v3` : une ligne par site.
  - `score` de 0 à 100 ;
  - composantes `performance_mobile`, `performance_ordinateur`, `seo_technique`,
    `accessibilite`, `bonnes_pratiques`, `visibilite_ia`, `notoriete_ia` (de 0 à 100, `null`
    si la composante n'est pas mesurée, jamais 0) ;
  - `manquantes`, `analyse_le` ;
  - `constats_critiques`, `constats_ouverts`, `constats_resolus`.
- `vis_score_historique_v3` : un point par composante et par date (`le`, `origine` : analyse
  ou fenêtre, `valeur`). Sert aux courbes d'évolution. Aucune valeur n'est reportée d'une date
  à l'autre.
- `vis_analyses_v3` : chaque analyse, dont la plus récente de chaque type est marquée
  `derniere`.
  - Lighthouse, une par stratégie (mobile, ordinateur) : `scores` (performance,
    accessibilité, bonnes pratiques, SEO, de 0 à 1), `metriques` (`lcp_ms`, `fcp_ms`, `cls`,
    `tbt_ms`, `si_ms`, `ttfb_ms`, `poids_ko`, `requetes`), `resultat.opportunites` (titre,
    `gain_ms`, `gain_ko`).
  - Audit de lecture (`nature = crawl`) : pages, robots, données structurées, prix lisibles
    sans JavaScript.
  - `statut` vaut `fait` ou `echec`. En cas d'échec, `erreur` contient le message, à afficher
    tel quel.
- `vis_constats_v3` : les problèmes trouvés.
  - Contenu : `titre`, `explication` (pourquoi c'est un problème), `correction` (comment
    corriger), `impact`, `effort` (XS à XL), `qui` (client ou équipe), `gravite` (critique,
    important, mineur), `categorie`, `valeur`, `preuve.documentation` (lien).
  - Suivi : `etat` vaut `ouvert` ou `resolu` (le problème a disparu à l'analyse suivante),
    avec `premiere_fois` et `derniere_fois`.
- `vis_demander_analyse(p_subject)` : bouton **« Analyser maintenant »**.
  - Gratuit : aucun GO ni plafond.
  - Une seule analyse à la fois par site : un double clic rend la même demande.
  - Le moteur la traite en quelques minutes. Suis-la dans `vis_demandes_v2` (type `ANALYSE`),
    puis recharge les vues v3.

### Écrans

1. **Accueil Visibility** (vue d'ensemble), pour chaque site :
   - **Jauge du score** de 0 à 100. Couleur de statut : rouge sous 50, orange de 50 à 79,
     vert à partir de 80. Afficher la variation depuis le point précédent de l'historique.
   - **Radar ou barres des 7 composantes.** Une composante non mesurée apparaît en gris,
     « non mesurée », avec le bouton qui la mesure.
   - **« Les 3 actions qui feront monter le score »** : les constats ouverts, triés par
     gravité puis effort. Chacun avec son titre, une phrase d'explication et le gain attendu.
   - Bouton **« Analyser maintenant »**, avec l'état de la demande en cours.
   - **Courbe d'évolution** du score et des composantes (`vis_score_historique_v3`).
     Annoter les dates des recommandations exécutées (`vis_recommandations_v2`).
2. **Onglet « Performance »**, nouveau, avec un sélecteur Mobile / Ordinateur :
   - les 4 scores Lighthouse ;
   - les signaux Web essentiels (LCP, CLS, TBT, FCP, temps de réponse) comparés aux seuils
     de Google, en bon, à améliorer ou mauvais :
     - LCP : 2,5 s et 4 s ;
     - CLS : 0,1 et 0,25 ;
     - TBT : 200 ms et 600 ms ;
     - FCP : 1,8 s et 3 s ;
   - les opportunités, en barres de gain en secondes ;
   - poids de la page et nombre de requêtes.
3. **Onglet « À corriger »**, nouveau, ou refonte de « Opportunités de contenu » :
   - les constats sous forme de cartes dépliables : problème, pourquoi, comment corriger,
     effort, qui, lien de documentation ;
   - filtres par gravité, catégorie et qui ;
   - un onglet « Résolus » montre l'évolution, d'une analyse à l'autre ;
   - réutilise aussi les recommandations de la mesure IA (`vis_recommandations_v2`) dans la
     même liste, avec la source indiquée.
4. **Rapports**, à rendre clairs :
   - en tête du rapport, un résumé lisible, avant l'iframe : score, 3 chiffres clés,
     3 actions ;
   - « Télécharger » et « Valider » restent.
5. **Corrections des écrans actuels :**
   - **Sentiment.**
     - Ne pas afficher la réponse brute en entier. Rendre le markdown (gras, listes, liens) et
       tronquer à environ 4 lignes avec « Lire la suite ».
     - Surligner le passage qui cite la marque (`vis_jugements_v2.passage`).
     - Ajouter en tête un graphique de répartition positif, neutre et négatif par assistant
       (`vis_jugements_moteurs_v2`).
   - **Réseaux sociaux.**
     - Séparer **les profils de la marque** de **ceux des autres**, en comparant aux
       domaines et profils du sujet ; à défaut, tout est « autres profils cités ».
     - Regrouper par plateforme, avec le top 5 pour chacune, plutôt qu'une grille de cartes
       identiques.
   - **Opportunités de contenu.** Remplacer « Non mesurable » par l'onglet « À corriger »
     décrit au point 3.
   - **SEO Command.** Afficher `vis_seo_command_v1` et `vis_planificateur_v1` (déjà au
     contrat v1), ou masquer l'onglet s'ils sont vides, avec la phrase « Aucune mission ».
6. **Graphiques**, orientés action :
   - chaque graphique dit ce qu'il faut en conclure, en une phrase sous le titre ;
   - pas de camembert à plus de 4 parts ;
   - info-bulles avec les valeurs exactes et les effectifs ;
   - affichage soigné sur mobile.

### Règles

- Une composante non mesurée ne s'affiche jamais à 0.
- L'erreur d'une analyse s'affiche telle quelle.
- Après « Analyser maintenant », relis les vues : n'affiche pas un état optimiste.
- Tests :
  - jauge et couleurs du score ;
  - composante non mesurée ;
  - appel `vis_demander_analyse` ;
  - tri des actions ;
  - rendu markdown sans script ;
  - séparation des profils.

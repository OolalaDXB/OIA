# Visibility, hygiène d'indexation

## Écran

`Résultats › Indexation`, route `/visibility/indexation`, ajouté à la navigation réorganisée sans nouvelle entrée principale.

- En-tête : jauge du score `scores.indexation` converti de 0 à 1 vers 0 à 100, date du contrôle, écarts ouverts et bouton gratuit « Contrôler maintenant ».
- Liste de contrôle : états conforme, écart et non mesuré, valeur, gravité et preuve dépliable avec les pages en cause. Les écarts sont en premier, triés par gravité.
- Bing Webmaster Tools : vérification du site et lien externe si nécessaire, erreur Bing verbatim, sitemaps, exploration, problèmes et exemples, requêtes classées par impressions, clics et position.
- Actions faites par OIA dans la carte Bing : action, cible et résultat, y compris lorsque la lecture Bing est absente ou en erreur.
- Google Search Console : carte d'attente « Bientôt : branchement par compte de service ».
- Plan d'action : une origine `indexation` devient « Hygiène d'indexation (site en ligne, Bing) ». L'activité traduit `HYGIENE` en « Hygiène d'indexation ».

## Contrat utilisé

- Lecture paginée de `vis_hygiene_v3` avec la session publique existante, isolée dans `src/lib/donnees/visibility-hygiene.ts` et sa propre requête. La vue n'est pas ajoutée aux types générés avant la migration 0019.
- Champs lus dans `metriques` : `controles`, `bing` et `actions`. Les compteurs `adresses_sitemap` et `bing_problemes` restent disponibles dans la ligne, et `bing_problemes` sert de repli au total absent du détail Bing.
- Geste : `vis_demander_hygiene({ p_subject })`, sans coût, confirmation de coût ni écriture directe.
- Suivi : demandes `HYGIENE` de `vis_demandes_v2` aux statuts `QUEUED` et `RUNNING`. L'hygiène et les demandes sont relues toutes les 30 secondes pendant l'exécution, puis le suivi s'arrête.
- Les erreurs de lecture et de RPC sont affichées telles quelles. Une erreur de la nouvelle vue ne bloque pas les autres écrans Visibility.

## États et démonstration

- Compte connecté : chargement, erreur avec nouvel essai, absence de contrôle et résultats réels uniquement. Aucun repli fictif.
- Visiteur non connecté : exemple fictif signalé par le Shell, bouton réel désactivé.
- Score ou contrôle absent : non mesuré, jamais transformé en zéro. Un nombre d'écarts absent reste non mesuré.
- Bing non vérifié : consigne et lien https://www.bing.com/webmasters. Bing en erreur : message de la base sans statistiques inventées.

## Vérifications

- 193 tests automatisés, dont 8 tests Indexation : contrôles `true`, `false`, `null`, tri, preuves, score, Bing lu, erreur Bing, site non vérifié, requêtes, actions, RPC exacte, suivi 30 secondes, navigation et origine du plan.
- Vérification Playwright sur la démonstration à 1280 et 390 pixels : parcours depuis la liste des sites, trois preuves dépliées, deux requêtes Bing complètes, actions dans la carte Bing, origine visible dans le plan, aucune erreur de page et aucun débordement horizontal de page.
- Vérification Playwright avec session et réponses du contrat simulées, sans appel externe : erreur Bing verbatim, site non vérifié sur les deux tailles, clic appelant exactement `vis_demander_hygiene`, nouvelle lecture de l'hygiène et des demandes après 30 secondes.
- TypeScript et compilation de la preview validés.

## Reste à vérifier après migration 0019

- La vue et la RPC n'ont pas été appelées dans une session OIA réelle depuis cet environnement.
- La structure exacte des clés d'`exploration` peut varier selon Bing. Les clés connues sont traduites et les autres clés scalaires sont humanisées sans calcul supplémentaire.
- Aucune modification Supabase, aucune publication et aucun transfert manuel vers le dépôt GitHub OIA.

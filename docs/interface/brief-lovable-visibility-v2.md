# Brief Lovable · Visibility v2 : brancher les écrans et piloter les études

16 novembre 2026. **À envoyer à Lovable, dans le projet du cockpit OIA**, avec le contrat
`docs/interface/contrat-donnees-visibility-v2.md` (et la v1,
`contrat-donnees-visibility.md`).

- **Partie 1** : peut partir tout de suite, car les vues v1 sont en production.
- **Partie 2** : seulement après l'application de la migration v2 en production, ou sur sa
  démonstration (`docs/interface/demo/visibility-v2-demo.json`).

---

## Message pour Lovable

Bonjour. Le module **Visibility** du cockpit OIA passe sur données réelles, et devient
l'endroit où l'on pilote les études de visibilité dans les IA. Mickaël ne passe plus par un
terminal : chaque geste est un bouton qui appelle une fonction de la base. Garde le design
actuel (onglets, composants, couleurs de statut, typographie). Tu n'ajoutes que les écrans
qui manquent, dans le même style.

### Interdits (inchangés)

- Aucune création ni modification dans Supabase : ni table, ni migration, ni politique, ni
  fonction. S'il manque une donnée, arrête-toi et écris-le : c'est une demande de contrat.
- Aucune écriture directe dans une table : seulement les fonctions `rpc` du contrat.
- Aucune clé de service. Adresse et clé publique du projet `iywmvyebuikxyvnrcnoy`, session de
  l'utilisateur connecté.
- Aucun service tiers de suivi ou d'analyse.

### Partie 1 · Brancher les écrans existants (vues v1)

1. Pour un compte connecté, **plus aucune donnée de démonstration** dans Visibility. Le
   bandeau « fictif » et `public/data/visibility.json` ne servent qu'en mode non connecté.
   Branche `src/lib/donnees/visibility.ts` et `src/lib/donnees-visibility.tsx` sur les vues,
   comme Money Lookup (`src/lib/donnees/money-reel.ts`).
2. Sélecteur de client et de sujet : `vis_sujets_v1`. Sélecteur de fenêtre (J0, J1…) :
   `vis_mesure_v1`.
3. Onglets, selon la table « Onglets et écrans » du contrat v1 :
   - Vue d'ensemble : `vis_apercu_v1` et `vis_mesure_v1`, avec les questions non marquées
     et les questions marquées séparées.
   - Réponses : `vis_reponses_v1`.
   - Citations : `vis_citations_v1`.
   - Part de voix : `vis_concurrents_v1`.
   - Visibilité par question : `vis_questions_v1`.
   - Réseaux sociaux : `vis_reseaux_sociaux_v1`.
   - Recommandations : `vis_recommandations_v1`, avec valider et rejeter.
   - Rapports : `vis_rapports_v1`.
   - SEO Command : `vis_seo_command_v1` et `vis_planificateur_v1`.

   Pour **Sentiment**, **Recherches des assistants** et **Opportunités de contenu**, qui
   n'ont pas encore de vue : affiche l'état vide « Pas encore mesuré par OIA », sans aucune
   donnée inventée.
4. Règles d'honnêteté du contrat v1 :
   - « Non mesurable » avec sa raison, jamais 0 ;
   - chaque pourcentage avec son effectif, par exemple « 30 % (3 sur 10) » ;
   - « Mesure en cours, jour N sur 5 » ;
   - « Accès non accordé à ce client », différent de « vide » ;
   - une erreur s'affiche avec « Réessayer ».
5. Tests : un test par onglet. Sur des données vides, l'écran affiche l'état vide, jamais la
   démonstration.

### Partie 2 · Piloter les études (vues et fonctions v2)

Nouveaux écrans, chacun avec ses états (chargement, vide, erreur, non membre) :

1. **Portefeuille** (`/visibility/sites`, qui remplace la table actuelle) : `vis_portefeuille_v2`.
   - Une ligne par site : étape (badge de statut), prochaine action et qui la fait, jour N
     sur 5, dernière présence avec son effectif, coût du mois sur le plafond, alertes.
   - Un clic ouvre l'écran du site.
   - Bouton **« Ajouter un site »** : formulaire (adresse, nom, langues, marchés, client
     existant ou nouveau) qui appelle `vis_demander_site`.
2. **Écran d'un site**, organisé par étape :
   - **Revue** (`vis_propositions_v2`) : sections Faits, Panel (par langue, marquées et non
     marquées séparées), Concurrents, Homonymes, Audit (lecture seule). Chaque élément montre
     sa source et peut être coché, modifié (`vis_modifier_proposition`) ou ajouté
     (`vis_ajouter_proposition`). Boutons de section : `vis_valider_faits`,
     `vis_valider_panel`, `vis_valider_concurrents`.
   - **Lancer** (`vis_fenetres_v2`, `vis_budget_v2`) : carte de coût (estimation, détail par
     moteur, plafond restant du mois), choix de la date de début pour une étude, puis
     **double confirmation** qui affiche le montant. L'appel est `vis_go_reconnaissance` ou
     `vis_go_fenetre`, avec `p_cout_vu_usd` égal au montant affiché. Si la base répond
     « estimation changée », recharge et redemande la confirmation. Le bouton est désactivé,
     avec la raison écrite, si le plafond n'est pas fixé ou est dépassé.
   - **Suivi** : 5 pastilles de jours (complet, partiel, manquant, à venir), coût réel,
     bouton « Arrêter » (`vis_annuler_fenetre`, motif obligatoire).
   - **Rapport** (`vis_pages_client_v2`) : rapport et page client affichés dans un `iframe`
     avec `sandbox` et sans `allow-scripts`, « Télécharger », « Valider »
     (`vis_valider_rapport`). Comparaison avec la fenêtre de référence :
     `vis_comparaisons_v2` et `vis_comparaison_moteurs_v2`. Écris « pas de changement
     démontrable » quand le verdict le dit.
3. **Recommandations** : passe sur `vis_recommandations_v2`. Ajoute **« Marquer comme
   fait »** (`vis_declarer_execution` : preuve, URL ou commit, et date) sur les
   recommandations acceptées, puis affiche la remesure qui les mesurera.
4. **Activité du moteur** (onglet ou panneau) :
   - `vis_demandes_v2`, avec « Relancer » sur une demande échouée (`vis_relancer_demande`) ;
   - bandeau `vis_moteur_v2` : actif, en retard ou **muet**. S'il est muet, le message dit
     que les mesures ne tournent pas.
5. **Alertes** : cloche dans la barre du module (`vis_alertes_v2`), avec « Acquitter »
   (`vis_acquitter_alerte`).
6. **Réglages › Budget** : plafond mensuel par client (`vis_fixer_plafond`, visible pour le
   propriétaire OIA seulement) et état du mois (`vis_budget_v2`).

Règles :
- Les erreurs des fonctions (`42501`, `22023`, `P0002`, `55000`) s'affichent telles quelles,
  près du bouton.
- Après chaque geste, relis les vues concernées. N'affiche jamais un état optimiste comme
  s'il était acquis.
- Les montants s'affichent en dollars, avec 2 décimales.
- Tests :
  - chaque bouton appelle la bonne fonction avec les bons paramètres ;
  - le GO est refusé sans plafond ;
  - le contenu affiché dans l'`iframe` ne peut pas exécuter de script ;
  - aucune démonstration n'apparaît pour un compte connecté.

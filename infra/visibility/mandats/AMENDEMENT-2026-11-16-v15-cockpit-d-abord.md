# Amendement au mandat v15 · le cockpit d'abord

16 novembre 2026 · Mickaël Thomas

## Règle

**Mickaël travaille dans le cockpit OIA, jamais dans le Terminal.** Tout geste humain du
mandat v15 est un bouton du cockpit qui appelle une fonction de la base OIA (RPC). Le moteur
(Mac, puis serveur) lit ces demandes dans la base, exécute, et écrit les résultats en base.
Le cockpit les lit par des vues. Les commandes `pnpm vis …` restent des outils d'équipe
technique et de secours.

| Geste de Mickaël (cockpit) | Fonction en base | Ce que fait le moteur |
| --- | --- | --- |
| Ajouter un site (adresse, client, langues, marchés) | `vis_demander_site` | audit, faits, panel et concurrents proposés, écrits en base |
| Lancer la reconnaissance (coût affiché) | `vis_go_reconnaissance` | journée de reconnaissance, concurrents et homonymes proposés |
| Valider le panel, les concurrents, les faits | `vis_valider_panel`, `vis_valider_concurrents`, `vis_valider_faits` | rien, attend le GO |
| Donner le GO d'une étude (coût affiché, plafond du client) | `vis_go_fenetre` | crée la fenêtre, collecte chaque jour, clôt, rapporte |
| Valider ou rejeter une recommandation | `vis_valider_recommandation`, `vis_rejeter_recommandation` (existent) | rien |
| Déclarer une recommandation exécutée (preuve, date) | `vis_declarer_execution` | propose la remesure 21 jours après |
| Fixer le plafond d'un client | `vis_fixer_plafond` | arrête ce client au dépassement |

Toutes ces fonctions : membres autorisés seulement, auteur et date enregistrés, aucune écriture
directe dans une table, journalisées. Les demandes vont dans une file (une table de demandes en
ajout seul, comme les demandes de recherche de Money Lookup). Le moteur traite chaque demande une
seule fois et écrit son résultat ou son erreur.

## Ce qui change dans le v15

- **Blocs A, B et E** : le parcours reste le même, mais ses entrées sont les fonctions ci-dessus,
  et ses sorties sont des vues lisibles par le cockpit. Les sorties ne sont plus des fichiers ni
  des pages HTML locales. La page de revue devient un écran du cockpit.
- **Bloc C** : l'ordonnanceur lit aussi la file des demandes à chaque passage, en plus des
  fenêtres actives.
- **Contrat** : livrer `docs/interface/contrat-donnees-visibility-v2.md`, en reprenant la 0010
  proposée et en la complétant : vues des sites et de leur étape (portefeuille), des
  propositions à valider, des demandes et de leur état, des fenêtres et rapports, et les
  fonctions ci-dessus. Migration testée sur Postgres jetable, appliquée selon la procédure de la
  0008 avec l'accord de Mickaël. Les vues v1 restent servies.
- **Ordre** :
  1. contrat v2 et migration (pour que Lovable puisse commencer) ;
  2. le moteur branché sur la file ;
  3. le parcours de Maisons.co, fait **depuis le cockpit**.

## Cockpit (Lovable)

Après le contrat v2, Lovable :
- branche les écrans Visibility existants sur les vues réelles (aucune démonstration pour un
  compte connecté) ;
- ajoute les écrans des gestes ci-dessus : ajouter un site, revue et validation, GO avec coût,
  recommandations, portefeuille.

Le design existant est gardé. Le cockpit ne fait aucune modification de Supabase.

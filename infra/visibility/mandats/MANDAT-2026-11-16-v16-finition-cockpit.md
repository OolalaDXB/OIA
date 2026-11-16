# Mandat v16 · Finir Visibility : la seconde étude se fait depuis le cockpit

16 novembre 2026 · Mickaël Thomas

> Exécuteur : la session Claude Code du Mac Studio, sur `main`. Ce mandat remplace la suite
> du v15 et de son amendement : les blocs C, D, F et G du moteur sont faits (`972d774`).
> La mesure croisée de Coach Gari reste à part.

## 0. Critère de fin

**Mickaël fait la seconde étude (Maisons.co) de bout en bout dans le cockpit OIA, sans
Terminal ni session Claude :** ajouter le site, lire et corriger la revue, valider, lancer
la reconnaissance, valider les concurrents, donner le GO du J0 avec son coût, suivre les
5 jours, valider le rapport, puis les recommandations. Le moteur tourne seul.

Une fois ce mandat fini, plus aucun geste de Mickaël ne passe par une session Claude.

## 1. Règles

Celles du v15 s'appliquent toutes (plafonds, validation humaine, dépôt public sans données
client, généricité, procédure de la 0008 pour la production). En plus :
- le contrat est `docs/interface/contrat-donnees-visibility-v2.md`. Toute divergence passe
  par une modification de ce document dans le même commit, jamais en silence ;
- aucun appel payant pendant ce mandat. Le premier appel payant est la reconnaissance de
  Maisons.co, lancée par Mickaël depuis le cockpit.

## Bloc A · Migration du contrat v2

- `0011_visibility_pilotage.sql` (numéro à ajuster) : tables en ajout seul (gestes,
  demandes, propositions versionnées, fenêtres et jours, budget, alertes, signe de vie du
  moteur, pages), vues `_v2`, fonctions des gestes et du moteur. Elle inclut la 0010 ou passe
  après elle.
- Tests adverses sur Postgres jetable : chaque fonction (droits par rôle, `viewer` refusé,
  `anon` refusé, identité de service refusée pour un geste humain), chaque refus du contrat
  (GO avant validation, coût vu différent, plafond dépassé ou non fixé, double appel), RLS
  entre deux clients, colonnes des vues identiques au contrat.
- Démonstration v2 (SQL et JSON) comme décrit dans le contrat.
- Compléter le contrat avec les colonnes des vues reprises de la 0010.
- **Production** : donner à Mickaël les commandes selon la 0008 (sauvegarde, répétition
  terminée par un retour arrière, application). Il valide chaque écriture. Puis
  `vis_fixer_plafond` pour Coach Gari et Maisons.co reste un geste de Mickaël dans le cockpit.

## Bloc B · Le moteur branché sur la file, sans surveillance

- Le moteur (`scheduler.ts` et le parcours d'ajout de site) lit les demandes par
  `vis_moteur_prendre`, les traite, écrit en base, et signe sa présence à chaque passage.
- Traitement de chaque type : `SITE_ADD` (adresse, audit Crawlie, contrôle de l'indexation
  Bing et Google, faits et panel proposés par Mistral via `packages/providers`, estimation de
  la reconnaissance), `RECON` (collecte, extraction des acteurs et homonymes, estimation du
  J0), `WINDOW_RUN` (collecte quotidienne, jours consignés, clôture, rapport, page client,
  recommandations), `REMEASURE_PROPOSE`.
- **Installation sur le Mac, faite une fois par cette session** : un `launchd` qui lance un
  passage toutes les 5 minutes pour la file, et le passage quotidien à `runTimeUtc`.
  - Il redémarre seul.
  - Ses journaux sont hors du dépôt et ne contiennent aucune donnée client.
  - Ses clés viennent de `~/.oia/visibility.env`.
  - Documenter le réglage de veille du Mac (`pmset`) : le Mac ne doit pas dormir à l'heure
    de collecte. En cas de manque, le cockpit montre « moteur muet », jamais un faux vide.
- Tests : une demande de chaque type sur fournisseurs fictifs, une reprise après plantage
  (une demande `RUNNING` abandonnée repasse en file après 30 minutes), aucune requête réseau
  en CI.

## Bloc C · Le cockpit

- Livrer le brief `docs/interface/brief-lovable-visibility-v2.md` (déjà rédigé), à relire et
  corriger s'il s'écarte de la migration réelle.
- Après l'envoi du brief à Lovable par Mickaël : relire le code produit par Lovable dans
  `prototypes/oia-prototype`. Vérifier qu'il n'utilise aucune clé de service, n'écrit dans
  aucune table, appelle les bonnes fonctions, et gère les états. Lancer ses tests. Consigner
  les écarts dans `docs/interface/ecarts-visibility-lovable.md`, avec un message correctif
  prêt pour Lovable.

## Bloc D · Recette, sans appel payant

Sur la base de production, avec un client de recette fictif (à supprimer seulement s'il
n'a laissé aucune preuve, sinon archivé) ou sur une branche Supabase :
1. « Ajouter un site » depuis le cockpit : le moteur produit la revue en moins de
   15 minutes.
2. Modifier une question, valider le panel et les faits.
3. Vérifier que le GO est refusé sans plafond, puis avec un coût vu différent.
4. Vérifier l'alerte « moteur muet » en arrêtant le `launchd`, puis son retour.

Ensuite, Maisons.co est ajouté **par Mickaël, depuis le cockpit**. Ce mandat s'arrête à la
revue de Maisons.co : la reconnaissance et le J0 sont les GO de Mickaël.

## Bloc Z · Rapport

`infra/visibility/reports/2026-11-16-mandat-v16.md`, court :
- ce qui est appliqué en production ;
- le moteur installé (comment voir qu'il tourne : le bandeau du cockpit) ;
- le résultat de la recette, écran par écran ;
- les écarts avec Lovable ;
- ce que Mickaël fait maintenant, uniquement dans le cockpit.

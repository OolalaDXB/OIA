# Mandat v13 · OIA Visibility en continu : fenêtres J1, J2…, rapports comparés, pages client

16 novembre 2026 · Mickaël Thomas

> Exécuteur : la session Claude Code du Mac Studio, sur `main`. Elmo, les données de mesure
> (`~/oia-visibility-data/`) et les commits non poussés de la clôture de J0 sont sur ce Mac.

## 0. Constat et objectif

J0 de Coach Gari est clos : 0 % de visibilité sur les 8 questions non marquées, sur les
5 moteurs. Les scripts acceptent déjà un sujet et une fenêtre (`OIA_VIS_WINDOW`), et la
fenêtre `j1` est déclarée dans `subjects/coach-gari/measurement.yaml` (`comparesWith: j0`).
Il manque l'outillage qui rend la mesure récurrente.

**Objectif : n'importe quelle fenêtre (J1, J2…) de n'importe quel sujet se lance, se clôt,
se rapporte et se compare à sa référence avec les mêmes commandes, et produit une page
lisible pour le client.** Aucun nom de sujet dans le code (test de généricité).

| Ordre | Bloc | Résultat |
| --- | --- | --- |
| 0 | Remise à niveau | Commits de la clôture de J0 poussés, rapport J0 validé ou en attente |
| A | Commandes génériques | `pnpm vis <action> <sujet> <fenêtre>` |
| B | Lancement d'une remesure | Fenêtre de suivi lancée dans l'Elmo existant, contrôles GO / NO-GO |
| C | Rapport comparé | J1 contre J0, selon les règles de comparaison du brief |
| D | Décisions et mesure | Recommandations exécutées rattachées à la fenêtre qui les mesure |
| E | Page client | Page générée depuis les chiffres du rapport, sans saisie à la main |
| F | Base OIA | Synchronisation de toute fenêtre, pas seulement J0 |
| Z | Rapport | Ce qui est fait, testé, et ce qui reste à décider |

## 1. Règles

1. Travail sur `main`, `git pull --rebase origin main` avant chaque push.
2. **Aucun appel payant** hors d'une fenêtre lancée par Mickaël. Les tests utilisent des
   données fictives. Une fenêtre ne démarre jamais sans GO explicite de Mickaël.
3. **Les données de J0 ne bougent pas** : table des preuves, rapport, empreintes. Toute
   nouvelle version du rapport J0 est un nouveau fichier, jamais une réécriture.
4. **Elmo** : ne jamais supprimer une question (la suppression efface ses réponses), la
   désactiver. Aucun fork, aucune modification de son code.
5. Aucune modification du site ni du dépôt d'un sujet. Le gel d'une fenêtre s'applique
   pendant toute sa durée.
6. Migrations éventuelles : fichier dans `packages/database/supabase/migrations`, tests
   adverses sur Postgres jetable, application en production selon la procédure de la 0008,
   chaque commande d'écriture validée par Mickaël.
7. Aucun secret dans le dépôt, les journaux ou les rapports.

## Bloc 0 · Remise à niveau

- Pousser les commits locaux de la clôture de J0 (dont `41fa71a`), le rapport J0 et les
  fiches `jour-1` à `jour-5`.
- Reporter le coût réel de J0 quand Mickaël l'a relevé dans les consoles.
- Statut du rapport J0 : « à valider par Mickaël » tant qu'il ne l'a pas validé.

## Bloc A · Commandes génériques

- Une commande : `pnpm vis <action> <sujet> <fenêtre>`, actions `launch` (avec
  `--dry-run`), `status`, `view`, `close`, `report`, `verify`, `compare`, `page`.
- Aucun sujet ni fenêtre codé en dur. Les `vis:j0-*` actuels restent comme alias de
  `coach-gari j0`.
- Chaque action refuse une fenêtre absente de `measurement.yaml`, ou dans un statut
  incompatible (par exemple `close` sur une fenêtre `planned`).
- Tests : tous les chemins de refus, et un aller-retour complet sur un sujet fictif.

## Bloc B · Lancer une fenêtre de suivi dans l'Elmo existant

`pnpm vis launch <sujet> <fenêtre> --dry-run` donne GO ou NO-GO, sans rien écrire.
Contrôles :

1. La marque et les questions existent déjà dans Elmo. **Exactement** les questions actives
   du panel de la fenêtre sont activées, identifiées par leur étiquette `oia:<id>@v<version>` ;
   toute autre question est désactivée, jamais supprimée.
2. `panelVersion` identique à celle de la fenêtre de référence (`comparesWith`), sinon
   `comparisonNote` obligatoire.
3. Cibles et modèles identiques à la référence. Un modèle servi sous un alias qui peut changer
   (`-latest`, `-preview`) est signalé : la version servie sera relevée, et toute différence
   rendra la comparaison « fragile » pour ce moteur.
4. Concurrents : la liste chargée dans Elmo est celle que la fenêtre déclare. Si elle diffère
   de celle de la référence, la comparaison recomptera les deux fenêtres avec la même liste
   (voir C).
5. Heure : le worker démarre à `runTimeUtc`. Les travaux en retard ne doivent pas tous partir
   au démarrage d'un coup : vérifier, puis documenter le comportement réel d'Elmo 0.7.7.
6. Gel : un gel `freeze-<fenêtre>` est créé dans `measurement.yaml` pour toute la durée de la
   fenêtre, sur le modèle de `freeze-j0`.
7. Budget : plafond et alerte de `cost-guard.sh` actifs, limites par fournisseur vérifiées
   dans la configuration.
8. Suivi quotidien (fiches `jour-N`, synchronisation, notification en cas de problème)
   installé pour cette fenêtre.

Sans `--dry-run`, et seulement après le GO de Mickaël : lancement, puis premier contrôle
après le premier passage, comme pour J0.

## Bloc C · Rapport comparé

`pnpm vis compare <sujet> <fenêtre>` compare une fenêtre à sa référence (`comparesWith`) et
écrit `subjects/<sujet>/reports/<fenêtre>/comparaison-<fenêtre>-<référence>.{md,html,json}`.

Règles du brief, non négociables :

- **Unité statistique : le jour, par moteur.** Chaque jour donne un taux par moteur. Le taux
  d'une fenêtre est la moyenne de ses jours. Son intervalle de confiance à 95 % se calcule
  sur la dispersion entre jours, par rééchantillonnage des jours (graine fixée, résultat
  reproductible).
- **Une évolution n'est déclarée que si les intervalles des deux fenêtres ne se chevauchent
  pas.** Sinon le rapport écrit « pas de changement démontrable ».
- Questions non marquées et questions marquées comparées séparément. Seules les non marquées
  disent la visibilité.
- Comparaison refusée si `panelVersion` diffère sans `comparisonNote`.
- Changement de version de modèle entre les deux fenêtres : comparaison signalée « fragile »
  pour ce moteur.
- Réponses non mesurées : hors du dénominateur, dans les deux fenêtres.
- Concurrents et part de voix : les deux fenêtres recomptées avec la même liste, celle de la
  fenêtre la plus récente. Les comptes d'Elmo ne servent pas à la comparaison.
- Sources citées : évolution des domaines les plus cités, et du nombre de citations du site
  et des profils officiels du sujet.
- Aucune causalité affirmée : les recommandations exécutées entre les deux fenêtres sont
  listées comme contexte (voir D), jamais comme cause prouvée.
- Tests avec données fictives : changement net (intervalles disjoints), pas de changement
  démontrable, jour manquant, version de modèle changée, réponses non mesurées, panel
  différent.

## Bloc D · Décisions et mesure

- Chaque recommandation de `subjects/<sujet>/p2/decisions.md` (et du journal en base
  `vis_recommandations`) porte, une fois exécutée : la date de mise en ligne, le commit ou la
  preuve (page publiée, fiche créée), et la fenêtre qui la mesurera.
- Les actions sans code (fiche d'annuaire, page d'une académie, profil LinkedIn) se
  consignent de la même façon, avec l'URL et la date, déclarées par Mickaël.
- `pnpm vis status <sujet> <fenêtre>` rappelle les recommandations exécutées depuis la
  référence, et celles encore en attente.
- La date de J1 se fixe par Mickaël, au moins trois semaines après la dernière exécution
  (règle déjà inscrite dans `measurement.yaml`).

## Bloc E · Page client générée

- `pnpm vis page <sujet> <fenêtre>` génère
  `subjects/<sujet>/reports/<fenêtre>/page-client.html` à partir de `figures.json` (et de la
  comparaison, s'il y en a une). Aucun chiffre n'est saisi à la main.
- Contenu, sur le modèle de la page J0 de Coach Gari
  (https://claude.ai/artifact/LFgRWhaVYXjqjJjKb5nVms, lue comme exemple et non recopiée) :
  - le résultat en une phrase ;
  - les questions non marquées ;
  - les questions marquées ;
  - les sources les plus citées et la place du site ;
  - les acteurs cités à la place du sujet ;
  - les actions du client et celles de l'équipe, tirées des recommandations validées ;
  - la prochaine mesure ;
  - les limites (API et non applications, aucune garantie).
- Langue : celle du client, déclarée dans `subject.yaml` (champ à ajouter si besoin,
  schéma commun).
- Aucun nom de sujet dans le gabarit. Test : la page générée pour un sujet fictif ne contient
  que ses données.
- La publication reste un geste de Mickaël.

## Bloc F · Base OIA

- `vis-sync` synchronise n'importe quelle fenêtre (preuves en ajout seul, empreintes
  vérifiées), pas seulement `coach-gari-j0`.
- Les vues `vis_*_v1` exposent toutes les fenêtres d'un sujet, et la comparaison si elle
  existe. Si une colonne manque au contrat, proposer une version 2 du contrat et de ses vues,
  sans modifier les vues v1.

## Bloc Z · Rapport

`infra/visibility/reports/2026-11-16-mandat-v13.md` :
- ce qui est fait et testé, bloc par bloc ;
- le comportement réel d'Elmo au redémarrage du worker (B5) ;
- les décisions à prendre par Mickaël : date de J1, liste de concurrents pour J1, modèles
  sous alias, panel de Maisons.co et son J0.

# Mandat v14 · Basculer d'Elmo vers OIA Visibility

16 novembre 2026 · Mickaël Thomas

> Exécuteur : la session Claude Code du Mac Studio, sur `main`. Elmo, sa base et les données
> de mesure sont sur ce Mac.

## 0. Décision et périmètre

**Décision de Mickaël (16 novembre 2026)** : OIA Visibility devient le collecteur et la seule
source de vérité de la mesure.
- Elmo est vidé de tout ce qu'il contient d'utile, puis arrêté. Il n'est jamais supprimé : la
  base et une sauvegarde complète sont gardées.
- C'est la trajectoire de l'ADR 0001 (`docs/visibility/adr/0001-strategie-de-collecte.md`),
  avancée à maintenant. Passer son statut à « validé » en notant cette date.
- **Ce mandat remplace le bloc B du mandat v13** (lancer J1 dans Elmo). Les blocs A
  (commandes génériques), C (rapport comparé), D (décisions et mesure), E (page client) et F
  (base OIA) du v13 restent valables : ils s'appliquent au collecteur OIA.

| Ordre | Bloc | Résultat |
| --- | --- | --- |
| A | Export complet d'Elmo | Sauvegarde intégrale vérifiée, et export JSON de chaque table utile |
| B | Import dans OIA | Toutes les réponses d'Elmo dans `vis.evidence`, en ajout seul, empreintes vérifiées |
| C | Collecteur OIA | Les 5 moteurs interrogés par OIA, avec les mêmes réglages qu'à J0 |
| D | Juge des mentions | Correspondance déterministe, plus un juge au choix de Mickaël |
| E | Parité | Preuve que le collecteur OIA mesure comme Elmo, avant J1 |
| F | Arrêt d'Elmo | Worker et interface arrêtés, base gardée, procédure de redémarrage écrite |
| G | Rapports et cockpit | Rapports, comparaisons et pages lus depuis la base OIA, plus jamais depuis Elmo |
| Z | Rapport | Ce qui est fait, testé, et les décisions de Mickaël |

## 1. Règles

1. Travail sur `main`, `git pull --rebase origin main` avant chaque push.
2. **Rien n'est perdu** : aucune suppression dans Elmo, aucune réécriture des preuves de J0.
   Tout import se fait en ajout seul.
3. **Aucun appel payant** hors d'une fenêtre ou d'une mesure de parité lancée sur GO explicite
   de Mickaël, avec une estimation chiffrée avant. Tests sur données fictives.
4. **Migrations** : fichier dans `packages/database/supabase/migrations` (ou
   `infra/visibility/migrations` pour `vis`), tests adverses sur Postgres jetable, application
   en production selon la procédure de la 0008, chaque commande d'écriture validée par
   Mickaël.
5. **Code repris d'Elmo** (licence MIT) : autorisé, avec l'avis de licence et la référence du
   fichier d'origine (tag `v0.7.7`, commit `5e76f422`) en tête de chaque fichier repris.
6. Aucun secret dans le dépôt, les journaux ou les rapports. La table `secrets` d'Elmo n'est
   pas exportée en valeurs (noms seulement).
7. Aucun nom de sujet dans le code (test de généricité). Aucune modification d'un site client.

## Bloc A · Export complet d'Elmo (lecture seule)

- Sauvegarde intégrale : `pg_dump -Fc` de la base d'Elmo dans
  `~/oia-sauvegardes/elmo-final/<horodatage>/`, avec `SHA256SUMS`, relue sur un Postgres
  jetable (comptes de lignes identiques).
- Export JSON, table par table, de tout ce qui a une valeur de preuve ou de configuration :
  - `brands`, `prompts` (texte, étiquettes, état, dates), `competitors` (et les listes
    gardées avant chaque changement) ;
  - `prompt_runs` (sortie brute complète, requêtes de recherche, modèle, version servie,
    date) ;
  - `run_extractions` (texte), `run_mentions` (mentions et jugements de Jev : sentiment,
    position, passages) ;
  - `citations`, `cited_pages`, `usage_events` (coûts estimés), `reports`,
    `brand_opportunities`, `organization_settings` sans secret.
- Inventaire : nombre de lignes par table et par sujet. Les réponses aux deux questions hors
  panel de Coach Gari (30) sont incluses et marquées « hors panel ».
- Lister aussi ce qu'Elmo calcule et qu'OIA doit savoir refaire : classement des domaines
  cités, extraction des citations par fournisseur, recherches lancées par les moteurs,
  catégories de sources, opportunités. Pour chacun : repris (code MIT), refait, ou abandonné.

## Bloc B · Import dans OIA

- Toutes les réponses d'Elmo entrent dans `vis.evidence`, en ajout seul :
  - avec `collector_name = 'elmo-0.7.7'`, le modèle et la version servie, la date, la
    recherche web, les citations, les requêtes, et le coût estimé ;
  - les réponses hors fenêtre et hors panel sont importées, mais marquées comme telles ;
  - les jugements de Jev sont importés comme « extraits (Jev 1.13) », jamais comme faits.
- Vérification :
  - le nombre de réponses en base est égal au nombre de runs dans Elmo ;
  - pour les 250 réponses de J0, l'empreinte SHA-256 est identique à celle de la table des
    preuves locale ;
  - le rapport J0 recalculé depuis la base donne exactement `figures.json`.
- Une migration n'est écrite que si une colonne manque, en suivant la règle 4.

## Bloc C · Collecteur OIA

Implémentation `collector-oia-direct` du contrat existant
(`infra/visibility/src/collector.ts`), pour les 5 moteurs de J0.

- **Mêmes réglages qu'Elmo à J0**, lus dans son code au tag `v0.7.7` : modèles et
  identifiants exacts, recherche web, limites de recherche par appel, plafond de jetons, et
  passage par OpenRouter pour Gemini et Perplexity.
  - Tout écart avec Elmo est documenté.
  - Les adaptateurs de modèles d'OIA (`src/llm-adapters.ts`, `packages/providers`) sont
    réutilisés quand ils conviennent. Sinon, un appel direct, sans nouveau fournisseur.
- **Ce qu'Elmo perdait, et qu'OIA garde** :
  - la sortie brute complète et les compteurs d'OpenAI (Elmo reconstruisait la réponse) ;
  - le coût réel de chaque appel ;
  - le texte de toutes les réponses de Mistral (Elmo en a laissé 14 sans texte à J0).
- Citations : extraction par fournisseur, reprise d'Elmo. Liens de redirection de Gemini
  résolus (`src/redirects.ts`). Mistral Large 4 ne renvoie pas ses sources : le documenter.
- **Planification** :
  - une tâche quotidienne sur le Mac, à `runTimeUtc`, un appel par question, par moteur et
    par jour ;
  - reprises bornées sur 429 et 5xx ; un échec définitif est consigné, jamais comblé ;
  - le garde-fou de coût arrête la collecte au plafond, et s'arrête aussi si le coût du jour
    est illisible.
- Le choix du moteur se fait **par question**, et non plus par marque comme dans Elmo.
- Tests : réponses fictives pour chaque fournisseur, cas d'erreur, aucune requête réseau en
  CI.

## Bloc D · Juge des mentions

- Toujours : **correspondance déterministe** des noms, alias et domaines (un fait), avec le
  passage exact qui l'a déclenchée.
- En plus, au choix de Mickaël (interface prête pour les trois, aucun appel avant sa
  décision) :
  1. **Jev de TypeSafe**, appelé directement par OIA avec le même modèle épinglé
     (`jev-1.13.0`). C'est le même juge qu'à J0, donc la meilleure comparabilité.
  2. **Mistral** via `packages/providers`, méthode « LLM, extrait ».
  3. **Aucun juge** : correspondance seule, sans sentiment ni position.
- Estimer le coût mensuel de chaque option au volume de J0.

## Bloc E · Parité avant J1

L'ADR 0001 exige, avant de basculer un moteur, une mesure croisée. Changer de collecteur
entre J0 et J1 sans preuve de parité rendrait la comparaison « fragile » pour chaque moteur.
Préparer les deux options, Mickaël choisit :

1. **Mesure croisée courte** : 2 à 5 jours, les 10 questions de Coach Gari posées le même
   jour par Elmo et par le collecteur OIA, sur les 5 moteurs. Coût à estimer avant (environ
   le double d'un jour de J0). Critères de l'ADR : couverture, nombre de citations, longueur
   médiane, taux de mention, tous dans les intervalles de J0.
2. **Pas de mesure croisée** : J1 se fait sur le collecteur OIA, et le rapport comparé
   déclare la comparaison « fragile » pour chaque moteur, avec la raison.

## Bloc F · Arrêt d'Elmo

Seulement après la vérification des blocs A et B, et la décision du bloc E :
- arrêter le worker et l'interface d'Elmo, retirer sa tâche de suivi quotidienne ;
- garder son volume Postgres et la sauvegarde du bloc A ;
- écrire la procédure de redémarrage (au cas où), dans `infra/visibility/README.md` ;
- clés propres à Elmo : à garder dans le coffre de Mickaël, à retirer de la configuration
  active.

## Bloc G · Rapports et cockpit

- `vis report`, `vis compare` et `vis page` (mandat v13) lisent la base OIA. Plus aucun
  rapport ne lit Elmo.
- Les vues `vis_*` du cockpit sont alimentées par le collecteur OIA. Les données d'Elmo
  importées restent lisibles, marquées par leur collecteur.

## Bloc Z · Rapport

`infra/visibility/reports/2026-11-16-mandat-v14.md` :
- inventaire de l'export, avec les comptes vérifiés ;
- résultat de l'import (empreintes, rapport J0 recalculé) ;
- ce qui est repris d'Elmo, refait ou abandonné ;
- collecteur OIA : moteurs, réglages, écarts avec Elmo, tests ;
- retour arrière de chaque migration ;
- décisions de Mickaël : juge (D), parité (E), date de J1, arrêt d'Elmo (F).

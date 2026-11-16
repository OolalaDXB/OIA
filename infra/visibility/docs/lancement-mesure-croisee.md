# Lancement de la mesure croisée (mandat v14, bloc E, option E1)

Procédure seulement : **rien n'est lancé par ce document**. Fenêtre `parite-1` de
`measurement.yaml` : 2 jours, 4 moteurs (Mistral retiré), `comparesWith: j0`, `runTimeUtc`
de la fenêtre. Les mêmes questions sont posées le même jour par Elmo 0.7.7 et par le
collecteur OIA direct. Les deux sortes de preuves vont dans la même table locale,
`<data>/<sujet>/evidence/parite-1.jsonl` : `collectorName` vaut `elmo` (import de la clôture)
ou `oia-direct` (collect-day).

Notations : `<sujet>` est l'identifiant du sujet, `<data>` vaut `OIA_VIS_DATA` (par défaut
`~/oia-visibility-data`) et `<HH:MM>` est le `runTimeUtc` de `parite-1`. « La session »
désigne la session Claude Code supervisée par Mickaël.

## Vue d'ensemble

| # | Étape | Qui | Sur quel GO |
|---|---|---|---|
| 0 | Prérequis : date de début, budget du mois, clés | Mickaël | décision de la date (décembre) |
| 1 | Contrôle à blanc côté Elmo | la session | aucun (lecture seule) |
| 2 | Cibles d'Elmo réduites à 4 moteurs | Mickaël, ou la session par le script | GO de Mickaël pour modifier `elmo/.env` |
| 3 | Nouveau contrôle à blanc, jusqu'au GO | la session | aucun (lecture seule) |
| 4 | Jour 1 : démarrage d'Elmo à `<HH:MM>` | Mickaël (ou la session) | **GO de lancement** de Mickaël, donné le jour même |
| 5 | Jour 1 : collecte OIA à la même heure | la session ou Mickaël | même GO de lancement (dépense) |
| 6 | Jour 2 : collecte OIA à `<HH:MM>` (Elmo tourne seul) | la session ou Mickaël | GO du jour 2 (dépense) |
| 7 | Clôture de la fenêtre | Mickaël | GO de clôture, après le dernier run du jour 2 |
| 8 | `parity-check` | la session | aucun (lecture des preuves, aucun appel) |
| 9 | Décision de parité, puis arrêt d'Elmo (bloc F) | Mickaël | décision sur le rapport `parite-parite-1.md` |

## 0. Prérequis (Mickaël)

- **Date** : un jour de décembre (le budget de novembre est épuisé). La date de début est
  posée par le lancement lui-même : `start` et le statut `running` sont écrits dans
  `measurement.yaml` par `elmo-load.ts start-window`, au démarrage du worker.
- **Budget** : au volume de J0, sans Mistral, un collecteur coûte environ 1,51 $ par jour
  (7,56 $ estimés pour chatgpt, claude, gemini et perplexity sur les 5 jours de J0). Deux
  collecteurs sur 2 jours, cela fait environ **6,05 $**, plus le juge des mentions d'OIA
  (Jev, majorant provisoire de 0,001 $ par réponse, `src/judge.ts`) et Jev côté Elmo. Le
  plafond mensuel (`OIA_VIS_MONTHLY_CAP_USD`) est commun aux deux collecteurs :
  `collect-day` additionne le journal de `cost-guard.sh` (coût d'Elmo) et ses propres
  preuves.
- **Clés d'OIA** dans `~/.oia/visibility.env`, en droits 600 et au format `NOM=valeur`, avec
  les noms connus seulement (`scripts/load-keys.sh`) : `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY` (juge jev) et `OIA_VIS_MONTHLY_CAP_USD`. Ce fichier
  est chargé par `scripts/collect-day.sh`. Mickaël le remplit à la main : la session ne lit
  ni n'affiche jamais une clé.
- Les limites propres à chaque fournisseur (crédits prépayés, clé OpenRouter plafonnée)
  sont à confirmer par Mickaël dans chaque console.

## 1. Contrôle à blanc côté Elmo (la session, sans GO)

```sh
pnpm vis launch <sujet> parite-1 --dry-run
```

Ce contrôle prend un instantané d'Elmo en **lecture seule**, déroule les contrôles 1 à 8 de
`src/window-launch.ts` et rend GO ou NO-GO. Rien n'est écrit. On le relance autant de fois
qu'il le faut.

## 2. Cibles d'Elmo réduites à 4 moteurs (GO de Mickaël)

Avec `SCRAPE_TARGETS` dans `elmo/.env`, valeur égale aux `targets` de `parite-1` séparés par
des virgules (contrôle 3) :

```
chatgpt:openai-api:gpt-6-luna:online,claude:anthropic-api:claude-sonnet-5-5:online,gemini:openrouter:google/gemini-3-flash-preview:online,perplexity:openrouter:perplexity/sonar:online
```

Deux façons de faire :
- **Mickaël**, à la main, dans `elmo/.env` ;
- **la session**, sur GO de Mickaël, avec la méthode de `set_env_line` (`scripts/j0-launch.sh`) :
  une seule ligne `KEY=` est remplacée par un fichier temporaire en droits 600, sans afficher le
  fichier. Elle n'est appliquée qu'à `SCRAPE_TARGETS`, une valeur qui n'est pas secrète.
  `set_env_line` est une fonction interne de `j0-launch.sh`, pas un script autonome : la
  session reprend ses quatre lignes, ou un petit script dédié est écrit (à décider).
- Le contrôle 3 relit la valeur dans le fichier. Le conteneur du worker la prend à sa
  création : `docker compose up -d worker` (étape 4) le recrée si sa configuration a changé.
  À vérifier sur le premier run (`j0-first-run.sh`), qui doit montrer 4 moteurs.

## 3. Ce qui manque encore pour que le contrôle à blanc donne GO

L'état d'Elmo n'a pas été relu pour écrire ce document : seul le contrôle à blanc fait foi.
Voici ce qui est connu à la date du mandat :

| Contrôle | État connu | À faire |
|---|---|---|
| 4. Concurrents | **ok** depuis le 2026-11-16 : les 20 concurrents déclarés (`subject.yaml`) ont été rechargés dans Elmo en une transaction, la liste précédente gardée hors du dépôt (voir la note de la fenêtre dans `measurement.yaml`). Effet : au démarrage du worker, Elmo rejugera ses réponses passées par Jev (tampon lié aux concurrents) | rien ; vérifier l'effet de rejugement au GO |
| 3. Cibles | **NO-GO** tant que `SCRAPE_TARGETS` contient Mistral (5 cibles de J0) | étape 2 |
| 1. Questions | les deux questions hors panel sont désactivées depuis le 2026-11-10 ; à confirmer | rien si le contrôle passe |
| 5. Worker | il doit être arrêté (la clôture de J0 l'a arrêté) ; les travaux en retard partiront au démarrage, d'où le démarrage à `<HH:MM>` ± 5 min | rien |
| 7. Budget | plafond et alerte de `cost-guard.sh` à poser, dépense du mois de début sous le plafond. Depuis le 2026-11-16, l'estimation de ce contrôle est le coût par jour des moteurs de la fenêtre à J0, multiplié par sa durée (environ 3,02 $ pour 2 jours, côté Elmo seulement) : la collecte OIA ajoute environ autant, plus le juge, que le contrôle ne compte pas | Mickaël pose le plafond de décembre ; garder environ 6,1 $ de marge pour les deux collecteurs |
| 8. Suivi quotidien | aucune tâche d'une autre fenêtre ne doit rester installée (launchd `com.oia.visibility.<sujet>.*`) | rien si le contrôle passe |
| Collecte OIA | **aucune tâche planifiée** pour `collect-day` : la collecte du jour 2 à `<HH:MM>` est manuelle | Mickaël choisit : lancement à la main, ou une tâche launchd à écrire (autre GO) |
| Clés OIA | `~/.oia/visibility.env` non vérifié | Mickaël, étape 0 ; `scripts/collect-day.sh <sujet> parite-1` sans `--go` affiche le plan et le plafond lu, sans aucun appel |

## 4. Jour 1 : démarrage du worker d'Elmo à `<HH:MM>` (GO de lancement)

```sh
pnpm vis launch <sujet> parite-1
```

Cette commande refait les mêmes contrôles, puis, seulement à `<HH:MM>` ± 5 min : gel
`freeze-parite-1`, démarrage du worker, passage de la fenêtre en `running` (avec `start`),
installation du suivi quotidien, Mac maintenu éveillé et `cost-guard.sh --watch`. Premier
contrôle 10 à 15 minutes plus tard :
`OIA_VIS_WINDOW=parite-1 ./scripts/j0-first-run.sh <sujet>`.

## 5. Jour 1 : collecte OIA du même jour, à la même heure

Juste après le démarrage du worker (la fenêtre doit être `running`) :

```sh
./scripts/collect-day.sh <sujet> parite-1          # plan et coût au majorant, aucun appel
./scripts/collect-day.sh <sujet> parite-1 --go     # collecte réelle (juge par défaut : jev)
```

Il y a un appel par question active et par moteur cible. Les reprises sont bornées sur 429
et 5xx. Un échec est consigné dans `<data>/<sujet>/evidence/parite-1.failures.jsonl` et n'est
jamais comblé. Le garde-fou arrête la collecte au plafond (code de sortie 3).

## 6. Jour 2 : collecte OIA à `<HH:MM>`

Elmo relance seul ses questions, 24 heures après. La collecte OIA est relancée à la même
heure avec la même commande `--go`. Un jour non collecté ne se rattrape pas : `parity-check`
le compte comme une couverture de 0 %, donc comme un écart.

## 7. Clôture (Mickaël, après le dernier run du jour 2)

```sh
pnpm vis close <sujet> parite-1
```

La clôture arrête le worker (`docker compose stop worker`, réversible), sauvegarde et vérifie
la base d'Elmo, puis exporte et importe les réponses d'Elmo dans `parite-1.jsonl`, à côté des
preuves `oia-direct`. Elle résout aussi les redirections, retire le suivi quotidien et passe
la fenêtre en `done`. Rien n'est supprimé.

## 8. `parity-check` (la session, sans GO)

La référence de préférence est les **preuves de J0**, car elles portent tous les critères.
Son `failed.json` donne les bornes exactes de la fenêtre :

```sh
npx tsx src/parity-check.ts <sujet> parite-1 \
  <data>/<sujet>/evidence/parite-1.jsonl \
  <data>/<sujet>/evidence/j0.jsonl \
  subjects/<sujet>/reports/parite-1 \
  "$(source scripts/lib.sh; window_dir <data> <sujet> j0)/close/failed.json"
```

La commande écrit `subjects/<sujet>/reports/parite-1/parite-parite-1.{md,json}` et affiche
le verdict de chaque moteur (« parité », « écart » avec le critère fautif, ou « non
concluant »). Options :
- `--mention texte` : correspondance déterministe sur le texte pour la référence, Elmo et
  OIA, si les juges diffèrent (par exemple OIA collecté avec `--juge aucun`) ;
- en repli, `subjects/<sujet>/reports/j0/figures.json` à la place de `j0.jsonl` : seuls les
  taux de mention se comparent alors, et le verdict vaut au mieux « non concluant ».

Aucun appel réseau. Le rapport est « à valider par Mickaël ».

## 9. Décision, puis arrêt d'Elmo (Mickaël)

- Mickaël lit `parite-parite-1.md` et décide, moteur par moteur : bascule vers OIA, ou J1
  déclaré « fragile » pour ce moteur. Chaque bascule est consignée dans `decisions/`
  (ADR 0001).
- **Seulement ensuite**, le bloc F : arrêt du worker et de l'interface d'Elmo, retrait de
  sa tâche quotidienne, volume Postgres et sauvegardes gardés, clés d'Elmo rangées dans le
  coffre.

## Limites à garder en tête

- L'ADR 0001 demande une semaine de mesure croisée, et 0 échec sur 30 appels consécutifs
  par moteur. `parite-1` donne 2 jours, soit 20 appels par moteur et par collecteur. Le
  verdict « parité » est donc une présomption, pas la preuve complète de l'ADR (point à
  décider par Mickaël).
- `parity-check` ne vérifie pas les autres critères de l'ADR : mêmes URL et passages,
  fiabilité, coût, maintenance.

## Décisions de Mickaël (2026-11-16)

1. Mention : le jugement de chaque collecteur (Jev des deux côtés), réglage par défaut ; la correspondance sur le texte est produite en information (`<outDir>/information-texte/`), sans effet sur le verdict.
2. Questions marquées : information, sans effet sur le verdict (`INFORMATIVE` dans `src/parity-check.ts`).
3. Seuil d'écart du même jour entre OIA et Elmo : l'étendue des jours de la référence.
4. Durée : 2 jours ; le verdict est présenté comme une présomption. On n'allonge que si un moteur sort « écart » ou « non concluant ».
5. Collecte OIA du jour 2 : par l'ordonnanceur du mandat v15 s'il est prêt, sinon à la main. Pas de tâche ad hoc.
6. Rejugement des réponses passées par Elmo au démarrage du worker (concurrents rechargés) : accepté.

Date de début, plafond de décembre et clés : à donner par Mickaël.

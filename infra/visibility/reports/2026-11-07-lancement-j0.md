# Rapport · mandat de lancement J0 · 2026-11-07

À lire après `a-faire-au-retour.md`.

## En bref

- **J0 n'est pas lancé.** Il bloque sur la création de ton compte Elmo,
  que toi seul peux faire. Tout le reste est outillé et vérifié : après
  le compte, `./scripts/j0-launch.sh coach-gari` lance J0 en une
  commande.
- **Aucun appel payant.** Ni clé lue, ni valeur de `elmo/.env` affichée
  (seule la présence des variables a été contrôlée).
- **Écran Lovable :** `pnpm vis:j0-view` fonctionne. Mais le prototype ne
  lit pas encore `public/data/visibility.json` : il affiche ses données de
  démonstration. **Ajustement à demander à Lovable.**
- **Étape 4 :** `mandats/MANDAT-2026-11-07-v6.md` n'existe pas, donc
  rien à exécuter.

## Étape 1 · Limites

Déjà en place depuis le commit `933d3b7`. Plafonds indépendants par
fournisseur : Anthropic 12 $, Mistral 8 $, TypeSafe 3 $ au plus,
OpenRouter 5 $ par mois sur la clé, OpenAI 5 $. Le plafond de 30 $ porte
sur la dépense totale réelle, que surveille `cost-guard.sh`. Ajout au
runbook (étape 1) : les secrets générés d'Elmo sont conservés et seront
régénérés au passage sur serveur, en P3.

## Étape 2 · Diagnostic et lancement

| Contrôle | Résultat |
|---|---|
| `preflight.sh` (état des lieux, sans verdict GO/NO-GO) | Mac arm64, Docker 29.4.3, 16 Go, images Elmo 0.7.7 disponibles en arm64, port 1515 libre. Copie : `~/oia-visibility-data/preflight-2026-11-07.txt`. |
| Clés dans `elmo/.env` (présence seule) | Les 5 clés sont remplies (une occurrence chacune). `SCRAPE_TARGETS` vide (verrou). Réglages non secrets conformes (mode local, 24 h, 1 run, plafond 30 $, alerte 24 $). |
| Interface d'Elmo | Postgres, migration (code 0) et web démarrés, **worker arrêté**. http://localhost:1515 renvoie vers `/auth/register` (« Sign up · Elmo »). |
| Base d'Elmo | Vide : 0 compte, 0 organisation, 0 marque, 0 run. |
| `j0-launch.sh coach-gari --dry-run` | Clés, cibles, grille de prix et conteneurs : OK. **NO-GO : aucun compte dans Elmo.** |

**Pourquoi c'est bloquant.** En mode local, c'est la première
inscription qui crée l'organisation `default` et son administrateur
(`apps/web/src/lib/auth/server.ts:25-36` d'Elmo 0.7.7). Elmo refuse toute
inscription suivante. Ce compte est le tien (email, mot de passe) : je ne
l'ai pas créé à ta place. Lancer J0 sans lui aurait placé la marque dans
une organisation inaccessible depuis ton compte, c'est-à-dire J0 à
moitié.

**Ce qui est prêt.**

- `scripts/j0-launch.sh` : lancement complet. Contrôles GO/NO-GO, puis :
  clé admin temporaire, `SCRAPE_TARGETS` (les cinq moteurs avec recherche
  web), création de la marque, des 4 concurrents et des 10 questions par
  `POST /api/v1/brands`, retrait de la clé, worker, `caffeinate`,
  `cost-guard.sh --watch 60`, début de fenêtre dans `measurement.yaml`.
- `scripts/j0-first-run.sh` : contrôle du premier run, par moteur.
- `src/elmo-load.ts`, avec ses tests : corps de requête conforme au schéma
  d'Elmo. Le lancement refuse un moteur en trop, une cible sans recherche
  web ou un modèle absent de la grille de prix.

**Constats sur Elmo 0.7.7 qui ont guidé ces choix.**

- Une marque créée par l'API n'a pas de `enabledModels` (`null`) : Elmo
  interroge alors tous les moteurs de `SCRAPE_TARGETS`
  (`packages/lib/src/providers/runner.ts:17`). Aucun réglage de moteur
  n'est donc à faire dans l'interface, d'où le contrôle « cibles =
  moteurs du sujet ».
- La création par l'API ne fait aucun appel LLM : elle n'appelle ni
  l'analyse ni les suggestions (`apps/web/src/server/onboarding-core.ts`).
  L'onboarding Mistral (`mistral-large-latest`, codé en dur) ne sert qu'à
  l'assistant de l'interface et aux « Opportunités ». Son modèle réel ne
  sera donc pas observé pendant J0, sauf si quelqu'un utilise ces écrans.
- L'écran « Brand Onboarding » qui suit l'inscription lancerait
  l'assistant (avec une analyse Mistral) : `a-faire-au-retour.md` dit de
  n'y rien saisir.
- Les tags d'OIA passent tels quels : Elmo ne fait que les mettre en
  minuscules (`packages/lib/src/tag-utils.ts:89-101`).

**État laissé :** Postgres et web d'Elmo en marche, worker arrêté, base
vide, `elmo/.env` inchangé.

## Étape 3 · J0 dans l'écran Lovable

- **Exporteur** `src/vis-export.ts` + `scripts/vis-export.sh`. Il lit
  Elmo dans une session Postgres en lecture seule
  (`default_transaction_read_only=on`) : Postgres refuse toute écriture,
  ce que j'ai vérifié. Aucun rôle ni schéma d'Elmo modifié, aucun appel
  à un fournisseur d'IA. Il produit `visibility.json` avec les sept clés
  de `src/data/demo.ts` : `utilisateur`, `aDecider`, `sites`, `agents`,
  `depenses`, `onboarding`, `vueSite`.
  - Rien n'est inventé : ce qui n'est pas mesuré reste vide (`null`,
    « — », « Non connecté », listes vides).
  - La présence se calcule sur les seules réponses jugées par Jev.
  - La dépense est lue dans le journal de `cost-guard.sh`.
- **Tests** (`test/vis-export.test.ts`, 13) sur une exportation fictive
  ayant la forme exacte de la requête (`test/fixtures/elmo-export/`).
  L'un d'eux lit `demo.ts` sur la branche, sans la modifier, et compare
  clé par clé et type par type : **identique**.
- **Commande** `pnpm vis:j0-view` (`scripts/j0-view.sh`). Elle exporte,
  prépare un worktree en tête détachée **hors du dépôt**
  (`~/oia-visibility-data/prototype-worktree`), installe les dépendances
  une fois (sans scripts d'installation), copie `visibility.json` dans
  `public/data/`, sert l'écran sur **127.0.0.1:4317** et l'ouvre.
  Vérifié : l'écran répond, et `/data/visibility.json` aussi (HTTP 200).
  La branche est inchangée (`a9e7a1f`). Le worktree n'a aucun fichier
  non suivi, grâce à une exclusion locale, jamais commitée. Le
  `visibility.json` vient d'Elmo, dont la base est encore vide.
- **Données de client jamais commitées :** `.gitignore` ignore
  `prototypes/oia-prototype/public/data/` et `visibility.json`, et un
  test le vérifie.
- **Limite :** le prototype importe `src/data/demo.ts` en dur
  (`routes/index.tsx`, `nouveau-compte.tsx`, `sites/$slug.tsx`). Demande
  à Lovable : « charger `/data/visibility.json` au démarrage, à la place
  de `src/data/demo.ts`, avec la même structure ». Le script le
  rappellera tant que ce n'est pas fait.

Le serveur du prototype tourne encore. Pour l'arrêter :
`kill $(cat ~/oia-visibility-data/prototype-view.pid)`.

## Étape 4 · Suite

Pas de `infra/visibility/mandats/MANDAT-2026-11-07-v6.md` dans le dépôt.
Rien d'autre n'a été exécuté.

## Questions consignées (sans blocage)

1. **Veille du Mac.** Elle est réglée à 1 min ; `j0-launch.sh` lance
   `caffeinate -ims` pour la durée de J0. Le Mac doit rester sur secteur.
   Faut-il un réglage permanent (Réglages → Batterie) ?
2. **Rapport « Opportunités » d'Elmo pendant J0.** Je recommande de ne
   pas l'utiliser : appel Mistral non mesuré, modèle codé en dur. À
   confirmer.
3. **Lovable.** Faut-il aussi demander de remplacer les libellés codés en
   dur (`agents`, `connexions`) par ceux de `visibility.json` ? L'exporteur
   les fournit déjà.

## Fichiers

Sur `main` : `scripts/j0-launch.sh`, `scripts/j0-first-run.sh`,
`scripts/vis-export.sh`, `scripts/j0-view.sh`, `src/elmo-load.ts`,
`src/vis-export.ts`, leurs tests, `test/fixtures/elmo-export/`,
`reports/a-faire-au-retour.md`, ce rapport, `runbook-j0.md`,
`package.json` (`vis:j0-view`) et `.gitignore`. Rien n'a été modifié dans
`apps/web`, `knowledge/generated/solution-2026-08-14.md` ni sur la
branche `lovable/oia-visibility-prototype`.

Tests : 254 passent, typage propre.

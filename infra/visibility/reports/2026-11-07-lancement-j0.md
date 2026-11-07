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

Pas de `infra/visibility/mandats/MANDAT-2026-11-07-v6.md` dans le dépôt :
je n'ai donc rien exécuté. En poussant, j'ai constaté qu'une autre session
avait poussé sur `main` des commits qui citent ce mandat v6 (`818de4f`
Shyrka 1, `66a6e03` évaluation de Bifrost), ainsi que le mandat v7, bloc F
(`c6b4dab`, `apps/web`), et la roadmap 3.6 (`6722dbf`). Aucun fichier en
commun avec ce mandat. Mon commit a été rebasé par-dessus, sans conflit,
et les 254 tests passent après rebase. Je n'ai rien repris du v6.

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

## Lancement effectif et premier run (2026-11-07)

- Compte créé par Mickaël. La marque « OIA » que l'écran d'accueil avait
  créée a été supprimée de la base, après vérification qu'aucune ligne n'y
  était liée (Elmo 0.7.7 n'a pas de route de suppression). Copie de la
  ligne : `~/oia-visibility-data/j0/brand-oia-supprimee-2026-11-07.json`.
- `j0-launch.sh coach-gari` à 15:27 UTC : 4 concurrents et 10 questions
  chargés, worker démarré à 15:27:30 UTC, `caffeinate` et
  `cost-guard.sh --watch 60` actifs, clé admin retirée.
  `measurement.yaml` : j0 en `running`, début le 2026-11-07.

Premier passage, environ deux minutes après le démarrage :

| Moteur | Runs réussis | Version servie | Recherches par run | Coût selon la grille | Jev |
|---|---|---|---|---|---|
| chatgpt | 10/10 | `gpt-6-luna` | inconnu | 0,26 $ (majorant) | 10/10 |
| claude | 10/10 | `claude-sonnet-5-5` | 1 | 0,48 $ | 8/10 |
| gemini | 10/10 | `google/gemini-3-flash-preview` | 4,4 | 0,64 $ (facturé par OpenRouter) | 10/10 |
| mistral | 7/10 (en cours) | `mistral-large-4` | 5,7 | 1,36 $ (recherche au prix provisoire) | 2/7 |
| perplexity | 10/10 | `perplexity/sonar` | — | 0,15 $ (facturé) | 9/10 |

Aucun échec. Coût retenu du mois : **2,88 $** (grille ; estimation
d'Elmo : 0,44 $ ; solde OpenRouter : 0,79 $).

**Points à surveiller (rien changé pendant la fenêtre) :**

1. **ChatGPT : compteurs absents.** Elmo garde pour OpenAI une réponse
   reconstruite, sans `usage` ni éléments de recherche. La grille compte
   donc chaque run au majorant (0,026 $). Le coût réel se lit dans la
   console OpenAI.
2. **Gemini et Mistral cherchent beaucoup plus que prévu**, en moyenne
   4,4 et 5,7 recherches par réponse, contre 1 dans le budget. Gemini
   coûte environ 0,058 $ par réponse (montant facturé par OpenRouter),
   soit ≈ 2,9 $ sur la fenêtre. Mistral, au prix provisoire de 0,03 $
   par recherche, coûte ≈ 0,19 $ par réponse, soit ≈ 9,7 $ sur la
   fenêtre : **au-delà de la limite de 8 $**. Si ce prix est le bon,
   Mistral refusera les derniers appels vers le quatrième jour. Le vrai
   prix se lit dès maintenant dans la console Mistral (Usage).
3. **Projection de la fenêtre :** ≈ 3,4 $ par jour, soit ≈ 17 $ sur cinq
   jours, sous le plafond de 30 $. C'est plus que le budget typique
   (7,9 $), à cause des recherches.
4. **Claude :** Elmo a refait deux appels après `max_uses_exceeded`. La
   première tentative n'est pas comptée par la grille ; la limite de 12 $
   de l'espace Anthropic la couvre.
5. **Grille :** les plafonds de recherche du majorant (1 pour Gemini,
   3 pour Mistral) sont sous les valeurs observées. Ils ne servent
   qu'aux runs sans compteurs ou échoués. À relever si Mickaël le
   décide ; je n'ai rien modifié pendant la fenêtre.

Contrôle suivant : `./scripts/j0-first-run.sh coach-gari` à tout moment
(lecture seule).

## Perturbation du jour 1 : worker arrêté par erreur (15:28 → 17:20 UTC)

- **Ce qui s'est passé.** À 15:28:20 UTC, 50 s après le démarrage, le
  worker d'Elmo a reçu un arrêt normal (SIGTERM, code 0). Ce n'était ni
  un manque de mémoire, ni une décision de `cost-guard.sh`. Il est resté
  arrêté jusqu'à sa relance, à 17:20:16 UTC, sur décision de Mickaël.
- **Cause : mon code.** Dans `cost-guard.sh`, `stop_unreadable()`
  arrêtait le worker même à blanc (`OIA_VIS_COST_GUARD_DRYRUN`). Le test
  « modèle absent de la grille » de `test/cost-grid.test.ts` passe par
  ce chemin. Quand j'ai lancé la suite de tests juste après le
  démarrage, elle a arrêté le vrai worker.
- **Correctif : `bc7a230`.** À blanc, le script n'appelle plus jamais
  Docker. Un test place un faux `docker` en tête du PATH et échoue au
  moindre appel. Je l'ai vérifié en échec sur l'ancien code, puis vert
  avec le correctif.
- **Effet sur la mesure.** 47 runs sur 50 étaient enregistrés avant
  l'arrêt. Les 3 runs Mistral interrompus et les jugements de Jev ont
  été retardés, puis terminés dès la relance (premier run repris à
  17:20:25 UTC). Premier passage complet : 50 runs, 50 jugés, 0 échec.
  **Aucun jour manquant.** C'est consigné dans la note de la fenêtre
  j0 (`measurement.yaml`).

## Grille : pire cas relevé (décision de Mickaël)

Gemini passe de 1 à 8 recherches par run (observé : 4 à 6) ; Mistral de
3 à 40 (observé : jusqu'à 37, moyenne 9,4 sur les 10 premiers runs). Ce
réglage ne sert qu'aux runs sans compteurs ou échoués. La grille lit
aussi le nombre de recherches déclaré par OpenRouter (Gemini). Le montant
facturé par OpenRouter reste retenu quand il est plus élevé.

**Mistral cherche beaucoup.** Au prix provisoire de 0,03 $ par
recherche, ses runs vont de 0,10 à 1,10 $. Coût retenu du mois après le
premier passage : **3,46 $**. Si chaque jour ressemble au premier, la
fenêtre coûtera ≈ 17 $, et Mistral pourrait atteindre sa limite de 8 $
avant le cinquième jour (appels refusés, rien dépensé au-delà). Le vrai
prix d'une recherche Mistral se lit dans la console Mistral (Usage) :
c'est le chiffre à relever en premier.

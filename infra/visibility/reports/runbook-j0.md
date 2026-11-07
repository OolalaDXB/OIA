# Runbook J0 · OIA Visibility · Coach Gari

Mise à jour 2026-11-07. Lancement du premier pilote (`coach-gari`) sur
cinq moteurs API (trois directs, Gemini et Perplexity via OpenRouter),
plafonnés à 30 $/mois. Toutes les étapes sont faites par
Mickaël sur le Mac Studio ; aucune n'est exécutée par un agent Claude
Code. Durée estimée : 45 min pour poser les clés, 5 min de lancement, puis
cinq journées pendant lesquelles un contrôle quotidien suffit.

## 0 · Avant de poser une clé

Mise à jour 2026-11-07 (décisions de Mickaël, `FOURNISSEURS.md` § 0
quater) : API directes partout où Elmo les gère, Jev en direct chez
TypeSafe. Gemini et Perplexity passent par OpenRouter, seule voie dans
Elmo 0.7.7 (5 $ de crédit, clé plafonnée à 5 $ par mois). Grok : pas pour
J0, candidat pour une fenêtre ultérieure avec sa propre mesure de départ.

**Règle commune** : crédit prépayé, limite de dépense et recharge
automatique **coupée** chez chaque fournisseur. Sans cette précaution, le plafond logiciel de `cost-guard.sh` n'arrête rien
tant que l'estimation ou le solde reporté n'a pas rattrapé la dépense
réelle (et l'estimation d'Elmo sous-estime Claude Sonnet 5.5).

| Fournisseur | Clé | Crédit prépayé | Limite supplémentaire |
|---|---|---|---|
| OpenAI | `oia-visibility` | 5 $ | limite mensuelle du projet |
| Anthropic | `oia-visibility`, créée **dans l'espace de travail dédié** | 12 $ | limite de dépense de l'espace : 12 $ / mois |
| Mistral | `oia-visibility` (compte existant, séparée d'OIA Funding) | 8 $ | **limite recommandée : 8 $** |
| OpenRouter | `oia-visibility` | 5 $ | **clé plafonnée à 5 $ par mois** |
| TypeSafe (Jev) | `oia-visibility` | minimum proposé, au plus 3 $ | — |

Les limites par fournisseur sont des **plafonds indépendants**, pas un
budget à répartir : leur somme (33 $) peut dépasser 30 $. Chacune borne la
dépense d'un seul fournisseur, même si `cost-guard.sh` lit mal. Le plafond
de **30 $ s'applique à la dépense totale réelle du mois**, que surveille
`cost-guard.sh` (arrêt du worker au-delà). Si `cost-guard.sh` tombait en
panne, la dépense resterait bornée par la somme des limites (33 $).

Chaque limite couvre le pire cas J0 de son fournisseur : Claude ≈ 11 $
(nouvelle tentative complète sur chaque appel) sous 12 $, Mistral ≈ 6,55 $
(`mistral-large-4`, onboarding compris) sous 8 $.

**Le prix de la recherche web de Mistral n'est pas publié** (page de
tarifs : « facturé par appel », sans montant). La grille compte 0,03 $
par recherche, à titre provisoire ; **le vrai prix se lira sur la première
facture Mistral**, à reporter alors dans `src/cost-grid.ts`.

Cases à cocher avant de poser la première clé :

- [ ] OpenAI : recharge automatique coupée (Billing → Auto recharge).
- [ ] OpenAI : limite mensuelle posée sur le projet de la clé.
- [ ] Anthropic : espace de travail dédié `oia-visibility` créé.
- [ ] Anthropic : limite de dépense posée sur cet espace (12 $ / mois).
- [ ] Anthropic : clé créée dans cet espace, pas dans l'espace par défaut.
- [ ] Anthropic : recharge automatique coupée (Billing).
- [ ] Mistral : 8 $ de crédit, limite de dépense à 8 $, recharge automatique coupée, clé dédiée `oia-visibility`.
- [ ] TypeSafe : recharge automatique coupée (ou facturation sans carte enregistrée).
- [ ] OpenRouter : 5 $ de crédit, recharge automatique coupée.
- [ ] OpenRouter : clé `oia-visibility` plafonnée à 5 $ par mois (limite de crédit de la clé).
- [ ] Plafond total de 30 $ dans `.env` (`OIA_VIS_MONTHLY_CAP_USD=30`, alerte à 24 $), vérifié à l'étape 2.
- [ ] Clés Google (Gemini), Perplexity et xAI laissées dans Proton Pass : Elmo 0.7.7 ne les lit pas.

## 1 · Poser les clés sur le Mac

Les clés **ne sont jamais exportées dans le shell** — elles iraient dans
`ANTHROPIC_API_KEY`, où Claude Code les capterait. Seul le fichier
`infra/visibility/elmo/.env` les reçoit, et ce fichier est hors Git
(voir `SECRETS.md`).

```
cd ~/OIA/infra/visibility/elmo
cp -n .env.example .env               # ne jamais écraser un .env déjà posé
# Ouvrir .env dans un éditeur et compléter UNIQUEMENT :
#   OPENAI_API_KEY=...
#   ANTHROPIC_API_KEY=...         (clé de l'espace de travail dédié)
#   MISTRAL_API_KEY=...
#   TYPESAFE_API_KEY=...          (Jev en direct chez TypeSafe)
#   OPENROUTER_API_KEY=...        (clé plafonnée à 5 $ par mois)
# Les autres variables (ELMO_POSTGRES_PASSWORD, ELMO_ENCRYPTION_KEY,
# BETTER_AUTH_SECRET, DEPLOYMENT_ID) ont été générées une fois par
# scripts/init-env.sh et sauvegardées hors machine (SECRETS.md).
chmod 600 .env
```

**Secrets générés d'Elmo** (`ELMO_POSTGRES_PASSWORD`, `ELMO_ENCRYPTION_KEY`,
`BETTER_AUTH_SECRET`, `DEPLOYMENT_ID`) : conservés tels quels pour J0, par
décision de Mickaël (2026-11-07). Ils seront **régénérés au passage sur
serveur, en P3** (nouvelle installation, nouveau `.env`, sauvegarde hors
machine selon `SECRETS.md`).

Également dans `.env`, poser `SCRAPE_TARGETS` avec les cinq moteurs
(valeur de l'étape 5) **avant de démarrer l'interface** : sans lui, Elmo
affiche « Missing environment configuration : SCRAPE_TARGETS » sur toutes
ses pages, y compris l'inscription (constaté le 2026-11-07). Le verrou
contre les appels payants est alors **le worker arrêté** : il ne démarre
qu'à l'étape 6 (ou par `j0-launch.sh`), après le chargement de la marque
et la vérification du plafond. `j0-launch.sh` accepte un `SCRAPE_TARGETS`
déjà posé s'il est identique à ses cibles, et refuse sinon.

## 2 · Vérifier le plafond mensuel (`cost-guard.sh`) avant tout lancement

Sans démarrer le worker, faire un relevé à blanc pour vérifier que le
script lit bien l'environnement et le solde OpenRouter :

```
cd ~/OIA/infra/visibility
./scripts/cost-guard.sh
# Attendu : une ligne CSV dans ~/oia-visibility-data/cost-journal.csv,
# colonne action=none si le coût du mois < 24 $.
# alert : action=alert(monthly-80pct) > seuil d'alerte (24 $ par défaut).
# stop  : action=stop-worker(cap-reached) — le worker n'était pas démarré,
#         donc l'arrêt est un no-op, mais le journal trace la décision.
```

Si le script échoue sur la lecture OpenRouter, la colonne
`openrouter_cum_usd` vaut `n/a` : vérifier la ligne `OPENROUTER_API_KEY`.

La colonne `grid_usd` recalcule chaque run avec la grille de prix des
modèles retenus (`src/cost-grid.ts`). Si `action` vaut
`stop-worker(model-not-in-price-grid)`, un modèle de `SCRAPE_TARGETS` n'est
pas dans la grille : mettre la grille à jour avant de relancer. Le message
« Prix provisoire » sur `mistral-large-4` est attendu : les tokens sont au
prix officiel (0,70 $ / 2,10 $ par M), seule la recherche web est
provisoire (0,03 $) jusqu'à la première facture Mistral. TypeSafe et les factures réelles se relèvent dans les consoles
(`OIA_VIS_MANUAL_COST_USD`).

Un journal au format antérieur (sans `grid_usd`) est mis de côté sous
`cost-journal.<date>.old.csv` au premier relevé.

## 3 · Démarrer Elmo (web + Postgres + migrations), **worker arrêté**

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml up -d postgres db-migrate web
# worker VOLONTAIREMENT pas démarré.
# Vérifier :
docker compose ps
# postgres: healthy ; db-migrate: Exited (0) ; web: Up (port 1515) ;
# worker: pas listé (pas démarré).
```

Ouvrir http://localhost:1515 dans le navigateur. Créer le compte
administrateur Elmo. **Ne pas** encore saisir la marque Coach Gari.

**Point à vérifier au premier appel : le modèle de l'onboarding.** Elmo
0.7.7 lit seulement le fournisseur dans `ONBOARDING_LLM_TARGET`
(`packages/lib/src/onboarding/llm.ts:39-46`). Le modèle est codé en dur :
`mistral-large-latest` (`packages/lib/src/providers/registry/mistral-api.ts:17`,
commenté « Mistral Large 3 » dans le code). Aucun réglage ne le fixe à
`mistral-large-4` sans modifier Elmo. Cet alias n'apparaît plus dans la
documentation actuelle de Mistral. Au premier onboarding ou à la première
analyse « Opportunités » :
- si l'appel échoue (modèle inconnu), le noter et décider ensuite (aucun
  fork d'Elmo) ;
- s'il réussit, relever dans la console Mistral (Usage) le modèle
  réellement facturé et le consigner dans le journal de la fenêtre.
Ces appels ne passent pas par `prompt_runs` : la grille ne les compte
pas, la limite Mistral à 8 $ les couvre.

Mémoire Docker recommandée : 6 Go minimum alloués à Docker Desktop
(Elmo web + Postgres + migration + worker ≈ 3 Go en charge ; Crawlie
ajoute 1 Go). Docker Desktop → Settings → Resources → Memory.

## 4 · Charger la marque et le panel dans Elmo

**Lancement outillé (2026-11-07), qui remplace les étapes 4 à 6 ci-dessous.**
Après la création du compte (étape 3), et **sans rien saisir dans l'écran
« Brand Onboarding »** (il lancerait l'assistant d'Elmo et une analyse
Mistral non mesurée) :

```
cd ~/OIA/infra/visibility
./scripts/j0-launch.sh coach-gari --dry-run   # contrôles, « GO » attendu
./scripts/j0-launch.sh coach-gari             # charge la marque par l'API et démarre
./scripts/j0-first-run.sh coach-gari          # 10 à 15 min après : premier run par moteur
```

`j0-launch.sh` crée la marque, les concurrents et les questions actives
par `POST /api/v1/brands` (clé admin temporaire, retirée aussitôt), pose
`SCRAPE_TARGETS`, démarre le worker, `caffeinate` et `cost-guard.sh --watch
60`, et note le début de fenêtre dans `measurement.yaml`. La marque n'a
pas de `enabledModels` : Elmo interroge alors tous les moteurs de
`SCRAPE_TARGETS`, que le script vérifie identiques à ceux du sujet.
Détail pas à pas : `reports/a-faire-au-retour.md`.

La procédure manuelle ci-dessous reste valable en secours.

Le brief est généré depuis les fichiers du sujet :

```
cd ~/OIA/infra/visibility
pnpm --filter @oia/visibility-infra subjects elmo-brief coach-gari > /tmp/brief-coach-gari.json
```

Il contient : la marque (slug, nom, site, alias, domaines additionnels),
les cinq moteurs à activer (`chatgpt, claude, mistral, gemini,
perplexity`), les concurrents (Playtomic, Ultimate Performance, Future,
Caliber), et les dix questions actives (annexe B du plan SEO/AEO).

Pour simuler l'ordre des appels d'API qu'Elmo recevrait :

```
pnpm tsx scripts/load-panel.ts coach-gari
# Imprime : POST /brands, POST /competitors × N, POST /prompts × 10
# AUCUN appel réseau. En P1, la saisie dans Elmo reste manuelle (interface
# web), aucune écriture automatique depuis OIA.
```

Saisir ensuite dans Elmo (interface web) :

1. **Brand → Create** : coller `brand.slug`, `brand.name`, `brand.website`.
   Dans « Additional domains » : `coachgari.com`. Dans « Aliases » : les
   trois alias du brief.
2. **Brand → LLM settings** : activer `chatgpt`, `claude`, `mistral`,
   `gemini`, `perplexity`. Pas `grok` (pas pour J0). **Décocher** tout autre moteur (pas de
   fallback par défaut d'Elmo).
3. **Brand → Competitors** : ajouter les quatre concurrents ; cocher
   « proposed » (passera en « confirmed » quand Mickaël aura tranché).
4. **Brand → Prompts** : copier-coller les dix questions `status: active`
   du brief, dans l'ordre. Dans « Tags » (champ libre), coller la liste
   de tags du brief (`oia:en-01@v2`, `panel:v2`, `lang:en`,
   `family:unbranded`) — c'est la traçabilité qui relie les réponses
   d'Elmo au panel OIA.

Faire une **capture d'écran** de la page « Prompts » (10 questions
cochées) à sauvegarder dans `~/oia-visibility-data/j0/elmo-prompts.png`.

## 5 · Modèles (décidés le 2026-11-07)

Cinq moteurs : `gpt-6-luna`, `claude-sonnet-5-5` (identifiant vérifié sur
platform.claude.com), `mistral-large-4` (remplaçant désigné par Mistral de
Medium 3.5, déprécié au 2026-10-31), et via OpenRouter
`google/gemini-3-flash-preview` et `perplexity/sonar`. Poser dans `.env` :

```
SCRAPE_TARGETS=chatgpt:openai-api:gpt-6-luna:online,claude:anthropic-api:claude-sonnet-5-5:online,mistral:mistral-api:mistral-large-4:online,gemini:openrouter:google/gemini-3-flash-preview:online,perplexity:openrouter:perplexity/sonar:online
```

Chaque modèle doit figurer dans la grille de prix de `cost-guard.sh`
(`src/cost-grid.ts`). Grok n'est pas ajouté : il fera l'objet d'une
fenêtre ultérieure, avec sa propre mesure de départ.

Après le premier run Mistral, relever `prompt_runs.version` (la version
que Mistral déclare avoir servie) et la consigner dans le journal de la
fenêtre. Si elle n'est pas reconnue par la grille, `cost-guard.sh` arrête
le worker : ajouter cette version à la grille avant de relancer.

## 6 · Démarrer le worker

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml up -d worker
docker compose logs -f worker
# Attendu : connexion à Postgres, enregistrement des cinq moteurs,
# premier run lancé à l'heure UTC qui suit le démarrage.
```

Dès le premier run reçu (environ 2 à 10 min), re-lancer `cost-guard.sh`
pour inscrire le premier relevé dans le journal :

```
cd ~/OIA/infra/visibility
./scripts/cost-guard.sh --watch 60   # relevé toutes les 60 s pendant J0
```

Laisser tourner dans un `screen` ou un onglet dédié. Le script arrête le
worker si le plafond mensuel est atteint, ou si l'estimation devient
illisible.

## 7 · Suivi quotidien (cinq jours)

Chaque matin, Mickaël exécute :

```
cd ~/OIA/infra/visibility
./scripts/window-day.sh coach-gari     # résumé du jour (jours manquants,
                                       # coût retenu, état du gel, nombre
                                       # de réponses collectées)
```

Vérifier :

- aucune journée manquante (sinon, Elmo le marque dans
  `prompt_runs.missed_at`) ;
- la ligne `cost-journal.csv` du jour est bien < 24 $ cumulés sur le mois ;
- le gel J0 (`subjects freezes coach-gari`) est toujours en vigueur et
  aucune publication publique du site n'a eu lieu (`CoachGari` repo,
  branche `main`, dernier commit avant la fenêtre : hash à noter à J-0).

Clore chaque journée dans le registre (`infra/visibility/reports/` ou
cahier interne — à définir dans le mandat suivant).

## 8 · Arrêt au cinquième jour

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml stop worker
# Surtout PAS down (qui supprime les volumes). Postgres reste chaud pour
# l'export du rapport.
```

Lancer le rapport :

```
cd ~/OIA/infra/visibility
# (procédure E6 / F5 à finaliser dans un mandat ultérieur)
```

Mettre à jour `subjects/coach-gari/measurement.yaml` :

```
windows:
  - id: j0
    status: done
    start: YYYY-MM-DD        # jour du premier run
    end:   YYYY-MM-DD        # cinquième jour (inclus)
```

Et lever le gel implicitement (le gel est automatiquement « levé »
quand la fenêtre passe à `done`, voir `src/load.ts` → `activeFreezes`).

## 9 · Après J0 : préparer la suite

- Export du rapport (statistiques, exactitude des faits, revue croisée)
  et archivage dans `infra/visibility/subjects/coach-gari/reports/j0/`.
- Relevé manuel des coûts réels dans chaque console (OpenAI, Anthropic,
  Mistral, TypeSafe), à reporter dans la colonne `manual_usd` du journal
  (`OIA_VIS_MANUAL_COST_USD`), pour que le plafond logiciel soit lu sur
  des chiffres facturés et non seulement sur l'estimation d'Elmo.
- Décision Mickaël : mesure suivante en M+1, ou fenêtre de contrôle plus
  courte en M+0,5 (hors scénario roadmap).

## Rappels sécurité qui ont déjà sauvé le projet

- **Ne jamais `export ANTHROPIC_API_KEY=...`** dans le shell : Claude
  Code (l'outil d'édition) l'absorbe et des runs non mesurés partent.
- **Ne jamais `git add` le fichier `.env`** : il est dans `.gitignore`,
  mais un `git add -A` forçant peut contourner.
- **Ne pas faire `docker compose down -v`** à la fin : perte du Postgres
  (y compris ses clés chiffrées).
- **Ne pas démarrer deux workers en parallèle** (double Elmo sur le
  Mac) : double coût sans double mesure.

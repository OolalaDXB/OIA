# Fournisseurs : moteurs mesurés, traitements LLM, flux hors d'Europe

État au 5 novembre 2026, vérifié dans le code des versions épinglées (Elmo
0.7.7, CrawlSEO 0.3.6, Crawlie 0.5.3) et dans `packages/providers` d'OIA.

## 0. Décision du 2026-11-08 : configuration payante plafonnée

Annule la bascule zéro coût du 2026-11-06. Les cinq moteurs mesurés
reviennent en mode API, dans la limite d'un plafond mensuel global de
**30 $ par mois UTC**, avec une alerte à 24 $ (80 %). `cost-guard.sh`
bascule à un plafond mensuel ; arrêt immédiat du worker Elmo si le plafond
est atteint ou si le coût du mois devient illisible. Les comptes et les
clés sont à ouvrir par Mickaël (hors nuit). La saisie manuelle (`subjects
capture-template` / `capture-check`) reste disponible, pour les moteurs non
branchés en API ou en complément.

### Plafond logiciel et plafond réel

`cost-guard.sh` est un **contrôle logiciel** et non une garantie.

- Il lit l'estimation d'Elmo (`usage_events.estimated_cost_usd`), qui est
  une estimation et non une facture.
- Il recalcule le coût de chaque run avec la grille de prix des modèles
  retenus (`src/cost-grid.ts`, § 0 quater), à partir des compteurs de
  tokens et de recherches enregistrés par Elmo. Toujours pas une facture.
- Il lit le coût réel OpenRouter (cumul `usage` via `/api/v1/key`). OpenAI,
  Anthropic et Mistral ne sont **pas** interrogés : leur coût réel doit
  être reporté à la main dans la colonne `manual_usd` du journal
  (`OIA_VIS_MANUAL_COST_USD`).
- Le script s'arrête après lecture d'une dépense déjà engagée ; il ne
  refuse rien par avance.
- Il échoue en sécurité (worker arrêté) si le coût du mois est illisible.

**Le vrai plafond opposable** est double : crédits prépayés **et** recharge
automatique désactivée chez chaque fournisseur (OpenAI, Anthropic, Mistral,
OpenRouter), plus une réserve de budget avant chaque lot de mesure. Sans
cette double précaution, un dépassement peut passer sous le radar du
script le temps que l'estimation ou l'API de solde se mette à jour.

## 0 quater. Décisions du 2026-11-07 : API directes, OpenRouter pour Gemini et Perplexity, J0 sur cinq moteurs

Remplace les identifiants et le budget du § 0 ter pour la fenêtre J0 du
premier pilote. Le tableau de compatibilité (fournisseur et modèle, fichier
et ligne d'Elmo 0.7.7) est dans `reports/2026-11-07-decisions-mickael.md`.

**Règle** : API directe partout où Elmo la gère ; OpenRouter seulement pour
les moteurs qu'Elmo n'appelle que par lui (retenu par Mickaël : 5 $ de
crédit, clé plafonnée à 5 $ par mois) ; aucun adaptateur maison avant P3.

| Moteur | Accès dans Elmo 0.7.7 | Modèle | Statut J0 |
|---|---|---|---|
| chatgpt | OpenAI direct | `gpt-6-luna` | retenu |
| claude | Anthropic direct | `claude-sonnet-5-5` (vérifié sur platform.claude.com : 2 $ / 10 $ par M, recherche web acceptée) | retenu |
| mistral | Mistral direct | `mistral-large-4` (décision 2026-11-07 ; 0,70 $ / 2,10 $ par M, fiche docs.mistral.ai/models/mistral-large-4-0 ; recherche web non tarifée) | retenu |
| gemini | OpenRouter seulement | `google/gemini-3-flash-preview` (confirmé par Mickaël ; 0,50 $ / 3 $ par M + 0,014 $ par recherche). Le slug `google/gemini-3-flash` cité au § 0 ter n'existe pas (404). | retenu |
| perplexity | OpenRouter seulement | `perplexity/sonar` (1 $ / 1 $ par M + 0,005 $ par recherche) | retenu |
| grok | OpenRouter seulement | `x-ai/grok-4.5` (seul slug Grok testé par Elmo) | **pas pour J0** : candidat pour une fenêtre ultérieure, avec sa propre mesure de départ |
| Jev | TypeSafe direct (`TYPESAFE_API_KEY`) | `jev-1.13.0`, épinglé par Elmo | retenu |

Les clés Google (Gemini), Perplexity et xAI créées par Mickaël ne sont lues
par aucun fournisseur d'Elmo 0.7.7 : elles restent dans Proton Pass.

**Mistral : `mistral-large-4` retenu le 2026-11-07** (option A). Contexte : au
2026-11-07, la page de Mistral Medium 3.5 sur docs.mistral.ai l'indique
déprécié au 2026-10-31, avec Mistral Large 4 pour remplaçant, et la page
de tarifs ne publie plus de prix pour Medium ni pour l'outil `web_search`.
Ce que sert l'alias `mistral-medium-latest` n'est pas documenté ; seul le
premier appel le dira (Elmo enregistre la version servie dans
`prompt_runs.version`). Large 4 est le remplaçant désigné par Mistral. La
grille de `cost-guard.sh` le compte à son prix officiel (0,70 $ / 2,10 $
par M) et à 0,03 $ par recherche, prix provisoire signalé à chaque relevé :
le vrai prix de la recherche se lira sur la première facture. Le modèle de
l'onboarding reste codé en dur dans Elmo (`mistral-large-latest`), à
vérifier au premier appel (runbook, étape 3).

### Grille de prix de `cost-guard.sh`

`src/cost-grid.ts` recalcule le coût de chaque run du mois à partir des
compteurs de la réponse brute (`prompt_runs.raw_output`) et des prix
officiels ci-dessus. `cost-guard.sh` retient le maximum entre cette grille,
l'estimation d'Elmo, le solde OpenRouter et le relevé manuel. Un modèle
absent de la grille arrête le worker (`stop-worker(model-not-in-price-grid)`) :
changer de modèle impose de mettre la grille à jour d'abord. Un run sans
compteurs, ou échoué, est compté au majorant (20 000 tokens d'entrée,
8 000 de sortie, recherches au plafond d'Elmo). Limite connue : quand Elmo
relance un appel Anthropic après une erreur de recherche, seule la seconde
réponse est gardée ; la première n'est pas dans la grille (la limite de
dépense de l'espace de travail Anthropic la couvre).

### Budget J0 du premier pilote (10 questions × 5 moteurs × 5 jours)

`RUNS_PER_PROMPT=1`, `DEFAULT_DELAY_HOURS=24` : 50 appels par moteur, 250
au total. Typique : 10 k tokens d'entrée (question + résultats de recherche
facturés comme entrée), 1,5 k de sortie (2,5 k pour Claude, dont la
réflexion adaptative de Sonnet 5.5), une recherche par appel (deux chez
OpenAI). Pire cas : majorant de la grille (20 k / 8 k, recherches au
plafond) ; pour Claude, nouvelle tentative complète en plus.

| Poste | Prix (source, 2026-11-07) | Typique / appel | Pire cas / appel | Fenêtre typique | Fenêtre pire cas |
|---|---|---|---|---|---|
| chatgpt `gpt-6-luna` | 0,10 / 0,50 $ par M ; recherche 10 $ / 1 000 (developers.openai.com) | 0,022 $ | 0,026 $ | 1,10 $ | 1,30 $ |
| claude `claude-sonnet-5-5` | 2 / 10 $ par M ; recherche 10 $ / 1 000 (platform.claude.com) | 0,055 $ | 0,22 $ | 2,75 $ | 11,00 $ |
| mistral `mistral-large-4` | 0,70 / 2,10 $ par M (docs.mistral.ai) ; recherche 0,03 $ provisoire | 0,040 $ | 0,121 $ | 2,00 $ | 6,05 $ |
| gemini `google/gemini-3-flash-preview` | 0,50 / 3 $ par M + 0,014 $ / recherche (openrouter.ai) | 0,024 $ | 0,048 $ | 1,20 $ | 2,40 $ |
| perplexity `perplexity/sonar` | 1 / 1 $ par M + 0,005 $ / recherche (openrouter.ai) | 0,010 $ | 0,033 $ | 0,50 $ | 1,65 $ |
| Jev (≈ 250 réponses à juger) | 0,15 à 0,35 $ / 1 000 (§ 0 ter) | — | — | < 0,10 $ | < 0,10 $ |
| Onboarding Mistral (une fois) | `mistral-large-latest` | — | — | < 0,20 $ | < 0,50 $ |
| **Total J0, cinq moteurs** | | | | **≈ 7,9 $** | **≈ 23,0 $** |

Recherches web comprises : au plus 100 chez OpenAI (1 $), 100 chez
Anthropic avec les nouvelles tentatives (1 $), 150 chez Mistral (4,50 $,
prix provisoire), 50 chez Google via OpenRouter (0,70 $), 50 chez
Perplexity (0,25 $). Sous le plafond de 30 $, pire cas compris.

Pour mémoire, Grok (`x-ai/grok-4.5`, 2 / 6 $ par M + 0,005 $ / recherche) :
≈ 1,70 $ par fenêtre de 50 appels, 3,65 $ au pire, à budgéter avec sa
propre mesure de départ.

### Protection par fournisseur (plafond opposable)

La somme des crédits prépayés ne dépasse pas le plafond de 30 $ : même si
`cost-guard.sh` lit mal, aucun fournisseur ne peut dépenser plus que son
crédit.

| Fournisseur | Crédit prépayé | Recharge automatique | Limite supplémentaire | Besoin J0 (pire cas) |
|---|---|---|---|---|
| OpenAI | 5 $ | coupée | limite mensuelle du projet `oia-visibility` | 1,30 $ |
| Anthropic | 10 $ | coupée | **espace de travail dédié `oia-visibility`, limite de dépense 10 $ / mois**, clé créée dans cet espace | 11,00 $ |
| Mistral | 8 $ | coupée | **limite de dépense 8 $**, clé dédiée `oia-visibility` | 6,55 $ (recherche au prix provisoire) |
| OpenRouter | 5 $ | coupée | **clé plafonnée à 5 $ par mois** | 4,05 $ |
| TypeSafe (Jev) | minimum proposé, au plus 2 $ | coupée | — | < 0,10 $ |
| **Total immobilisé** | **≤ 30 $** | | | |

Mistral à 8 $ (décision 2026-11-07) couvre son pire cas. Pour rester sous
les 30 $, Anthropic descend à 10 $ : son pire cas (≈ 11 $, nouvelle
tentative complète sur chaque appel) dépasserait légèrement la limite, et
les derniers appels seraient refusés, sans dépense au-delà.

## 0 ter. Modèles mesurés, proches des applications grand public (A6, mis à jour 2026-11-07)

> **Remplacé pour J0 par le § 0 quater** (décision du 2026-11-07). Conservé pour l'historique des vérifications et des prix.

Vérification documentaire des identifiants retenus, à partir des pages
officielles consultées le 2026-11-07. Les cinq moteurs sont confirmés.
**Aucun appel réel** n'a été fait depuis OIA : seul un appel « ping »
depuis le compte Mickaël permettra de clore la vérification une fois les
clés posées.

### Identifiants retenus pour J0 (pilote anglophone)

| Moteur (nom Elmo) | Plus proche de | Identifiant API | Recherche web | Statut documentaire |
|---|---|---|---|---|
| chatgpt (OpenAI) | ChatGPT Free (Luna) | `gpt-6-luna` (Responses API, outil `web_search`) | Oui | **Vérifié** sur openai.com/index/introducing-gpt-6-sol-and-luna (sortie 2026-09-22) et developers.openai.com/api/docs/pricing : 0,10 $ / 0,50 $ par M de tokens (entrée / sortie). |
| claude (Anthropic) | — (modèle de la couche API, pas celui de l'app) | `claude-haiku-5-5` (Messages, outil `web_search`) | Oui | **Vérifié** sur platform.claude.com/docs/en/models/haiku-5-5/overview (sortie 2026-10-07) : 0,10 $ / 0,50 $ par M de tokens jusqu'à 100 k. |
| gemini (via OpenRouter) | — (identifiant en voie de dépréciation) | `google/gemini-2.5-flash` avec `:online` | Oui | **Déprécié par Google le 2026-11-02**, cinq jours avant J0. Décision à prendre (voir « Décision en attente » plus bas). |
| perplexity (via OpenRouter) | Perplexity Sonar | `perplexity/sonar` avec `:online` | Oui (Sonar) | **Vérifié** sur openrouter.ai/perplexity/sonar : 1,00 $ / 1,00 $ par M de tokens + 5,00 $ / 1 000 recherches web. |
| mistral (Mistral direct) | Le Chat (modèle de base) | `mistral-medium-latest` avec `:online` (Conversations API, outil `web_search`) | Oui | **Vérifié** sur docs.mistral.ai/studio/agents/agent-tools/websearch : l'API Conversations accepte `tools: [{type:"web_search"}]`. Alias `-latest` qui évolue ; la version servie est stockée par Elmo (`prompt_runs.version`). |

Jev (juge des mentions) : `typesafe/jev-1.13` via OpenRouter. **Remplacé le
2026-11-07 par TypeSafe en direct** (§ 0 quater). Le slug `typesafe/jev-1.13`
n'apparaît plus dans la liste publique d'OpenRouter (seul `typesafe/jev-router`
y figure, vérifié le 2026-11-07).

### Modèles alternatifs proches de l'application grand public (décision Mickaël)

L'application Claude.ai sert Sonnet 4.6 aux utilisateurs Pro et Opus 4.7
aux utilisateurs Max ; Haiku 5.5 n'y est jamais exposé seul. L'application
Gemini sert maintenant Gemini 3 Flash (Gemini 2.5 Flash déprécié le
2026-11-02). Les deux alternatives « plus proches de l'app » coûtent
nettement plus cher :

| Moteur | Alternative plus proche de l'app grand public | Coût entrée / sortie (M tokens) | Facteur vs. retenu | Source |
|---|---|---|---|---|
| claude | `claude-sonnet-4-6` (par défaut Free + Pro de Claude.ai depuis 2026-02) | 3,00 $ / 15,00 $ | **×30** en entrée, **×30** en sortie | Pages anthropic.com/news/claude-sonnet-4-6 et platform.claude.com. |
| claude | `claude-opus-4-7` (plan Max de Claude.ai, modèle « phare » depuis 2026-04) | 5,00 $ / 25,00 $ | **×50** en entrée, **×50** en sortie | Page platform.claude.com, confirmé par deux agrégateurs. |
| gemini | `google/gemini-3-flash` sur OpenRouter (défaut app Gemini depuis déc. 2025) | 0,50 $ / 3,00 $ | **×50** en entrée, environ **×90** en sortie par rapport à 2.5 Flash | Pages openrouter.ai/google/gemini-3-flash et blog Google. |

Ces trois alternatives multiplient le coût par appel entre 30 et 90. Avec
le plafond mensuel de 30 $ et une fenêtre J0 = 250 appels, elles restent
toutes finançables ; au-delà, elles sortent du plafond. **Décision à
prendre par Mickaël** (voir section « Décisions en attente »).

### Coûts estimés face au plafond mensuel de 30 $

Sources des prix : pages officielles citées ci-dessus. Les nombres sont
donnés en USD, arrondis. « Par appel » = prompt + réponse, recherche web
comprise quand facturée séparément.

| Moteur | Coût unitaire estimé | Source |
|---|---|---|
| chatgpt (`gpt-6-luna`) | 0,003 à 0,006 $ | 0,10 + 0,50 $/M × ≈ 1,5 k entrée + 1 k sortie + recherche |
| claude (`claude-haiku-5-5`) | 0,003 à 0,006 $ | mêmes tarifs qu'OpenAI Luna, outil `web_search` inclus |
| gemini (via OpenRouter, 2.5 Flash) | 0,005 à 0,015 $ | 0,15 / 0,60 $/M + recherche Google native |
| perplexity (`sonar` + online) | ≈ 0,010 $ | 1,00 $/M × 2 k tokens + 0,005 $ recherche |
| mistral (`mistral-medium-latest` + web_search) | 0,015 à 0,030 $ | tarifs Mistral medium + outil web_search |
| Jev (par 1 000 réponses analysées) | 0,15 à 0,35 $ | inchangé |

**Volumétrie du pilote anglophone (J0 = 10 questions × 5 moteurs × 5 jours)** :

| Scénario | Questions × moteurs × jours | Appels fournisseurs | Coût estimé fenêtre J0 | Plafond 30 $ compatible ? |
|---|---|---|---|---|
| **Pilote anglophone J0** (retenu, modèles ci-dessus) | 10 × 5 × 5 = **250** | 250 appels moteurs + ≈ 250 passages Jev | **1,0 à 2,0 $ / fenêtre** (10 moteurs × 5 j × 0,04 $ médian) | oui, marge ≈ 28 $ |
| Variante A : Claude basculé sur Sonnet 4.6 | 250 | — | **5 à 7 $ / fenêtre** | oui |
| Variante B : Claude Opus 4.7 **et** Gemini 3 Flash | 250 | — | **10 à 15 $ / fenêtre** | oui, marge ≈ 15 $ |
| Deux pilotes J0 enchaînés le même mois (anglophone 10×5×5 + bilingue 20×5×5) | 250 + 500 = 750 | — | **4 à 8 $ / mois** avec les modèles retenus | oui, large marge |
| Mesure quotidienne permanente (hors scénario) | — | — | 30 à 60 $ / mois | **non** — le plafond 30 $ arrêterait le worker après ≈ 15 à 20 jours |

Conclusion : **une fenêtre de 5 jours tient très largement dans le plafond
30 $**, même en basculant Claude et Gemini sur leurs modèles grand public.
Les crédits prépayés à placer chez chaque fournisseur avant la première
fenêtre : 5 $ minimum chez OpenAI, Anthropic, Mistral, OpenRouter, soit
≈ 20 $ immobilisés en avance (Jev consomme du crédit OpenRouter, pas de
compte supplémentaire).

### Décisions en attente avant J0 réel

1. **Gemini : `gemini-2.5-flash` déprécié le 2026-11-02**. Deux options :
   - garder `google/gemini-2.5-flash:online` tant qu'OpenRouter sert encore
     ce routage (réponses encore comparables aux mesures précédentes, mais
     indisponibilité imminente) ;
   - basculer sur `google/gemini-3-flash:online` dès J0 (plus proche de ce
     que voit un utilisateur de l'app Gemini, surcoût estimé 1 à 3 $ sur la
     fenêtre).
   Option recommandée : **`gemini-3-flash` dès J0**, alignée avec la
   doctrine « au plus proche de l'app grand public » ; à acter par Mickaël.
2. **Claude : rester sur Haiku 5.5 ou basculer sur Sonnet 4.6 / Opus 4.7 ?**
   Rester sur Haiku = coût minimal mais aucun utilisateur Claude.ai ne reçoit
   Haiku. Sonnet 4.6 = ce que voit un utilisateur Pro. Surcoût sur J0 :
   ≈ 5 $ pour Sonnet, ≈ 9 $ pour Opus (toujours dans le plafond).
3. **Clé Mistral** : à ouvrir par Mickaël dans son compte Mistral existant,
   idéalement une clé dédiée nommée `oia-visibility` pour que la dépense
   d'OIA Visibility ne se confonde pas avec celle d'OIA Funding. La clé est
   collée dans `infra/visibility/elmo/.env` (hors Git).
4. **Recharge automatique désactivée** partout (OpenAI, Anthropic, Mistral,
   OpenRouter) : à confirmer avant de poser la première clé.

## 0 bis. Historique : la configuration à zéro coût (2026-11-06, annulée le 2026-11-08)

Aucune dépense, aucune carte bancaire, aucun abonnement. Elle a remplacé la
configuration des sections 1 et 4 pendant deux jours. Ces sections
redeviennent la référence. Le détail des vérifications est dans
`reports/2026-11-05-zero-cout.md`.

| Moteur | Collecte | Recherche web | Coût |
|---|---|---|---|
| Gemini | Elmo, via OpenRouter (compte gratuit, clé Google AI Studio en BYOK) | Oui si le test d'un appel le confirme gratuit | 0 € attendu, vérifié par `scripts/zero-cost-check.sh` |
| Mistral | Elmo, API Mistral (offre gratuite), panels en français | **Non** (facturée par appel) | 0 € |
| ChatGPT, Claude, Perplexity | **Saisie manuelle** depuis les applications gratuites (`subjects capture-template` / `capture-check`) | Selon l'application | 0 € |
| Jev | `TYPESAFE_API_KEY=stub`, juge local intégré à Elmo | — | 0 € ; sentiment et position non exploitables |

Flux hors d'Europe dans cette configuration : Gemini (OpenRouter puis Google,
États-Unis ; les données de l'offre gratuite peuvent servir à Google) et les
applications grand public consultées à la main. Jev ne sort plus du Mac, et
OpenAI, Anthropic et Perplexity ne reçoivent plus rien par API.

## 1. Moteurs mesurés par Elmo (mode API uniquement)

| Moteur (modèle Elmo) | Accès | Cible `SCRAPE_TARGETS` | Recherche web | URL citées extraites |
|---|---|---|---|---|
| chatgpt | OpenAI en direct | `chatgpt:openai-api:gpt-6-luna:online` | Oui (outil `web_search`) | Oui |
| claude | Anthropic en direct | `claude:anthropic-api:claude-sonnet-5-5:online` | Oui (outil `web_search`) | Oui |
| gemini | via OpenRouter | `gemini:openrouter:google/gemini-3-flash-preview:online` | Oui (recherche native Google) | Oui (`url_citation`) |
| perplexity | via OpenRouter | `perplexity:openrouter:perplexity/sonar:online` | Oui (Sonar) | Oui |
| **mistral** | **Mistral en direct** | `mistral:mistral-api:mistral-large-4:online` | **Oui**, voir ci-dessous | Oui (`tool_reference`) |

### Mistral (Le Chat)
- **L'API permet la recherche web.** Avec `:online`, Elmo appelle l'API
  Conversations de Mistral (`POST /v1/conversations`) avec l'outil intégré
  `tools: [{type: "web_search"}]`. Le modèle décide lui-même de chercher. Elmo
  relève les requêtes lancées (`tool.execution` / `web_search`) et les URL
  citées (morceaux `tool_reference`). Sans `:online`, Elmo passe par
  `/v1/chat/completions`, sans recherche ni citations.
- **Réserves** :
  - l'API Conversations est marquée **bêta** par Mistral : son format peut
    changer, et une mise à jour d'Elmo peut être nécessaire ;
  - aucun réglage ne limite le nombre de recherches par appel, seul le plafond
    de tokens borne le coût ;
  - **l'API n'est pas Le Chat.** L'application ajoute sa mémoire, sa
    localisation et ses propres choix de modèle et de recherche. On mesure
    `mistral-large-4` avec recherche, ce qui est une approximation de
    Le Chat (même limite que pour les autres moteurs) ;
  - la version exacte servie (identifiant épinglé `mistral-large-4` depuis le
    2026-11-07, plus d'alias `-latest`) est stockée
    par Elmo (`prompt_runs.version`), et un changement rend une comparaison
    fragile.
- **Réservé aux panels en français.** Elmo 0.7.7 choisit les moteurs **par
  marque** (`brands.enabled_models`), pas par question. Chaque sujet déclare
  ses moteurs et leurs langues dans `measurement.yaml` (`engines`) :
  - sujet entièrement anglophone : Mistral n'est pas activé sur sa marque ;
  - sujet bilingue : Mistral est activé sur la marque et répond donc aussi aux
    questions en anglais (une dizaine d'appels de plus par jour). Ces réponses
    sont conservées mais **exclues des rapports** (`reportLanguages` dans
    `subjects elmo-brief <id>`). La seule autre option serait de couper le
    sujet en deux marques Elmo, ce qui casserait la part de voix par sujet.
- Coût : Elmo estime environ 0,005 $ par appel Mistral (`usage_events`). Le
  coût réel se relève dans la console Mistral (non lu par `cost-guard.sh`).

## 2. Traitements LLM de la couche OIA Visibility

**Règle : tout traitement par LLM de la couche OIA Visibility (extraction de
faits, classification, recommandations) passe par `packages/providers`,
adaptateur Mistral. Aucun nouveau fournisseur, aucun SDK supplémentaire.**

Ce que l'interface fournit déjà (`LLMProvider.extract<T>`) :
- une sortie structurée et validée par un schéma Zod, avec une nouvelle
  tentative si le JSON est invalide ;
- côté Mistral : JSON natif (`response_format: json_object`), température 0,
  budget d'appels par processus (`maxCalls`, l'appel est refusé plutôt que
  facturé), reprise sur 429 et 5xx, détection des sorties tronquées, accès au
  texte brut (`onRawResponse`) et au compte de tokens (`usage()`) ;
- des métadonnées par appel : fournisseur, modèle, empreinte du prompt, tokens.
  Elles alimentent la provenance de chaque extraction, qui reste « extraite »
  et n'est jamais présentée comme un fait.

Points à traiter quand la couche OIA sera écrite (P3, après validation des
livrables avant code) :
1. **Instancier Mistral explicitement** (`createMistralProvider`, comme
   `apps/workers/src/analyse.ts`), et non `createProviderFromEnv`. Le
   `.env.example` racine indique `LLM_PROVIDER="anthropic"` et
   `LLM_MODEL="claude-sonnet-5"`, alors que le code met Mistral par défaut :
   une copie telle quelle de ce fichier enverrait les traitements chez
   Anthropic (États-Unis). Ce fichier relève d'OIA Funding V0 (en pause) et
   n'est pas modifié ici.
2. **`costUsd` n'est pas rempli** par l'adaptateur Mistral (tokens seulement).
   Le coût se calculera dans la couche OIA à partir des tokens et d'une table
   de prix datée, sans toucher au fournisseur.
3. L'adaptateur n'utilise pas la recherche web, et la couche OIA n'en a pas
   besoin : elle traite des réponses déjà collectées.

## 3. Jev peut-il utiliser un modèle Mistral via OpenRouter ? Non.

- Jev n'est pas un réglage de modèle : c'est **le modèle propre de TypeSafe**.
  Elmo l'épingle en dur (`apps/worker/src/mention-judge/jev.ts`) :
  `jev-1.13.0` chez TypeSafe (`api.typesafe.ai/v1/systemone`) ou
  `typesafe/jev-1.13` via OpenRouter (`openrouter.ai/api/v1/systemone`). C'est
  un point d'accès dédié, pas l'API de chat. OpenRouter ne fait que relayer
  vers TypeSafe ; aucun modèle Mistral ne peut répondre à cet appel.
- Elmo ne prévoit aucune variable pour changer de juge. Le remplacer
  demanderait un fork, que les règles du projet excluent. Le worker ne démarre
  pas sans clé Jev : on ne peut pas non plus l'éteindre.
- Ce qui reste possible sans fork : la couche OIA (P3) peut **re-juger** les
  mentions avec Mistral via `packages/providers`, en méthode « LLM, extrait »,
  pour comparaison ou contrôle. Les réponses partent quand même chez TypeSafe,
  puisque Elmo les envoie à Jev.
- Le routage européen d'OpenRouter (`eu.openrouter.ai`, offres Business et
  Enterprise) ne règle rien ici : Elmo code `openrouter.ai` en dur (Jev et
  fournisseur OpenRouter), et une requête régionale échoue s'il n'existe pas
  de fournisseur dans la région, ce qui est le cas de Jev, servi par TypeSafe.

## 4. Ce qui part hors d'Europe dans la chaîne actuelle

Localisations : liste des sous-traitants publiée par Elmo
(`packages/docs/content/legal/subprocessors.mdx`, mise à jour le 2026-10-27),
complétée par les fournisseurs propres à CrawlSEO.

| Flux | Destinataire | Pays | Données envoyées |
|---|---|---|---|
| Moteur chatgpt | OpenAI | États-Unis | Texte des questions (marques et concurrents dans les questions marquées) ; réponses générées là-bas |
| Moteur claude | Anthropic | États-Unis | Idem |
| Moteurs gemini et perplexity | OpenRouter, puis Google et Perplexity | États-Unis | Idem, en passant par la passerelle OpenRouter |
| **Juge Jev** | OpenRouter, puis TypeSafe | **États-Unis** | **Chaque réponse qui nomme une entreprise suivie**, avec les noms, alias et domaines de la marque et des concurrents. C'est le flux le plus riche. |
| Moteur mistral | Mistral | France (UE) | Questions en français. **Moteur de la recherche web de Mistral : non documenté**, à vérifier dans le DPA et la liste des sous-traitants de Mistral avant de le déclarer « entièrement UE ». |
| Onboarding, assistant de prompts, Opportunités d'Elmo | Mistral (`ONBOARDING_LLM_TARGET=mistral:mistral-api`) | France (UE) | Texte du site, marque, concurrents. Ce flux était épinglé sur Anthropic (États-Unis) jusqu'à ce changement. |
| CrawlSEO : Search Console, PageSpeed, connexion Google | Google | États-Unis | URL des propriétés, appels API sur des données que Google détient déjà |
| CrawlSEO : Bing Webmaster (si clé) | Microsoft | États-Unis | Idem pour Bing |
| Crawlie | aucun tiers | — | Requêtes directes vers les sites audités |
| Agents (P2) dans Claude Code | Anthropic | États-Unis | **Tout ce que les agents lisent par MCP** (réponses, crawls, Search Console) passe dans le contexte du modèle. À garder en tête pour un client externe. |
| Téléchargements (images Docker, npm) | Docker Hub, GHCR, npm | États-Unis | Code seulement, aucune donnée |
| Télémétrie | — | — | Désactivée (`DISABLE_TELEMETRY=1`, `CRAWLSEO_UPDATE_CHECK=false`) |

**Où sont stockées les données** : dans les bases Postgres des outils, sur la
machine qui les fait tourner (Mac Studio en P1-P2, VPS en P3). Pour un
stockage UE, la région du VPS et celle de Supabase pour la couche OIA sont à
choisir en conséquence (décision « serveur P3 » encore ouverte).

**Données personnelles** : les questions sont des requêtes de type étude de
marché. Une **marque personnelle** (nom d'une personne) fait toutefois des
noms, alias et faits du sujet des données personnelles, envoyées aux
fournisseurs américains ci-dessus. À couvrir dans le contrat avec un client
externe.

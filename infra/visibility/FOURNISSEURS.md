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

## 0 ter. Modèles mesurés, proches des applications grand public (A6, 2026-11-08)

Proposition de cinq modèles API, chacun aussi proche que possible du
comportement de l'application grand public du fournisseur (ChatGPT,
Claude, Le Chat, Gemini, Perplexity). Les identifiants proviennent de la
documentation officielle aux adresses citées, consultées le 2026-11-08.
**Aucun appel réel** n'a été fait pour les confirmer : ce qui est marqué
« non vérifié » demande un appel réel plus tard.

| Modèle (nom Elmo) | Plus proche de | Identifiant API | Source de l'identifiant | Recherche web | Statut de vérification |
|---|---|---|---|---|---|
| chatgpt (OpenAI) | ChatGPT | `gpt-6-luna` (Responses API, outil `web_search`) | HANDOFF §2.1 (code Elmo 0.7.7, `openai-api.ts`) | Oui | Nom d'identifiant **non vérifié** côté OpenAI docs — à rejouer quand les docs seront accessibles. |
| claude (Anthropic) | Claude.ai | `claude-haiku-5-5` (Messages, outil `web_search`) | HANDOFF §2.1 | Oui | Idem : **non vérifié** côté Anthropic docs. |
| gemini (via OpenRouter) | Gemini app | `google/gemini-2.5-flash` avec `:online` | HANDOFF §2.1 ; AI Studio annonce `gemini-2.5-flash` comme offre gratuite courante | Oui (Google natif) | Identifiant côté OpenRouter : **vérifié dans le code Elmo**, pas sur docs OpenRouter (accès bloqué dans la session précédente). |
| perplexity (via OpenRouter) | Perplexity | `perplexity/sonar` avec `:online` | HANDOFF §2.1 ; Perplexity annonce Sonar comme son modèle « base » | Oui (Sonar) | **Vérifié dans le code Elmo** ; Perplexity peut l'étiqueter autrement côté console. |
| mistral (Mistral direct, FR) | Le Chat FR | `mistral-medium-latest` avec `:online` (Conversations API, outil `web_search`) | HANDOFF §2.1, Mistral annonce Conversations en bêta | Oui | Alias `-latest` qui évolue ; la version exacte est stockée par Elmo (`prompt_runs.version`). |

Jev (juge des mentions) : `typesafe/jev-1.13` via OpenRouter. Pas modifié
depuis le 2026-11-05.

### Coûts estimés face au plafond mensuel de 30 $

Sources des prix : tableau du HANDOFF §2.3 (non vérifié, documenté à partir
des tarifs de la doc Elmo) + estimations OIA. Les nombres sont donnés en
USD, arrondis. Par appel, recherche web comprise.

| Moteur | Coût unitaire estimé |
|---|---|
| ChatGPT (OpenAI) | 0,015 à 0,02 $ |
| Claude (Anthropic) | ≈ 0,03 $ (≈ 40 % de la facture) |
| Gemini (via OpenRouter) | 0,01 à 0,035 $ |
| Perplexity (Sonar) | ≈ 0,007 $ |
| Mistral (avec recherche web) | ≈ 0,03 $ |
| Jev (par 1 000 réponses) | 0,15 à 0,35 $ |

**Volumétrie des deux pilotes (fenêtre J0 = 5 jours à 1 run par jour par cible)** :

| Pilote | Questions × moteurs × jours | Appels fournisseurs | Plafond 30 $ compatible ? |
|---|---|---|---|
| Pilote 1 (anglophone, 10 questions × 4 moteurs × 5 jours) | 200 | ≈ 0,5 à 0,9 $/jour → **2,5 à 4,5 $/fenêtre** | oui, confortablement |
| Pilote 2 (bilingue FR+EN, 20 questions × 5 moteurs × 5 jours) | 500 | ≈ 1,1 à 2,2 $/jour → **5,5 à 11 $/fenêtre** | oui |
| Les deux ensemble, 1 fenêtre/mois | — | **8 à 16 $/mois** | oui, marge 14 à 22 $ |
| Les deux ensemble, mesure quotidienne (hors scénario) | — | 48 à 95 $/mois | **non** — le plafond 30 $ arrêterait le worker vers J12-J15. |

Conclusion : **une fenêtre de 5 jours par mois tient dans le plafond 30 $
avec marge**. Une mesure quotidienne permanente ne tient pas ; elle n'est
pas au programme (roadmap 3.3 : fenêtres ponctuelles). Les crédits
prépayés à placer chez chaque fournisseur avant la première fenêtre : 5 $
minimum chez OpenAI, Anthropic, Mistral, OpenRouter, soit environ 20 à
25 $ immobilisés en avance.

Reste à vérifier par Mickaël avant J0 réel :
- identifiants exacts (deux `non vérifié` ci-dessus) ;
- disponibilité de la recherche web en formule prépayée sur chaque compte ;
- recharge automatique **désactivée** partout.

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
| claude | Anthropic en direct | `claude:anthropic-api:claude-haiku-5-5:online` | Oui (outil `web_search`) | Oui |
| gemini | via OpenRouter | `gemini:openrouter:google/gemini-2.5-flash:online` | Oui (recherche native Google) | Oui (`url_citation`) |
| perplexity | via OpenRouter | `perplexity:openrouter:perplexity/sonar:online` | Oui (Sonar) | Oui |
| **mistral** | **Mistral en direct** | `mistral:mistral-api:mistral-medium-latest:online` | **Oui**, voir ci-dessous | Oui (`tool_reference`) |

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
    `mistral-medium-latest` avec recherche, ce qui est une approximation de
    Le Chat (même limite que pour les autres moteurs) ;
  - `-latest` est un alias qui évolue : la version exacte servie est stockée
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

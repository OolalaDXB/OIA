# Passation OIA Visibility (P1) — 6 novembre 2026

Document écrit à la fin de la session Claude Code **cloud** qui a travaillé du
5 au 6 novembre 2026. La session suivante tourne en local sur le Mac Studio et
n'a pas l'historique de la conversation. Ce document ne contient que des
faits : aucune décision nouvelle.

**À lire d'abord :** cette session n'a **jamais** eu accès au Mac. Elle
tournait dans un conteneur Linux x86_64 (`uname` : Linux x86_64, pas de
`sw_vers`), sans aucun dossier du Mac relié. Tout ce qui demande le Mac, des
clés, un compte Google ou un accès aux deux sites n'a pas été exécuté (§5).

Documents de référence dans le repo :
- `infra/visibility/README.md` : procédure et règles ;
- `reports/2026-11-05-etape-0.md` : étape 0, écarts entre doc et code, tests ;
- `reports/2026-11-05-zero-cout.md` : étude zéro coût et sa mise en place ;
- `FOURNISSEURS.md` : moteurs, règle LLM, Jev, flux hors d'Europe ;
- `agents/` : checklist générique et doc des agents Technique et AEO ;
- `subjects/<id>/REVIEW.md` : fiche de revue de chaque sujet.

---

## 1. Ce qui est commité sur `main`, commit par commit

Tous les commits ont été faits directement sur `main`, à la demande du
mandat. La branche de session `claude/oia-visibility-setup-tb3h0s` existe
toujours sur GitHub (pointée sur `a180d77`). Sa suppression a été demandée,
mais le proxy git de la session l'a refusée (HTTP 403) : **elle est à
supprimer à la main**.

### `a180d77` (2026-11-05) — Étape 0 et configuration d'installation
- `elmo/compose.yaml` : Elmo **v0.7.7** (images `elmohq/elmo-{web,worker,db-migrate}:0.7.7`,
  plus Postgres 18), épinglé par tag **et** digest d'index multi-architecture
  (arm64 présent). Web sur `127.0.0.1:${ELMO_PORT:-1515}`. **Postgres non
  publié sur l'hôte**. Volume nommé `elmo_pg` monté sur `/var/lib/postgresql`
  (exigence de Postgres 18).
- `crawlseo/compose.yaml` : CrawlSEO **v0.3.6** (`ghcr.io/crawlseo/crawlseo:0.3.6`,
  plus Postgres 16), épinglé par tag et digest. App sur
  `127.0.0.1:${CRAWLSEO_PORT:-3100}`, services app et worker, Postgres non
  publié. Compose refuse de démarrer sans `CRAWLSEO_POSTGRES_PASSWORD`.
- `elmo/.env.example`, `crawlseo/.env.example` : sans aucune valeur secrète.
- `.gitignore` local : `.env`, dumps, exports.
- `scripts/preflight.sh` : état des lieux en lecture seule (Docker, Node,
  architecture, ports 1515/3000/3100/5432-5435, images arm64, veille du Mac).
- `scripts/init-env.sh` : crée les `.env` et génère les secrets. **Refuse
  d'écraser un `.env` existant.**
- `scripts/lock-crawlseo.sh` : passe `DISABLE_REGISTRATION=true` et redémarre
  CrawlSEO.
- `backup.sh`, `restore.sh`, `scripts/verify-restore.sh`, `scripts/lib.sh` :
  portabilité (voir §5 pour ce qui a été testé).
  - `backup.sh` : dumps `-Fc` horodatés, MANIFEST, SHA256SUMS, dans un dossier
    hors du repo (refuse un dossier situé dans le repo).
  - `restore.sh` : démarre Postgres seul, refuse une base non vide, restaure,
    puis démarre le reste.
  - `verify-restore.sh` : compte les lignes ; vérifie que les jetons Google de
    CrawlSEO se déchiffrent avec `NEXTAUTH_SECRET` (AES-256-GCM) ; vérifie que
    les secrets d'Elmo sont sous la clé courante (`kid` du JWE).
  - Variables : `OIA_VIS_SUFFIX` (installation de test séparée),
    `OIA_VIS_ONLY=elmo|crawlseo`.
- `SECRETS.md` : noms des secrets à sauvegarder hors machine, dont
  `NEXTAUTH_SECRET` et `ELMO_ENCRYPTION_KEY`.
- Rapport d'étape 0, alors nommé `RAPPORT-ETAPE-0.md` et déplacé ensuite,
  plus `PANELS-PROPOSITION.md`, supprimé ensuite.

### `abcb871` (2026-11-05) — Sujets génériques, panels versionnés, plafond de coût
- `infra/visibility` devient un paquet du workspace (`@oia/visibility-infra`,
  ajouté à `pnpm-workspace.yaml`), avec `zod` et `yaml`.
- `src/schema.ts` : schéma unique de sujet. `src/load.ts` : chargeur et
  règles transverses. `src/render.ts` : génère `REVIEW.md` et `elmo-brief`.
  `src/cli.ts` : la CLI `subjects`.
- `subjects/<id>/` : `subject.yaml`, `panel.yaml`, `facts.yaml` (et
  `measurement.yaml` à partir de `a8b314c`). Le dossier peut être ailleurs
  (`OIA_VIS_SUBJECTS_DIR`).
- `test/no-hardcoded-subjects.test.ts` : **échoue si un id, nom, alias ou
  domaine d'un sujet apparaît hors de `subjects/` et `reports/`**, accents et
  casse ignorés. Le test se vérifie lui-même.
- `scripts/cost-guard.sh` : arrête le worker Elmo au plafond journalier, et en
  cas de coût illisible (échec en sécurité).
- `scripts/window-day.sh` : relevé d'un jour de fenêtre (réponses par sujet et
  par cible, questions sans réponse, coût estimé).
- `scripts/crawlie-audit.sh` : lit les URL dans les sujets ; Crawlie 0.5.3 via
  `npx` ; rapports JSON hors du repo.
- `PANELS-PROPOSITION.md` est remplacé par les fichiers de sujets ; le rapport
  d'étape 0 est déplacé vers `reports/2026-11-05-etape-0.md`.

### `a8b314c` (2026-11-05) — Plan SEO/AEO du site pilote en source, checklist, gel J0
- Schéma :
  - questions `candidate` (gardées pour un panel élargi, jamais envoyées) ;
  - provenance des questions (`sourceId`, `sourceRef`) ;
  - `measurement.yaml` : fenêtres, jours manquants, **gels** jusqu'à la fin
    d'une fenêtre ;
  - commande `subjects freezes` (code de sortie 1 si un gel est en vigueur).
- Coach Gari : plan SEO/AEO du dépôt du site en document source ; faits
  extraits ; gel J0 (§3).
- `agents/checklist-site.md` : 10 contrôles génériques (C01 à C10), avec la
  brique qui mesure chacun ; `agents/technique.md`, `agents/aeo.md`.

### `615b0f3` (2026-11-05) — Mistral mesuré (FR), règle LLM, flux hors UE
- Moteurs déclarés par sujet (`engines`, langues comptées). `elmo-brief`
  donne `enabledModels` et `reportLanguages`.
- Cible Mistral ajoutée ; `ONBOARDING_LLM_TARGET=mistral:mistral-api`.
- `FOURNISSEURS.md` : règle « traitements LLM de la couche OIA =
  `packages/providers` (Mistral) » ; Jev ; tableau des flux hors d'Europe.

### `6cca747` (2026-11-05) — Panel Coach Gari validé, étude zéro coût
- `subjects/coach-gari/panel.yaml` : panel v2 `validated` (Mickaël THOMAS,
  2026-11-05).
- `reports/2026-11-05-zero-cout.md` : vérifications à zéro coût.
- README : ne jamais supprimer une question dans Elmo (§6).

### `16f8a4b` (2026-11-06) — Configuration à zéro coût et saisie manuelle
**Contexte factuel :** ce commit a été construit après un « ok go » que la
session a lu comme un accord sur ses quatre propositions. Mickaël a ensuite
indiqué que son message précédent demandait seulement de vérifier et de
s'arrêter : ce commit va au-delà de la demande. Il n'a rien appelé ni rien
payé, et n'a pas été annulé.

- Moteurs : `collection: api | manual` et `webSearch`.
- `src/capture.ts` et les commandes de saisie manuelle des applications
  grand public :
  - `subjects capture-template <id> <moteur> [AAAA-MM-JJ] [--draft]` : écrit
    `~/oia-visibility-data/manual/<date>/<id>/<moteur>.md`, jamais écrasé ;
    panel validé exigé, sauf `--draft` ;
  - `subjects capture-check <fichier>` : contrôles (méta-données, questions
    exactes, réponses remplies ou « NON CAPTURÉ : raison ») ; mention par alias
    et domaines ; URL et concurrents cités ; SHA-256 ; collecte `manual-app` ;
    écrit `<fichier>.json`.
- `elmo/.env.example` en zéro coût :
  - `TYPESAFE_API_KEY=stub` ;
  - OpenAI et Anthropic vides ;
  - Mistral sans `:online` ;
  - Gemini via OpenRouter en BYOK ;
  - `OIA_VIS_DAILY_CAP_USD=0` et `OIA_VIS_COST_SOURCE=real`.
- `scripts/zero-cost-check.sh` : garde-fous de configuration, puis un appel par
  fournisseur gratuit (option `--mistral-search`), sans afficher de clé.
- `cost-guard.sh` : source du coût `max|estimate|real`, arrêt quand le coût
  **dépasse** le plafond.
- Moteurs des deux sujets passés en zéro coût (`measurement.yaml`).

État des tests au dernier commit : 22 tests du paquet au vert
(`pnpm --filter @oia/visibility-infra test`) ; typecheck du monorepo 15/15 ;
tests du monorepo 27/27 au commit `abcb871` ; validations du registry et de
knowledge au vert. Aucune régression observée sur OIA Funding V0.

---

## 2. Ce qui n'existe que dans la conversation

Sources : code d'Elmo au tag **v0.7.7** (commit `5e76f422`), CrawlSEO
v0.3.6, Crawlie 0.5.3, et le repo OIA. Les chemins sont ceux du dépôt
`elmohq/elmo`.

### 2.1 Elmo : constats dans le code

| Constat | Preuve |
|---|---|
| **Jev en mode `stub`** : `TYPESAFE_API_KEY=stub` active un juge local à mots repères, sans aucun appel réseau. Elmo le marque « For tests and development only ». | `apps/worker/src/mention-judge/analyze.ts` l. 276-296 (`configureMentionAnalyzer`) ; `jev.ts` l. 197 (`stubTransport`), l. 213 (`stubVerdict`) |
| Effet du juge `stub` : toute correspondance de nom, d'alias ou de domaine compte comme mention (sauf « no information » et « fruit ») ; sentiment par mots anglais (« great », « best », « avoid »…). **Sentiment et position inutilisables**, et inopérants en français. | `jev.ts` l. 213-221 |
| Sans `stub`, sans `TYPESAFE_API_KEY` et sans `OPENROUTER_API_KEY`, **le worker refuse de démarrer**. Une clé TypeSafe l'emporte sur OpenRouter, sans bascule automatique entre les deux. | `analyze.ts` l. 276-296 ; `apps/worker/src/index.ts` l. 45-47 |
| **Adresses de Jev codées en dur** : `api.typesafe.ai/v1/systemone` et `openrouter.ai/api/v1/systemone`. Modèles `jev-1.13.0` et `typesafe/jev-1.13`. Format propre à TypeSafe, pas l'API de chat. Aucune variable pour les changer : **pas d'Ollama ni d'adresse compatible OpenAI pour Jev**, sauf à modifier Elmo. | `jev.ts` l. 4, 10-12 |
| Si le juge change de version, Elmo re-juge l'historique sur `REPROCESS_DAYS` (90 jours par défaut). | doc `developer-guide/configuration.mdx` |
| **`sendImmediate`** : créer ou réactiver une question met immédiatement un run en file. | `apps/web/src/lib/job-scheduler.ts` l. 46-62 (`sendImmediate ?? true`) |
| Sans `SCRAPE_TARGETS`, le worker s'arrête (« Missing required environment variable: SCRAPE_TARGETS »). Constaté au test. | `packages/config/src/env.ts` l. 203 |
| **`elmo init` non conforme** : il génère Postgres publié sur `5432:5432`, toutes interfaces, avec le mot de passe en dur `postgres`. La doc ne le dit pas. | `apps/cli/src/compose.ts` l. 102-110 ; `apps/cli/src/commands/init.ts` l. 37 |
| **Gemini seulement via OpenRouter** (ou par un scraper, exclu) : il n'existe pas de connecteur Google direct. Connecteurs API : `openai-api`, `anthropic-api`, `mistral-api`, `openrouter`. | `packages/lib/src/providers/registry/` |
| `openrouter.ai` est codé en dur pour les moteurs aussi : le routage UE d'OpenRouter (`eu.openrouter.ai`) est inutilisable sans modifier Elmo. | `openrouter.ts` l. 13 ; `jev.ts` l. 12 |
| Le connecteur OpenAI appelle l'API **Responses** (`/v1/responses`) avec l'outil de recherche d'OpenAI. Le SDK de l'image (`@ai-sdk/openai` 4.0.101) lit `OPENAI_BASE_URL` (vérifié dans l'image), mais une redirection vers Google ou Ollama ne donnerait pas une mesure valable : pas d'outil de recherche, réponses étiquetées « chatgpt ». | `openai-api.ts` l. 29 |
| **Recherche web Mistral** : Elmo l'appelle via `/v1/conversations` avec `tools: [{type:"web_search"}]` (`:online`), et extrait les sources (`tool_reference`). Sans `:online`, il passe par `/v1/chat/completions`, sans recherche ni sources. | `mistral-api.ts` l. 93-97 ; `text-extraction.ts` (`extractCitationsFromMistral`) |
| Elmo **estime** 0,005 $ par appel Mistral (table de prix interne), même sur l'offre gratuite. C'est une estimation, pas une facture. | `packages/lib/src/usage/cost.ts` l. 25 |
| Moteurs choisis **par marque** (`brands.enabled_models`), pas par question : un moteur réservé au français répond aussi aux questions anglaises d'un sujet bilingue. | `providers/runner.ts` l. 13 ; `run-policy/policy.ts` l. 72 |
| **Supprimer une question efface ses réponses brutes** (`DELETE /prompts/{id}` dans l'API et l'interface). | `apps/web/src/server/prompts-core.ts` l. 266 |
| L'API REST d'Elmo n'a **aucun point pour importer une réponse**. Écritures possibles : `/brands`, `/competitors`, `/prompts`, `/reports`, `/tools/analyze`. | `packages/api-spec/src/openapi.json` |
| `RUNS_PER_PROMPT` vaut 5 par défaut ; `DEFAULT_DELAY_HOURS` ne s'applique qu'aux questions programmées après le changement ; l'intervalle court à partir de la fin du run précédent. | doc `configuration.mdx` |
| Le README parle de citations classées « Google properties » ; le code 0.7.7 n'a plus cette catégorie. | `packages/lib/src/citations/domain-categories.test.ts` l. 47 |
| Sous-traitants publiés par Elmo : OpenAI, Anthropic, TypeSafe et OpenRouter aux États-Unis ; Mistral en France. | `packages/docs/content/legal/subprocessors.mdx` (mise à jour 2026-10-27) |

### 2.2 Offres gratuites (recherches web, pages officielles non joignables depuis la session)

`ai.google.dev`, `mistral.ai` et `help.mistral.ai` étaient bloqués par le
réseau de la session. **Rien de ce qui suit n'est vérifié.**

- **Gemini** : plusieurs sources citent 500 requêtes par jour avec recherche
  Google en offre gratuite (Flash et Flash-Lite). D'autres signalent une baisse
  de Flash à environ 20 requêtes par jour fin 2025. Débit cité : 5 à 15
  requêtes par minute. Les données de l'offre gratuite peuvent servir à Google.
  OpenRouter en BYOK : pas de frais OpenRouter sur les premiers 25 000 $ par
  mois selon les sources. On ne sait pas si un appel BYOK est accepté avec
  0 crédit, ni si la recherche native passe sans frais.
- **Mistral** : l'offre gratuite (Experiment, ou « Free mode ») demande un
  téléphone vérifié, sans carte. Selon l'aide Mistral, les requêtes peuvent
  servir à l'entraînement. **Recherche web probablement payante** : environ
  30 $ pour 1 000 appels (environ 50 $ en premium) selon les sources, sans
  indication de gratuité. Le moteur derrière la recherche web de Mistral n'est
  pas documenté.
- **TypeSafe (Jev)** : une source affirme 5 $ de crédit offert à l'inscription
  depuis le 21 septembre 2026, d'autres le contredisent. Prix cité : environ
  0,042 $ par million de tokens d'entrée.
- **OpenRouter** : routage UE (`eu.openrouter.ai`) réservé aux offres Business
  et Enterprise ; modèles `:free` limités à 50 requêtes par jour sans crédit ;
  pas de modèle Gemini gratuit, seulement Gemma.

### 2.3 Coûts estimés (mesure payante en API, cinq moteurs)

Calculés à partir des tarifs de la doc d'Elmo et des sources ci-dessus, **non
vérifiés**. Par appel, recherche web comprise :

| Moteur | Coût par appel |
|---|---|
| ChatGPT (OpenAI) | ~0,015–0,02 $ |
| Claude (Anthropic) | ~0,03 $ (le poste le plus cher, ~40 % de la facture) |
| Gemini | ~0,01–0,035 $ |
| Perplexity Sonar | ~0,007 $ |
| Mistral | ~0,03 $ avec recherche, ~0,002 $ sans |
| Jev | ~0,15–0,35 $ pour 1 000 réponses |

| | Coach Gari (10 questions × 4 moteurs) | Maisons.co (20 questions × 5 moteurs) | Les deux |
|---|---|---|---|
| Par jour de mesure | ~0,5–0,9 $ | ~1,1–2,2 $ | ~1,6–3,2 $ |
| Une fenêtre de 5 jours par mois | ~2,5–4,5 $/mois | ~5,5–11 $/mois | ~8–16 $/mois |
| Mesure quotidienne permanente (non prévue) | ~16–28 $/mois | ~32–67 $/mois | ~48–95 $/mois |

- Avance de crédits prépayés : environ 5 $ minimum par fournisseur, soit
  environ 20 à 25 $ au total. Mistral et TypeSafe demandent une carte.
- Palier « Jev réel seulement » : environ 5 $ une fois, ou 0 si le crédit
  TypeSafe existe.
- Scraping des applications grand public (exclu en P1 et P2) : 30 à 50 $
  par mois minimum.

### 2.4 Alternative évaluée, non codée : collecteur minimal dans OIA, sans Elmo

**Écarts entre le repo et les hypothèses de départ :**
- **`packages/watch` n'est pas un stockage en ajout seul de réponses brutes.**
  C'est un registre propre à Funding (`ConsoleRecord`), avec une ligne par
  opportunité, mise à jour (`upsertRows`, `lastSeenAt`, `timesSeen`).
  L'ajout seul ne vaut que pour `watch_events` et `reviews`, et seulement par
  l'absence d'autorisation de modification ou de suppression (RLS), que le
  compte de service contourne (`docs/architecture/schema/0002_watch_and_workspace.sql`).
  Aucun déclencheur ne rejette `UPDATE` ou `DELETE`, alors que le brief en
  exige un.
- **`packages/providers` n'a pas d'adaptateur Gemini**, et OpenAI n'y est pas
  implémenté (`src/index.ts`). L'interface `extract` force une réponse JSON
  validée par Zod, à température 0, sans recherche web
  (`src/mistral.ts`) : elle sert à extraire, pas à poser une question en texte
  libre. L'adaptateur Mistral ne remplit pas `costUsd` (tokens seulement).
- **`.env.example` racine** : `LLM_PROVIDER="anthropic"`,
  `LLM_MODEL="claude-sonnet-5"`, alors que `packages/config/src/env.ts`
  met `mistral` par défaut. `createProviderFromEnv` suit le `.env`.
- La détection par alias existe déjà (`src/capture.ts`, `src/scan.ts`).
  Ses limites : homonymes (alias qui sont des mots courants), fautes
  d'orthographe, et aucune lecture du sentiment.
- Les sources renvoyées par la recherche Gemini sont probablement des liens de
  redirection Google, à résoudre pour retrouver la vraie URL (non vérifié).

**Ce qu'on perd par rapport à Elmo :** tableau de bord, part de voix et
rapports ; sentiment et position (déjà perdus en mode `stub`) ; classement des
sources par catégorie ; assistant de prompts et Opportunités ; API et MCP
d'Elmo ; re-jugement automatique après un changement d'alias ; 7 moteurs, le
scraping, et la maintenance par l'éditeur quand les API changent. Gemini
renvoie aussi ses requêtes de recherche (`webSearchQueries`).

**Effort estimé** (travail de Claude Code, plus relecture) :

| Lot | Jours |
|---|---|
| Table de réponses en ajout seul (déclencheur), métadonnées obligatoires, SHA-256, isolation par sujet | 1 |
| Adaptateur Gemini AI Studio (recherche, sources, redirections, quotas, reprises) | 1 à 1,5 |
| Question en texte libre à Mistral, sans recherche | 0,5 |
| Exécution quotidienne sur le Mac (1 run par jour et par moteur, jours manquants, arrêt au premier coût) | 1 |
| Détection mentions et sources avec le passage exact (reprise de `capture.ts`) | 0,5 |
| Import des saisies manuelles dans la même table | 0,5 |
| Export brut (dump SQL + JSON) et synthèse J0 par sujet et moteur | 1 |
| Tests et revue | 1 |
| **Total** | **6,5 à 7 jours** |

Recommandation donnée par la session (ce n'est pas une décision) :
construire le collecteur et retirer Elmo **si la contrainte zéro coût est
durable** ; garder Elmo en mode `stub` pour J0 si elle n'est que temporaire.
Préalables cités : une ADR sur le changement de la règle « ne jamais
reconstruire ce que fait Elmo », et un appel réel de vérification pour
Gemini et Mistral.

### 2.5 Autres écarts entre documentation et code (CrawlSEO, Crawlie)
- **CrawlSEO** :
  - le `docker-compose.yml` amont utilise `:latest`, le port 3000,
    `127.0.0.1:5432` et le mot de passe par défaut `changeme` ;
  - `NEXTAUTH_SECRET` chiffre aussi les jetons Google (`lib/encryption.ts`,
    AES-256-GCM avec SHA-256 du secret ; préfixe `enc:v1:`) ;
  - le README annonce « 9 read-only tools » pour le MCP et en liste 13 ;
  - **la clé Bing ne fait que lire** l'API Bing Webmaster (`GetUserSites`,
    `GetRankAndTrafficStats`, `GetQueryStats`, `GetPageStats`,
    `GetCrawlStats`) : ni ajout de site, ni soumission, ni IndexNow ;
  - les vitals viennent de PageSpeed Insights, profil mobile, **catégorie
    performance seulement** ;
  - le robot s'appelle `CrawlSEOBot/1.0` ; pas de rendu JavaScript.
- **Crawlie** :
  - au tag v0.5.3, `npm/package.json` indique encore 0.2.1, alors que le
    registre npm publie bien 0.5.3 ;
  - `--max-pages` vaut 500 par défaut ;
  - robots.txt n'est évalué que pour son propre robot, et le CLI ne permet pas
    de changer de robot ;
  - règles utiles : `content-requires-js`, `geo-not-answerable`,
    `geo-no-author`, `geo-no-llms-txt`.

### 2.6 Flux hors d'Europe (détail dans `FOURNISSEURS.md`)
- **Configuration payante prévue au 2026-11-05** : OpenAI, Anthropic,
  OpenRouter, Google, Perplexity et TypeSafe, tous aux États-Unis.
- **Configuration zéro coût** : seuls Gemini (OpenRouter puis Google, aux
  États-Unis) et les applications consultées à la main sortent d'Europe.
- **Agents Claude Code (P2)** : tout ce qu'ils lisent par MCP passe par
  Anthropic (États-Unis).
- **Données personnelles** : Coach Gari est une marque personnelle, ses noms,
  alias et faits sont donc des données personnelles.

---

## 3. Lien avec le repo `OolalaDXB/CoachGari`

- Ajouté à la session et cloné **en lecture seule**. Aucune modification du
  dépôt ni du site.
- **Commit épinglé : `73e1967`** (2026-11-05 21:33 UTC, « Merge step 1:
  reliability… »).
- Déclaré dans `subjects/coach-gari/subject.yaml` (`repository`) avec deux
  documents sources :
  - `repo-seo-aeo-plan` : `docs/SEO_AEO_PLAN.md`, plan établi le 2026-09-30
    (état du site, cibles, plan par priorité, mesure, annexe B de 20 questions,
    baseline Lighthouse en §4bis) ;
  - `repo-pages` : titres et descriptions de `index.html`,
    `online-coaching.html`, `personal-training-dubai.html`,
    `padel-coaching-dubai.html` et `corporate-wellness-dubai.html`.
- **Les 4 pages de service sont des brouillons non indexables** : chacune a
  `<meta name="robots" content="noindex, nofollow">` et
  `<meta name="cg-draft" content="true">` au commit `73e1967` (le dépôt
  impose ce couple par `scripts/test-seo.mjs`). Seule la page d'accueil est commerciale et indexable.
  `sitemap.xml` ne liste que `/`, `/legal` et `/privacy`, ce qui est voulu
  tant que les pages restent en brouillon.
- Autres faits lus dans le dépôt :
  - `robots.txt` : `Allow: /` pour tous, `Disallow` sur `/admin`, `/r/` et
    `/c/` ;
  - fichier de clé IndexNow à la racine et `.github/workflows/indexnow.yml` ;
  - Lighthouse CI à chaque push (CG-069), IndexNow après chaque déploiement
    (CG-070) ;
  - selon le README du dépôt, `coachgari.com` est prévu comme redirection vers
    `coachgari28.com` ; selon le plan (action 1.4), la redirection 308 a été
    vérifiée sur Vercel le 2026-09-30.
- **Repris du plan :**
  - annexe B, 20 questions : 9 actives dans le panel v2 (n° 1, 2, 3, 7, 10,
    12, 13, 14 et 15 ; le n° 15 est réécrit « Harare, Zimbabwe »), et les 11
    autres en candidates (n° 4, 5, 6, 8, 9, 11, 16, 17, 18, 19, 20) ;
  - faits `extracted` (§2 du plan pour les marchés, 1.3 pour la zone, 3.6 pour
    la langue, annexe A pour le padel, 3.2 pour les tournées, §1 pour l'absence
    de fiche Google, d'avis et de profils au-delà d'Instagram et TikTok) ;
  - constats du §1 et des actions 1.4b, 1.5 et 4bis transformés en checklist
    générique (`agents/checklist-site.md`, C01 à C10), sans référence au site.
- **Gel J0** (`subjects/coach-gari/measurement.yaml`, `freeze-j0`, décidé
  par Mickaël THOMAS le 2026-11-05) :
  - périmètre : le site et le dépôt ;
  - règle : rien ne se publie qui change ce que voient Google et les IA avant
    la fin de la fenêtre J0 ;
  - couvre notamment la publication des 4 pages (action 1.2 du plan), les prix
    dans le HTML (2.1), `llms.txt` (2.8), IndexNow et les soumissions aux
    moteurs, le pare-feu de l'hébergeur ;
  - reste permis : une branche non déployée, le back-office sans effet sur les
    pages publiques, et un correctif de sécurité urgent consigné ;
  - lecture : `pnpm --filter @oia/visibility-infra subjects freezes coach-gari`.

---

## 4. Décisions

### Prises par Mickaël
- **Mandat 1 (2026-11-05)** :
  - trois outils déployés tels quels, versions épinglées, jamais `latest` ;
  - Elmo sur le port 1515, CrawlSEO sur 3100 ;
  - ports sur 127.0.0.1 uniquement ;
  - mots de passe Postgres changés avant le premier démarrage ;
  - `DISABLE_REGISTRATION=true` après la première connexion à CrawlSEO ;
  - `NEXTAUTH_SECRET` jamais modifié ;
  - mode API uniquement, sans scraping ;
  - aucun secret dans le repo ;
  - aucune modification des deux sites ;
  - commits directs sur `main`.
- **Portabilité** : volumes nommés, `backup.sh` et `restore.sh`, liste des
  secrets, test réel de restauration.
- **Généricité** : aucun sujet codé en dur, schéma unique, test qui le vérifie.
- **Coach Gari** :
  - coach sportif et préparateur physique ; coaching en ligne (entraînement,
    nutrition) ; padel en complément ;
  - basé à Dubaï ; audience surtout en Afrique australe (Zimbabwe) ;
  - alias : « Coach Gari », « @coach_gari28 », coachgari28.com, et
    coachgari.com à confirmer ;
  - panel en anglais.
- **Maisons.co** : mesuré comme loueur de maisons et conciergerie (Quistinic
  et Morbihan, Gudauri, conciergerie en Bretagne) ; pas de panel logiciel ;
  10 questions FR + 10 EN.
- **2026-11-05**, configuration payante : OpenAI et Anthropic en direct ;
  Gemini et Perplexity via OpenRouter ; Jev via OpenRouter ; plafond 5 $/jour.
  **Remplacée le 2026-11-06 par la configuration zéro coût.**
- **2026-11-05** : Mistral ajouté pour les panels en français. Tout
  traitement LLM de la couche OIA passe par `packages/providers` (Mistral),
  sans nouveau fournisseur.
- **2026-11-05** : gel J0 du site de Coach Gari.
- **2026-11-05** : panel Coach Gari v2 **validé**.
- **2026-11-06** : onboarding d'Elmo maintenu sur Mistral.
- **2026-11-06** : configuration à **zéro coût** : aucune dépense, aucune
  carte, aucun abonnement.
- **2026-11-06** : CrawlSEO et Crawlie gardés dans tous les cas.
- **2026-11-06** : suppression de la branche de session demandée (non faite,
  §1).

### Encore ouvertes
1. **Garder ou retirer Elmo.** Mickaël a écrit : « si sa réponse sur Jev est
   négative, on retire Elmo et on construit le collecteur minimal ». La
   réponse factuelle est que Jev peut fonctionner sans paiement en mode `stub`,
   marqué « tests et développement ». La question du budget (§2.3) a été posée,
   et rien n'est tranché.
2. Le sort des fichiers propres à Elmo (`elmo/`, `zero-cost-check.sh`, la
   partie Elmo de `cost-guard.sh`, `backup.sh`, `restore.sh`,
   `verify-restore.sh` et `window-day.sh`) si Elmo est retiré.
3. **Panel Maisons.co** : v1 encore en brouillon. Il manque les noms des
   maisons, les offres, d'autres domaines, et les concurrents locaux du
   Morbihan et de Gudauri (`subjects/maisons-co/subject.yaml`,
   `openQuestions`).
4. **Coach Gari** :
   - coachgari.com ;
   - le marché ZA ;
   - les concurrents proposés (Playtomic, Ultimate Performance, Future,
     Caliber), sans concurrent local à Dubaï ou au Zimbabwe ;
   - les faits `extracted` à valider ;
   - le nom civil comme alias.
5. **Gel hors site** pendant J0 : fiche Google, avis, mentions, Playtomic.
6. **Ampleur de la saisie manuelle** : 3 applications × toutes les questions,
   soit environ 90 copier-coller et 3 heures par jour de fenêtre.
7. Jev en mode `stub` accepté pour J0, ou vérification préalable du crédit
   TypeSafe.
8. Réduire Maisons.co à 10 questions par jour si le quota Gemini gratuit est
   de 20 requêtes par jour.
9. Repris du brief, sans changement : condition de reprise de Funding V0,
   mission Moë-Kan, serveur P3, nom de marque.

---

## 5. Jamais testé faute d'accès au Mac

- `preflight.sh` (versions de Docker et Node, ports, veille), sur macOS et
  arm64.
- **Tous les scripts sous macOS** : bash 3.2, `awk`, `sed`, `shasum`,
  `uuidgen` et `lsof` BSD. Ils n'ont tourné que sous Linux, avec bash 5.
- **CrawlSEO de bout en bout.** L'image n'a pas pu être téléchargée : le
  stockage de blobs de GHCR est bloqué depuis la session. Rien n'a été fait
  avec Google : OAuth, Search Console, première synchronisation, premier
  crawl, liste des URL hors sujet de maisons.co, `lock-crawlseo.sh`.
- **Sauvegarde et restauration de CrawlSEO avec de vrais jetons Google** :
  seule la logique de déchiffrement a été testée, isolément, avec Node.
- **Crawlie sur les deux sites** : ni coachgari28.com ni maisons.co n'étaient
  joignables. Seul `npx crawlie@0.5.3 --version` a été exécuté.
- **Aucun appel réel** à Gemini, OpenRouter, Mistral ou TypeSafe. Dans la
  partie réseau de `zero-cost-check.sh`, `HTTP 000` correspond au réseau
  bloqué de la session.
- Le worker Elmo avec des cibles réelles, l'interface web d'Elmo (création de
  compte, de marque, de questions), et l'assistant de prompts.
- La fenêtre J0 elle-même : rien n'a été lancé, aucun livrable J0 n'existe.

**Ce qui a été réellement testé dans le conteneur (amd64, données factices) :**
- Elmo 0.7.7 : pull par digest ; `postgres` + `db-migrate` (exit 0,
  41 tables) + `web` (HTTP 307 sur 127.0.0.1:1515) ; Postgres non publié.
- `init-env.sh`.
- `backup.sh` et `restore.sh` en installation séparée (`-restoretest`), avec
  refus d'une base non vide.
- `verify-restore.sh` : clé Elmo identique, puis différente.
- `cost-guard.sh` (illisible → rc 4, plafond → rc 3, sous le plafond → rc 0,
  modes `real` et `estimate`) et `window-day.sh`.
- `capture-template` et `capture-check` sur le sujet validé.

---

## 6. Pièges connus

- **Ne jamais supprimer une question dans Elmo** : ses réponses brutes sont
  effacées. On la désactive.
- **Garder le worker Elmo arrêté jusqu'au début de J0** (`sendImmediate`).
  Démarrer seulement `postgres db-migrate web`. Laisser `SCRAPE_TARGETS` vide :
  c'est le verrou.
- **Ne pas utiliser `elmo init` ni `elmo compose`** : ils publient Postgres
  avec le mot de passe `postgres`. Utiliser `elmo/compose.yaml`.
- **Postgres 18** : monter le volume sur `/var/lib/postgresql`, pas
  `/var/lib/postgresql/data`.
- **`NEXTAUTH_SECRET` et `ELMO_ENCRYPTION_KEY`** : à générer une fois et à
  sauvegarder hors machine avant tout usage. `init-env.sh` refuse d'écraser un
  `.env`.
- **`TYPESAFE_API_KEY` ne doit jamais rester vide si `OPENROUTER_API_KEY` est
  renseignée** : Jev passerait par OpenRouter (payant).
- `RUNS_PER_PROMPT` vaut 5 par défaut (mis à 1 dans `.env.example`).
  `DEFAULT_DELAY_HOURS` ne s'applique qu'aux questions programmées après le
  changement. L'heure du run glisse chaque jour.
- **Moteurs par marque dans Elmo** : Mistral répond aussi aux questions
  anglaises d'un sujet bilingue. Ces réponses sont à exclure des synthèses
  (`reportLanguages` d'`elmo-brief`).
- **Les estimations de coût d'Elmo (`usage_events`) ne sont pas des
  factures.** En zéro coût, `cost-guard.sh` utilise `OIA_VIS_COST_SOURCE=real`
  (coût réel OpenRouter) et arrête le worker si ce coût est illisible.
- Le `.env.example` racine pointe vers Anthropic : la couche OIA doit créer
  l'adaptateur Mistral explicitement, sans passer par `createProviderFromEnv`.
- **Test de généricité** : un nom, alias ou domaine de sujet hors de
  `subjects/` et `reports/` (code, README, agents, scripts) fait échouer
  `pnpm --filter @oia/visibility-infra test`. Après toute modification d'un
  YAML de sujet : `subjects review <id> --write`, sinon le test de `REVIEW.md`
  échoue.
- **Versions des questions** : changer une formulation crée
  `version + 1`, retire l'ancienne avec `supersededBy`, et augmente
  `panelVersion` si l'ensemble actif change. Ne jamais écraser une version.
- **Saisie manuelle** : panel `validated` exigé (sauf `--draft`, qui ne compte
  pas) ; fichier jamais écrasé ; la question collée dans l'app doit être
  exactement celle du fichier.
- **Gel J0 de Coach Gari** : aucune publication du site ni du dépôt
  (publication des 4 pages, prix, `llms.txt`, IndexNow…) avant la fin de J0.
  Vérifier avec `subjects freezes`.
- **CrawlSEO** : déclarer l'URI de redirection
  `http://localhost:3100/api/auth/callback/google` dans le client OAuth Google.
  Lancer `lock-crawlseo.sh` juste après la première connexion.
- **Crawlie** : passer `--max-pages` (500 par défaut ; le script met 5000).
  Il respecte robots.txt pour son propre robot seulement.
- **Données hors du repo** : `~/oia-visibility-data/` (saisies, Crawlie,
  journaux, relevés) et `~/oia-visibility-backups/`. Ni secrets ni dumps dans
  le repo (`.gitignore`).
- **Session cloud et Mac** : un `HTTP 000` ou un « ENOTFOUND » venait du réseau
  de la session cloud. Sur le Mac, les vrais codes s'afficheront.
- Toute affirmation marquée « non vérifiée » ci-dessus (quotas Gemini, prix de
  la recherche Mistral, crédit TypeSafe, BYOK avec 0 crédit) doit être
  confirmée dans les consoles ou par un appel réel avant d'en dépendre.

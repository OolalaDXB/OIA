# Inventaire de l'application Elmo 0.7.7

Document de référence pour la future interface OIA Visibility. Il décrit Elmo tel que son code le montre, écran par écran, indicateur par indicateur. Il propose ensuite les améliorations OIA, un brief prêt à coller dans Lovable et une correspondance avec le contrat de données.

Toutes les preuves citent un chemin relatif à la racine du dépôt Elmo, avec numéros de ligne. Aucun code d'Elmo n'est recopié ici.

---

## 1. Source et méthode

### 1.1 Provenance

| Élément | Valeur |
|---|---|
| Dépôt | `https://github.com/elmohq/elmo.git` |
| Tag | `v0.7.7` (message du commit : « bump version to 0.7.7 », daté du 2026-10-28) |
| Commit | `5e76f4229ae49fa300097c38823486f937da0b86` (préfixe `5e76f422` conforme) |
| Licence | MIT, `LICENSE.md:1-3`, titulaire « Blue Whale Software, LLC », 2026. `package.json:4` déclare aussi `"license": "MIT"`. Le fichier s'appelle `LICENSE.md` et le dépôt n'a pas de fichier `LICENSE` nu. |
| Méthode | Clone `--depth 1` en lecture seule. Lecture par `cat`, `grep`, `find`, `sed`. Aucune installation, aucun build, aucun script exécuté. |

Le dépôt contient aussi `CLA.md`. Les contributions demandent un accord de contributeur ; la réutilisation du code reste couverte par la licence MIT.

### 1.2 Structure du monorepo

Monorepo pnpm + Turborepo, Node 24 (`package.json:5-8`, `AGENTS.md`). TypeScript partout, PostgreSQL comme unique base.

| Dossier | Rôle |
|---|---|
| `apps/web` | Tableau de bord produit. TanStack Start + Vite, React 19, TanStack Router et Query, Recharts, Base UI (`apps/web/package.json`). |
| `apps/worker` | Tâches de fond pg-boss : runs de questions, jugement des mentions, rollups, rapports (`apps/worker/src/index.ts`). |
| `apps/www` | Site marketing, docs, blog. |
| `apps/cli` | `@elmohq/cli`, déploiement Docker Compose et saisie des clés (`apps/cli/src/providers.ts`). |
| `packages/lib` | Logique partagée, schéma Drizzle, migrations SQL `0000` à `0032`, fournisseurs, rollups. |
| `packages/ui` | Composants shadcn sur Base UI. |
| `packages/config` | Validation d'environnement, modèles, plans, rôles, cibles de scraping. |
| `packages/deployment` | Modes de déploiement, hooks d'auth, facturation Stripe, e-mails. |
| `packages/api-spec` | Spécification OpenAPI de `/api/v1`. |
| `packages/docs`, `packages/og` | Contenu MDX et images Open Graph. |
| `e2e/`, `evals/`, `plugins/elmo`, `skills/` | Tests Playwright, évaluations, plugin et skill « aeo ». |

Authentification : better-auth avec plugin organisations, clés d'API et serveur OAuth pour MCP (`packages/lib/src/auth/server.ts`). Auth0 sert en mode whitelabel (`packages/config/src/env-registry.ts:65-95`).

Quatre modes de déploiement : `local`, `demo`, `whitelabel`, `cloud` (`packages/config/src/types.ts:1`). Les fonctions actives par mode sont fixées dans `packages/deployment/src/deployment.ts:16-66` (facturation et invitations en cloud seulement, rapports ponctuels hors cloud, `demo` en lecture seule).

### 1.3 Base de données

Schéma dans `packages/lib/src/db/schema.ts` et `packages/lib/src/db/schema-auth.ts`. Chaque table applicative appelle `enableRLS()` ; aucune politique RLS n'existe dans les migrations. Le cloisonnement se fait dans le code applicatif par l'appartenance à l'organisation (`apps/web/src/lib/auth/helpers.ts:54-105`).

| Table | Colonnes clés | Preuve |
|---|---|---|
| `brands` | `id`, `name`, `slug`, `website`, `additional_domains[]`, `aliases[]`, `enabled`, `onboarded`, `delay_override_hours`, `enabled_models[]`, `analysis_versions`, `organization_id` | `schema.ts:37-75` |
| `competitors` | `id`, `brand_id`, `name`, `domains[]`, `aliases[]` | `schema.ts:105-122` |
| `prompts` | `id`, `brand_id`, `value`, `enabled`, `premium_models[]`, `tags[]`, `system_tags[]` (`branded` ou `unbranded`) | `schema.ts:77-103` |
| `prompt_runs` | `id`, `prompt_id`, `brand_id`, `model`, `provider`, `version`, `web_search_enabled`, `raw_output`, `web_queries[]`, `created_at`. Table en ajout seul, un trigger refuse les mises à jour. | `schema.ts:124-155` |
| `run_extractions` | `run_id`, `text_content`, `stamp` | `schema.ts:161-169` |
| `run_mentions` | `run_id`, `brand_mentioned`, `competitors_mentioned[]`, `assessments` (JSON : sentiment, probabilités, passage, position), `stamp` | `schema.ts:172-182`, type `packages/lib/src/mentions.ts:39-70` |
| `citations` | `prompt_run_id`, `prompt_id`, `brand_id`, `model`, `url`, `domain`, `title`, `citation_index`, `page_id` | `schema.ts:184-211` |
| `cited_pages` | `url`, `domain`, `title`, `page_type`, `static_category`, `classifier_version`, `first_seen_at`, `last_seen_at` (partagée entre clients) | `schema.ts:451-462` |
| `rollup_prompt_runs` | clé (`brand_id`, `bucket` 15 min, `prompt_id`, `model`, `provider`, `web_search_enabled`) ; `runs`, `brand_mentioned_runs`, `competitor_runs`, `competitor_mentions`, `no_mention_runs`, `positive_runs`, `neutral_runs`, `negative_runs`, `mixed_runs`, `position_sum`, `positioned_runs`, `fanout_runs`, `fanout_queries` | `schema.ts:375-413` |
| `rollup_competitor_mentions` | même clé + `competitor_name` ; `runs`, sentiment, position | `schema.ts:415-445` |
| `rollup_citation_urls`, `rollup_citation_pages` | citations par page et par seau ; copie des pages par marque | `schema.ts:464-518` |
| `rollup_web_queries` | requêtes de fan-out normalisées, `runs`, `brand_mentioned_runs` | `schema.ts:521-545` |
| `rollup_sentiment_quotes` | meilleur run par sentiment et par seau | `schema.ts:551-575` |
| `rollup_dirty`, `pipeline_state`, `background_migrations` | invalidation et versions des rollups | `schema.ts:583-628` |
| `brand_opportunities` | rapport d'opportunités JSON, modèle, date (historique en ajout seul) | `schema.ts:239-255` |
| `reports` | rapports ponctuels : `brand_name`, `brand_aliases`, `brand_website`, `status`, `progress`, `raw_output` | `schema.ts:213-234` |
| `usage_events` | un appel fournisseur par ligne, `event_type` (`prompt_run` ou `prompt_run_failed`), coût estimé | `schema.ts:324-342` |
| `secrets` | surcharges chiffrées des variables de clés | `schema.ts:348-356` |
| `organization_settings` | surcharges de droits, quantité d'options premium | `schema.ts:300-312` |
| `user`, `organization`, `member` (`role` par défaut `member`), `invitation`, `subscription`, `apikey`, tables OAuth | auth | `schema-auth.ts:36`, `:118`, `:128-145`, `:147`, `:415` |

Le seau de rollup dure 15 minutes (`packages/lib/src/rollups/constants.ts:6`). Les rollups se reconstruisent par suppression puis réinsertion depuis les données brutes (`packages/lib/src/rollups/rebuild.ts:51-70`).

### 1.4 Chaîne de mesure

1. Le worker lance une question sur chaque cible due (`apps/worker/src/jobs/process-prompt.ts:296-402`).
2. Chaque réponse réussie crée une ligne `prompt_runs` (`process-prompt.ts:244-256`). Un échec crée seulement une ligne `usage_events` de type `prompt_run_failed` (`process-prompt.ts:270-288`).
3. Une tâche dérivée extrait le texte, les citations, puis juge les mentions (`apps/worker/src/jobs/derive-runs.ts`).
4. Le juge de mentions est Jev de TypeSafe, version épinglée `jev-1.13.0` (`apps/worker/src/mention-judge/jev.ts:4`). Il interroge seulement les sujets dont le nom, un alias ou un domaine apparaît en mot entier dans le texte (`apps/worker/src/mention-judge/analyze.ts:240`). Une mention compte si la somme des probabilités de sentiment dépasse 0,3 (`analyze.ts:56`, `:115-116`).
5. Les rollups agrègent par seau de 15 minutes ; la jointure interne sur `run_mentions` écarte les runs encore non jugés (`rebuild.ts:93-96`).

---

## 2. Écrans et routes

Les routes suivent le routage par fichiers de TanStack (`apps/web/src/routes`). Toutes les pages de marque partagent la barre de filtres : période (`1w`, `1m`, `3m`, `6m`, `1y`, `all`, plage personnalisée), moteur, étiquettes, et parfois recherche (`apps/web/src/lib/lookback.ts:1-12`, `apps/web/src/components/filter-bar.tsx`). La période par défaut vaut `1m`, ou `1w` si la marque a moins de 7 jours d'historique (`apps/web/src/lib/chart-utils.ts:16-27`). La navigation latérale masque les pages d'analyse tant que `onboarded` vaut faux (`apps/web/src/components/app-sidebar.tsx:87-130`).

Le gabarit de marque charge la marque, ses questions et ses concurrents, puis redirige vers `/choose-plan` si l'organisation n'a aucun droit actif (`apps/web/src/routes/_authed/app/org/$org/brand/$brand.tsx:20-87`). Squelette de chargement : `$brand.tsx:45-59`. Marque introuvable : 404.

### 2.1 Vue d'ensemble (`/app/org/$org/brand/$brand`)

- **Contenu** : quatre cartes de tête (visibilité, part de voix, sentiment, position), chacune avec valeur, variation sur la période, mini-courbe et note de couleur. En dessous, le « paysage concurrentiel » : graphique de tendance de la marque et des 4 meilleurs concurrents, puis grille entreprises × moteurs pour l'indicateur choisi. En pied, quatre statistiques : questions suivies, évaluations, fréquence de run, dernière mise à jour (`routes/_authed/app/org/$org/brand/$brand/index.tsx:98-187`, `:264-297`).
- **Composants** : `HeadlineCard` (`components/overview/headline-card.tsx`), `CompetitiveLandscape` et `ModelGrid` (`components/overview/competitive-landscape.tsx:126-296`), `FilterBar` sans recherche.
- **Filtres** : période, moteur, étiquettes.
- **Actions** : changer d'indicateur dans le paysage, trier la grille, suivre les liens vers les pages détaillées.
- **États** : marque non onboardée, assistant « Research Brand Data » (`index.tsx:237-255`, `:322-324`). Aucun run et aucun filtre : « Waiting for First Evaluation » si des questions actives existent, sinon « No Data Yet » avec lien vers les questions (`index.tsx:193-235`, `:327-331`). Chargement : squelettes. Erreur : message « Couldn't load the overview right now » (`index.tsx:273-279`). Valeur nulle : tiret (`headline-card.tsx:103`).
- **Données** : `getDashboardSummaryFn` (`apps/web/src/server/dashboard.ts:39-81`) → `getCompetitiveLandscape` (`server/analytics-core.ts:625-651`) sur `rollup_prompt_runs` et `rollup_competitor_mentions`, plus `getMentionTotals` (`lib/rollup-read.ts:149-162`).

### 2.2 Visibilité (`/visibility`)

- **Contenu** : bandeau de visibilité globale (valeur, couleur, mini-courbe si la période dépasse 7 jours, nombre de questions, de runs, de citations), puis une carte par question avec courbe journalière de la marque et des 3 concurrents les plus visibles, et un badge de dernière valeur (`components/prompts-display.tsx:37-239`, `components/visibility-bar.tsx:70-160`, `lib/chart-utils.ts:327-352`).
- **Composants** : `VisibilityBarSection`, `VirtualizedPromptList`, `CachedPromptChart`, `PromptOrderDropdown`.
- **Filtres** : période, moteur, étiquettes, recherche texte, ordre (`?order=`, tri par taux de mention de la marque ou des concurrents, `lib/prompt-order.ts:33-66`).
- **Actions** : ouvrir le détail d'une question, exporter un graphique, éditer les questions.
- **États** : chargement, squelettes de 3 cartes (`prompts-display.tsx:231-239`). Erreur : « Failed to load prompts data » (`:110-118`). Aucune question : boîte vide avec lien Edit (`:123-138`). Filtres sans résultat : « No prompts match your filters ». Par carte : « Evaluating for the first time », « No data in selected time range », « No brands found in responses » (`components/cached-prompt-chart.tsx:147-215`). Bandeau sans run : « No visibility data for the selected time range and filters » (`components/visibility-bar.tsx:183-184`).
- **Données** : `getFilteredVisibilityFn` et `getBatchChartDataFn` (`server/visibility.ts:46-148`) sur `rollup_prompt_runs`, `rollup_competitor_mentions` ; `getPromptsSummaryFn` (`server/prompts.ts:156`).

### 2.3 Part de voix (`/share-of-voice`)

- **Contenu** : anneau de répartition, courbe de part de voix (marque + 4 concurrents), classement avec rang, mentions, barre de part, nombre de questions (`routes/.../share-of-voice.tsx:44-230`).
- **Filtres** : période, moteur, étiquettes.
- **États** : chargement, squelette (`:129-141`). Vide : « No mention data yet for the selected filters » (`:142-151`). Erreur du classement : **non géré**, une erreur tombe dans le même message que l'état vide (`:142`). Erreur de la courbe : « Couldn't load the trends right now » (`:85-86`).
- **Données** : `getShareOfVoiceFn` et `getCompetitiveLandscapeFn` (`server/analysis.ts:43-94`) → `getBrandShareOfVoice` (`server/analytics-core.ts:199-262`).

### 2.4 Sentiment (`/sentiment`)

- **Contenu** : anneau de sentiment et score sur 100, courbe de sentiment par entreprise, grille sentiment par moteur, « What AI Says About You » (citations de passages classées en éloges, mitigés, critiques, 5 par côté), « Sentiment by Prompt » trié du moins positif au plus positif (`routes/.../sentiment.tsx:53-345`, `server/analytics-core.ts:680-726`).
- **États** : erreur : « Couldn't load sentiment right now » (`sentiment.tsx:372-379`). Chargement : squelette (`:380-381`). Vide : « No answers mention you for the selected filters yet » si le score de la marque est nul (`:382-389`). Côté vide d'une liste de citations : « No positive answers in this period » et équivalents (`:107-109`).
- **Données** : `getBrandSentimentFn` (`server/analysis.ts:95`), `rollup_sentiment_quotes` et `run_extractions` (`lib/postgres-read.ts:219`).

### 2.5 Réponses (`/responses`)

- **Contenu** : liste paginée (15 par page, `server/responses.ts:17`) de cartes de réponse : question liée, moteur, fournisseur, version, texte en Markdown avec surlignage, recherches web, marques mentionnées (`components/response-card.tsx`).
- **Filtres** : recherche plein texte (ILIKE sur `text_content`, `lib/postgres-read.ts:152-156`), sentiment (positif, neutre, mitigé, négatif, non mentionné) avec compteurs, tri (récent, négatif d'abord, positif d'abord, `lib/sentiment-sql.ts:161-169`), sélection de questions, moteur, étiquettes, période.
- **États** : erreur, vide, recherche sans résultat, chacun avec son message (`routes/.../responses.tsx:165-178`). Chargement : squelettes de cartes. Rechargement : opacité réduite (`:95-103`).
- **Données** : `searchResponsesFn`, `getResponseSentimentCountsFn` (`server/responses.ts:51-78`) sur `prompt_runs` ⨝ `run_mentions` ⨝ `run_extractions`.

### 2.6 Fan-out des requêtes (`/query-fan-out`)

- **Contenu** : carte d'état des moteurs (exposent-ils leurs recherches), trois onglets « Prompt Fan-Out », « Top Queries », « Query Words » (`routes/.../query-fan-out.tsx:110-118`).
- **États** : erreur (`:77`). Aucun run avec recherche web (`:78-85`). Aucune requête exposée (`:97`). Chargement dédié.
- **Données** : `getQueryFanoutFn` (`server/query-fanout.ts:46`) → `getBrandQueryFanout` (`server/analytics-core.ts:454-489`) sur `rollup_web_queries`. Une requête compte si elle est non vide, différente du marqueur `unavailable` et différente du texte de la question (`packages/lib/src/rollups/fanout.ts:21-26`).

### 2.7 Citations (`/citations`)

- **Contenu** : trois tuiles (part de citations de la marque, domaines uniques, total), aires empilées par catégorie de source et par type de page, « Recent Changes », « Content Gaps », « Top Cited Domains », « Citation Flow », « Top Cited URLs », « Google Shopping », carte des subreddits (`components/citations-display.tsx:100-262`, `components/citations/*`).
- **Catégories de source** : `brand`, `competitor`, `editorial`, `reviews`, `ecommerce`, `social`, `developer`, `pr`, `reference`, `institutional`, `other` (`packages/lib/src/citations/domain-categories.ts:6-36`). Forums et réseaux sociaux tombent dans `social` (`packages/lib/src/citations/domain-lists.ts:779-815`).
- **Actions** : ajouter un domaine cité à la marque ou à un concurrent, créer un concurrent depuis un domaine (`server/brands.ts:466-564`), choisir le domaine du flux, paginer.
- **États** : chargement, carte squelette. Erreur : « Failed to load citation data » ; la page affiche aussi ce message quand la réponse manque sans erreur (`routes/.../citations.tsx:99-108`). Vide : « No citations found. Citations are only available from prompts evaluated with web search enabled » (`:112-120`).
- **Données** : `getCitationsFn`, `getCitationUrlsFn`, `getCitationDomainsFn`, `getGoogleShoppingFn`, `getCitationFlowFn` (`server/citations.ts:337-544`) sur `rollup_citation_urls`, `rollup_citation_pages`. Fenêtre en UTC, période par défaut `1w` côté serveur (`server/citations.ts:258-269`).

### 2.8 Opportunités (`/opportunities`)

- **Contenu** : date de dernière évaluation, résumé en 3 à 5 puces, 8 à 12 opportunités classées (catégorie `creation`, `existing-content`, `outreach`, `social`, titre, justification, questions liées, pages citées de la marque et des concurrents), 2 à 4 risques (`server/opportunities.ts:70-104`, `components/opportunities-report.tsx`).
- **Génération** : un LLM produit le rapport à partir d'un condensé des données (fenêtres 30 jours et 7 jours, `server/opportunities.ts:485`). Le rapport se régénère au plus tous les 6 jours (`:530`), en ligne, de façon synchrone, avec 3 essais de validation de schéma (`:551-618`).
- **États** : chargement avec texte d'attente (`routes/.../opportunities.tsx` fonction `LoadingState`). Erreur (`:36`). Données insuffisantes (`:37-43`).
- **Données** : `getOpportunitiesFn` (`server/opportunities-fn.ts:11`), table `brand_opportunities`.

### 2.9 Détail d'une question (`/prompts/$promptId`)

- **Contenu** : en-tête avec la question, ses étiquettes, sa première évaluation ; quatre onglets : `mentions`, `web-queries`, `citations`, `responses` (`apps/web/src/lib/prompt-detail-tabs.ts:1`). Mentions : comptage par marque et concurrent, plus une ligne « (no brand mentions) » (`server/prompts.ts:339-358`).
- **États** : erreur globale (`routes/.../prompts/$promptId.tsx:272-299`). Vide par onglet : « No mention data available for this time period » (`:418-423`), requêtes web (`:504-515`), citations (`:570-575`), réponses (`:613-634`).
- **Données** : `getPromptStatsFn`, `getPromptRunsFn`, `getPromptMetadataFn`, `getPromptWebQueryFn` (`server/prompts.ts:56-587`).

Routes de redirection : `/prompts` → `/visibility`, `/prompts/edit` → `/settings/prompts`, `/settings` → `/settings/brand`. Sous-chemin inconnu : page 404 (`routes/.../$brand/$.tsx`).

### 2.10 Réglages de marque

| Route | Contenu et actions | États | Données |
|---|---|---|---|
| `/settings/brand` | Nom, slug, site, domaines additionnels, alias ; bouton Enregistrer (`settings/brand.tsx:139-226`) | chargement ; erreur d'écriture en bandeau (`:220`) | `updateBrandFn` (`server/brands.ts:342`) |
| `/settings/competitors` | Liste éditable : nom, domaines, alias, max 500 (`components/competitors-editor.tsx:59-198`) | barre « modifications non enregistrées » | `getCompetitors`, `updateCompetitors` (`server/brands.ts:398-465`) |
| `/settings/prompts` | Éditeur : texte, actif, étiquettes, modèles premium ; « Suggest Prompts » ; max 100 questions (`components/prompts-editor.tsx:104-206`, `packages/lib/src/constants.ts:46`) | squelette (`settings/prompts.tsx`) | `updatePromptsFn` (`server/prompts.ts:456`) |
| `/settings/llms` | Plateformes suivies par groupe, réserve premium partagée par l'organisation (`settings/llms.tsx:63-360`) | erreur d'écriture | `getModelPickerStateFn`, `updateEnabledModelsFn` (`server/platform-picks.ts:195-328`) |

### 2.11 Organisation et compte

| Route | Contenu |
|---|---|
| `/app` | Annuaire des organisations ; état « No organizations » |
| `/app/new` | Création d'organisation (cloud) |
| `/app/org/$org` | Redirige vers `/settings` de l'organisation |
| `/app/org/$org/new` | Nouvelle marque avec choix des plateformes |
| `/app/org/$org/settings` | Nom et URL de l'organisation |
| `/settings/brands` | Marques de l'organisation |
| `/settings/members` | Équipe : inviter (rôle `member` ou `admin`), annuler, retirer (`server/team.ts:24-161`), cloud seulement |
| `/settings/billing` | Plan, usage, option premium (`server/billing.ts:63-179`), cloud seulement |
| `/settings/api-keys` | Clés `read` ou `read`+`write` (`apps/web/src/lib/api/scopes.ts:15`), gestion réservée aux rôles `admin` et `owner` (`server/api-keys.ts:77`) |
| `/settings/api`, `/settings/mcp`, `/settings/skill` | Documentation API, connexion MCP, installation du skill |
| `/choose-plan`, `/accept-invitation/$id`, `/change-password` | Paywall, invitation, mot de passe |
| `/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/authorize`, `/logout` | Authentification et consentement OAuth |

### 2.12 Rapports ponctuels et administration

- `/reports` et `/reports/render/$reportId` : rapport ponctuel sur une marque arbitraire (hors cloud, `routes/_authed/reports.tsx`). Sections : « AI Engine Performance », « Mention Rate », « Competitive Landscape », « Share of Voice Opportunity », « Prompt Analysis », « Top AI Search Queries », « Content Gaps », « What Should I Do Next? ». Le worker choisit 70 questions parmi 84 candidates et place d'abord les questions non marquées qui mentionnent déjà la marque (`apps/worker/src/report-worker.ts:26-29`, `:95-160`). Ce tri biaise le rapport en faveur de la marque.
- `/admin`, `/admin/tools`, `/admin/workflows` : réservés à `user.role = admin` (`routes/_authed/admin.tsx`, `lib/auth/helpers.ts:24-26`). Marques, cadence forcée (`server/admin.ts:264`), analyse d'onboarding, files pg-boss avec relance et journaux (`server/admin.ts:776-984`).

### 2.13 Routes d'API importantes

- `/api/v1/*` (clé d'API ou OAuth, portée `read` ou `write`) : `brands`, `brands/{id}/analytics` (`routes/api/v1/brands/$brandId/analytics.ts`, même calcul que le tableau de bord via `getBrandAnalytics`, `server/analytics-core.ts:599-623`), `citations/domains`, `citations/urls`, `opportunities`, `prompt-performance`, `query-fanout`, `tags`, `competitors`, `prompts`, `prompts/{id}/runs`, `prompts/{id}/snapshot`, `reports`, `tools/analyze`, `models`, `me`, `organizations`, `docs`.
- `/api/mcp` : outils `get_analytics`, `get_prompt_performance`, `get_citations`, `get_query_fanout`, `get_opportunities`, `list_runs`, `get_run`, `list_brands`, `get_brand`, `list_competitors`, `get_billing`, `list_prompts`, `list_prompt_tags`, `create_prompts`, `update_prompt`, `whoami`, `list_models` (`apps/web/src/lib/mcp/tools/*.ts`).
- Techniques : `/api/health` (ping base, 503 si échec, `lib/readiness.ts`), `/api/setup-status`, `/api/auth/$`, `/.well-known/*`, `/api/og`, `/api/site-icon`, `/api/manifest`, proxys Plausible.

---

## 3. Indicateurs

### 3.1 Règle commune : dernière valeur reportée

Le tableau de bord applique une règle unique (`apps/web/src/lib/landscape.ts:1-5`). Pour chaque question, il prend son dernier résultat connu à chaque jour, le reporte sur les jours sans run, puis additionne toutes les questions. La valeur affichée est le dernier jour de la période. La variation va du premier au dernier point tracé (`apps/web/src/server/dashboard.ts:28-37`).

Le report est **pré-amorcé** : avant le premier run d'une question, la période reçoit déjà sa première observation (`apps/web/src/lib/chart-utils.ts:143-164`, `lib/rollup-read.ts:257-263` et `:278-295`, `lib/visibility-stats.ts:191`). Les jours antérieurs à la première mesure affichent donc une valeur observée plus tard.

Le jour est calculé dans le fuseau du lecteur (`lib/analytics-sql.ts:27-36`). « all » remonte au premier run de la marque (`server/brand-window.ts:31-38`).

### 3.2 Tableau des indicateurs

| Indicateur | Formule implémentée | Dénominateur | Fenêtre et agrégation | Réponses manquantes ou en échec | Arrondi et affichage |
|---|---|---|---|---|---|
| **Visibilité IA** (vue d'ensemble, paysage) | mentions de la marque / runs, par jour reporté (`landscape.ts:182-192`, `:132-133`) | runs réussis et jugés des questions en périmètre | dernier jour reporté, toutes questions | un run en échec n'existe pas en base (`process-prompt.ts:270-288`) ; un run non jugé est absent du rollup (`rebuild.ts:93-96`) ; dénominateur 0 → `null` | `Math.round(v*100)` % (`lib/overview-metrics.ts:21`) ; tiret si `null` |
| **Visibilité, bandeau** (`/visibility`) | `lvcf_mentioned / lvcf_runs` du dernier jour non nul (`server/analytics-core.ts:148-162`) | runs reportés, marquées et non marquées | même règle, calculée en SQL | `null` devient **0** (`server/visibility.ts:141`) ; la mini-courbe trace `null` à 0 (`components/visibility-bar.tsx:96`) | entier % |
| **Visibilité par question** (carte) | `round(mentions/runs*100)` par jour, sans report (`contexts/chart-data-context.tsx:84-110`) | runs du jour | jour local ; badge = dernier jour observé (`:122`) | jour sans run → `null` | entier %, seuils 45 et 75 (`lib/chart-utils.ts:211-218`) |
| **Visibilité par moteur** (API) | `brand_mentioned_runs / runs` (`server/analytics-core.ts:293`) | runs du moteur sur la fenêtre | somme brute, sans report | `null` si 0 run | ratio brut |
| **Taux de mention par question** | `brand_mentioned_runs / runs` et `competitor_runs / runs` (`server/analytics-core.ts:553-554`) | runs de la question | somme brute | **0** si aucun run | ratio brut |
| **Part de voix** | mentions marque / (mentions marque + somme des mentions concurrents) (`landscape.ts:132`, `:188` ; `lib/visibility-stats.ts:144-160`) | une mention = un run qui nomme l'entité ; un run qui nomme 3 concurrents compte 3 | dernier jour reporté (`visibility-stats.ts:279-311`) | `null` si total 0 ; part de chaque ligne 0 si total 0 (`visibility-stats.ts:154`) | entier % ; note par rang (1er bon, ≤3 moyen, `overview-metrics.ts:44`) |
| **Sentiment** | (positifs + (neutres + mitigés)/2) / runs avec sentiment (`lib/sentiment.ts:123-129`) | runs qui mentionnent la marque et portent un sentiment | dernier jour reporté sur la vue d'ensemble ; somme brute sur `/sentiment` par question (`analytics-core.ts:712-719`) | `null` si aucune mention avec sentiment | score sur 100 entier (`overview-metrics.ts:24`) ; bon ≥ 65, moyen ≥ 50 (`:54`) |
| **Position** | `position_sum / positioned_runs` (`landscape.ts:190`) | runs où la marque est classée | dernier jour reporté | `null` si jamais classée | 1 décimale (`overview-metrics.ts:61`, `lib/sentiment.ts:102-104`) ; bon ≤ 1,5, moyen ≤ 2,5 |
| **Rang de position** | rang de première apparition parmi les seules entités suivies (`apps/worker/src/mention-judge/analyze.ts:97-106`) | entités suivies nommées | par run | absente si non nommée | entier |
| **Variation** | dernier point tracé − premier point tracé (`dashboard.ts:28-37`) | aucun | sur la période | `null` si moins de 2 points | points de % ; masquée si moins de 0,5 pt (`headline-card.tsx:17`) |
| **Évaluations** | somme des runs réussis sur la période (`dashboard.ts:76`) | aucun | somme brute | échecs exclus | entier |
| **Part de citations de la marque** | dernier point de la courbe lissée des catégories, sinon `round(citations marque / total * 100)` (`components/citations-display.tsx:56-61`, `:95`) | citations en périmètre | report par question normalisé par la cadence (`lib/chart-utils.ts:173-204`) | **0** si aucune citation | entier %, largest remainder (`domain-categories.ts:553-572`) |
| **Part d'un domaine** | citations du domaine / total (`server/analytics-core.ts:405`) | citations de la fenêtre | somme brute | 0 si total 0 | ratio brut |
| **Facteur de variation d'un domaine** | citations fenêtre / citations fenêtre précédente de même durée (`analytics-core.ts:321-332`, `:408`) | fenêtre précédente | deux fenêtres contiguës | `null` si précédente à 0 | ratio brut ; % arrondi dans une autre vue (`server/citations.ts:508`) |
| **Changements récents** | URL et domaines nouveaux ou disparus, seuil 2 citations, 10 éléments (`server/citations.ts:91-95`, `:150-188`) | fenêtre précédente | deux fenêtres | non géré au-delà du seuil | listes |
| **Lacunes de contenu** | questions où un domaine concurrent est cité et aucun domaine de la marque (`server/citations.ts:212-254`) | aucun | fenêtre | non géré | liste triée |
| **Fan-out** | requêtes par run = `round(total/fanout_runs, 1)` ; couverture = requêtes dont le run mentionne la marque / total des requêtes (`server/analytics-core.ts:447-448`, `lib/fanout-analysis.ts:444`, `:518`) | runs avec au moins une requête | somme brute | 0 si aucun | 1 décimale ; ratio brut |
| **Stabilité des sources** | `round((1 − Bray-Curtis moyen entre jours consécutifs) × 100)` (`lib/visibility-stats.ts:72-121`) | transitions entre jours | sur la période | `null` sous 2 jours | entier sur 100, 3 décimales en interne |

Les seuils de couleur de visibilité valent 45 et 75 (`overview-metrics.ts:33`, `components/visibility-bar.tsx:23-40`). Aucun intervalle de confiance n'est calculé dans le code (recherche sans résultat dans `apps/web/src`). Aucune mesure d'exactitude des faits n'existe.

### 3.3 Points d'attention pour l'honnêteté

1. Le bandeau de visibilité affiche 0 % quand aucune valeur n'existe (`server/visibility.ts:141`).
2. Le report pré-amorcé crée des valeurs avant la première mesure (`chart-utils.ts:155-156`).
3. Les échecs disparaissent du dénominateur. Ils restent visibles seulement dans `usage_events` (`process-prompt.ts:280-286`).
4. Un changement de version de modèle se voit seulement dans la carte de réponse (`components/response-card.tsx:72`). Aucun graphique ne le signale.
5. Un appel API et un scraping de l'application grand public du même modèle se distinguent par le fournisseur (`lib/analytics-sql.ts:94-114`) ; le filtre de moteur sépare les deux, l'interface affiche un seul libellé de modèle.
6. Le rapport ponctuel sélectionne ses questions en favorisant les mentions de la marque (`report-worker.ts:123-160`).
7. Une erreur sur la part de voix s'affiche comme un état vide (`share-of-voice.tsx:142`).

---

## 4. Réglages

### 4.1 Marque

Nom, slug unique par organisation, site, domaines additionnels, alias, activée, onboardée (`schema.ts:37-75`). Les alias et domaines servent au repérage des mentions (`packages/lib/src/mentions.ts:21-34`). L'onboarding analyse le site avec le LLM `ONBOARDING_LLM_TARGET` et propose concurrents et questions (`packages/lib/src/onboarding/analyze.ts`, `apps/worker/src/jobs/analyze-brand.ts`).

### 4.2 Concurrents

Nom, domaines, alias ; 500 au plus (`packages/lib/src/constants.ts:45`). Le rollup des concurrents se clé par nom (`schema.ts:419`). Ajouter un concurrent re-juge seulement ce concurrent (`mentions.ts:87-94`).

### 4.3 Questions

Texte, actif, étiquettes libres, étiquette système `branded` ou `unbranded` calculée par présence du nom, du site ou d'un alias dans la question (`packages/lib/src/tag-utils.ts:79-87`), modifiable par étiquette utilisateur (`tag-utils.ts:26-50`). 100 questions par marque au plus (`constants.ts:46`), plafond du plan en cloud (`packages/config/src/plans.ts:172-215`). Suggestions limitées à 5 lancements par jour (`constants.ts:48`).

### 4.4 Moteurs, fournisseurs, modèles

- `SCRAPE_TARGETS` au format `model:provider[:version][:online]` (`packages/config/src/scrape-targets.ts:4-48`). `:online` active la recherche web.
- Modèles connus : ChatGPT, Claude, Google AI Mode, Google AI Overview, Gemini, Copilot, Perplexity, Grok, Mistral, DeepSeek, Kimi, Qwen (`packages/config/src/models.ts:16-27`).
- Fournisseurs « api » : `openai-api`, `anthropic-api`, `mistral-api`, `openrouter`, `stub`. Fournisseurs « scraped » (application grand public) : `olostep`, `brightdata`, `oxylabs`, `cloro`, `searchapi`, `dataforseo` (`packages/lib/src/providers/registry/*.ts`, champ `access`).
- Localisation figée sur les États-Unis et l'anglais pour plusieurs fournisseurs (`registry/searchapi.ts:10`, `registry/dataforseo-shared.ts:16-17`, `registry/cloro.ts:66`).
- Par marque : `enabled_models` choisit les plateformes ; en cloud, le plan borne le menu et le nombre de choix (`plans.ts`). Les modèles premium d'une question passent par l'appel API avec recherche (« grounded »), une réplication (`packages/lib/src/run-policy/policy.ts:99-105`).

### 4.5 Clés et variables d'environnement (noms seulement)

Registre : `packages/config/src/env-registry.ts:46-468`.

- Base et app : `DATABASE_URL`, `APP_URL`, `VITE_APP_URL`, `DEPLOYMENT_MODE`, `ENVIRONMENT`, `READ_ONLY`, `BETTER_AUTH_SECRET`, `ELMO_ENCRYPTION_KEY`, `ELMO_ENCRYPTION_KEY_OLD`.
- Mesure : `SCRAPE_TARGETS`, `RUNS_PER_PROMPT`, `DEFAULT_DELAY_HOURS`, `ONBOARDING_LLM_TARGET`, `REPROCESS_DAYS`, `TYPESAFE_API_KEY`.
- Fournisseurs : `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `SEARCHAPI_API_KEY`, `OLOSTEP_API_KEY`, `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_SERP_ZONE`, `OXYLABS_USERNAME`, `OXYLABS_PASSWORD`, `CLORO_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `JINA_API_KEY`.
- Auth et admin : `AUTH0_*`, `VITE_AUTH0_*`, `ADMIN_AUTH0_SUB`, `ADMIN_API_KEYS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLOUD_SIGNUP_ALLOWLIST`, `DEFAULT_BRAND_DOMAINS`, `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY`.
- Cloud et observabilité : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `UPSTASH_REDIS_*`, `BLOB_READ_WRITE_TOKEN`, `SENTRY_*`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_PLAUSIBLE_DOMAIN`, `VITE_CLARITY_PROJECT_ID`, `DISABLE_TELEMETRY`.
- Marque blanche : `VITE_APP_NAME`, `VITE_APP_ICON`, `VITE_APP_PARENT_NAME`, `VITE_APP_PARENT_URL`, `VITE_OPTIMIZATION_URL_TEMPLATE`, `VITE_ONBOARDING_REDIRECT_URL_TEMPLATE`, `VITE_CHART_COLORS`.

La table `secrets` stocke des surcharges chiffrées de ces clés (`schema.ts:346-356`, `packages/lib/src/secrets/store.ts`).

### 4.6 Organisation, utilisateurs, rôles

Multi-tenant par organisation : chaque marque porte `organization_id` (`schema.ts:55-61`) ; l'accès passe par une ligne `member` (`helpers.ts:65-105`). Rôles d'organisation : `owner`, `admin`, `member` ; `owner` et `admin` gèrent plan, facturation, membres et clés (`packages/config/src/roles.ts:16`). Les lectures et écritures de marque restent ouvertes à tout membre. Un rôle global `user.role = admin` ouvre `/admin` (`helpers.ts:24-26`).

### 4.7 Planification des runs

- Un job pg-boss par question, relancé à la fin de chaque cycle (`process-prompt.ts:67-88`). Maintenance toutes les 5 minutes, rollups chaque minute (`apps/worker/src/index.ts:129`, `:142-155`).
- Hors cloud : cadence `delay_override_hours` ou `DEFAULT_DELAY_HOURS` (24 h par défaut), 5 réplications par cible (`RUNS_PER_PROMPT`, `constants.ts:2`, `:26` ; `policy.ts:72-80`).
- Cloud : 1 ou 4 runs par jour selon le plan, réplication du plan, premium 1 réplication (`policy.ts:107-141`, `plans.ts:172-215`).
- Une cible devient due après son intervalle moins une tolérance de 25 % plafonnée à 30 minutes (`policy.ts:228-236`).
- Après un cycle entièrement en échec : reprise à 15 min, 30 min, 1 h, 2 h, 4 h, 8 h, plafonnée à la cadence (`packages/lib/src/run-backoff.ts:13`, `:28-32`).
- Plafond quotidien d'appels par organisation (`process-prompt.ts:340-351`).

---

## 5. Améliorations OIA par écran

### 5.1 Règles transverses

- **Intervalle explicite.** Pour une proportion (visibilité, part de voix), afficher l'intervalle de Wilson à 95 % avec `n` en clair, par exemple « 34 % [22 ; 48], n = 50 réponses ». Sous 30 réponses, afficher plutôt « k réponses sur n » et la plage observée jour par jour (minimum et maximum). Le libellé dit lequel des deux est affiché.
- **Mesure en cours.** Tant que la fenêtre compte moins de 5 jours mesurés, l'écran affiche « Mesure en cours, jour N sur 5 ». N compte les jours distincts avec au moins une réponse réussie et jugée.
- **Non mesurable.** Un dénominateur nul produit l'état « non mesurable », avec sa raison : aucune réponse réussie, moteur en échec, texte vide, jugement absent, recherche web désactivée. Le zéro reste réservé à une mesure faite qui ne trouve rien. Le code d'Elmo confond les deux en plusieurs points (§ 3.3).
- **Aucun report avant la première mesure.** Les jours sans données restent vides.
- **Échecs visibles.** Chaque écran affiche réponses demandées, réussies, en échec, non jugées.
- **Méthode affichée.** Un pied de page fixe : « Mesure par API des fournisseurs ; l'application grand public peut répondre autrement. Un run par jour et par moteur. Langue du panel : français. Panel v N. »
- **Changement de modèle signalé.** Toute variation de `version` dans la fenêtre pose un repère sur les courbes et une alerte en tête.
- **Couleur de statut.** La couleur indique un statut (attendu, en cours, validé, alerte). Elle cesse de noter un score, conformément à `docs/visibility/console-spec.md`.
- **Avant et après.** Comparaison J0 contre remesure seulement si la version du panel et la liste des modèles sont identiques ; sinon l'écran affiche la différence et refuse le delta.

### 5.2 Par écran

| Écran Elmo | Améliorations OIA |
|---|---|
| Vue d'ensemble | Cartes avec intervalle et `n` ; badge « jour N sur 5 » ; « non mesurable » au lieu du tiret ; carte « exactitude des faits » (affirmations conformes, divergentes, non vérifiables face aux faits validés) ; carte « sources sociales citées » ; bloc « 3 recommandations SEO Command en attente » ; pied de méthode ; suppression des notes de couleur par seuil. |
| Visibilité | Bandeau sans conversion de `null` en 0 ; par question, « k sur n » et plage des jours ; repère de changement de modèle ; distinction marquée et non marquée affichée en deux chiffres séparés. |
| Part de voix | Erreur distincte du vide ; intervalle par entité ; rappel que le dénominateur dépend du nombre de concurrents suivis ; comparaison J0 contre remesure à concurrents identiques. |
| Sentiment | Score accompagné des effectifs bruts ; « non mesurable » sous 5 mentions ; lien vers les passages qui contredisent un fait validé. |
| Réponses | Filtre « affirmation fausse » relié aux faits validés ; affichage de l'échec quand une réponse manque ; badge API ou application ; version de modèle visible. |
| Fan-out | État « moteur sans recherches exposées » séparé de « aucune requête » ; part des requêtes qui visent un réseau social. |
| Citations | Écran « Social » dédié (forums, Reddit, YouTube, réseaux) ; part de citations avec `n` ; « non mesurable » si aucune réponse avec recherche web ; avant et après par domaine. |
| Opportunités | Remplacé par les recommandations SEO Command : preuve, risque, confiance, état (`pending`, `accepted`, `rejected`, `obsolete`), validation humaine ; date et modèle de génération affichés. |
| Détail d'une question | Historique jour par jour avec réussites et échecs ; texte de la question par version du panel ; faits attendus pour cette question. |
| Rapports | Rapport de fenêtre J0 et de remesure sur le panel complet, sans sélection des questions favorables. |
| Réglages | Lecture seule pour les membres ; modification par le propriétaire avec validation humaine ; journal des changements de panel. |
| Équipe, clés | Accès limité aux membres du client ; journal d'accès. |

---

## 6. Brief prêt à coller dans Lovable

Le bloc ci-dessous se colle tel quel. Il décrit le produit sous le nom OIA Visibility.

```text
PRODUIT : OIA Visibility
Tableau de bord de visibilité d'une marque dans les réponses des assistants IA.
Interface en français. Aucun logo ni nom de produit tiers.
Pile : React, Tailwind, shadcn/ui, Recharts. Données lues depuis des vues Supabase en lecture seule.

RÈGLES D'HONNÊTETÉ (valables sur tous les écrans)
1. Donnée fictive : badge « Exemple fictif » et fond hachuré sur la carte.
2. Indicateur inconnu : carte grise « Non mesurable » + raison
   (aucune réponse réussie, moteur en échec, recherche web désactivée, jugement absent).
   Jamais 0, jamais un tiret seul. Un montant inconnu suit la même règle.
3. Chaque pourcentage affiche son effectif : « 34 % (17 sur 50) ».
   n >= 30 : intervalle à 95 % entre crochets, libellé « intervalle de confiance 95 % ».
   n < 30 : plage observée sur les jours, libellé « plage observée, petit échantillon ».
4. Fenêtre de mesure de 5 jours. Moins de 5 jours mesurés : bandeau
   « Mesure en cours, jour N sur 5 » et variations masquées.
5. Pied de page fixe : « Mesure par API des fournisseurs. Un run par jour et par moteur.
   Langue du panel : {langue}. Panel v{version}. »
6. Changement de version de modèle dans la période : repère vertical sur les courbes
   et alerte en tête « Modèle modifié le {date} : {ancien} vers {nouveau} ».
7. La couleur indique un statut seulement (attendu, en cours, validé, alerte).
8. Un membre voit seulement les données de son client. Les boutons d'écriture
   apparaissent seulement pour les rôles propriétaire et approbateur, et demandent
   une double confirmation.

ÉTATS STANDARDS (à appliquer à chaque écran)
- Chargement : squelettes à la forme finale.
- Erreur : message court, bouton « Réessayer », code d'erreur. Jamais confondu avec le vide.
- Vide : explication et action suivante.
- Mesure en cours : bandeau jour N sur 5.
- Non mesurable : carte grise avec raison.

GABARIT
Barre latérale : Vue d'ensemble, Questions, Concurrents, Sentiment, Réponses,
Recherches web, Citations, Social, Recommandations, Avant / après, Rapports, Réglages, Équipe.
En tête de chaque écran : sélecteur de fenêtre (J0, remesure, jours), filtre moteur, filtre étiquette.

ÉCRAN 1 · VUE D'ENSEMBLE
But : situer la marque en dix secondes.
Contenu : 4 cartes (visibilité, part de voix, sentiment, position) avec valeur, effectif,
intervalle ou plage, mini-courbe ; carte « Exactitude des faits » (conformes, divergents,
non vérifiables) ; carte « Sources sociales citées » ; tableau entreprises x moteurs ;
bloc « Recommandations en attente » (3 premières).
Composants : Card KPI, Sparkline, Table triable, Badge de statut.
États : vide « Aucune question active : ajoutez un panel » ; mesure en cours ;
non mesurable par carte.
Données : vis_apercu_v1, vis_mesure_v1, vis_reseaux_sociaux_v1 (agrégé),
vis_recommandations_v1 (3 premières en attente). Exactitude des faits : hors version 1 du contrat.

ÉCRAN 2 · QUESTIONS
But : lire la visibilité question par question.
Contenu : liste avec texte, type (marquée, non marquée), dernière valeur « k sur n »,
courbe journalière sans valeurs inventées avant la première mesure, plage des jours,
compteur d'échecs.
Composants : liste virtualisée, LineChart, Select de tri, champ de recherche.
États : vide « Aucune question dans le panel » ; filtre sans résultat ;
carte de question « Première mesure en cours » ; « Non mesurable » si aucune réponse réussie.
Données : vis_questions_v1 (question_id, version_question, texte, marquee, etiquettes, moteur, jour,
reponses, reponses_jugees, avec_marque, etat).

ÉCRAN 3 · DÉTAIL D'UNE QUESTION
But : comprendre une question précise.
Contenu : onglets Mentions, Recherches web, Citations, Réponses ; faits attendus ;
historique jour par jour avec réussites et échecs.
États : par onglet, vide et non mesurable distincts.
Données : vis_questions_v1, vis_reponses_v1, vis_citations_v1, filtrés par question_id.

ÉCRAN 4 · CONCURRENTS
But : comparer la marque aux concurrents suivis.
Contenu : classement (rang, mentions, part, effectif, intervalle, nombre de questions),
anneau de répartition, courbe ; note « la part dépend du nombre de concurrents suivis ».
États : vide « Aucun concurrent suivi » ; non mesurable si aucune mention au total.
Données : vis_concurrents_v1 (entite, est_marque, mentions, denominateur_part, part_de_voix,
reponses_jugees, taux_apparition, borne_basse, borne_haute, questions).

ÉCRAN 5 · SENTIMENT
But : savoir comment les réponses décrivent la marque.
Contenu : score sur 100 et effectifs par classe (positif, neutre, mitigé, négatif) ;
passages cités par classe ; sentiment par question, du moins positif au plus positif.
États : non mesurable sous 5 mentions ; vide par classe « Aucun passage de cette classe ».
Données : hors version 1 du contrat (le sentiment n'est pas encore dans la table des preuves).
À construire avec l'état « Non mesurable : sentiment non collecté ».

ÉCRAN 6 · RÉPONSES
But : lire les réponses brutes.
Contenu : liste paginée (question, moteur, mode API ou application, version du modèle,
date, texte surligné, marques nommées, sentiment, affirmations comparées aux faits validés).
Les réponses en échec apparaissent avec leur cause.
Filtres : recherche, sentiment, « fait divergent », moteur, question.
États : vide ; recherche sans résultat ; erreur.
Données : vis_reponses_v1. Comparaison aux faits validés : hors version 1.

ÉCRAN 7 · RECHERCHES WEB
But : voir les recherches que lancent les moteurs.
Contenu : requêtes par question, requêtes les plus fréquentes, mots fréquents,
part des requêtes vers un réseau social.
États : « Moteur sans recherches exposées » distinct de « Aucune requête » ;
non mesurable si la recherche web est désactivée.
Données : hors version 1 du contrat (les requêtes des moteurs ne sont pas dans la table des preuves).

ÉCRAN 8 · CITATIONS
But : savoir quelles sources les moteurs citent.
Contenu : tuiles (part de la marque avec effectif, domaines uniques, total) ; catégories ;
domaines et pages les plus cités ; nouveaux et disparus ; questions où seuls les concurrents
sont cités.
États : non mesurable si aucune réponse avec recherche web ; vide.
Données : vis_citations_v1 (moteur, url, domaine, categorie, citations, reponses, questions,
premier_jour, dernier_jour) et vis_apercu_v1 (indicateur citation_marque).

ÉCRAN 9 · SOCIAL
But : suivre les sources sociales citées.
Contenu : plateformes (forums, Reddit par communauté, YouTube, réseaux), part dans les
citations avec effectif, questions concernées, liens.
États : vide « Aucune source sociale citée sur la fenêtre » ; non mesurable.
Données : vis_reseaux_sociaux_v1 (plateforme, communaute, url, citations, denominateur, part,
questions, moteurs).

ÉCRAN 10 · RECOMMANDATIONS
But : décider des actions.
Contenu : cartes triées (correction de fait et correctif technique en haut, veille en bas),
preuve, risque, confiance, état, auteur, date ; file des missions SEO Command, coût,
journal des actions ; planification affichée désactivée tant qu'elle est coupée.
Action : « Valider » ou « Rejeter » avec motif, double confirmation, propriétaire seulement.
États : vide « Aucune recommandation en attente ».
Données : vis_recommandations_v1, vis_seo_command_v1, vis_planificateur_v1.
Fonctions : vis_valider_recommandation, vis_rejeter_recommandation.

ÉCRAN 11 · AVANT / APRÈS
But : mesurer l'effet des actions.
Contenu : tableau J0 contre remesure par indicateur, avec effectifs et intervalles des deux
fenêtres. Le delta s'affiche seulement si panel et modèles sont identiques ; sinon
« Comparaison impossible » et liste des différences.
États : « Remesure à planifier » ; mesure en cours.
Données : vis_apercu_v1 sur les deux fenêtres, vis_mesure_v1 (version_panel, moteurs).

ÉCRAN 12 · RAPPORTS
But : télécharger les rapports de fenêtre.
Contenu : liste (type J0 ou remesure, date, version du panel, lien PDF).
États : vide ; génération en cours.
Données : vis_rapports_v1.

ÉCRAN 13 · RÉGLAGES (lecture)
But : vérifier ce qui est mesuré.
Contenu : marque, alias, domaines, concurrents, panel versionné et ses questions,
moteurs suivis avec mode d'accès, version et langue, cadence.
États : lecture seule pour les membres.
Données : vis_sujets_v1, vis_mesure_v1. Concurrents suivis et alias : hors version 1.

ÉCRAN 14 · ÉQUIPE
But : voir qui accède aux données du client.
Contenu : membres, rôle, date d'arrivée.
Données : hors version 1 du contrat (une fonction dédiée listera l'équipe).
```

---

## 7. Correspondance avec le contrat de données

Le contrat `docs/interface/contrat-donnees-visibility.md` (version 1) fixe les
vues réelles, leurs colonnes et leurs états. Il fait foi. Toutes les vues sont
en lecture seule et ne rendent que les lignes des clients dont l'utilisateur
connecté est membre (`auth.uid()` et `vis.client_member`). Les écritures
passent par `vis_valider_recommandation` et `vis_rejeter_recommandation`,
réservées aux rôles propriétaire et approbateur.

| Écran OIA (équivalent dans l'inventaire) | Vues du contrat, version 1 |
|---|---|
| Vue d'ensemble (Overview) | `vis_apercu_v1`, `vis_mesure_v1`, `vis_recommandations_v1` |
| Bandeau de mesure et pied de méthode (tous écrans) | `vis_mesure_v1` |
| Questions (Visibility) | `vis_questions_v1` |
| Détail d'une question (Prompt detail) | `vis_questions_v1`, `vis_reponses_v1`, `vis_citations_v1` filtrés par `question_id` |
| Concurrents (Share of Voice) | `vis_concurrents_v1` |
| Sentiment (Sentiment) | hors version 1 |
| Réponses (Responses) | `vis_reponses_v1` |
| Exactitude des faits (absent de l'inventaire) | hors version 1 |
| Recherches web (Query Fan-Out) | hors version 1 |
| Citations (Citations) | `vis_citations_v1` |
| Social (carte Reddit, catégorie social) | `vis_reseaux_sociaux_v1` |
| Recommandations (Opportunities) | `vis_recommandations_v1` |
| SEO Command (absent de l'inventaire) | `vis_seo_command_v1`, `vis_planificateur_v1` |
| Avant et après (Recent Changes, variation) | `vis_apercu_v1` sur deux fenêtres, `vis_mesure_v1` |
| Rapports (Reports) | `vis_rapports_v1` |
| Réglages (Brand, Competitors, Prompts) | `vis_sujets_v1`, `vis_mesure_v1` |
| Moteurs (LLMs) | `vis_mesure_v1` (`moteurs`, `versions_modele`, `collecteurs`) |
| Équipe (Team) | hors version 1 |
| Coûts (usage_events, Billing) | `vis_mesure_v1` (`cout_estime_usd`), `vis_seo_command_v1` (`cout_usd`) |

Les écrans « hors version 1 » s'affichent avec l'état « Non mesurable » et sa
raison, jamais avec des chiffres inventés. Les ajouter sera un changement
compatible du contrat.

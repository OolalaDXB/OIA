# Étape 0 : état des lieux (5 novembre 2026)

## 0. Où ce rapport a été produit

Ce rapport a été produit dans une **session cloud Claude Code** (conteneur Linux
x86_64), **pas sur le Mac Studio**. Je n'ai aucun accès au Mac. Les points
propres à la machine (versions de Docker et de Node sur le Mac, ports occupés,
mise en veille) ne sont donc **pas encore relevés**. Le script
`scripts/preflight.sh`, en lecture seule, les produit. Il est à lancer sur le Mac
et sa sortie est à me renvoyer.

```bash
cd infra/visibility && ./scripts/preflight.sh
```

Tout le reste a été vérifié depuis la session cloud : registres d'images, code
source et documentation des trois outils aux tags épinglés.

## 1. Machine

| Élément | Mac Studio | Conteneur de test (cloud) |
|---|---|---|
| Architecture | **à relever** (`preflight.sh`), attendu arm64 | x86_64 |
| Docker / Compose | **à relever** | 29.9.2 |
| Node | **à relever** (Crawlie demande Node ≥ 18) | 22.23.4 |
| Ports 1515, 3000, 3100, 5432 à 5435 | **à relever** | — |

Ma configuration ne publie que 1515 et 3100 sur l'hôte (127.0.0.1). Aucun
Postgres n'est publié, si bien que l'occupation éventuelle de 5432 par un autre
service ne bloque rien.

## 2. Images arm64 : disponibles, on peut continuer

Les index multi-architecture ont été inspectés le 5 novembre 2026. Chaque image
contient **linux/arm64** et linux/amd64.

| Image (épinglée par tag + digest d'index) | Digest |
|---|---|
| `elmohq/elmo-web:0.7.7` | `sha256:684fc310…a7fe6b` |
| `elmohq/elmo-worker:0.7.7` | `sha256:c185639c…4738c9` |
| `elmohq/elmo-db-migrate:0.7.7` | `sha256:eb8bef5f…3a8db1` |
| `postgres:18-alpine` (Elmo) | `sha256:eaef288f…36` |
| `ghcr.io/crawlseo/crawlseo:0.3.6` | `sha256:51c6af82…f384` |
| `postgres:16-alpine` (CrawlSEO) | `sha256:e0e53cfa…973093` |
| Crawlie 0.5.3 (npm) | binaire `@spronta/crawlie-darwin-arm64@0.5.3` publié |

Les digests complets figurent dans `elmo/compose.yaml` et `crawlseo/compose.yaml`.
Aucune étiquette `latest` n'est utilisée.

Côté Elmo, la CI (`publish.yaml`) construit l'arm64 nativement, sur un runner
arm, et non par émulation.

## 3. Elmo : clés exigées et couverture de Gemini et Perplexity en mode API

Sources : `packages/docs/content/docs/developer-guide/configuration.mdx` et
`user-guide/providers.mdx` au tag v0.7.7, recoupés avec le code
(`packages/config/src/scrape-targets.ts`, `packages/lib/src/providers/registry/`).

### Jev (juge des mentions et du sentiment)

- **Une seule clé suffit, au choix** : `TYPESAFE_API_KEY` (direct chez TypeSafe)
  **ou** `OPENROUTER_API_KEY` (Jev 1.13 via OpenRouter, facturé sur le compte
  OpenRouter).
- Si les deux sont présentes, TypeSafe l'emporte. Il n'y a jamais de bascule
  automatique de l'une vers l'autre.
- **Le worker ne démarre pas sans l'une des deux.**
- Coût indiqué par la doc : environ 0,15 à 0,35 $ pour 1 000 réponses, et
  seulement pour les réponses qui citent une entreprise suivie.
- Il faut **en plus** une clé LLM directe (OpenAI, OpenRouter, Anthropic ou
  Mistral) pour l'onboarding de marque et l'assistant de prompts, même si
  toutes les cibles sont en API.

### Gemini et Perplexity en mode API

Elmo n'a **aucun connecteur direct Google Gemini ni Perplexity**. Ses
connecteurs API directs sont OpenAI, Anthropic, Mistral et OpenRouter. En mode
API, ces deux moteurs passent donc **par OpenRouter** :

| Moteur | Cible API (recherche web activée) | Remarque |
|---|---|---|
| Gemini | `gemini:openrouter:google/gemini-2.5-flash:online` | `:online` déclenche la recherche native de Google via OpenRouter (`plugins: [{id:"web", engine:"native"}]`) |
| Perplexity | `perplexity:openrouter:perplexity/sonar:online` | Le moins cher (1 $/M tokens + 0,005 $/requête). `perplexity/sonar-pro-search` coûte environ 7 fois plus |
| ChatGPT (modèle) | `chatgpt:openai-api:gpt-6-luna:online` ou via OpenRouter | API Responses avec l'outil web_search |
| Claude | `claude:anthropic-api:<modèle>:online` ou via OpenRouter | Outil web_search d'Anthropic |

- La seule autre voie pour Gemini et Perplexity est DataForSEO, avec un modèle
  épinglé (API « LLM Responses »). DataForSEO est **d'abord un prestataire de
  scraping** : je l'écarte pour respecter la règle « API uniquement ».
- Limite : par OpenRouter, Elmo **ne récupère pas les requêtes de fan-out**
  (tableau « Query fan-out » de la doc). Les réponses et les URL citées sont bien
  stockées.
- Rappel de la doc : l'API ne reproduit pas l'interface grand public
  (ChatGPT, AI Mode). C'est le choix assumé du mandat.

## 4. Écarts entre la documentation et la réalité, déjà constatés

| # | Outil | Constat | Traitement |
|---|---|---|---|
| 1 | Elmo | Le compose généré par `elmo init` publie Postgres sur **`5432:5432`, toutes interfaces**, avec le mot de passe en dur **`postgres`** (`apps/cli/src/compose.ts`, `init.ts`). La doc ne le signale pas. | Je n'utilise pas `elmo init`. Mon compose est écrit à la main, avec les mêmes images et services : Postgres non publié, mot de passe généré, web sur 127.0.0.1:1515 |
| 2 | Elmo | Créer ou réactiver un prompt **lance un run immédiatement** (`sendImmediate` vaut true par défaut). La doc n'en parle pas. | Le worker reste arrêté jusqu'à la validation (README) |
| 3 | Elmo | Sans `SCRAPE_TARGETS`, le worker s'arrête sur `Missing required environment variable: SCRAPE_TARGETS`, avant même de vérifier la clé Jev | Utile comme verrou supplémentaire avant J0 |
| 4 | Elmo | `RUNS_PER_PROMPT` vaut **5** par défaut (5 échantillons par run), alors que le mandat demande 1 run par jour | `RUNS_PER_PROMPT=1` et `DEFAULT_DELAY_HOURS=24` dans `.env.example` |
| 5 | Elmo | L'intervalle de 24 h court **à partir de la fin du run précédent** : l'heure du run glisse un peu chaque jour | À consigner dans le journal J0 |
| 6 | CrawlSEO | Le `docker-compose.yml` amont utilise `:latest`, le port 3000 et Postgres `127.0.0.1:5432`, avec le mot de passe par défaut `changeme` | Compose épinglé, port 3100, Postgres non publié, aucun mot de passe par défaut (compose refuse de démarrer sans) |
| 7 | CrawlSEO | `NEXTAUTH_SECRET` sert aussi de **clé de chiffrement** des jetons Google (AES-256-GCM, `lib/encryption.ts`) | Noté dans SECRETS.md ; vérifié par `verify-restore.sh` |
| 8 | Crawlie | Au tag v0.5.3, `npm/package.json` du dépôt indique encore **0.2.1**, alors que le registre npm publie bien 0.5.3 | J'épingle sur le registre (`npx crawlie@0.5.3`) |
| 9 | Crawlie | Le README parle d'un « crawl whole site », mais `--max-pages` vaut 500 par défaut | `--max-pages 5000` dans `crawlie-audit.sh` |

## 5. Ce qui a été réellement testé (conteneur cloud amd64, sans clé API)

| Test | Résultat |
|---|---|
| Pull des images Elmo et Postgres 18 par digest | OK |
| Pull de l'image CrawlSEO (ghcr.io) | **Non testé** : le réseau de la session cloud bloque le stockage de blobs de GHCR. Aucun impact sur le Mac. |
| `init-env.sh` : génération des secrets, droits 600, refus d'écraser un `.env` existant | OK |
| Elmo `postgres` + `db-migrate` (exit 0, 41 tables) + `web` (HTTP 307 sur 127.0.0.1:1515) | OK |
| Postgres Elmo non publié sur l'hôte | OK (`5432/tcp` interne seulement) |
| `backup.sh` (Elmo) : dump `-Fc`, MANIFEST, SHA256SUMS, refus d'un dossier situé dans le repo | OK |
| `restore.sh` dans une installation séparée (`-restoretest`, volume distinct) | OK : données présentes, web répond |
| `restore.sh` sur une base non vide | Refus, comme prévu |
| `verify-restore.sh`, clé Elmo identique / différente | « 1 sous la clé courante » (rc 0) / « 1 sous une autre clé » (rc 1) |
| Contrôle de déchiffrement des jetons Google (logique isolée, NEXTAUTH_SECRET bon / mauvais) | 2 déchiffrables (rc 0) / 2 illisibles (rc 1) |
| Crawlie `npx crawlie@0.5.3 --version` | OK |

**Il reste à faire sur le Mac** : tout ce qui touche à CrawlSEO (démarrage,
OAuth Google, Search Console), le test réel de sauvegarde et de restauration
avec de vrais jetons Google, et les crawls Crawlie.

## 6. Ce qui est bloqué depuis la session cloud

- **Le Mac** : aucun accès. L'installation, les runs J0, la connexion Google et
  les crawls doivent se faire sur le Mac, par vous ou par une session Claude Code
  lancée sur le Mac.
- **coachgari28.com et maisons.co** ne sont pas joignables depuis cette session
  (politique réseau). Je n'ai donc pas pu lire les sites pour les panels :
  `PANELS-PROPOSITION.md` part des fiches `registry/projects/*.yaml` du repo, qui
  sont encore en statut DRAFT.
- **Assistant de prompts d'Elmo** : il tourne dans l'Elmo installé, avec une clé
  LLM. Sa proposition s'obtiendra sur le Mac, une fois Elmo web démarré (worker
  arrêté).

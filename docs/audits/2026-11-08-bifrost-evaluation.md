# Évaluation de Bifrost pour Souffleur / routage (P4) · 2026-11-08

**Statut : évaluation documentaire, rien d'installé, rien d'exécuté.**
Session web sans démon Docker (`docker info` : socket absente). L'évaluation
se limite donc à la documentation, à la licence et au code, comme prévu par la
consigne de session. Elle tient lieu de première partie de l'audit de la
chaîne d'approvisionnement exigé par la roadmap (P4, règle d'installation des
candidats) ; la seconde partie demande Docker (voir « À lever »).

## Objet lu

| Élément | Valeur |
|---|---|
| Dépôt | `github.com/maximhq/bifrost`, clone superficiel en lecture seule, hors du dépôt OIA, rien de compilé ni lancé |
| Commit lu | `6e640279b36337820f2088fb85f6e78f339063c3` (branche par défaut, 2026-11-07) |
| Dernière version de la passerelle | tag `transports/v2.5.0` (objet `be8a21a7`, commit `69f4d56d`), publiée le 2026-11-06 |
| Image correspondante (Docker Hub, relevée le 2026-11-07) | index `sha256:b5258c5f11c79064fc8280e49513f54c0b1da81c78bd11d3b4c1f62f8926d1ab` ; amd64 `sha256:27ae3ccb0e5c7fb81d1c8a6b6a2b55a71486295534a154ece20fa7c26e96f9fb` ; arm64 `sha256:445bc49544bc64971b63581a93c6ca5716a03ccf27a58ced4c285cbafc133e78` |

Épinglage à utiliser si l'essai est validé : `maximhq/bifrost:v2.5.0@sha256:b5258c5f…26d1ab`,
jamais `latest`. Cadence de publication rapide (environ une version par
semaine) : chaque montée de version demande un nouvel audit.

## 1. Licence

- **Apache-2.0** à la racine (`LICENSE`, « Copyright 2025 H3 Labs Inc. »), seul
  fichier de licence du dépôt. Aucun CLA.
- `THIRD_PARTY_NOTICES.md` : du MPL-2.0 non modifié compilé dans le binaire
  (`hashicorp/go-version`, une partie de `cyphar/filepath-securejoin`) ; code
  dérivé de gormigrate (MIT). Le fichier se déclare lui-même incomplet.
- **Modèle open-core.** Le code Enterprise n'est pas dans le dépôt ; l'interface
  publique compile des écrans de remplacement (`ui/app/_fallbacks/enterprise/`).
  - Ouvert : clés virtuelles, budgets et limites de débit par clé, équipe,
    client et configuration de fournisseur ; replis ; répartition pondérée ;
    règles de routage CEL ; Prometheus et OpenTelemetry ; passerelle MCP ;
    chiffrement des secrets.
  - Payant (`docs/enterprise/overview.mdx`) : RBAC, contrôle d'accès aux
    données, périmètre « Projects », garde-fous et masquage des données
    personnelles, journaux d'audit, export des journaux, haute disponibilité,
    routage adaptatif, coffre de secrets (Vault), SSO.

Compatible avec un usage interne d'OIA. Les fonctions qui touchent au
cloisonnement fin (droits d'administration, visibilité des journaux) sont
payantes.

## 2. Architecture

Go (modules `core`, `framework`, `plugins/*`, `transports`). Un binaire HTTP
(`transports/bifrost-http`) qui embarque l'interface web. `config.json` sert
d'amorçage ; l'état vit ensuite en base : SQLite par défaut (`config.db`,
`logs.db`), Postgres en option.

## 3. Fonctions face aux besoins de P4

| Besoin P4 | Bifrost (version ouverte) |
|---|---|
| Fournisseurs OIA : OpenAI, Anthropic, Mistral, Gemini, OpenRouter, Ollama | Tous présents (`core/providers/`) |
| Routage par tâche, projet, fournisseur, sensibilité | Règles CEL par clé virtuelle, équipe, client ou global, sur en-têtes et paramètres (`docs/providers/routing-rules.mdx`). Le périmètre « Project » est payant : un projet OIA se modélise par une clé virtuelle ou une équipe |
| Replis explicites et testés | Replis pondérés automatiques ; à tester en exécution |
| Budgets, limites de débit, arrêt automatique | Oui, hiérarchiques ; la requête est bloquée quand un budget est épuisé. État non synchronisé entre plusieurs nœuds (sans objet pour un seul Mac Studio) |
| Secrets centralisés | Oui, mais **en clair dans `config.db` si `BIFROST_ENCRYPTION_KEY` est absent** (`framework/encrypt/encrypt.go`), sel fixe, clé non changeable ensuite |
| Registre des versions de modèles | Catalogue de modèles et prix synchronisé depuis getbifrost.ai |
| Journal des métadonnées, données sensibles limitées | **Contenu des requêtes et réponses journalisé par défaut** (`EnableLogging: true`, `DisableContentLogging: false`, `transports/bifrost-http/lib/config.go`), rétention 365 jours. `disable_content_logging: true` ne garde que les métadonnées, à poser pour chaque destination |
| Coût, latence, erreurs | Prometheus (étiquettes par clé, équipe, client), OpenTelemetry |
| Deux applications isolées (porte P4) | Budgets, limites et journaux filtrables par clé virtuelle : oui. Droits d'administration et visibilité des journaux cloisonnés : non (un seul administrateur, RBAC payant) |

## 4. Appels sortants par défaut (télémétrie)

Aucun SDK d'analyse (PostHog, Sentry, Segment, Mixpanel) trouvé. En revanche,
des appels vers l'éditeur partent par défaut :

- `https://getbifrost.ai/datasheet` et `/datasheet/model-parameters`, toutes
  les 24 h (`framework/modelcatalog/datasheet/store.go`). L'adresse se change,
  y compris en `file://` ; aucune option trouvée pour couper la
  synchronisation.
- `https://getbifrost.ai/mcp-library` : coupable (`mcp_library_sync_interval: 0`).
- Flux RSS « Bifrost Announcements » actif par défaut
  (`framework/configstore/rssfeeds.go`), coupable par `rss_news_enabled`.
- CLI annexe : vérification de mise à jour toutes les 24 h vers
  `downloads.getmaxim.ai` (`cli/internal/update/check.go`).
- Interface : l'éditeur Monaco semble chargé depuis `cdn.jsdelivr.net` (non
  confirmé sans exécution).

## 5. Chaîne d'approvisionnement

- Images `docker.io/maximhq/bifrost` (miroir `ghcr.io`) ; images de base
  épinglées par empreinte, utilisateur non root, contrôle de santé.
- Intégration continue de publication durcie (actions épinglées par SHA,
  sorties réseau bloquées).
- **Ni signature cosign, ni SBOM publiés.** L'index multi-architecture est
  recréé par `docker manifest create`, ce qui fait probablement perdre les
  attestations de provenance au niveau de l'index.
- Binaires sur `downloads.getmaxim.ai` avec des `.sha256` servis par le même
  hôte : pas une vérification indépendante.
- Paquet npm `@maximhq/bifrost` publié avec provenance ; il télécharge le
  binaire et vérifie l'empreinte. Pas de script `curl | sh`.
- Dépendances Go directes : 33 (core), 40 (framework), 44 (transports).
  `mark3labs/mcp-go` remplacé par un **fork de l'éditeur** (`maximhq/mcp-go`)
  en pseudo-version ; d'autres pseudo-versions (`bytedance/sonic`,
  `prometheus/client_golang`).
- `SECURITY.md` : canal de signalement présent, tableau des versions
  supportées obsolète (1.4.x pour une 2.5.0).

## 6. Réglages par défaut à risque

1. Authentification de l'administration **désactivée par défaut**.
2. Image Docker à l'écoute sur `0.0.0.0` (`transports/Dockerfile`, ligne 70) :
   avec l'authentification coupée, un port publié expose l'API
   d'administration.
3. `allowed_origins: ["*"]`.
4. Contenu des échanges journalisé 365 jours.
5. Secrets en clair sans clé de chiffrement.

## Verdict

**Candidat sérieux, non retenu à ce stade, essai possible sous conditions.**
Licence et couverture fonctionnelle conviennent ; tous les fournisseurs d'OIA
sont pris en charge ; budgets et coupure automatique couvrent le besoin de
P4. Trois points pèsent contre une adoption directe : réglages par défaut peu
sûrs, appels sortants vers l'éditeur, absence de signature et de SBOM. Le
cloisonnement fin (RBAC, journaux par équipe) est payant, ce qui compte pour
la porte P4 (« sans fuite entre projets ») dès qu'un tiers y accède.

Rien ne remet en cause la règle de la roadmap : `packages/providers` garde
les contrats métier et les extractions structurées ; une passerelle se place
devant, sans les remplacer.

Conditions d'un essai local (P4, pas avant) :

- image épinglée `v2.5.0@sha256:b5258c5f…` (ou version ultérieure ré-auditée) ;
- port lié à `127.0.0.1` seulement, authentification activée,
  `BIFROST_ENCRYPTION_KEY` fourni hors dépôt ;
- `disable_content_logging: true`, synchronisations pointées vers des fichiers
  locaux, RSS et bibliothèque MCP coupés ;
- réseau sortant limité aux fournisseurs d'IA retenus ;
- comparaison avec LiteLLM et Portkey sur la même grille avant tout choix.

## À lever avec Docker (seconde partie de l'audit)

- Liste réelle des connexions sortantes au démarrage, et fonctionnement sans
  accès à getbifrost.ai (synchronisations en `file://`).
- Attestations présentes ou non sur l'index :
  `docker buildx imagetools inspect --format '{{json .Provenance}}' maximhq/bifrost:v2.5.0`.
- Analyse de vulnérabilités de l'image (Trivy ou Grype).
- Contenu réel de `logs.db` avec `disable_content_logging: true`.
- Exposition de `/metrics` sans authentification.
- Essais de repli et de coupure budgétaire sur deux clés virtuelles.

# Rapport du mandat de jour · 2026-11-07 · T1 à T6

Exécuté sans attendre de clarification (consigne du mandat). Chaque
question restée ouverte est listée en bas, dans « Questions pour
Mickaël ». Enchaîne sans pause sur le mandat de correctifs sécurité (S1
à S5) dans un rapport séparé.

## T1 · Préparation J0 Coach Gari (5 moteurs, Mistral inclus)

Fait :

- **Mistral ajouté** dans `subjects/coach-gari/measurement.yaml`. Les cinq
  moteurs activés : `chatgpt, claude, gemini, perplexity, mistral`.
- **Identifiants vérifiés sur les docs officielles** le 2026-11-07 :
  - `gpt-6-luna` (OpenAI, sortie 2026-09-22) : vérifié
    (openai.com/index/introducing-gpt-6-sol-and-luna et pricing).
  - `claude-haiku-5-5` (Anthropic, sortie 2026-10-07) : vérifié
    (platform.claude.com).
  - `mistral-medium-latest` + Conversations API `web_search` : vérifié
    (docs.mistral.ai).
  - `perplexity/sonar` (OpenRouter) : vérifié (openrouter.ai).
  - `google/gemini-2.5-flash` (OpenRouter) : **déprécié par Google le
    2026-11-02**, cinq jours avant J0. Alternative : `google/gemini-3-flash`.
- **Modèles alternatifs « plus proches de l'app » documentés** dans
  `FOURNISSEURS.md` § 0 ter :
  - Claude : Sonnet 4.6 (défaut Free/Pro de Claude.ai) à 3 $/15 $ par M,
    Opus 4.7 (plan Max) à 5 $/25 $ par M.
  - Gemini : Gemini 3 Flash (défaut app Gemini) à 0,50 $/3 $ par M
    (OpenRouter). Cette alternative est **recommandée** pour J0, à
    acter par Mickaël.
- **Volumétrie recalculée** : 10 × 5 × 5 = **250 appels fournisseurs**,
  coût estimé **1 à 2 $ / fenêtre** avec les modèles retenus, large marge
  face au plafond 30 $. Même en basculant Claude sur Sonnet 4.6 et
  Gemini sur 3 Flash, la fenêtre reste sous 15 $.
- **Script de chargement du panel dans Elmo** (`scripts/load-panel.ts`) :
  dry-run par défaut (impression des POST `/brands`, `/competitors`,
  `/prompts`), avec option `--json` ; refuse la bascule « pour de vrai »
  (règle P1 : aucune écriture automatique dans Elmo). Testé sur
  `coach-gari` : 1 POST `/brands`, 4 POST `/competitors`, 10 POST
  `/prompts`.
- **Runbook J0** : `reports/runbook-j0.md`. Décrit les 9 étapes depuis
  l'ouverture des comptes Mickaël jusqu'à l'arrêt du worker au cinquième
  jour, avec les commandes, les contrôles (`cost-guard.sh`), les règles
  de sécurité (ne jamais exporter `ANTHROPIC_API_KEY` dans le shell) et
  la mémoire Docker recommandée (6 Go Docker Desktop).

Tests : 194 tests passent (`pnpm --filter @oia/visibility-infra test`).

## T2 · Modèle de vérification en données (YAML)

Fait :

- **13 fichiers YAML** dans `infra/visibility/verification/`, un par
  famille (A à M), au total ~80 contrôles.
- **Schéma + loader** : `src/verification.ts` (Zod). Un contrôle `auto`
  ou `mixte` doit nommer un outil non manuel (contrainte vérifiée par
  Zod) ; sinon l'intérêt par rapport au document source disparaît.
- **CLI** : `pnpm --filter @oia/visibility-infra subjects verifications
  [--family X] [--tool T] [--subject <id>]`. Exemple :
  `verifications --family H` renvoie les 8 contrôles H01-H08 (Elmo,
  panel, manuel), filtrables par outil.
- **Intégration site-init** (`src/site-init.ts`) : `dryRunSiteInit`
  renvoie maintenant `checks: [...]` filtré par `applicableChecks`
  (A09 seulement si relation externe, B10 seulement si multilingue).
- **Intégration SEO Command** (`src/seo-command/executor.ts`) :
  `resolveCheckIds(mission, tool)` donne les IDs couverts par l'outil
  pour la mission, et lève si `mission.checkIds` demande un contrôle
  hors couverture. `mission.ts` reçoit le champ `checkIds: string[]`.
- **Tests** : `test/verification.test.ts` (10 tests ajoutés) :
  13 familles présentes, IDs uniques, chaque ID du document d'origine
  (`agents/modele-verification-compte.md`) existe dans le YAML,
  applicabilité A09/B10, résolution SEO Command (vide / intersection /
  refus hors couverture).

Point technique : un contrôle `B01` (versions `www.` et bare) a
basculé de l'outil `manuel (curl)` à `oia` dans la forme données, parce
qu'un contrôle auto doit avoir un outil non manuel. C'est fidèle à la
réalité : le script est côté OIA (`curl -sIL`), pas une inspection à
l'œil.

## T3 · Exigences SEO pour la refonte de Maisons.co

Fait :

- `subjects/maisons-co/refonte-exigences-seo.md` : un document de dix
  sections, de B01 (hôte canonique unique) à M03 (garde-fou SEO CI),
  avec les critères d'acceptation pour passer de « en attente » à « prêt
  à mesurer » (§10).
- **Plan de redirections 301** : 24 lignes groupées par canonique
  (généré depuis `audits/2026-11-08/crawlie.json`, 68 pathnames uniques,
  237 URL crawlées). Groupes : `/concierge/*`, `/collection/*`, maisons
  (arabia, atlantique, georgia) en trois langues (FR, EN, RU), démos
  exclues. Les cibles sont proposées, à arbitrer par le propriétaire du
  site.
- **Panel Maisons.co passé en `status: paused`** dans `subject.yaml`
  (avec note « en attente de la refonte »). La fenêtre J0 ne démarrera
  qu'après l'atteinte des critères §10.

Lecture rapide des constats qui pilotent le document : score GEO Crawlie
0 / 100, 236 pages canonicalisées vers un autre hôte (crawl sur `www.`,
canonical vers bare), 190 titres dupliqués, 181 descriptions dupliquées,
6 liens cassés, 236 champs sans étiquette.

## T4 · Le cadre de Shyrka

Fait :

- `docs/shyrka/DOCTRINE.md` renommé en `docs/shyrka/CADRE.md` via
  `git mv` (historique conservé).
- **Contenu réécrit** (`docs/shyrka/CADRE.md`, v1 au 2026-11-07, signé
  Mickaël Thomas) : liste courte, modifiable, portant les décisions
  prises par Mickaël.
  - Identité évolutive, version 0 : présence en points, voix Aurélie en
    référence, Chatterbox candidate, aucune voix activée.
  - Permissions fixées et élargies par Mickaël seul, sans limite ;
    Shyrka ne s'en accorde jamais.
  - Données de Mickaël entrent ; Swift et ses clients non.
  - Voix de Mickaël jamais de son vivant ; autorisée après son décès
    selon ses directives écrites.
  - Visages : mélanges libres, aucune ressemblance reconnaissable.
  - E-mails et WhatsApp en son nom par paliers ; téléphone plus tard,
    en se présentant comme son assistante.
  - Humeurs reliées à un travail concret, jamais sans objet.
  - Benchmarks : avec accord écrit, agrégés et anonymisés, trois
    clients minimum, fourchettes, modèles réécrits, usages déclarés en
    CGV.

## T5 · Roadmap 3.4

Fait :

- `docs/roadmap-oia-shyrka-souffleur.md` passe en **version 3.4**,
  ligne d'historique ajoutée, Mermaid actualisé (P8 devient « Voix,
  présence, Ollama », P9 reçoit l'atelier d'identité, P0 renvoie à
  CADRE.md, un nœud « Chantier Espace personnel » apparaît après P1).
- **P8** reçoit trois chemins (prototype local son + Ollama local texte
  + expérience avancée distante), la présence et la personnalité, et
  l'identité évolutive (versioning).
- **P9** reçoit l'atelier d'identité de Shyrka (produit la version
  suivante de l'identité, consignée dans CADRE.md).
- **Chantier « Espace personnel » (Agenda, Santé, Famille)** ajouté
  dans « En parallèle et en attente », strictement séparé des modules
  professionnels, démarre par un audit en lecture seule après le
  lancement de J0.
- **P6** réécrit pour acter l'absence de serveur MCP existant dans
  OolalaDXB (voir T6). Part de zéro.
- **Toutes les décisions approuvées renvoient à `docs/shyrka/CADRE.md`.**

Vérification Mermaid : les deux blocs `mermaid` sont syntaxiquement
valides (ouverture, nœuds déclarés, flèches `-->`, `-.->`, `==>`). Rendu
à confirmer dans le lecteur Markdown de Mickaël.

## T6 · Clôture de l'inventaire I1

Fait :

- `docs/audits/2026-11-08-souffleur-mcp.md` **clos le 2026-11-07** avec
  une nouvelle section « Clôture I1 · aucun serveur MCP dans les dépôts
  d'OolalaDXB ». Dépôts couverts : `studiomt-platform`, `TheStudioMT`,
  les trois dépôts `myOolala*`, et `mcp-studio-mt`. Aucun contient de
  dossier `mcp-server*`, de manifeste `mcp.json` ou de code outil MCP
  compatible.
- **Conséquence pour P6** : part de zéro, aucun code à reprendre.
  `souffleur.py` reste disponible localement (`~/souffleur/`) comme
  moteur d'audit après lecture par Mickaël.

## Tests et vérifications

- `pnpm --filter @oia/visibility-infra test` : **194 tests passent**
  (24 fichiers).
- `pnpm --filter @oia/visibility-infra subjects validate` : **2 sujets
  valides** (coach-gari en v2 validated, maisons-co en v1 draft).
- `pnpm --filter @oia/visibility-infra subjects elmo-brief coach-gari`
  et `scripts/load-panel.ts coach-gari` : production du brief et du
  plan d'appels à Elmo (15 appels), sans aucun appel réel.

## Ce qui n'a pas été touché

- `apps/web`, `apps/visibility-console`, `apps/workers` : intacts.
- `knowledge/generated/solution-2026-08-14.md` : intacte.
- `infra/visibility/elmo/.env` : non lu, non modifié.
- Aucun dépôt client (CoachGari, Maisons.co, etc.) : lecture seule.
- Elmo : ne démarre pas, aucun run, aucune question créée.

## Questions pour Mickaël

Toutes les questions sont consignées ici pour éviter de bloquer le flux.
Les réponses conditionnent les prochaines étapes.

1. **Gemini en J0 : bascule `google/gemini-2.5-flash` → `google/gemini-3-flash` ?**
   Recommandation : oui, parce que `gemini-2.5-flash` a été déprécié
   par Google le 2026-11-02 et parce que Gemini 3 Flash est ce que voit
   l'app Gemini. Surcoût estimé : 1 à 3 $ sur la fenêtre, large marge.
2. **Claude en J0 : rester sur Haiku 5.5, ou basculer sur Sonnet 4.6 /
   Opus 4.7 ?** Rester sur Haiku garde le coût minimal ; Sonnet 4.6 est
   le modèle par défaut vu par un utilisateur Claude.ai Free ou Pro.
   Surcoût Sonnet : ≈ 5 $ par fenêtre ; Opus : ≈ 9 $.
3. **Clé Mistral dédiée `oia-visibility`** : à créer dans le compte
   Mistral de Mickaël, pour séparer les dépenses d'OIA Visibility de
   celles d'OIA Funding. Ce n'est pas une question bloquante, juste une
   demande de configuration avant J0.
4. **Recharge automatique désactivée** chez OpenAI, Anthropic, Mistral
   et OpenRouter : à confirmer avant d'ouvrir la première clé.
5. **Robots des IA dans `robots.txt` de la refonte Maisons.co** :
   recommandation OIA = autoriser les robots qui citent
   (`OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`) et refuser les
   robots d'entraînement (`GPTBot`, `Google-Extended`). À arbitrer par
   le propriétaire du site.
6. **Chantier Espace personnel** : qui a accès (Mickaël seul, ou aussi
   Shyrka en permission « Analyse » ?), et quelles sources sont dans
   le périmètre de l'audit en lecture seule (iCloud Famille, Agenda
   macOS, Santé Apple, autres) ?

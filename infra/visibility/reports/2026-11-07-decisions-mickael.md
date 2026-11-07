# Rapport · 2026-11-07 · Décisions de Mickaël (suite du mandat de jour)

Suite des « Questions pour Mickaël » de `2026-11-07-mandat-jour.md`.
Aucun appel payant, worker d'Elmo arrêté (image worker même pas présente
localement), aucune question chargée, `elmo/.env` ni lu ni modifié.

## 1 · Ce qu'Elmo 0.7.7 sait appeler (fournisseur et modèle)

Source lue : `github.com/elmohq/elmo`, tag `v0.7.7`, commit `5e76f422`
(identique à l'épinglage de `elmo/compose.yaml`), cloné en lecture seule
hors du dépôt. Chemins ci-dessous relatifs à ce dépôt.

**Niveau fournisseur.** Fournisseurs directs : `openai-api`,
`anthropic-api`, `mistral-api`, rien d'autre
(`packages/lib/src/providers/index.ts:28-40`). Aucun fournisseur Google,
Perplexity ou xAI : ces moteurs ne passent que par `openrouter`.

**Niveau modèle.** Elmo ne tient aucune liste des modèles acceptés : il
exige un identifiant (`packages/lib/src/providers/config.ts:87-94`) et le
passe tel quel à l'API (`openai-api.ts:107-109`, `anthropic-api.ts:104-106`,
`mistral-api.ts:89-98`, `openrouter.ts:101-118`, dans
`packages/lib/src/providers/registry/`). Un identifiant faux n'est donc
refusé qu'au premier appel, par le fournisseur. Les couples testés
régulièrement par Elmo sont dans `packages/config/src/scrape-targets.ts:66-128`.

| Moteur | Accès Elmo | Modèle retenu | Le modèle passe-t-il dans Elmo ? | Statut |
|---|---|---|---|---|
| chatgpt | direct (`openai-api`) | `gpt-6-luna` | oui, couple testé par Elmo (`scrape-targets.ts:107-108`) | retenu |
| claude | direct (`anthropic-api`) | `claude-sonnet-5-5` | oui. Identifiant vérifié sur platform.claude.com/docs (models overview) : `claude-sonnet-5-5`, 2 $ / 10 $ par M tokens. Outil `web_search_20250305` (`anthropic-api.ts:36-40`) accepté pour ce modèle (page Web search tool). Pas testé par Elmo (seul Haiku 5.5 l'est, `scrape-targets.ts:109-110`), mais c'est le modèle par défaut d'Elmo pour sa recherche interne (`anthropic-api.ts:21`). | retenu |
| mistral | direct (`mistral-api`) | `mistral-medium-latest` | oui, testé (`scrape-targets.ts:126-127`) | retenu |
| gemini | **OpenRouter seulement** | Gemini 3 Flash | le slug `google/gemini-3-flash` (cité le matin) **n'existe pas** (404 sur openrouter.ai). Le slug réel est `google/gemini-3-flash-preview` (liste publique OpenRouter, 2026-11-07). Elmo ne teste que `google/gemini-2.5-flash` (`scrape-targets.ts:115-116`), mais passerait le slug tel quel. | **décision Mickaël** |
| perplexity | **OpenRouter seulement** | `perplexity/sonar` | oui, testé (`scrape-targets.ts:125`) | **décision Mickaël** |
| grok | **OpenRouter seulement** | `x-ai/grok-4.5` (seul Grok testé, `scrape-targets.ts:120-121`) | oui par OpenRouter. La clé xAI directe ne sert à rien dans Elmo. | **décision Mickaël** (sixième moteur) |
| Jev | direct (`TYPESAFE_API_KEY`) | `jev-1.13.0`, épinglé par Elmo (`apps/worker/src/mention-judge/jev.ts:4,11,54`) | oui. Elmo préfère TypeSafe en direct quand les deux clés existent (`packages/config/src/env-registry.ts:221-226`). Le slug OpenRouter `typesafe/jev-1.13` n'apparaît plus dans la liste publique d'OpenRouter : le passage en direct évite aussi ce risque. | retenu |

Clés Google (Gemini), Perplexity et xAI : lues par aucun fournisseur
d'Elmo 0.7.7, elles restent dans Proton Pass. Aucun adaptateur ajouté,
aucun modèle remplacé.

**Gemini 3 Flash : je n'ai pas substitué de modèle.** OpenRouter liste
aussi `google/gemini-3.5-flash` à `3.8-flash`. « Gemini 3 Flash »
correspond à `-preview`. Si Mickaël voulait le Flash actuel de l'app
Gemini, c'est à lui de le dire.

## 2 · Décisions à prendre par Mickaël

1. **OpenRouter à 5 $, ou Gemini et Perplexity retirés de J0 ?** Sans
   OpenRouter, J0 se fait sur trois moteurs (chatgpt, claude, mistral).
   Les lignes sont en commentaire dans `measurement.yaml` et dans
   `.env.example`. Il suffit de les décommenter.
2. **Grok en sixième moteur ?** Seulement via OpenRouter, donc lié à la
   décision 1. Avec Grok, prévoir 7 $ chez OpenRouter (voir budget).
3. **Gemini : confirmer `google/gemini-3-flash-preview`** (le slug du
   matin était faux).

## 3 · Budget J0 (détail : `FOURNISSEURS.md` § 0 quater)

50 appels par moteur (10 questions × 5 jours, 1 run par jour).

| Scénario | Typique | Pire cas | Plafond 30 $ |
|---|---|---|---|
| 3 moteurs directs + Jev + onboarding | ≈ 5,6 $ | ≈ 15,4 $ | oui |
| + Gemini 3 Flash + Perplexity (OpenRouter) | ≈ 7,3 $ | ≈ 18,3 $ | oui |
| + Grok (6 moteurs) | ≈ 9,0 $ | ≈ 22,0 $ | oui |

Recherches web incluses (10 $ / 1 000 chez OpenAI et Anthropic, 0,014 $
chez Google via OpenRouter, 0,005 $ chez Perplexity et xAI). Claude
Sonnet 5.5 représente l'essentiel du pire cas (8 000 tokens de sortie,
réflexion comprise, plus une nouvelle tentative possible). **L'estimation
d'Elmo sous-estime Claude d'un facteur proche de 3**
(`packages/lib/src/usage/cost.ts:24,33` : 0,02 $ par run, quel que soit
le modèle). La vraie protection est donc par fournisseur. Les crédits
prépayés totalisent au plus 30 $ (OpenAI 5, Anthropic 12 avec une limite
de 12 $ sur l'espace de travail dédié, Mistral 5, TypeSafe ≤ 3, OpenRouter
5 si retenu). Recharge automatique coupée partout.

## 4 · Fichiers modifiés

- `elmo/.env.example` : `TYPESAFE_API_KEY` en direct, `OPENROUTER_API_KEY`
  vide en attente de décision, clés non lues par Elmo signalées, cible
  `SCRAPE_TARGETS` à trois moteurs directs (lignes OpenRouter en
  commentaire). Toutes les valeurs restent vides.
- `FOURNISSEURS.md` : nouveau § 0 quater (décision, budget, protection
  par fournisseur) ; § 0 ter marqué comme remplacé pour J0.
- `reports/runbook-j0.md` : étape 0 réécrite avec les cases à cocher
  (recharge automatique coupée chez chaque fournisseur, espace de travail
  Anthropic dédié avec limite de dépense), étapes 1, 2, 4 et 5 alignées
  sur les décisions.
- `subjects/coach-gari/measurement.yaml` : trois moteurs actifs ;
  gemini, perplexity et grok en commentaire, en attente de décision.
  `REVIEW.md` régénéré.
- `subjects/maisons-co/refonte-exigences-seo.md` (B04, H08) : robots de
  recherche et de réponse autorisés ; entraînement présenté comme un
  choix séparé du client, sans recommandation d'OIA. Correction :
  `ClaudeBot` est le robot d'entraînement d'Anthropic, et non un robot
  qui cite (ceux qui citent : `Claude-SearchBot`, `Claude-User`).
- `docs/roadmap-oia-shyrka-souffleur.md` → v3.5 : Bifrost ajouté aux
  candidats P4. Règle : versions épinglées (tag et empreinte) et audit de
  la chaîne d'approvisionnement avant toute installation.

Espace personnel : reporté à l'audit après J0, rien n'a changé.

Tests : `pnpm --filter @oia/visibility-infra test`, 218 passent.
`subjects validate` : 2 sujets valides. `elmo-brief coach-gari` :
`enabledModels = chatgpt, claude, mistral`.

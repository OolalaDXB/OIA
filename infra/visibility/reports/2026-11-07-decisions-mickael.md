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

## 5 · Suite : décisions de Mickaël (deuxième série)

1. **OpenRouter retenu** (5 $ de crédit, clé plafonnée à 5 $ par mois) :
   Gemini et Perplexity actifs dans `measurement.yaml` et
   `.env.example`. J0 sur cinq moteurs ; `elmo-brief coach-gari` donne
   `chatgpt, claude, mistral, gemini, perplexity`.
2. **Grok : pas pour J0.** Noté dans `measurement.yaml`,
   `.env.example` et `FOURNISSEURS.md` § 0 quater comme candidat pour une
   fenêtre ultérieure, avec sa propre mesure de départ.
3. **Gemini : `google/gemini-3-flash-preview`** confirmé.
4. **`cost-guard.sh` a maintenant une grille de prix.** `src/cost-grid.ts`
   recalcule chaque run du mois à partir des compteurs de tokens et de
   recherches gardés par Elmo (`prompt_runs.raw_output`), aux prix
   officiels : Sonnet 5.5 à 2 $ / 10 $ par M (+ 0,01 $ par recherche),
   `gpt-6-luna` à 0,10 $ / 0,50 $ (+ 0,01 $), Gemini 3 Flash Preview à
   0,50 $ / 3 $ (+ 0,014 $), Sonar à 1 $ / 1 $ (+ 0,005 $). Le coût
   retenu est le maximum entre la grille, l'estimation d'Elmo, le solde
   OpenRouter et le relevé manuel. Un modèle absent de la grille arrête
   le worker. Un run sans compteurs ou échoué est compté au majorant.
   Nouvelle colonne `grid_usd` dans le journal (l'ancien journal est mis
   de côté, jamais réécrit). Tests : `test/cost-grid.test.ts` (12), dont
   trois qui exécutent `cost-guard.sh` à blanc. Exemple : 50 runs Sonnet
   typiques donnent 2,75 $ selon la grille, contre 1 $ estimé par Elmo.
   Le script retient bien 2,75 $.
5. **Budget et runbook pour cinq moteurs** : ≈ 7,9 $ en typique, ≈ 23 $
   au pire, sous le plafond de 30 $. Crédits : OpenAI 5, Anthropic 12,
   Mistral 5, OpenRouter 5, TypeSafe ≤ 3.

**À trancher par Mickaël : Mistral Medium.** La documentation de Mistral
(2026-11-07) indique Medium 3.5 déprécié au 2026-10-31, avec Mistral
Large 4 pour remplaçant. Sa page de tarifs ne publie plus de prix ni pour
Medium ni pour l'outil `web_search`. On ne sait pas ce que sert l'alias
`mistral-medium-latest` : seul le premier appel le dira. Je n'ai remplacé
aucun modèle. La grille compte Mistral au prix de Large 4 (0,70 $ /
2,10 $) et 0,03 $ par recherche, en majorant provisoire signalé à chaque
relevé. À ce prix, le pire cas Mistral (6,55 $) dépasse les 5 $ prépayés :
les derniers appels seraient refusés, sans dépense au-delà.

Tests : 230 passent, typage propre.

## 6 · Mistral : `mistral-large-4` (option A, décision de Mickaël)

- Cible : `mistral:mistral-api:mistral-large-4:online` dans
  `.env.example`, `measurement.yaml`, `runbook-j0.md` (étapes 0, 2 et 5)
  et `FOURNISSEURS.md` (§ 0 quater et § 1).
- Grille de `cost-guard.sh` : l'entrée `mistral-medium-latest` est
  remplacée par `mistral-large-4`, au prix officiel de 0,70 $ / 2,10 $ par M
  (fiche docs.mistral.ai/models/mistral-large-4-0). Recherche web à 0,03 $,
  prix provisoire signalé à chaque relevé. Un run encore servi en
  `mistral-medium-latest` arrêterait le worker. Test ajouté (prix officiel,
  coût d'un run type) ; les versions hors grille sont testées.
- **Onboarding : non configurable.** Dans Elmo 0.7.7,
  `ONBOARDING_LLM_TARGET` ne sert qu'à choisir le fournisseur
  (`packages/lib/src/onboarding/llm.ts:39-46`). Le modèle est codé en dur,
  `mistral-large-latest` (`packages/lib/src/providers/registry/mistral-api.ts:17`).
  Je ne l'ai pas fixé, puisqu'il faudrait modifier Elmo. C'est signalé dans
  le runbook (étape 3) comme point à vérifier au premier appel.
- Limites : Mistral à 8 $. Pour rester sous les 30 $ au total, Anthropic
  passe à 10 $ et TypeSafe à 2 $ au plus. Le pire cas Claude (≈ 11 $)
  dépasserait légèrement la limite d'Anthropic : les derniers appels
  seraient refusés, sans dépense au-delà.
- Le prix de la recherche web de Mistral se lira sur la première facture,
  à reporter alors dans `src/cost-grid.ts`.

Tests : 231 passent, typage propre.

## 7 · Limites par fournisseur : plafonds indépendants (décision de Mickaël)

Annule l'ajustement du § 6. Limites retenues : Anthropic 12 $, Mistral
8 $, TypeSafe 3 $ au plus, OpenAI 5 $, OpenRouter 5 $. Ce sont des
plafonds indépendants, pas un budget à répartir : leur somme (33 $) peut
dépasser 30 $. Le plafond de 30 $ porte sur la dépense totale réelle, que
surveille `cost-guard.sh`. Chaque limite couvre le pire cas J0 de son
fournisseur. `runbook-j0.md` (étape 0) et `FOURNISSEURS.md` (§ 0 et
§ 0 quater) sont mis à jour.

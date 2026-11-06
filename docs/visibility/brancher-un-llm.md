# Brancher un LLM dans OIA Visibility

Ce guide s'applique à **chaque fonction qui a besoin d'un modèle d'IA** : reformulation de panels (B2), extraction de faits (F3), rédaction de contenus (D3), relecture croisée (F4), synthèse de rapports (F5).

## Vue d'ensemble

Toutes ces fonctions passent par l'interface unique `VisibilityLLM` (`src/llm.ts`). Cette nuit, aucun adaptateur réel n'est activé : seule l'implémentation fictive `createFakeVisibilityLLM` est utilisée dans les tests. L'activation d'un vrai modèle se fait **par configuration**, sans toucher au code des fonctions appelantes.

## Fonctions à brancher

| Purpose | Fonction | Modèle recommandé |
|---|---|---|
| `panel.reformulate` | Générateur de panels (B2) | Mistral (UE), petit modèle rapide |
| `panel.suggest` | Suggestions de questions | Mistral, petit modèle |
| `facts.extract` | Contrôle des faits (F3) | Mistral (UE), extraction structurée |
| `content.write` | Rédaction (D3) | Claude Sonnet ou Mistral Large |
| `report.review` | Revue croisée (F4) | Modèle différent par relecteur (diversité) |
| `report.summarize` | Synthèse (F5) | Mistral Large |

## Variables d'environnement

Pour chaque `purpose`, trois variables :

```
OIA_VIS_LLM_<PURPOSE_UPPER>_PROVIDER=mistral|anthropic|openai|gemini|fake
OIA_VIS_LLM_<PURPOSE_UPPER>_MODEL=<identifiant exact>
OIA_VIS_LLM_<PURPOSE_UPPER>_MAX_COST_USD=<décimal>
```

Exemple :

```
# Reformulation de panels : Mistral, petit modèle, ≤ 0,01 $ par appel
OIA_VIS_LLM_PANEL_REFORMULATE_PROVIDER=mistral
OIA_VIS_LLM_PANEL_REFORMULATE_MODEL=mistral-small-latest
OIA_VIS_LLM_PANEL_REFORMULATE_MAX_COST_USD=0.01
```

Sans provider ni modèle, la purpose reste **désactivée** (`composeLLM` renvoie une promesse rejetée). Aucune valeur par défaut payante n'est injectée.

## Test attendu avant activation

Pour chaque purpose activé :

1. `pnpm --filter @oia/visibility-infra test` doit rester au vert (la couche métier ne dépend pas d'un modèle particulier).
2. `cost-guard.sh` doit lire le coût réel du fournisseur et respecter le plafond mensuel 30 $ avant toute mesure.
3. Un appel de smoke test documenté dans les Questions pour Mickaël du rapport de nuit (par exemple : extraire un fait connu, vérifier que la sortie est stable).

## Coût attendu, par purpose

Voir `FOURNISSEURS.md` § « Modèles mesurés, proches des applications grand public » pour les coûts par appel. À titre indicatif :

| Purpose | Fréquence (par mois) | Coût estimé |
|---|---|---|
| `panel.reformulate` | 20 par sujet | < 0,30 $ |
| `facts.extract` | ~500 (1 par réponse mesurée) | 1 à 5 $ |
| `content.write` | 5 par semaine | 0,50 $ |
| `report.review` | 2 par rapport | 0,20 $ |
| `report.summarize` | 2 par rapport | 0,20 $ |

Total attendu sous 10 $/mois tant que la volumétrie reste proche de la configuration pilote. Toujours sous le plafond 30 $.

## Pourquoi un vrai modèle ne peut pas être activé cette nuit

- **Règle 1 du mandat** : aucun appel à un fournisseur de modèle d'IA.
- **Clés manquantes** : les `.env` sont générés vides par `init-env.sh` ; aucune clé réelle n'existe.
- **A3** : la configuration payante plafonnée est en place, mais les crédits prépayés (OpenAI, Anthropic, Mistral, OpenRouter) restent à poser par Mickaël.

## Choix recommandé

Par défaut : **Mistral** (UE, aligné sur `packages/providers` existant, coût bas). Deux exceptions attendues :

- `content.write` : Claude Sonnet pour la qualité de texte long. À confirmer par un test comparatif.
- `report.review` : utiliser au moins deux modèles différents (diversité). Éviter qu'un même modèle soit juge et partie d'une recommandation.

## Erreurs fréquentes

- **`composeLLM: no adapter configured for purpose "..."`** : la purpose est appelée mais aucun provider+model n'est fixé dans `.env`. Soit on configure, soit on fait passer la fonction en mode fictif pour les tests.
- **Variable `ANTHROPIC_API_KEY` exportée dans le shell** : Claude Code la capterait et ferait des appels non mesurés. Voir `SECRETS.md`. Toujours laisser les clés dans `elmo/.env`, lues explicitement.

## Référence

- `infra/visibility/src/llm.ts` : interface unique et implémentation fictive.
- `infra/visibility/src/llm-adapters.ts` : configuration par purpose, composition, adaptateurs désactivés.
- `packages/providers/src/*` : contrat métier existant conservé (G1 n'y touche pas, il s'y aligne).

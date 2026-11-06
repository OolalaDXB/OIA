# ADR 0001 · Stratégie de collecte

**Statut** : proposé le 2026-11-08, à valider par Mickaël. Référence unique : `docs/roadmap-oia-shyrka-souffleur.md` v3.3.

## Décision

OIA Visibility collecte les réponses des IA selon deux moteurs successifs :

1. **Elmo comme collecteur de transition** (phases P1 et P2), utilisé en mode API via un adaptateur `@oia/elmo-adapter` qui lit son schéma Postgres et expose la table des preuves A5 (ajout seul, SHA-256 côté serveur, RLS). Le code d'Elmo n'est pas copié dans OIA.
2. **Collecteur maison en cible** (phase P3 et suivantes), implémenté derrière le même contrat `Collector` que l'adaptateur d'Elmo. Le remplacement se fait **moteur par moteur**, pas en bloc.

**Canonry en plan B** : si Elmo devient indisponible (abandon de l'éditeur, cassure de contrat, montée de prix), bascule accélérée vers Canonry pour la collecte sans web search (moteurs texte seul) et vers le collecteur maison pour tout ce qui exige de la recherche web. Canonry n'est pas évalué en cible parce qu'il manque d'API de part de voix et de rejudgement Jev.

## Pourquoi

Faits techniques (voir `infra/visibility/reports/HANDOFF.md`) :

- Elmo 0.7.7 porte déjà les cinq moteurs (chatgpt, claude, gemini, perplexity, mistral) et extrait les citations, mais :
  - Jev est une boîte noire TypeSafe épinglée en dur ; en mode `stub`, le sentiment et la position sont inutilisables ;
  - les moteurs sont choisis par marque, pas par question ;
  - le worker ne démarre pas sans une clé Jev valide ni sans `SCRAPE_TARGETS` ;
  - `openrouter.ai` et `api.typesafe.ai` sont codés en dur, le routage UE d'OpenRouter n'est pas utilisable ;
  - l'API REST n'accepte pas d'import de réponse (collecte via le worker uniquement) ;
  - une suppression de question efface ses réponses brutes.
- Un collecteur maison, isomorphe à `packages/providers`, demande entre 6,5 et 7 jours d'effort (HANDOFF §2.4). Il permet : table de preuves en ajout seul (déclencheur), choix du moteur par question, détection de mentions sur passage exact, et absence de dépendance à Jev.
- Crawlie et CrawlSEO sont gardés dans tous les cas (audit technique et Search Console / Bing / PageSpeed). Ils ne sont pas des collecteurs de réponses IA.

## Critères de bascule, moteur par moteur

La bascule d'un moteur d'Elmo vers le collecteur maison se fait quand **tous** les critères suivants sont remplis pour ce moteur :

| Critère | Mesure |
|---|---|
| **Couverture** | le collecteur maison renvoie une réponse pour chaque question du panel (0 échec sur 30 appels consécutifs). |
| **Fidélité dans les intervalles** | sur une semaine de mesure croisée (Elmo + collecteur maison), les métriques quotidiennes (couverture, nombre de citations, longueur médiane) tombent dans les intervalles de l'un et de l'autre, pour chaque jour. |
| **Preuves** | mêmes URL citées, mêmes passages, même format d'empreinte. |
| **Fiabilité** | taux d'échec < 1 % sur 5 jours ; reprise automatique après 429 / 5xx ; journalisation complète dans la table de preuves. |
| **Coût inférieur ou égal** | coût par jour de mesure identique ou inférieur à Elmo pour le même moteur (hors Jev). |
| **Maintenance acceptée** | la maintenance de l'adaptateur maison est écrite, documentée et testée (CI). |

Chaque bascule est enregistrée dans `infra/visibility/decisions/` avec les mesures.

## Déclencheurs de bascule anticipée

- Elmo abandonne le mode API OpenRouter → bascule immédiate du moteur concerné vers le collecteur maison.
- Elmo introduit une dépendance payante non remplaçable (nouveau SaaS obligatoire, changement de licence) → même règle.
- Jev TypeSafe ferme ou devient payant au-delà du plafond mensuel → les moteurs continuent, le rejudgement bascule côté OIA (via Mistral derrière `packages/providers`, méthode « LLM, extrait »).
- Un fournisseur ferme l'API publique d'un moteur → bascule du moteur vers le collecteur maison avec stratégie alternative (recherche différente, mode « applications grand public » saisi à la main).
- Chute de qualité (plus de 5 % des réponses contiennent une hallucination factuelle détectée par le contrôleur F3) → investigation, puis bascule si imputable à Elmo.

## Ce qui n'est pas la cible

- **Pas d'écriture dans Elmo** autre que la table des réponses collectées. Les tableaux de bord et les rapports d'Elmo ne sont pas utilisés : OIA produit ses propres rapports (F5).
- **Pas de scraping** (déjà exclu par le mandat : Cloro, BrightData, Oxylabs, SearchApi, Olostep, DataForSEO interdits).
- **Pas de dépendance au mode `stub` de Jev** au-delà de J0 : soit le mode TypeSafe réel est financé (plafond respecté), soit le rejudgement bascule côté OIA.

## Interaction avec les blocs du mandat

- **A5** fournit le contrat `Collector` et la table de preuves. Les deux moteurs (Elmo adapté et maison) parlent à cette table.
- **F2** fournit l'adaptateur Elmo → table de preuves.
- **G1** fournit l'interface LLM unique ; le rejudgement cross-provider y branche Mistral (UE).
- **E5** (SEO Command Orchestrator) : les missions de mesure demandent une collecte, laquelle passe par un collecteur sélectionné en configuration (Elmo ou maison par moteur), sans que la mission sache qui répond.

## Conséquences

- Pas de vendor lock-in sur Elmo au-delà de P2 : chaque moteur devient remplaçable sans réécrire la couche métier.
- Un seul chemin de preuves (ajout seul, RLS) : les deux collecteurs écrivent dans la même table, signée par leur identité.
- Une bascule mal préparée est rejetée par les critères ; une bascule anticipée (déclencheurs) est documentée dans la décision.

## Risques

- La fidélité moteur par moteur est difficile à prouver quand les modèles tirent au sort leurs sources (ChatGPT, Claude). Les intervalles intégrés au moteur statistique F1 doivent le couvrir.
- Le collecteur maison hérite d'une charge de maintenance qui augmente avec le nombre de moteurs. Mitigation : priorité aux moteurs dont la bascule apporte un gain décisif (Gemini pour la part de voix ouverte, Perplexity pour les sources).
- Le plan B Canonry n'est pas évalué cette nuit ; une étude dédiée reste à faire avant la bascule, le jour où elle serait nécessaire.

# Agent AEO

**Base** : le skill `aeo` d'Elmo (mesurer, diagnostiquer, corriger, remesurer),
adapté à la règle de validation humaine. L'agent propose, il ne corrige pas.
**Lit** : Elmo (MCP ou API, en lecture : réponses, mentions, citations
classées, recherches lancées par les moteurs), la couche statistique OIA quand
elle existera (P3), et les définitions de sujets (`subjects` : panel, alias,
concurrents, faits).
**Produit** : des constats `FIX_FACT`, `CONTENT_GAP`, `ENTITY_INCONSISTENCY`,
`SOURCE_TARGET` ou `WATCH`, chacun rattaché aux réponses et aux extractions qui
le fondent.

## Contrôles dont il est responsable

Le détail (méthode, brique, preuve) est dans
[checklist-site.md](checklist-site.md).

| # | Contrôle | Brique |
|---|---|---|
| C01 | Fiche Google Business Profile présente ou absente | Manuel |
| C02 | Avis clients présents ou absents | Manuel ; Elmo indirect (citations `reviews`, avis inventés dans les réponses aux questions marquées) |
| C03 | Mentions de la marque hors du site | Elmo (sources citées par les IA, par catégorie) + inventaire manuel |
| C08 | Réponse directe en tête des pages principales | Crawlie `geo-not-answerable` (heuristique) + lecture humaine |
| C09 | Page « à propos » et recoupement de l'identité | Crawlie `geo-no-author` et schémas + Elmo (questions marquées : exactitude) + manuel (`sameAs`, cohérence des profils) |

Il partage C04 avec l'agent Technique : il fournit la liste des informations
clés, tirée des questions du panel et des faits validés.

## Règles propres
- Une réponse unique n'est jamais un constat. On travaille sur une fenêtre de
  mesure (jour par fournisseur), et aucune évolution n'est annoncée sans la
  comparaison de fenêtres de la couche OIA.
- Ce que détecte une correspondance d'alias ou de domaine est un fait. Ce
  qu'un LLM extrait reste « extrait ».
- Comparer uniquement des fenêtres qui utilisent la même `panelVersion`.
  Signaler la comparaison comme fragile si la version d'un modèle a changé.
- Écrire dans chaque rapport la limite de l'API : une réponse obtenue par API
  diffère de ce qu'affiche l'application grand public.

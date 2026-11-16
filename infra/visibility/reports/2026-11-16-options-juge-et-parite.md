# Juge des mentions (D) et parité (E) · options chiffrées, à décider par Mickaël

Mandat v14, 16 novembre 2026. Aucun appel n'a été fait : les montants viennent des coûts de J0 (grille `src/cost-grid.ts`, `reports/j0/figures.json`) et des volumes de l'export final d'Elmo (`~/oia-sauvegardes/elmo-final/20261116T103321Z/`).

## Volumes de référence (J0, Coach Gari)

- 10 questions × 5 moteurs = **50 réponses par jour**, 250 par fenêtre de 5 jours.
- Jev a jugé **les 280 réponses** d'Elmo (toutes nomment au moins une entreprise suivie), avec un seul tampon `judge-jev-1.13.0+request-1` : aucun rejugement après J0. Longueur médiane d'une réponse jugée : 2 156 caractères (environ 550 jetons).
- Coût de collecte de J0 : **22,92 $** pour 5 jours, soit **4,58 $ par jour**. Détail par jour : Mistral 3,07 $ (au majorant : Elmo n'a gardé aucun compteur), Gemini 0,62 $, Claude 0,48 $, ChatGPT 0,26 $, Perplexity 0,15 $.
- Budget : 25,00 $ déjà retenus en novembre pour un plafond de 30 $. Toute dépense ci-dessous attend donc décembre ou un plafond relevé.

## D · Juge des mentions

Toujours actif, gratuit : **la correspondance déterministe** des noms, alias et domaines, en mot entier, avec le passage exact qui l'a déclenchée. C'est un fait, et c'est aussi la première étape d'Elmo : Jev ne fait que retirer une mention (homonyme, mot courant, « aucune information ») et donner un sentiment.

| Option | Ce que c'est | Coût par fenêtre de 5 jours (250 réponses) | Coût par mois en continu (1 500 réponses) | Comparabilité avec J0 |
|---|---|---|---|---|
| **D1 · Jev (TypeSafe), `jev-1.13.0`** | Même juge, même modèle épinglé, appelé directement par OIA (`POST https://api.typesafe.ai/v1/systemone`). On envoie la question, la réponse (50 000 caractères au plus), le nom et les domaines de chaque entreprise nommée | **0,04 à 0,09 $** | **0,23 à 0,53 $** | **La meilleure** : même juge qu'à J0 |
| **D2 · Mistral** (`packages/providers`, « LLM, extrait ») | Mistral Large 4 épinglé, sortie JSON, température 0 ; prompt de jugement à écrire. Environ 1 000 jetons en entrée et 200 en sortie par réponse | **environ 0,28 $** | **environ 1,70 $** | Moyenne : pas de probabilités (le seuil de 0,3 de Jev ne se reproduit pas), sentiment non comparable |
| **D3 · Aucun juge** | Correspondance seule, sans sentiment ni position | **0 $** | **0 $** | S'écarte de J0 exactement sur les réponses où Jev a retiré une mention ; `j0-reanalysis.ts` les compte déjà (`disagreements`) |

Pour D1, le prix vient de la documentation d'Elmo, qui l'estime à 0,15–0,35 $ pour 1 000 réponses ; il est à confirmer auprès de TypeSafe. La clé TypeSafe existe déjà (celle de J0) : il faudrait seulement la déplacer de la configuration d'Elmo vers celle d'OIA. Pour D2, les montants viennent de la grille (0,70 $ et 2,10 $ par million de jetons), sans recherche web.

**Recommandation : D1.** Il coûte moins d'un dollar par mois et garde la comparaison avec J0 intacte. D3 reste la position de repli si TypeSafe devait disparaître.

## E · Parité avant J1

| Option | Ce que c'est | Coût estimé | Résultat |
|---|---|---|---|
| **E1 · Mesure croisée courte** | Les 10 questions posées le même jour par Elmo et par le collecteur OIA, sur les 5 moteurs, pendant 2 à 5 jours. Critères de l'ADR 0001 : couverture, nombre de citations, longueur médiane, taux de mention, tous dans les intervalles de J0 | Environ **9,17 $ par jour** (2 × 4,58 $), plus le juge : **18,3 $ sur 2 jours, 27,5 $ sur 3 jours, 45,8 $ sur 5 jours** (Mistral compté au majorant) | Bascule démontrée moteur par moteur ; un moteur hors critères est signalé avant J1 |
| **E2 · Pas de mesure croisée** | J1 se fait directement sur le collecteur OIA | 0 $ de plus | Le rapport comparé J1 contre J0 déclare chaque moteur « fragile », avec la raison (changement de collecteur) |

Ce qui change de toute façon entre Elmo et le collecteur OIA, d'après le relevé du bloc C :
- OIA garde la sortie brute et les compteurs, donc le coût réel ;
- OIA consigne les réponses de Mistral qui s'arrêtent après la recherche, sans texte final (15 runs dans Elmo, 14 du panel de J0, lus dans la sortie brute : aucun texte n'y figure). Le collecteur les signale au lieu de les laisser vides.

E1 est la seule option qui permet d'attribuer un écart de J1 au site plutôt qu'au collecteur.

**Recommandation : E1 sur 2 jours, en décembre** (18,3 $, Mistral au majorant). Elle se lance seulement sur ton GO et sur ta saisie des clés dans la configuration d'OIA. Pendant ces 2 jours, Elmo reste actif ; il ne sera arrêté qu'ensuite (bloc F).

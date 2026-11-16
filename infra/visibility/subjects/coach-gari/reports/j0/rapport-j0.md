# Rapport J0 · Coach Gari

**Statut : à valider par Mickaël.** Fenêtre démarrée le 2026-11-07 15:27 UTC, 5 jours.

## Périmètre

Questions du panel : 10, dont 8 non marquées (en-01@v2, en-02@v2, en-03@v2, en-04@v2, en-05@v2, en-06@v2, en-07@v2, en-08@v2) et 2 marquées (en-09@v2, en-10@v1).
Questions d'Elmo exclues par leur identifiant (hors panel ; leurs réponses restent dans Elmo et ne sont pas importées) : `bf0b8284-cd44-4c1d-9245-7d66225bdaec`, `ff89627a-0804-48a7-8428-1886288a1113`.
Réponse « non mesurée » : réponse sans texte extrait ; retirée du dénominateur, même si Elmo lui a donné un jugement.

## Visibilité : questions non marquées (8)

Part des réponses mesurées et jugées par Jev qui mentionnent la marque, sur les questions qui ne la nomment pas : c'est la lecture de la visibilité. Intervalle = plus bas et plus haut des jours observés.

| Assistant | Version servie | Réponses | Non mesurées | Jugées | Mentions | Présence | Intervalle (jours) |
|---|---|---|---|---|---|---|---|
| chatgpt | gpt-6-luna | 40 | 0 | 40 | 0 | 0 % | 0 – 0 % |
| claude | claude-sonnet-5-5 | 40 | 0 | 40 | 0 | 0 % | 0 – 0 % |
| gemini | google/gemini-3-flash-preview | 40 | 0 | 40 | 0 | 0 % | 0 – 0 % |
| mistral | mistral-large-4 | 40 | 11 | 29 | 0 | 0 % | 0 – 0 % |
| perplexity | perplexity/sonar | 40 | 0 | 40 | 0 | 0 % | 0 – 0 % |
| **Total** | | 200 | 11 | 189 | 0 | **0 %** | 0 – 0 % |

## Questions marquées (2), à part

La question nomme la marque : une mention y est attendue et ne mesure pas la visibilité.

| Assistant | Version servie | Réponses | Non mesurées | Jugées | Mentions | Présence | Intervalle (jours) |
|---|---|---|---|---|---|---|---|
| chatgpt | gpt-6-luna | 10 | 0 | 10 | 1 | 10 % | 0 – 50 % |
| claude | claude-sonnet-5-5 | 10 | 0 | 10 | 5 | 50 % | 50 – 50 % |
| gemini | google/gemini-3-flash-preview | 10 | 0 | 10 | 9 | 90 % | 50 – 100 % |
| mistral | mistral-large-4 | 10 | 3 | 7 | 6 | 85.7 % | 50 – 100 % |
| perplexity | perplexity/sonar | 10 | 0 | 10 | 9 | 90 % | 50 – 100 % |
| **Total** | | 50 | 3 | 47 | 30 | **63.8 %** | 40 – 77.8 % |

## Réponses non mesurées, par jour

| Assistant | Jour 1 | Jour 2 | Jour 3 | Jour 4 | Jour 5 | Total |
|---|---|---|---|---|---|---|
| mistral | 3 | 4 | 2 | 2 | 3 | 14 |

Aucun texte n'est reconstruit dans la base : ces réponses restent non mesurées.

## Sources citées

Site de la marque : 22 citation(s). Profils officiels (comptés pour la marque, à l'adresse près) : 0.

- reddit.com : 383
- linkedin.com : 242
- en.wikipedia.org : 126
- trainerize.me : 69
- dubaigolf.com : 65
- isddubai.com : 48
- padeli.com : 45
- padelcoachfinder.com : 37
- acefitness.org : 33
- sanddune.ae : 30

## Concurrents cités quand la marque ne l'est pas

- Future : 15 réponse(s)
- Caliber : 14 réponse(s)
- Fit Squad DXB : 6 réponse(s)
- Fortius Dubai : 2 réponse(s)
- Ultimate Performance : 1 réponse(s)

## Contrôle des faits (première passe déterministe)

Sur les réponses qui nomment la marque, par mots-clés des faits validés. Une absence n'est pas une erreur : la réponse peut ne pas aborder le sujet.

| Fait validé | Réponses contrôlées | Cité | Contredit | Absent |
|---|---|---|---|---|
| Coach Gari est coach sportif et préparateur physique. | 47 | 47 | 0 | 0 |
| Coach Gari propose du coaching en ligne : entraînement et nutrition. | 47 | 27 | 0 | 20 |
| Coach Gari propose du padel en complément. | 47 | 25 | 0 | 22 |
| Coach Gari est basé à Dubaï. | 47 | 26 | 0 | 21 |
| L'audience de Coach Gari est surtout en Afrique australe, en particulier au Zimbabwe. | 47 | 25 | 0 | 22 |
| Le profil Instagram officiel de Coach Gari est https://www.instagram.com/coach_gari28 (@coach_gari28). | 47 | 1 | 0 | 46 |
| Le profil TikTok officiel de Coach Gari est https://www.tiktok.com/@coach_gari28 (@coach_gari28). | 47 | 0 | 0 | 47 |
| La page myOolala officielle de Coach Gari est https://myoolala.com/u/coachgari28. | 47 | 0 | 0 | 47 |

Seconde passe par un modèle et revue croisée : désactivées (aucune dépense nouvelle) ; options à décider par Mickaël.

## Contexte et perturbations de la fenêtre

Mesure de départ, 5 moteurs (3 directs + Gemini et Perplexity via OpenRouter). Dates fixées au démarrage du worker, après validation du panel. Démarrée le 2026-11-07 à 15:27 UTC (démarrage du worker). Perturbation jour 1 : worker arrêté par erreur de 15:28:20 à 17:20:16 UTC (test de cost-guard.sh à blanc qui arrêtait le vrai worker ; correctif bc7a230) ; 3 runs Mistral et des jugements de Jev retardés, terminés à la relance ; premier passage complet (50/50, jugés 50/50), aucun jour manquant. Gel rompu, J0 conservé (décision de Mickaël, 2026-11-07) : le 7 nov. à 08:54 UTC, 710b4dd publie les quatre pages de service (noindex retiré, entrée dans le sitemap) ; à 09:24 UTC, d89380b ajoute une section à la page padel ; pendant la fenêtre, à 15:56 UTC (29 min après le démarrage), a7ac6a7 réécrit le texte « About » de la page d'accueil. J0 mesure donc un site en transition d'indexation (pages de service indexables depuis quelques heures au démarrage). Gel rétabli jusqu'à la fin de la fenêtre. Concurrents d'Elmo changés le 2026-11-08 (décision de Mickaël), en deux temps : à 08:28 UTC (première liste, remplacée), puis à 08:43 UTC par la liste validée en cinq segments (20 concurrents : subject.yaml et concurrents-candidats.yaml, section candidates). Playtomic supprimé ; les académies de padel sont des lieux où Gari travaille, pas des concurrents (section lieux, non chargées dans Elmo). Seuls les concurrents changent (marque, questions, moteurs et heure inchangés). Les étiquettes de concurrents d'Elmo changent donc à cette date : les réponses antérieures gardent celles de l'ancienne liste (Playtomic, Ultimate Performance, Future, Caliber), les suivantes portent la nouvelle. Le rapport J0 recompte toute la fenêtre avec cette liste (scripts/j0-reanalysis.sh avec concurrents-candidats.yaml, sur les réponses complètes ; lieux de travail comptés à part), et non avec les étiquettes d'Elmo. Listes d'Elmo avant chaque changement : ~/oia-visibility-data/coach-gari/elmo-concurrents-avant-2026-11-08.json et elmo-concurrents-avant-2026-11-08b.json. Perturbation (questions hors panel) : deux questions ajoutées le 2026-11-08 à 11:23 UTC par Mickaël depuis l'interface d'Elmo, sans identifiant oia:…, étiquetées à la main panel:v2, lang:en, family:unbranded (le filtre panel:v2 ne les exclut donc pas) : bf0b8284-cd44-4c1d-9245-7d66225bdaec « Best personal coach in Dubai » et ff89627a-0804-48a7-8428-1886288a1113 « PT in Dubai ». Effet : 12 runs par jour et par moteur au lieu de 10, coût de la mesure en hausse d'environ 20 %. Désactivées le 2026-11-10 à 21:58:19 UTC depuis l'interface d'Elmo (enabled = false, jamais supprimées : leurs 30 réponses sont conservées) ; Elmo 0.7.7 laisse leur travail en file, que le worker saute sans appeler de moteur. Le rapport J0 les exclut par identifiant (excludedPromptIds).

## Jours manquants

Aucun jour manquant.
Runs échoués pendant la fenêtre : 0.

## Dépense

Dépense estimée (grille de prix, src/cost-grid.ts) : 22.92 $, dont 50 réponse(s) comptée(s) au majorant faute de compteurs.
Dépense réelle : **à relever**. À relever par Mickaël dans chaque console (OpenAI, Anthropic, Mistral, OpenRouter, TypeSafe), puis à reporter ici.

## Limites de la mesure

- Indicateurs de visibilité mesurés par les API des assistants, avec leur recherche web : ce ne sont pas les applications grand public (mémoire, localisation, choix de modèle propres à chaque application).
- Un run par jour et par question, sur une fenêtre de cinq jours : une variation d'un jour à l'autre peut relever du hasard des réponses.
- Langue unique (anglais) et panel de dix questions : la mesure ne couvre pas toutes les questions qu'un client peut poser.
- La mention de la marque est jugée par Jev (TypeSafe) ; les sources dépendent de ce que chaque API renvoie (Mistral Large 4 ne renvoie pas les siennes, Gemini renvoie des liens de redirection).
- Ce rapport ne prétend à aucune exhaustivité.

## Provenance

Tous les chiffres viennent de la table des preuves (250 réponses, empreinte 4ec67f0dd0ff58d4…). Vérification : `pnpm vis:j0-verify`.


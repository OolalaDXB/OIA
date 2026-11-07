# Rapport · réseaux sociaux et concurrents de Coach Gari · 2026-11-07

Aucun changement dans Elmo pendant J0, aucun appel payant (lecture
seule de la base d'Elmo, recherches publiques).

## 1 · Profils officiels et alias

- `facts.yaml` : trois faits validés (source `owner-2026-11-07`) : Instagram
  https://www.instagram.com/coach_gari28, TikTok
  https://www.tiktok.com/@coach_gari28, page myOolala
  https://myoolala.com/u/coachgari28.
- `subject.yaml` : alias `coach_gari28` confirmé et `coachgari28` ajouté.
  Playtomic est marqué comme rejeté côté OIA, mais reste concurrent dans
  Elmo jusqu'à la fin de J0.

## 2 · Une adresse précise comme domaine de la marque dans Elmo ? Non

Elmo 0.7.7 ne garde que l'hôte d'un domaine de marque : `extractDomain`
coupe au premier `/` (`packages/lib/src/citations/domain-categories.ts:82-103`).
Il classe ensuite une citation par cet hôte et par ses domaines parents
(`citations/domain-lists.ts:793-801`, `domain-categories.ts:339-347`).
Déclarer `instagram.com/coach_gari28` reviendrait donc à déclarer tout
`instagram.com`. La question de l'effet rétroactif ne se pose pas. **Rien
n'est changé dans Elmo**, ni domaines ni concurrents. Le comptage à
l'adresse près est fait par OIA (contrôle N06).

## 3 · Réanalyse des réponses complètes (jour 1 de J0, 50 réponses)

Outil : `scripts/j0-reanalysis.sh` + `src/j0-reanalysis.ts`, avec ses
tests. Il lit le texte complet et toutes les URL citées en lecture seule,
classe chaque citation à l'adresse près (site, profils officiels,
concurrents candidats, autres réseaux, autres) et y ajoute les liens
écrits dans le texte. Il repère aussi les alias dans le texte et les
compare au jugement de Jev. Le rapport complet est hors du dépôt :
`~/oia-visibility-data/coach-gari/reanalyse-20261107T173635Z.md`.

### Réseaux sociaux (section du rapport J0)

| Moteur | Profils officiels cités | Autres réseaux cités | Réponses parlant d'Instagram | Réponses citant un pseudonyme |
|---|---|---|---|---|
| chatgpt | 0 | 1 | 0 | 0 |
| claude | 0 | 6 | 3 | 1 |
| gemini | 0 | 0 | 0 | 1 |
| mistral | 0 | 0 | 2 | 1 |
| perplexity | 0 | 52 | 1 | 1 |

- **Aucun assistant ne cite les profils officiels** de Coach Gari au
  jour 1. Perplexity cite beaucoup les réseaux sociaux (52, surtout
  LinkedIn), mais pas ces profils. TikTok n'est jamais nommé.
- Le site lui-même n'est cité que 3 fois (Claude 1, Perplexity 2).
- Les pseudonymes n'apparaissent que dans les réponses aux questions
  qui nomment la marque.

### Limites de mesure constatées (à consigner dans le rapport J0)

1. **Mistral (`mistral-large-4`) ne renvoie pas ses sources.** Ses
   réponses ne contiennent que du texte et de la réflexion, sans
   `tool_reference`, alors qu'il fait en moyenne 9 recherches. Elmo
   n'enregistre donc aucune citation Mistral. Seuls 6 liens, écrits dans
   le texte d'une seule réponse, sont récupérés par la réanalyse.
2. **Les citations de Gemini sont des redirections Google**
   (`vertexaisearch.cloud.google.com`, 81). Le site réel n'est pas
   visible sans suivre la redirection, ce que la réanalyse ne fait pas
   (aucun appel réseau).
3. **Alias contre jugement de Jev.** Chaque moteur nomme la marque dans
   les 2 réponses aux questions marquées. Jev n'en compte qu'une par
   moteur (aucune pour ChatGPT). Une réponse peut nommer la marque pour
   dire qu'elle ne la connaît pas : ces désaccords sont à relire, pas à
   corriger.

## 4 · Concurrents : liste corrigée à valider

`subjects/coach-gari/concurrents-candidats.yaml`. Chaque nom a sa source.
Mentions dans les réponses du jour 1 :

- **Coachs personnels et de padel indépendants à Dubaï** : PTD Fitness,
  Magali de Lattre, Fede Brambati, David Pozo. 0 mention. Aucun
  classement fiable de coachs indépendants n'existe : les pages trouvées
  sont commerciales. Le statut (indépendant ou salarié d'académie) reste
  à vérifier.
- **Académies de padel à Dubaï** (segment ajouté, à classer) : Viya
  Padel (3, Mistral et Perplexity ; dubaigolf.com cité 13 fois), World
  Padel Academy (1, Gemini), Mouratoglou, Aria Sportscape, Champs Sports
  Club, RRA Padel et Lion Elite Padel Academy (0).
- **Salles de coaching personnel à Dubaï** : Ultimate Performance,
  StudioRepublik, Symmetry Gym, SHP Dubai, Fitsetgo. 0 mention.
- **Coaching en ligne, à part** : Future (3), Caliber (3), Planet Fitness
  Play (0).
- **Playtomic : retiré** (pas un concurrent).

## 5 · Réseaux sociaux, pilier d'OIA Visibility

- **Modèle de vérification, famille N « Réseaux sociaux »**
  (`verification/n-reseaux-sociaux.yaml` et
  `agents/modele-verification-compte.md`) :
  - N01 cohérence du profil avec le site (outil `social`, mixte, important) ;
  - N02 lien vers le site en biographie (`social`, auto, important) ;
  - N03 profils en sameAs sur le site (`crawlie`, auto, important) ;
  - N04 régularité des publications (`social`, auto, amélioration) ;
  - N05 sujets alignés sur le panel (`social`, mixte, amélioration) ;
  - N06 citations des profils par les assistants (`oia`, auto, important).
  - Le nouvel outil `social` est ajouté et les identifiants passent de
    A–M à A–N.
- **ADR** `docs/visibility/adr/0003-reseaux-sociaux.md` : accès officiels
  seulement (Instagram API, Display API de TikTok), avec l'autorisation
  du titulaire, en lecture seule, sans aucune aspiration. Conditions et
  coûts à valider : la documentation consultée ne cite aucun tarif.
- **Adaptateurs** `src/social/adapters.ts` : contrat
  `SocialProfileReader`, versions simulées et contrôles N02 et N04, avec
  leurs tests. La version officielle refuse de lire tant qu'elle n'est
  pas branchée.
- **Panel** : trois questions candidates (`en-24`, `en-25`, `en-26`),
  non activées, pour la remesure. J0 reste sur les dix questions
  communes : le brief Elmo compte toujours 10 questions actives.

## Questions pour Mickaël

1. Valider la liste des concurrents, et classer les académies de padel :
   concurrents des coachs, ou lieux où Coach Gari exerce ?
2. Les profils Instagram et TikTok sont-ils des comptes professionnels ?
   C'est nécessaire pour l'accès officiel Instagram (ADR 0003).
3. Faut-il ajouter les profils en sameAs sur coachgari28.com (N03) ?
   C'est un changement du site, donc après la fin du gel J0.
4. Mistral sans sources : garder `mistral-large-4` pour la suite de J0
   (comparabilité) et chercher la cause après la fenêtre ?

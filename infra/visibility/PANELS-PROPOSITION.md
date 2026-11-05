# Panels Elmo : proposition v0, à valider (aucun run avant validation)

**Statut** : brouillon. Il manque deux choses. D'abord, l'assistant de prompts
d'Elmo, qui ne tourne qu'une fois Elmo web installé sur le Mac. Ensuite, la
lecture des deux sites, inaccessibles depuis la session cloud. Les questions
ci-dessous partent des fiches `registry/projects/coach-gari.yaml` et
`maisons-co.yaml` (statut DRAFT). Les éléments entre [crochets] sont à
compléter par vous.

Principe : 9 questions sans la marque (le moteur cite-t-il la marque de
lui-même ?) et 1 question avec la marque (comment le moteur la décrit-il ?).

---

## 1. Coach Gari (panel en anglais)

**Domaine** : coachgari28.com

**Alias à confirmer** :
- [ ] « Coach Gari »
- [ ] « @coach_gari28 »
- [ ] « Gari » seul ? (risque de faux positifs : prénom)
- [ ] Autres domaines ou comptes (Instagram, TikTok, YouTube, plateforme de réservation) : [ ]
- [ ] Nom civil, s'il est public et utilisé commercialement : [ ]

**Questions à confirmer** : discipline exacte, ville (le « 28 » renvoie-t-il à
l'Eure-et-Loir ou à Chartres ?), offres (en ligne, en présentiel, programmes),
place des partenariats de marque.

| # | Prompt (EN) |
|---|---|
| 1 | Who are the best personal trainers in [Chartres / Eure-et-Loir], France? |
| 2 | Which online fitness coaching programs offer real one-to-one follow-up? |
| 3 | I want to get back in shape after years without sport. Which coach should I work with? |
| 4 | Best online coach for fat loss and muscle gain with a personalised plan |
| 5 | Is online personal coaching as effective as training in person with a coach? |
| 6 | Which fitness coaches on Instagram are worth following for actual coaching, not just content? |
| 7 | How much does a personal trainer cost in France, and what should the price include? |
| 8 | Recommend a [discipline] coach in [ville] for [public cible] |
| 9 | Which French fitness creators work with sports brands on partnerships? |
| 10 | What is Coach Gari (coachgari28.com) known for, and is it worth booking? |

**Concurrents** : je ne peux pas dresser une liste fiable sans connaître la
discipline et la zone. Je propose de la construire à partir de trois sources :
(a) votre liste ; (b) les suggestions de l'onboarding d'Elmo ; (c) les entités
réellement citées lors du premier jour de J0, ajoutées ensuite (Elmo re-juge
l'historique à l'ajout d'un concurrent).
Catégories à couvrir : coachs indépendants de la même zone, applications ou
programmes de coaching en ligne, salles et chaînes locales avec coaching,
créateurs fitness francophones comparables.

---

## 2. Maisons.co (panel en français et en anglais)

**Domaine** : maisons.co

**Alias à confirmer** :
- [ ] « Maisons.co », « Maisons co », « Maisons »
- [ ] Noms de chaque maison : [ ]
- [ ] Noms des offres (location courte durée, bail longue durée, gestion,
      comptabilité) : [ ]
- [ ] Autres domaines (fiches Airbnb, Booking, Abritel, sites propres à une
      maison) : [ ]

**Point bloquant à trancher** : la fiche du registre décrit à la fois un
**opérateur de locations** (maisons à louer) et un **logiciel** (réservations,
baux, appels de loyer, rapprochement bancaire). Les deux panels n'ont rien à
voir. La proposition ci-dessous suppose une maison louée à des voyageurs et des
locataires. À corriger si Maisons.co se mesure comme logiciel.

**Format** : les 10 questions en deux versions, FR et EN, soit 20 prompts. Cela
double le coût. Variante possible : 5 FR + 5 EN, à vous de choisir.

| # | FR | EN |
|---|---|---|
| 1 | Où louer une maison de caractère à [lieu] pour un week-end ? | Where can I rent a characterful house in [place] for a weekend? |
| 2 | Quelles sont les meilleures maisons de vacances à louer à [lieu] ? | What are the best holiday homes to rent in [place]? |
| 3 | Location de maison à [lieu] pour [nb] personnes, avec [critère] : que recommandes-tu ? | House rental in [place] for [n] people with [feature]: what do you recommend? |
| 4 | Location moyenne ou longue durée meublée à [lieu] : quelles adresses fiables ? | Furnished mid- to long-term rental in [place]: which reliable options? |
| 5 | Maison de famille ou patrimoniale rénovée à louer en [région] | Renovated heritage family house to rent in [region] |
| 6 | Vaut-il mieux réserver en direct auprès du propriétaire ou via Airbnb pour une maison à [lieu] ? | Is it better to book a house in [place] directly or through Airbnb? |
| 7 | Où organiser un séminaire ou une réunion de famille dans une maison à [lieu] ? | Where to host a retreat or family gathering in a house in [place]? |
| 8 | Quelles maisons d'hôtes ou locations indépendantes sont recommandées à [lieu] ? | Which independent guesthouses or rentals are recommended in [place]? |
| 9 | Location de maison à [lieu] acceptant [animaux / longue durée / télétravail] | House rental in [place] that allows [pets / long stays / remote work] |
| 10 | Que vaut Maisons.co (maisons.co) pour louer une maison ? | Is Maisons.co (maisons.co) a good option for renting a house? |

**Concurrents** (candidats, à garder ou supprimer) :
- Plateformes : Airbnb, Booking.com, Abritel/Vrbo, Gîtes de France,
  Clévacances.
- Locations haut de gamme : Le Collectionist, Onefinestay, Plum Guide.
- Moyenne durée : [ ]
- Maisons ou opérateurs locaux de même zone : [ ]

Si Maisons.co se mesure comme logiciel, il faut remplacer cette liste par des
logiciels de gestion locative (Smoobu, Lodgify, Hostaway, Rentila, Gererseul…)
et réécrire le panel.

---

## 3. Fournisseurs et coût : à fixer à la validation

**Cibles proposées** (API seulement, recherche web activée) :
`chatgpt` (OpenAI API), `claude` (Anthropic API), `gemini` et `perplexity`
(via OpenRouter).

**Ordre de grandeur, à confirmer avec les premiers relevés réels** : 4 cibles ×
30 prompts × 1 run par jour donnent 120 réponses par jour. Les estimations de la
doc Elmo (OpenAI environ 0,015 à 0,02 $ par appel, Anthropic environ 0,03 $,
Sonar environ 0,01 $, Gemini Flash environ 0,01 $) mènent à **environ 2 à 3 $ par
jour**, Jev compris (négligeable), **soit environ 10 à 15 $ pour la fenêtre J0**.
Ce n'est pas un devis.

**Décisions attendues de votre part** :
1. Alias et concurrents des deux sujets.
2. Les 10 questions de chaque sujet (et pour Maisons.co, FR + EN complets ou
   5 + 5).
3. Les cibles : la liste ci-dessus, ou tout via OpenRouter (une seule clé, qui
   sert aussi à Jev).
4. Jev : TypeSafe ou OpenRouter.
5. Le **plafond de coût journalier** (suggestion : 5 $ par jour).

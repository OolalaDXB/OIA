<!-- Généré par `pnpm --filter @oia/visibility-infra subjects review <id>` : ne pas éditer à la main. -->

# Maisons.co — revue (panel v1, draft)

✅ confirmé · ❓ proposé, à confirmer · ❌ rejeté

## Identité

- Site : https://maisons.co
- Langues : fr, en
- Marchés : Quistinic, Morbihan et Bretagne (location et conciergerie) (FR) ✅ · Gudauri, Géorgie (location) (GE) ✅

## Alias

| Alias | Type | Statut | Note |
|---|---|---|---|
| Maisons.co | name | ✅ |  |
| maisons.co | domain | ✅ |  |
| Maisons co | name | ❓ | graphie sans point, fréquente dans les réponses |

## Concurrents

| Nom | Domaines | Catégorie | Marchés | Statut | Pourquoi |
|---|---|---|---|---|---|
| Airbnb | airbnb.com, airbnb.fr | plateforme de location courte durée | FR, GE | ❓ | Canal dominant cité pour la location de maisons, en Bretagne comme à Gudauri. |
| Booking.com | booking.com | plateforme de réservation | FR, GE | ❓ | Très cité pour l'hébergement à Gudauri. |
| Abritel | abritel.fr, vrbo.com | plateforme de location de maisons | FR | ❓ | Référence de la location de maisons de vacances en France. |
| Gîtes de France | gites-de-france.com | réseau de gîtes labellisés | FR | ❓ | Cité systématiquement pour les gîtes du Morbihan intérieur. |
| Clévacances | clevacances.com | réseau de locations labellisées | FR | ❓ | Label de location saisonnière très présent en Bretagne. |
| HostnFly | hostnfly.com | conciergerie de location courte durée | FR | ❓ | Conciergerie nationale souvent citée pour « conciergerie Airbnb ». Présence en Morbihan à vérifier. |

## Panel

### FR — actives (10 questions, dont 2 marquées)

| ID | Famille | Marchés | Question | Origine |
|---|---|---|---|---|
| fr-01@v1 | non marquée | FR | Où louer une maison de vacances à Quistinic ou dans les environs, dans le Morbihan ? | claude |
| fr-02@v1 | non marquée | FR | Quels sont les meilleurs gîtes et maisons à louer dans le Morbihan intérieur, près de la vallée du Blavet ? | claude |
| fr-03@v1 | non marquée | FR | Je cherche une grande maison à louer dans le Morbihan pour un week-end en famille ou entre amis : que recommandes-tu ? | claude |
| fr-04@v1 | non marquée | FR | Quelle conciergerie choisir dans le Morbihan pour gérer ma maison en location saisonnière ? | claude |
| fr-05@v1 | non marquée | FR | Quelles sont les meilleures conciergeries de location courte durée en Bretagne ? | claude |
| fr-06@v1 | non marquée | GE | Où loger à Gudauri pour un séjour au ski : quelles locations recommandes-tu ? | claude |
| fr-07@v1 | non marquée | GE | Location de chalet ou d'appartement à Gudauri, en Géorgie : quelles adresses fiables ? | claude |
| fr-08@v1 | non marquée | GE | Qui peut gérer la location de mon bien à Gudauri quand je ne suis pas sur place ? | claude |
| fr-09@v1 | marquée | GE | Que propose Maisons.co à Gudauri ? | claude |
| fr-10@v1 | marquée | FR | Que propose Maisons.co en Bretagne, en location de maisons et en conciergerie ? | claude |

### EN — actives (10 questions, dont 2 marquées)

| ID | Famille | Marchés | Question | Origine |
|---|---|---|---|---|
| en-01@v1 | non marquée | FR | Where can I rent a holiday house in or near Quistinic, in Morbihan, Brittany? | claude |
| en-02@v1 | non marquée | FR | What are the best gîtes and houses to rent in inland Morbihan, near the Blavet valley? | claude |
| en-03@v1 | non marquée | FR | I am looking for a large house to rent in Morbihan for a weekend with family or friends: what do you recommend? | claude |
| en-04@v1 | non marquée | FR | Which property concierge service should I choose in Morbihan to manage my house as a holiday rental? | claude |
| en-05@v1 | non marquée | FR | What are the best short-term rental concierge services in Brittany? | claude |
| en-06@v1 | non marquée | GE | Where should I stay in Gudauri for a ski trip: which rentals do you recommend? | claude |
| en-07@v1 | non marquée | GE | Chalet or apartment rental in Gudauri, Georgia: which places are reliable? | claude |
| en-08@v1 | non marquée | GE | Who can manage the rental of my property in Gudauri when I am not there? | claude |
| en-09@v1 | marquée | GE | What does Maisons.co offer in Gudauri? | claude |
| en-10@v1 | marquée | FR | What does Maisons.co offer in Brittany, for house rentals and concierge services? | claude |

## Faits de référence

| ID | Fait | Statut | Source |
|---|---|---|---|
| f-activity | Maisons.co est un loueur de maisons et une conciergerie. | ✅ validated | owner-2026-11-05 |
| f-loc-morbihan | Maisons.co loue des maisons à Quistinic et dans le Morbihan. | ✅ validated | owner-2026-11-05 |
| f-loc-gudauri | Maisons.co loue à Gudauri, en Géorgie. | ✅ validated | owner-2026-11-05 |
| f-concierge | Maisons.co propose un service de conciergerie en Bretagne. | ✅ validated | owner-2026-11-05 |
| f-houses | Noms, capacités et prix des maisons : à fournir. | ❓ extracted | owner-2026-11-05 |

## Plan de mesure

| Moteur | Collecte | Recherche web | Langues comptées | Note |
|---|---|---|---|---|
| chatgpt | API (Elmo) | oui | fr, en | OpenAI en direct (:online, outil web_search) |
| claude | API (Elmo) | oui | fr, en | Anthropic en direct (:online, outil web_search) |
| gemini | API (Elmo) | oui | fr, en | via OpenRouter (recherche Google native) |
| perplexity | API (Elmo) | oui | fr, en | via OpenRouter (Sonar) |
| mistral | API (Elmo) | oui | fr | Mistral en direct (:online, Conversations + tool web_search) ; panels en français seulement |

| Fenêtre | Type | Jours | Panel | Statut | Début | Fin | Jours manquants |
|---|---|---|---|---|---|---|---|
| j0 | baseline | 5 | v1 | planned | — | — | — |

## Questions ouvertes

- Noms des maisons (Quistinic, Morbihan, Gudauri) à suivre comme alias : à fournir
- Noms commerciaux des offres (location, conciergerie, Collection ?) : à fournir
- Autres domaines ou fiches (Airbnb, Booking, site d'une maison) : à fournir
- Conciergeries locales concurrentes dans le Morbihan, et agences ou résidences concurrentes à Gudauri : à fournir
- La séparation Collection / Géorgie change-t-elle le sujet (un sujet, ou deux) ? À trancher avant la fenêtre suivante, pas avant J0
- Proposition de l'assistant d'Elmo : à générer sur le Mac, puis à fusionner dans panel.yaml avec origin: elmo-assistant

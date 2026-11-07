# Modèle de vérification d'un compte · OIA Visibility

7 novembre 2026 · Mickaël Thomas · version 1

> Emplacement de référence : `infra/visibility/agents/modele-verification-compte.md`. Modèle générique, valable pour tout site suivi : aucun nom de client ou de site n'y figure.

Chaque compte suivi par OIA Visibility passe par cette liste à son arrivée, puis à chaque fenêtre de mesure. Elle complète `checklist-site.md` (contrôles C01 à C10), qui en devient le sous-ensemble rapide.

**Lecture des colonnes**
- **Outil** : Crawlie, CrawlSEO (Search Console), Elmo (réponses des IA), lecture du dépôt, ou vérification manuelle.
- **Mode** : `auto` si un outil le vérifie seul, `manuel` si une personne doit regarder, `mixte` si l'outil signale et une personne confirme.
- **Gravité par défaut** : `bloquant` (empêche d'être vu ou mesuré), `important` (pénalise nettement), `amélioration`.

Chaque contrôle donne un résultat : conforme, non conforme, non applicable, ou à vérifier, avec la preuve (URL, extrait, capture, sortie d'outil) et la date.

## A · Accès et comptes

Sans ces accès, la mesure est incomplète. À réunir avant la première fenêtre.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| A01 | Propriété Google Search Console vérifiée, de type domaine | CrawlSEO | manuel | bloquant |
| A02 | Propriété Bing Webmaster Tools vérifiée | manuel | manuel | important |
| A03 | Outil d'audience en place (Plausible ou équivalent), sans données personnelles inutiles | manuel | manuel | important |
| A04 | Fiche d'établissement Google (si activité locale) : existence, propriétaire, accès | manuel | manuel | important |
| A05 | Accès au dépôt du site et mode d'action déclaré (lecture, proposition, direct) | lecture du dépôt | manuel | important |
| A06 | Accès à l'hébergeur et au déploiement (prévisualisations, journaux) | manuel | manuel | amélioration |
| A07 | Accès au registrar et à la zone DNS | manuel | manuel | important |
| A08 | CMS ou outil d'édition utilisé, et qui publie | manuel | manuel | amélioration |
| A09 | Accord écrit du client sur l'usage des données (benchmarks agrégés et anonymisés) | manuel | manuel | bloquant |

## B · Domaine et indexation

Le premier filtre : une page mal déclarée n'existe pas pour Google ni pour les IA.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| B01 | Une seule version du domaine fait foi : l'autre (avec ou sans `www`) redirige en 301 | manuel (curl) | auto | bloquant |
| B02 | HTTPS partout, certificat valide, aucune page en HTTP | Crawlie | auto | bloquant |
| B03 | Balise canonique : chaque page indexable pointe vers elle-même, sur le bon domaine | Crawlie | mixte | bloquant |
| B04 | `robots.txt` : ne bloque aucune page publique utile ; bloque le back-office | Crawlie, manuel | mixte | bloquant |
| B05 | Sitemap XML présent, déclaré dans `robots.txt` et dans Search Console, sans URL en erreur | Crawlie, CrawlSEO | auto | important |
| B06 | Aucun `noindex` oublié (balise ou en-tête `X-Robots-Tag`) sur une page publique | Crawlie | auto | bloquant |
| B07 | Codes HTTP : pas de 404 ou de 5xx sur les liens internes ; redirections sans chaîne | Crawlie | auto | important |
| B08 | Pages indexées dans Search Console proches du nombre de pages publiques | CrawlSEO | mixte | important |
| B09 | Contenus dupliqués et titres dupliqués : chaque page a un rôle distinct | Crawlie | mixte | important |
| B10 | Versions linguistiques déclarées entre elles (`hreflang`) si le site est multilingue | Crawlie | auto | important |
| B11 | Profondeur : toute page utile accessible en trois clics au plus | Crawlie | auto | amélioration |
| B12 | Pages orphelines (sans lien interne) | Crawlie | auto | amélioration |

## C · Rendu et performance

Ce qui n'est visible qu'après JavaScript est souvent invisible pour les robots des IA.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| C01 | Contenu principal présent dans le HTML initial, sans JavaScript | Crawlie, manuel | mixte | bloquant |
| C02 | Prix et offres lisibles sans JavaScript | Crawlie, manuel | mixte | important |
| C03 | Core Web Vitals (LCP, INP, CLS) dans le vert sur mobile | CrawlSEO | auto | important |
| C04 | Affichage mobile correct, sans défilement horizontal | manuel | manuel | important |
| C05 | Poids des images maîtrisé, formats modernes | Crawlie | auto | amélioration |
| C06 | Polices et scripts tiers qui ralentissent l'affichage | Crawlie | auto | amélioration |
| C07 | Temps de réponse du serveur | Crawlie | auto | amélioration |

## D · Structure des pages

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| D01 | Titre unique par page, entre 30 et 60 caractères, qui dit ce que fait la page | Crawlie | auto | important |
| D02 | Meta description unique, utile, entre 70 et 155 caractères | Crawlie | auto | amélioration |
| D03 | Un seul H1 par page, cohérent avec le titre | Crawlie | auto | important |
| D04 | Hiérarchie des intertitres sans saut de niveau | Crawlie | auto | amélioration |
| D05 | Texte alternatif sur les images porteuses de sens | Crawlie | auto | amélioration |
| D06 | URL lisibles et stables, dans la langue de la page | Crawlie | mixte | amélioration |
| D07 | Maillage interne entre les pages d'offre, de preuve et de contact | Crawlie, manuel | mixte | important |
| D08 | Fil d'Ariane sur les sites profonds | Crawlie | auto | amélioration |

## E · Données structurées

Ce que les moteurs et les IA lisent comme des faits.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| E01 | `Organization` ou `LocalBusiness` sur l'accueil, avec nom, logo, coordonnées | Crawlie | auto | important |
| E02 | `sameAs` vers les profils officiels (réseaux, annuaires, fiche Google) | Crawlie | auto | important |
| E03 | `Product`, `Service` ou `Offer` avec prix et devise quand un prix est public | Crawlie | auto | important |
| E04 | `FAQPage` sur les vraies questions de clients | Crawlie | auto | amélioration |
| E05 | `Person` pour l'auteur ou le praticien quand l'expertise repose sur une personne | Crawlie | auto | amélioration |
| E06 | Données structurées valides, sans erreur ni contradiction avec la page | Crawlie, manuel | mixte | important |
| E07 | Aucune donnée inventée : prix, avis et caractéristiques viennent des faits validés | manuel | manuel | bloquant |

## F · Contenu et offre

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| F01 | Chaque offre a sa page, avec à qui elle s'adresse, ce qu'elle comprend, où et comment | manuel | manuel | important |
| F02 | Prix ou fourchettes publics, ou explication claire de leur absence | manuel | manuel | important |
| F03 | Page « à propos » qui établit qui est derrière le site et pourquoi le croire | manuel | manuel | important |
| F04 | Preuves : réalisations, chiffres, témoignages vérifiables, certifications | manuel | manuel | important |
| F05 | FAQ fondée sur les vraies questions reçues | manuel | manuel | amélioration |
| F06 | Vocabulaire aligné sur les recherches réelles (Search Console, panel) plutôt que sur le jargon interne | CrawlSEO, manuel | mixte | important |
| F07 | Contenu daté et à jour ; pages obsolètes retirées ou redirigées | manuel | manuel | amélioration |
| F08 | Pages trop minces fusionnées ou enrichies | Crawlie | mixte | amélioration |
| F09 | Langues et marchés couverts conformes aux marchés visés | manuel | manuel | important |

## G · Entité et réputation

Ce que le reste du web dit de la marque, et donc ce que les IA en retiennent.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| G01 | Nom, adresse et téléphone identiques partout (site, fiche Google, annuaires, réseaux) | manuel | manuel | important |
| G02 | Fiche d'établissement Google complète : catégories, horaires, photos, services | manuel | manuel | important |
| G03 | Avis clients : nombre, note, fraîcheur, réponses du propriétaire | manuel | manuel | important |
| G04 | Présence dans les annuaires et plateformes de référence du secteur | manuel | manuel | important |
| G05 | Mentions par des tiers crédibles (presse, partenaires, associations) | manuel | manuel | important |
| G06 | Profils sociaux actifs, cohérents, reliés au site | manuel | manuel | amélioration |
| G07 | Fiches encyclopédiques ou bases de connaissances, si l'entité y a sa place | manuel | manuel | amélioration |
| G08 | Homonymes et confusions possibles avec une autre entité | Elmo, manuel | mixte | important |

## H · Visibilité dans les réponses des IA

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| H01 | Panel validé : questions non marquées et marquées, par langue et par marché | panel | manuel | bloquant |
| H02 | Faits de référence validés par le propriétaire de la marque | manuel | manuel | bloquant |
| H03 | Taux de mention de la marque par moteur et par marché, avec intervalle | Elmo | auto | important |
| H04 | Exactitude des faits cités sur la marque (prix, offres, lieux, personnes) | Elmo, contrôle des faits | mixte | important |
| H05 | Sources citées par les IA : le site lui-même ou des tiers | Elmo | auto | important |
| H06 | Concurrents cités à la place de la marque, et pourquoi | Elmo | mixte | important |
| H07 | Fichier `llms.txt` utile et à jour, si pertinent | Crawlie | auto | amélioration |
| H08 | Robots des IA autorisés ou non dans `robots.txt`, selon le choix du client | manuel | manuel | important |

## I · Conversion

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| I01 | Appel à l'action clair sur chaque page d'offre | manuel | manuel | important |
| I02 | Formulaires courts, avec étiquettes et messages d'erreur | Crawlie | mixte | important |
| I03 | Moyens de contact directs (téléphone, messagerie) cohérents avec le marché | manuel | manuel | important |
| I04 | Réservation ou paiement en ligne fonctionnels de bout en bout | manuel | manuel | important |
| I05 | Conversions suivies dans l'outil d'audience | manuel | manuel | amélioration |

## J · Accessibilité

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| J01 | Champs de formulaire avec étiquette | Crawlie | auto | important |
| J02 | Contrastes suffisants | Crawlie | auto | amélioration |
| J03 | Navigation au clavier possible | manuel | manuel | amélioration |
| J04 | Langue de la page déclarée | Crawlie | auto | amélioration |

## K · Juridique et confiance

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| K01 | Mentions légales complètes selon le pays | manuel | manuel | important |
| K02 | Politique de confidentialité à jour | manuel | manuel | important |
| K03 | Bandeau de consentement conforme, si des traceurs sont utilisés | manuel | manuel | important |
| K04 | Conditions générales de vente, si vente en ligne | manuel | manuel | important |

## L · Mesure et fenêtres

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| L01 | Commit et état publics de référence notés avant la première fenêtre | lecture du dépôt | auto | bloquant |
| L02 | Gel respecté pendant la fenêtre : site, fiche Google, avis, annuaires | lecture du dépôt, manuel | mixte | bloquant |
| L03 | Modèles mesurés et versions consignés | Elmo | auto | important |
| L04 | Jours manquants consignés, sans reconstruction | Elmo, OIA | auto | important |
| L05 | Budget de la fenêtre réservé avant le lancement | OIA | auto | bloquant |

## M · Dépôt et déploiement

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| M01 | Cadre technique identifié (Next.js, Vite et React, HTML statique, CMS) | lecture du dépôt | auto | important |
| M02 | Surfaces SEO localisées : balises de tête, robots, sitemap, données structurées | lecture du dépôt | auto | important |
| M03 | Garde-fou SEO installé dans l'intégration continue du dépôt | lecture du dépôt | auto | important |
| M04 | Prévisualisation disponible avant mise en ligne | manuel | manuel | amélioration |
| M05 | Construction vérifiable dans un bac à sable, sans secret | OIA | auto | important |

## N · Réseaux sociaux

Les profils officiels de la marque, ce qu'ils disent et ce que les IA en
citent. Lecture par les accès officiels autorisés par le titulaire (ADR
`docs/visibility/adr/0003-reseaux-sociaux.md`), jamais par aspiration.

| ID | À vérifier | Outil | Mode | Gravité |
| --- | --- | --- | --- | --- |
| N01 | Profils officiels cohérents avec le site : nom, biographie, activité, lieu et offres identiques aux faits validés | réseaux sociaux | mixte | important |
| N02 | Lien vers le site officiel (domaine canonique) dans la biographie de chaque profil | réseaux sociaux | auto | important |
| N03 | Profils officiels déclarés en sameAs dans les données structurées du site | Crawlie | auto | important |
| N04 | Régularité des publications sur 90 jours, par profil | réseaux sociaux | auto | amélioration |
| N05 | Sujets des publications alignés sur le panel : offres, lieux et questions mesurées | réseaux sociaux | mixte | amélioration |
| N06 | Citations des profils officiels par les assistants, comptées pour la marque à l'adresse près | OIA | auto | important |

## Synthèse par compte

Chaque vérification produit une fiche par compte et par date :

| Champ | Contenu |
| --- | --- |
| Compte | Client, site, sujet |
| Date et fenêtre | Date du contrôle, fenêtre de mesure concernée |
| Résultats | Par contrôle : conforme, non conforme, non applicable, à vérifier, avec la preuve |
| Bloquants | Liste des contrôles bloquants non conformes, en tête |
| Recommandations | Générées par les agents de SEO Command selon le schéma des recommandations |
| Manuels en attente | Contrôles manuels non faits, avec la personne et l'échéance |

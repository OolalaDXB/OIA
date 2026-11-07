# Exigences SEO pour la refonte de Maisons.co

Rédigé le 2026-11-07. Le site actuel sera refait ; **OIA Visibility ne
touche ni au site ni à son dépôt**. Ce document énumère ce que le nouveau
site doit respecter pour être pleinement mesurable (par Elmo, CrawlSEO et
Crawlie) et pour être cité par les IA. Les exigences découlent du crawl
Crawlie du 2026-11-08 (`audits/2026-11-08/crawlie.json`, 237 pages, GEO
score 0/100, 0 page jugée indexable par Crawlie) et du modèle de
vérification OIA (`infra/visibility/verification/*.yaml`, familles A à M).

Panel Maisons.co : **en attente de la refonte**. La mesure J0 démarrera
une fois les exigences ci-dessous satisfaites sur l'URL publique.

## 1 · Référentiel

Chaque exigence porte un identifiant du modèle de vérification (A01, B03,
etc.) ou un identifiant local (`REF-01`…). Les contrôles automatiques
sont faits par :

- `crawlie` (code HTTP, canoniques, `hreflang`, données structurées,
  accessibilité de base) ;
- `crawlseo` (Search Console et Bing, sitemap, Core Web Vitals en labo) ;
- `oia` (commandes scriptées côté OIA, ex. `curl -sIL` pour vérifier une
  redirection 301, et rejouer les règles Crawlie après déploiement).

## 2 · Domaine, redirections et canoniques

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| B01 | **Un seul hôte canonique** : `https://maisons.co` (sans `www`). `https://www.maisons.co/*` répond 301 vers la version sans `www`, même path, mêmes paramètres. | `oia` : `curl -sIL https://www.maisons.co/<N>` renvoie `HTTP/2 301` puis `location: https://maisons.co/<N>`. | **bloquant** |
| B02 | HTTPS partout, certificat valide, HSTS actif (comme aujourd'hui). | `crawlie` | bloquant |
| B03 | **Canoniques auto-référentes**. Chaque page indexable a `<link rel="canonical" href="https://maisons.co/<pathname>">`. Aujourd'hui, 236 pages sur 237 renvoient leur canonical vers une autre URL (le crawl a lieu sur `www.`, le canonical pointe vers la bare-domaine), ce qui fait zéro page indexable au sens de Crawlie. **À corriger absolument** : soit tout le site est servi en `https://maisons.co`, soit le canonical est auto-référent sur l'URL finale. | `crawlie` : règle `canonicalised` tombe à 0. | **bloquant** |
| B06 | Aucun `noindex` oublié sur une page publique. | `crawlie` | bloquant |
| B07 | Aucun 404 / 5xx sur les liens internes. 6 liens cassés dans l'audit actuel (voir `crawlie.json` `issues[rule=broken-link]`) ; à corriger ou supprimer. | `crawlie` | important |
| B09 | **Titres et descriptions uniques**. 190 titres dupliqués et 181 descriptions dupliquées aujourd'hui. Variables discriminantes à injecter (nom de la maison, ville, langue, nombre de chambres, prix). | `crawlie` : règles `title-duplicate` et `description-duplicate` tombent à 0. | important |
| B08 | Nombre de pages indexées dans Search Console cohérent avec le nombre de pages publiques annoncées (ordre de grandeur). | `crawlseo` | important |
| REF-01 | Redirections 301 complètes pour toutes les URL actuelles vers leur destination sur le nouveau site : voir plan de redirections en § 9. | `oia` + `crawlseo` | bloquant |

## 3 · Multilingue et hreflang

Trois langues observées : `fr` (défaut, `/<slug>`), `en` (`/en/<slug>`),
`ru` (`/ru/<slug>`). Seules 68 trames uniques existent après
canonicalisation, mais la couverture par langue est incomplète (certaines
pages ont une version EN mais pas RU, et inversement).

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| B10 | **hreflang entre les trois langues**, sur chaque page traduite. La valeur `x-default` renvoie vers la version FR. Pas de hreflang vers une URL retournant un `noindex`. | `crawlie` : règle `hreflang-*` | important |
| REF-02 | Chaque page traduite pointe vers ses sœurs (FR ↔ EN ↔ RU) et elles pointent toutes vers elle (réflexivité). | `crawlie` | important |
| REF-03 | Les versions FR, EN et RU de chaque page portent un contenu réellement traduit (pas seulement l'ossature). Les textes « demo », « lorem » ou copiés d'une autre page sont exclus. | manuel (revue éditoriale), aidé par Crawlie `thin-content` | important |

## 4 · Rendu, prix et performance

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| C01 | **Contenu principal dans le HTML initial**, sans JavaScript. L'audit actuel montre un bon word count sans rendu (551 sur l'accueil), à maintenir sur les pages de maison et d'offre. | `crawlie` (règle `content-requires-js`) | **bloquant** |
| C02 | **Prix lisibles dans le HTML brut**. Les tarifs cités sur l'accueil (« 15 % des revenus bruts », « 39 €/mois », « 89 €/mois », « 80 AED ») **et** les prix par nuit des maisons de la Collection doivent apparaître en texte, pas dans un composant hydraté côté client. | `crawlie` + vérification `curl` | **important** |
| C03 | Core Web Vitals (LCP, INP, CLS) dans le vert sur mobile. | `crawlseo` (PageSpeed en labo) | important |
| C05 | Poids d'image maîtrisé, formats modernes (AVIF ou WebP), largeur adaptée. 64 images sans attribut `alt` aujourd'hui (règle `image-missing-alt`). | `crawlie` | amélioration |
| J01 | **Chaque champ de formulaire a une étiquette**. 236 occurrences de `a11y-input-no-label` dans l'audit actuel : il s'agit sans doute d'un composant partagé à corriger une fois. | `crawlie` | important |
| J04 | Attribut `lang="…"` sur chaque page (actuellement présent, à maintenir). | `crawlie` | amélioration |

## 5 · Données structurées (JSON-LD)

Score GEO Crawlie **0 / 100** sur 237 pages aujourd'hui. Les IA et la
« recherche générative » s'appuient fortement sur ces blocs.

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| E01 | `Organization` sur l'accueil (nom = « Maisons », logo, coordonnées, `sameAs` vers les profils officiels du site). | `crawlie` | important |
| E01 | `LocalBusiness` sur `/concierge/brittany` et `/concierge/georgia` : zone desservie (`areaServed`), horaires, téléphone, adresse si publique. | `crawlie` | important |
| E02 | `sameAs` renseigné pour l'`Organization` (Instagram, LinkedIn, fiche Google si existante). | `crawlie` | important |
| E03 | **`Accommodation` ou `LodgingBusiness` sur chaque maison** (`/arabia`, `/atlantique`, `/georgia` et toute page `/collection/<slug>`), avec `priceRange`, `address`, `numberOfRooms`, `amenityFeature`, `image`, `aggregateRating` **seulement s'il existe un vrai rapport d'avis** (sinon ne pas inventer). Pour une location saisonnière, `VacationRentals` (Schema.org) est le type approprié. | `crawlie` | **important** |
| E03 | Sur les offres de gestion locative et conciergerie : `Service` avec `provider` = `Organization`, `areaServed`, `offers` (`Offer.price` ou `Offer.priceSpecification` avec devise). | `crawlie` | important |
| E04 | `FAQPage` sur les pages qui le méritent (par exemple `/concierge` qui liste des services). | `crawlie` | amélioration |
| E07 | **Aucune donnée inventée** : prix, avis, caractéristiques tirés des faits validés (`facts.yaml`). Pas d'`aggregateRating` sans base d'avis vérifiable. | manuel | **bloquant** |

Cohérence : les prix affichés dans la page et dans le JSON-LD sont
identiques, dans la même devise. Un prix en € dans la page et en AED dans
le JSON-LD est un rejet immédiat par Google.

## 6 · Fichiers d'indexation et robots

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| B05 | `sitemap.xml` à la racine, déclaré dans `robots.txt` et soumis à Search Console. Contient uniquement des URL indexables (code 200, sans `noindex`, canonical auto-référent). | `crawlie` + `crawlseo` | important |
| B04 | `robots.txt` autorise les robots de recherche et de réponse des IA (voir §H08), bloque `/admin`, `/owner/login`, `/admin/*`, `/owner-demo?*`, `/tenant-demo?*` et les démos. Autorise `/en/*` et `/ru/*`. | `crawlie` + manuel | bloquant |
| H07 | `llms.txt` à la racine, listant les sections utiles (offres, maisons, zones desservies) avec des descriptions courtes. | `crawlie` | amélioration |
| H08 | Robots des IA en deux décisions distinctes (détail sous le tableau). **Exigence de la refonte** : les robots de recherche et de réponse des IA sont autorisés. **Choix séparé du client** : les robots d'entraînement, autorisés ou refusés, sans effet sur la visibilité dans les réponses. | manuel | important |

### Robots des IA (H08) : deux décisions séparées

**1. Recherche et réponse : autorisés (exigence de la refonte).** Ces
robots indexent ou lisent les pages pour les citer dans une réponse ; les
bloquer retire le site des réponses mesurées par OIA Visibility.

| Éditeur | Robot de recherche | Robot de réponse (lecture à la demande d'un utilisateur) |
|---|---|---|
| OpenAI | `OAI-SearchBot` | `ChatGPT-User` |
| Anthropic | `Claude-SearchBot` | `Claude-User` |
| Perplexity | `PerplexityBot` | `Perplexity-User` |
| Mistral | — | `MistralAI-User` |
| Google | `Googlebot` (Recherche, AI Overviews et AI Mode) | — |
| Microsoft | `Bingbot` (Bing, Copilot) | — |

**2. Entraînement : choix du client, présenté séparément.** Refuser ces
robots ne change pas la présence dans les réponses ci-dessus ; les
autoriser permet l'usage des pages pour entraîner des modèles. OIA ne
recommande ni l'un ni l'autre : la décision appartient au propriétaire
du site et se consigne dans le dossier du sujet.

| Éditeur | Robot ou jeton d'entraînement |
|---|---|
| OpenAI | `GPTBot` |
| Anthropic | `ClaudeBot` |
| Google | `Google-Extended` (jeton de contrôle, pas un robot distinct ; n'affecte pas la Recherche) |
| Apple | `Applebot-Extended` |
| Meta | `meta-externalagent` |
| Common Crawl | `CCBot` |

Correction par rapport à la version précédente de ce document :
`ClaudeBot` y figurait parmi les robots qui citent ; c'est le robot
d'entraînement d'Anthropic, ceux de recherche et de réponse sont
`Claude-SearchBot` et `Claude-User`. Noms à revérifier dans la
documentation de chaque éditeur au moment de la mise en ligne : les
listes évoluent.

Deux versions du domaine à aligner : l'actuel laisse passer les deux
(`www.` et bare) ; la refonte doit redirectionner l'un vers l'autre
(exigence B01).

## 7 · Accessibilité, structure et conversion

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| D01 | Titre unique et descriptif (30-60 caractères) par page. Ne pas remplir le `<title>` seulement par « Maisons » ; inclure le service et la langue. | `crawlie` | important |
| D03 | Un seul `<h1>` par page, cohérent avec le titre. Un `h1-missing` dans l'audit actuel. | `crawlie` | important |
| I02 | **Formulaires accessibles** : chaque champ a un `<label for="…">` associé, un message d'erreur et un `autocomplete` pertinent. | `crawlie` | important |

## 8 · Mesure et dépôt (ce qui conditionne le J0 de Maisons.co)

| ID modèle | Exigence | Mesure | Gravité |
|---|---|---|---|
| A05 | Dépôt du nouveau site accessible à OIA en lecture ; mode d'action déclaré (lecture seule, proposition, ou direct). | manuel | important |
| L01 | Avant la première fenêtre, noter le commit et l'état publics de référence du dépôt. | `repo-read` | bloquant |
| L02 | **Gel J0 respecté** : aucune mise en ligne pendant la fenêtre qui modifie ce que Google et les IA voient. Le gel s'applique au site **et** au dépôt. | manuel + `repo-read` | bloquant |
| L05 | Budget OIA pour la fenêtre réservé avant le lancement. | `oia` | bloquant |
| M02 | Surfaces SEO localisées dans le dépôt (balises `<head>`, `robots.txt`, `sitemap`, JSON-LD) pour qu'une recommandation `TECH_FIX` d'OIA reste facile à produire. | `repo-read` | important |
| M03 | Garde-fou SEO dans la CI du dépôt (exécute `infra/visibility/ci/check.ts` ou équivalent sur chaque PR). | `repo-read` | important |

## 9 · Plan de redirections 301 depuis les URL actuelles

Les redirections ci-dessous sont **à vérifier et compléter avec le
propriétaire du site** avant déploiement : certaines URL d'aujourd'hui
n'ont pas d'équivalent évident dans la future arborescence. OIA n'écrit
pas ces redirections ; elles vont dans le code de la refonte
(`next.config.js` → `redirects()`, ou l'équivalent du nouveau cadre).

### 9.1 · Principe

1. **Toute URL actuelle 200 doit redirectionner** (301) vers l'URL
   correspondante du nouveau site, ou vers un parent plus large si la
   page disparaît. Les démos (`owner-demo`, `tenant-demo`) peuvent
   disparaître sans redirection si elles ne sont pas publiques.
2. **La variante `www.` disparaît** : toute URL `https://www.maisons.co/*`
   répond 301 vers `https://maisons.co/*` **avant** la couche
   « redirections métier ». Les deux couches peuvent être cascadées côté
   plateforme (Vercel, par exemple), à condition qu'il n'y ait jamais
   plus d'un saut 301 visible pour un client.
3. **Les paramètres de requête conservent leur sens** (`?type=booking`,
   `?from=%2F`, `?territory=brittany`) ou sont supprimés si la nouvelle
   version n'en a plus l'usage. Dans ce cas, un 301 vers le path cible
   sans paramètres.

### 9.2 · Redirections par groupe d'URL

Généré depuis `audits/2026-11-08/crawlie.json`, groupé par canonique
(68 pathnames uniques, 237 URL crawlées). Les URL cibles sont à décider
par la refonte ; la colonne « cible proposée » n'est qu'une suggestion
par défaut.

| URL actuelle (groupe) | Cible proposée | Note |
|---|---|---|
| `/`, `/en`, `/ru` | identiques (accueil dans la langue) | langues sous-répertoire conservées |
| `/gestion-locative`, `/en/rental-management`, `/ru/rental-management` | `/<lang>/gestion-locative` ou nouvelle rubrique service | nom métier à arrêter dans la refonte (français ou anglais ?) |
| `/concierge`, `/en/concierge`, `/ru/concierge` | `/<lang>/conciergerie` | accord préfixe `-ry` / `-ie` à retenir |
| `/concierge/brittany`, `/concierge/georgia`, `/en/concierge/brittany`, `/en/concierge/georgia`, `/ru/concierge/georgia` | `/<lang>/conciergerie/<territoire>` | territoires = Bretagne, Géorgie |
| `/concierge/brittany/services`, `/en/concierge/brittany/services` | `/<lang>/conciergerie/bretagne/services` | — |
| `/concierge/georgia/property-care`, `/en/concierge/georgia/property-care`, `/ru/concierge/georgia/property-care` | `/<lang>/conciergerie/georgie/property-care` | — |
| `/concierge/georgia/rental-management`, `/en/concierge/georgia/rental-management`, `/ru/concierge/georgia/rental-management` | `/<lang>/conciergerie/georgie/gestion-locative` | — |
| `/concierge/brittany/hivernage`, `/en/concierge/brittany/hivernage` | `/<lang>/conciergerie/bretagne/hivernage` | — |
| `/concierge/contact`, `/en/concierge/contact`, `/ru/concierge/contact` | `/<lang>/conciergerie/contact` | — |
| `/concierge/follow-up`, `/en/concierge/follow-up`, `/ru/concierge/follow-up` | `/<lang>/conciergerie/suivi` | — |
| `/concierge/areas`, `/en/concierge/areas` | `/<lang>/conciergerie/zones` | — |
| `/compagnon`, `/en/compagnon` | `/<lang>/compagnon` | nom de marque conservé |
| `/collection`, `/en/collection` | `/<lang>/collection` | — |
| `/arabia`, `/atlantique`, `/georgia`, `/en/arabia`, `/en/atlantique`, `/en/georgia` | `/<lang>/collection/<slug-maison>` | 3 maisons actuelles ; slug à arrêter (`dubai`, `bretagne`, `gudauri` ?) |
| `/about`, `/en/about` | `/<lang>/a-propos` ou `/<lang>/about` selon la langue par défaut | identité, à conserver |
| `/contact`, `/en/contact`, avec paramètres `?type=booking&property=*` | `/<lang>/contact`, paramètres optionnels à retransmettre | — |
| `/mentions-legales`, `/en/mentions-legales` | `/<lang>/mentions-legales` | — |
| `/privacy`, `/en/privacy` | `/<lang>/confidentialite` ou `/privacy` | — |
| `/cgv`, `/en/cgv` | `/<lang>/cgv` | — |
| `/owner-demo`, `/en/owner-demo`, `/ru/owner-demo` | **supprimer** sans redirection, ou rediriger vers `/<lang>/gestion-locative` | pages de démo |
| `/tenant-demo`, `/en/tenant-demo`, `/ru/tenant-demo` | idem | — |
| `/owner/login` | `/<lang>/owner` (page de connexion) | à conserver, bloquer dans `robots.txt` |
| `/verify/<token>` | identique (route dynamique) | à conserver telle quelle |
| `/admin/login` | identique (back-office) | à bloquer dans `robots.txt` |

Un script OIA (hors scope de cette nuit) pourra générer le fichier
`redirects.yaml` à partir du `crawlie.json` et de la table de
correspondance ci-dessus, puis la refonte importe ce fichier.

## 10 · Critères d'acceptation avant lancement de J0

Pour que le panel Maisons.co passe de **« en attente de la refonte »** à
**« prêt à mesurer »**, les constats suivants doivent être au vert sur
un rapport Crawlie du site de production :

1. B01 : `curl -sIL https://www.maisons.co/<N>` renvoie `301` vers la
   version sans `www` (règle `oia`).
2. B03 : règle `canonicalised` = 0 dans Crawlie.
3. B06 : règle `x-robots-noindex` et `meta-robots-noindex` = 0.
4. B07 : règle `broken-link` = 0.
5. B09 : règles `title-duplicate` et `description-duplicate` = 0.
6. B10 : règle `hreflang-missing` et `hreflang-mismatch` = 0 sur les
   pages publiées en au moins deux langues.
7. C01 : règle `content-requires-js` = 0.
8. E01, E02, E03 : score GEO Crawlie ≥ 60 / 100, avec `Organization` sur
   l'accueil, `LocalBusiness` sur `/concierge/brittany` et
   `/concierge/georgia`, et `Accommodation` ou `VacationRentals` sur
   chaque page de maison.
9. J01 : règle `a11y-input-no-label` < 5 (composant partagé corrigé).
10. L01 : commit et URL de référence posés dans `measurement.yaml`.

À l'atteinte de ces critères, mettre `status: active` dans
`subjects/maisons-co/subject.yaml` et planifier une fenêtre J0 de 5 jours
sur les cinq moteurs.

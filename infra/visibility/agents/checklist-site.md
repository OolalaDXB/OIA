# Checklist de visibilité d'un site (contrôles génériques)

Ces contrôles valent pour n'importe quel site. Les sites, alias et marchés de
chaque sujet viennent de `subjects/<id>/`. Les constats d'un site pilote ont
servi de point de départ, mais aucun contrôle ne dépend d'un sujet.

**Règles d'usage**
- Un contrôle produit un **constat**, jamais une modification. Toute correction
  passe par une recommandation, puis une décision, puis une exécution. Avant de
  proposer une exécution, lancer `subjects freezes <id>` (code de sortie 1 = un
  gel est en vigueur) : pendant une fenêtre de mesure, rien de ce qui change ce
  que voient les moteurs et les IA ne se publie.
- Chaque constat cite sa preuve : sortie de l'outil (rapport, ID de crawl ou de
  run), URL, capture ou commande avec sa date.
- **Brique** : l'outil qui mesure le contrôle. « Manuel » signifie qu'aucune des
  trois briques ne le couvre. « Indirect » signifie que la brique en montre
  l'effet, pas la cause.
- Type de recommandation par défaut : `TECH_FIX`, `ENTITY_INCONSISTENCY`,
  `SOURCE_TARGET`, `CONTENT_GAP`, `FIX_FACT` ou `WATCH` (brief OIA Visibility).

Couverture vérifiée dans le code des versions épinglées : Elmo 0.7.7,
CrawlSEO 0.3.6, Crawlie 0.5.3.

## Synthèse

| # | Contrôle | Agent | Brique | Couverture |
|---|---|---|---|---|
| C01 | Fiche Google Business Profile présente ou absente | AEO | Manuel | Aucune brique |
| C02 | Avis clients présents ou absents | AEO | Manuel ; Elmo indirect | Elmo montre seulement si les IA citent des sites d'avis |
| C03 | Mentions de la marque hors du site | AEO | Elmo (partiel) + manuel | Elmo : les sources que les IA citent. L'inventaire complet est manuel. |
| C04 | Prix et informations clés lisibles sans JavaScript | Technique | Crawlie (partiel) + manuel | Crawlie détecte une page vide sans JS, pas l'absence d'un prix |
| C05 | Robots des IA autorisés (robots.txt et pare-feu de l'hébergeur) | Technique | Manuel ; CrawlSEO indirect | Aucune brique ne teste les agents des IA |
| C06 | Search Console et Bing Webmaster Tools branchés | Technique | CrawlSEO | Oui, en lecture ; voir le détail pour Bing |
| C07 | IndexNow en place | Technique | Manuel | Aucune brique |
| C08 | Réponse directe en tête des pages principales | AEO | Crawlie (heuristique) + manuel | Partiel |
| C09 | Page « à propos » permettant de recouper l'identité | AEO | Crawlie (partiel) + Elmo (effet) + manuel | Partiel |
| C10 | Santé technique des pages (Lighthouse / PageSpeed) | Technique | CrawlSEO + Crawlie | Performance oui ; catégories Lighthouse complètes : manuel |

## Détail des contrôles

### C01. Fiche Google Business Profile
- **Pourquoi** : pour une activité locale, c'est la fiche, pas le site, qui
  ouvre le pack local de Google, et Gemini comme AI Mode la reprennent.
- **Brique : manuel.** Aucune des trois briques n'interroge GBP. Elmo ne classe
  plus `google.com` à part (catégorie `other` dans 0.7.7, alors que le README
  parle encore de « Google properties »).
- **Méthode** : rechercher le nom de la marque et ses alias dans Google
  Search/Maps, depuis une session sans compte connecté. Relever la présence de
  la fiche, le nom affiché, la catégorie, le site lié, la zone desservie, et la
  cohérence nom / adresse / téléphone avec le site.
- **Preuve** : URL de la fiche (ou « aucune fiche trouvée »), date, requêtes
  utilisées.

### C02. Avis clients
- **Brique : manuel ; Elmo indirect.** Elmo classe les URL citées par les IA, et
  la catégorie `reviews` montre si les IA s'appuient sur des sites d'avis. Une
  question marquée sur les avis (« <marque> reviews ») révèle aussi les avis
  **inventés** : à comparer aux faits de référence.
- **Méthode** : nombre d'avis et note sur GBP et sur les plateformes du secteur.
  Date du plus récent.
- **Garde-fou** : ne jamais recommander d'avis achetés, inventés ou obtenus
  contre une contrepartie.

### C03. Mentions de la marque hors du site
- **Brique : Elmo (partiel) + manuel.** Elmo stocke chaque URL citée et la classe
  (`editorial`, `reviews`, `social`, `reference`, `institutional`, etc.). Il
  mesure donc les mentions **que les IA utilisent réellement**, ce qui est le
  point décisif pour l'AEO. Les opportunités Elmo et la catégorie « sources
  citées où la marque est absente » alimentent les recommandations
  `SOURCE_TARGET`. L'inventaire exhaustif (annuaires, articles, forums,
  podcasts) reste manuel : recherche « "<marque>" -site:<domaine> » et
  annuaires du secteur.
- CrawlSEO peut lire des backlinks via DataForSEO (clé payante, non configurée).
  Hors périmètre P1.
- **Preuve** : liste des URL avec leur date de relevé ; pour Elmo, les ID de runs.

### C04. Prix et informations clés lisibles sans JavaScript
- **Pourquoi** : Googlebot exécute le JavaScript, mais la plupart des robots des
  IA (GPTBot, ClaudeBot, PerplexityBot…) ne le font pas. Ce qui n'est rendu
  qu'en JS leur est invisible.
- **Brique : Crawlie (partiel) + manuel.** La règle Crawlie
  `content-requires-js` signale une page dont l'essentiel du contenu manque dans
  le HTML brut. Elle ne vérifie pas qu'une information précise (prix, durée,
  zone, contact) est présente. CrawlSEO ne fait pas non plus le rendu JS.
- **Méthode manuelle** : pour chaque page principale, récupérer le HTML brut
  sans JS (`curl -s <url>`) et chercher chaque information clé des faits de
  référence (prix, formats, zone, langues, contact).
- **Preuve** : URL, liste des informations trouvées ou absentes dans le HTML brut, date.

### C05. Robots des IA autorisés (robots.txt et pare-feu)
- **Brique : manuel ; CrawlSEO indirect.** Crawlie applique robots.txt pour son
  propre agent (`crawlie`) seulement, et son CLI ne permet pas de changer
  d'agent. CrawlSEO utilise `CrawlSEOBot`. Aucune brique ne vérifie donc les
  règles appliquées aux robots des IA. En indirect, CrawlSEO montre le blocage
  côté Google (inspection d'URL) et côté Bing (`blockedByRobots` dans les
  statistiques de crawl Bing, si la clé Bing est configurée).
- **Méthode** :
  1. robots.txt : lire les groupes qui s'appliquent à Googlebot, Bingbot,
     OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User,
     ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended et
     Applebot-Extended. Distinguer les robots de recherche ou de citation (à
     autoriser pour être cité) des robots d'entraînement (choix du
     propriétaire).
  2. Pare-feu de l'hébergeur (règles anti-bots, listes « AI bots ») : lire la
     configuration chez l'hébergeur. Un test par agent
     (`curl -A "<agent>" -o /dev/null -w "%{http_code}"`) détecte un blocage
     fondé sur l'agent déclaré, mais **pas** un blocage par vérification d'IP.
     Seuls la configuration et les journaux de l'hébergeur font foi.
- **Preuve** : copie datée de robots.txt, capture ou export des règles du
  pare-feu, codes HTTP par agent.

### C06. Search Console et Bing Webmaster Tools branchés
- **Brique : CrawlSEO.** Le MCP `list_sites` donne, pour chaque site, la
  propriété Search Console et la propriété Bing associées. La synchronisation
  quotidienne prouve que les données arrivent.
- **La clé Bing de CrawlSEO couvre-t-elle Bing Webmaster Tools ? En lecture
  seulement.** Avec la clé API d'un compte BWT, CrawlSEO appelle l'API Bing
  Webmaster (`ssl.bing.com/webmaster/api.svc/json`, méthodes `GetUserSites`,
  `GetRankAndTrafficStats`, `GetQueryStats`, `GetPageStats`, `GetCrawlStats`).
  Il lit les sites du compte, les clics et impressions, les requêtes, les pages
  et les statistiques de crawl (pages crawlées, pages indexées, codes HTTP,
  pages bloquées par robots.txt). Il **ne fait pas** :
  - l'ajout ni la vérification d'un site dans BWT (préalable manuel) ;
  - la soumission de sitemap ou d'URL ;
  - IndexNow (C07).
  Le contrôle « branché » est donc couvert : le site apparaît dans `list_sites`
  avec une propriété Bing, et la synchro Bing renvoie des données. La mise en
  place reste manuelle.
- **Preuve** : sortie de `list_sites`, date de la dernière synchro GSC et Bing.

### C07. IndexNow en place
- **Brique : manuel.** Aucune brique ne le vérifie : rien dans CrawlSEO ni dans
  Crawlie.
- **Méthode** :
  1. Présence du fichier de clé IndexNow à la racine du site
     (`https://<hôte>/<clé>.txt`, qui contient la clé). Si le dépôt du site est
     déclaré dans `subject.yaml`, chercher le fichier de clé et l'étape de
     déploiement qui notifie IndexNow.
  2. Côté Bing Webmaster Tools : le rapport IndexNow montre les URL reçues et
     leur date.
- **Preuve** : URL du fichier de clé (sans recopier la clé dans un rapport),
  capture du rapport IndexNow, référence de l'étape de CI.

### C08. Réponse directe en tête des pages principales
- **Brique : Crawlie (heuristique) + manuel.** La règle `geo-not-answerable`
  signale une page où la réponse n'est pas placée juste sous un titre clair.
  `geo-thin-for-ai` et `geo-no-semantic-html` complètent. La lecture humaine
  reste nécessaire : les 2 ou 3 premières phrases répondent-elles seules à
  « qui, quoi, où, combien, pour qui », de façon cohérente avec les faits de
  référence ?
- **Preuve** : ID du rapport Crawlie et règles déclenchées par URL ; extrait
  des premières phrases.

### C09. Page « à propos » permettant de recouper l'identité
- **Pourquoi** : un moteur de réponse ne cite pas volontiers une entité qu'il ne
  peut pas recouper (même nom, photo et bio partout, profils reliés).
- **Briques : Crawlie (partiel) + Elmo (effet) + manuel.**
  - Crawlie : `geo-no-author` (auteur ou E-E-A-T absent), et
    `structured-data-*` / `schema-missing-*` (validité de `Person` ou
    `Organization`).
  - Elmo : les questions marquées (« Qui est <marque> ? ») mesurent le
    résultat, c'est-à-dire si les IA identifient correctement l'entité, à
    comparer aux faits validés (exactitude).
  - Manuel : une page « à propos » existe et est liée depuis l'accueil ; la
    liste `sameAs` correspond aux profils réels ; le nom, la description et la
    zone sont identiques sur le site, les profils sociaux, GBP et les annuaires.
- **Preuve** : URL de la page, liste `sameAs`, tableau des incohérences
  (recommandation `ENTITY_INCONSISTENCY`).

### C10. Santé technique des pages (Lighthouse / PageSpeed)
- **Briques : CrawlSEO + Crawlie.**
  - CrawlSEO (`get_vitals`) appelle l'API PageSpeed Insights en profil mobile,
    **catégorie performance seulement** : score, LCP, CLS, INP, TTFB, FCP, en
    mesures de laboratoire. Pas de données terrain CrUX dans ce rapport.
  - Crawlie : codes de réponse, redirections, HTTPS, poids des pages,
    compression, temps de réponse, accessibilité de base, balises SEO.
  - Manuel : les catégories Lighthouse **accessibilité, bonnes pratiques et
    SEO** ne sont mesurées par aucune brique. Les relever avec PageSpeed
    Insights sur l'URL de production, ou avec la CI Lighthouse du dépôt du site
    si elle existe. Pour un site à faible trafic, les Core Web Vitals terrain
    (rapport Search Console) peuvent ne pas exister : Lighthouse reste alors la
    seule mesure.
- **Preuve** : ID du rapport de vitals CrawlSEO, ID du crawl Crawlie, URL et
  date des relevés PageSpeed.

## Ce que la checklist ne fait pas
- Elle ne promet aucune position Google ni aucune citation par une IA.
- Elle n'autorise aucune modification d'un site : les agents proposent, le
  propriétaire décide, l'exécution passe par un commit.

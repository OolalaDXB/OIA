# Audit Crawlie · Maisons.co · 2026-11-08

Crawl : `crawlie@0.5.3`, `--max-pages 5000 --concurrency 4`, `https://maisons.co`, 2026-11-07 02:22 UTC. Rapport JSON brut : `crawlie.json` (2,7 Mo).

## Résumé

| Chiffre | Valeur |
|---|---|
| Pages crawlées | 237 |
| Erreurs | 6 |
| Avertissements | 1 156 |
| Notices | 492 |
| Pages indexables | **0** (toutes canonicalisées vers une autre URL) |
| Pages dupliquées | 169 |
| Health score Crawlie | 46 / 100 |
| GEO score Crawlie | **0 / 100** |
| A11y score Crawlie | 90 / 100 |
| Temps de réponse moyen | 124 ms |

**Lecture d'ensemble** : le site est **très actif techniquement** (temps de réponse bons, beaucoup de contenu), mais sa structure SEO est problématique : chaque page crawlée a un `canonical` qui pointe vers une autre page, donc Crawlie considère 0 page indexable. Soit c'est voulu (une architecture `/p/<id>` normalisée sur `/<slug>`), soit c'est un défaut de canonicalisation. **À confirmer avant toute recommandation** avec Mickaël et le propriétaire du site.

## Constats par gravité

### Erreurs (6)

- `broken-link` × 6 : 6 liens cassés dans l'arborescence. À lister via `node -e` sur `crawlie.json` → `issues.filter(i => i.rule === 'broken-link')`. Non détaillé ici pour éviter d'inventer les URL exactes avant vérification.

### Avertissements (les plus fréquents)

| # | Rule | Nombre | Commentaire |
|---|---|---|---|
| 1 | `a11y-input-no-label` | 236 | un champ sans label présent sur presque chaque page (probablement un composant partagé). A11y, et impact AEO (les IA décrivent moins bien un champ sans label). |
| 2 | `blocked-by-robots` | 200 | pages lues malgré le blocage robots.txt (comportement Crawlie : il ignore robots pour les autres robots, voir HANDOFF §2.5). À distinguer entre : routes voulues cachées (back-office, admin) et URLs exposées. |
| 3 | `title-duplicate` | 190 | 190 titres dupliqués. Signal fort pour Google (cannibalisation) et pour les IA (pages interchangeables). |
| 4 | `description-duplicate` | 181 | idem pour les meta descriptions. |
| 5 | `duplicate-content` | 169 | 169 pages marquées comme doublons de contenu. Cohérent avec les canonicals. |
| 6 | `title-too-long` | 114 | 114 titres > 60 caractères. |
| 7 | `image-missing-alt` | 64 | à traiter par lot (composant partagé probablement). |
| 8 | `h1-missing` | 1 | à localiser. |
| 9 | `x-robots-noindex` | 1 | une page a un en-tête `X-Robots-Tag: noindex` qui s'ajoute au canonical. À regarder. |

### Notices les plus fréquentes

| # | Rule | Nombre |
|---|---|---|
| 1 | `canonicalised` | 236 (toutes les pages crawlées) |
| 2 | `description-too-long` | 156 |
| 3 | `title-too-short` | 28 |
| 4 | `deep-page` | 70 (profondeur de clic trop grande) |
| 5 | `canonical-missing` | 1 |
| 6 | `thin-content` | 1 |

**GEO score à 0** : aucune des règles GEO (données structurées JSON-LD par page, auteur, FAQ, `llms.txt`) n'est satisfaite à l'échelle des 237 pages. C'est le chantier principal pour la visibilité dans les IA.

## Lecture par la checklist C01 à C10

| # | Contrôle | Résultat | Commentaire |
|---|---|---|---|
| C01 | GBP | **manuel** | À inventorier par Mickaël. HANDOFF : conciergerie Bretagne + locations Quistinic/Morbihan/Gudauri → une ou plusieurs fiches locales ? |
| C02 | Avis clients | **manuel** | — |
| C03 | Mentions hors site | **manuel** | — |
| C04 | Prix et infos clés sans JavaScript | **à auditer** | Les pages de maison ont-elles le prix dans le HTML ou en JS ? Crawlie lit le HTML initial. Les 169 doublons suggèrent que oui, mais à confirmer sur 2-3 pages test. |
| C05 | Robots des IA | **manuel** | `robots.txt` à vérifier côté bot IA. |
| C06 | Search Console, Bing Webmaster | **non audité** | CrawlSEO non branché. |
| C07 | IndexNow | **non vérifié** | Pas repéré par Crawlie, à vérifier côté dépôt du site (non accessible cette nuit). |
| C08 | Réponse directe | **à auditer** | Score GEO 0 : pas de réponse directe ni auteur sur l'échantillon. |
| C09 | Page à propos | **manuel** | — |
| C10 | Santé technique | **vigilant** | Temps de réponse rapide (124 ms moyen), mais 6 liens cassés + 169 doublons + 200 pages avec titre dupliqué = santé moyenne. Lighthouse à compléter. |

## Recommandations à préparer

Rien n'est encore acté : **ni Mickaël ni le propriétaire du site n'ont validé** les hypothèses. Je consigne les pistes pour E4 :

- **TECH_FIX** : revoir la stratégie de canonicals. Soit elle est voulue (dans ce cas la documenter dans `facts.yaml` du sujet), soit elle crée 236 pages « invisibles » pour Google. Grosse incertitude ; **ne rien proposer tant que Mickaël n'a pas levé le doute**.
- **CONTENT_GAP** : 190 titres dupliqués + 181 descriptions dupliquées. Si le gabarit prend le nom de la maison + une variable, il faut injecter une variable discriminante (ville, nombre de chambres, prix) dans le `<title>` et la meta description.
- **TECH_FIX** : 6 liens cassés. À corriger quand les URL précises seront listées.
- **TECH_FIX** : `a11y-input-no-label` × 236 = un seul composant à corriger pour tout le site.
- **CONTENT_GAP + TECH_FIX** : score GEO 0 implique l'absence de `JSON-LD Product/Offer/Accommodation` par page. Chantier structurel.

## Journal

- JSON brut : `crawlie.json` (2,7 Mo).
- `stderr.log` : 21 Ko d'avertissements Crawlie ; conservé hors repo (`/tmp/oia-vis-crawlie-run/crawlie/20261106T222229Z/maisons-co/maisons.co.stderr.log`), sera effacé en fin de nuit.
- Aucune donnée inventée. Les chiffres viennent du JSON Crawlie.

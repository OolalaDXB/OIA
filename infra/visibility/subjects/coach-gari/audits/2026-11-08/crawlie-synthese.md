# Audit Crawlie · Coach Gari · 2026-11-08

Crawl : `crawlie@0.5.3`, `--max-pages 5000 --concurrency 4`, `https://coachgari28.com`, 2026-11-07 02:22 UTC. Rapport JSON brut : `crawlie.json` (37 Ko).

## Résumé

| Chiffre | Valeur |
|---|---|
| Pages crawlées | 4 |
| Erreurs | 0 |
| Avertissements | 14 |
| Notices | 20 |
| Pages indexables | 3 (sur 4) |
| Pages dupliquées | 0 |
| Health score Crawlie | 57 / 100 |
| GEO score Crawlie | 34 / 100 |
| A11y score Crawlie | 99 / 100 |
| Temps de réponse moyen | 400 ms |

Sites découverts : accueil et 3 pages de service (brouillons `noindex` + `cg-draft`, voir `integrite-j0.md`). Le gel J0 est respecté : les 3 pages de service sont `noindex` et ne figurent pas dans la sitemap. Score GEO bas parce que les pages brouillon n'ont pas de données structurées ni d'auteur (c'est attendu avant leur publication).

## Constats par gravité

### Avertissements

| # | Rule | Détail | URL |
|---|---|---|---|
| 1 | `schema-missing-required` (×5) | `Offer: missing price, priceCurrency` | principalement `/` |
| 2 | `image-missing-alt` (×2) | 2/6 images sans alt, 1 page concernée | `/` |
| 3 | `geo-no-structured-data` (×2) | — | — |
| 4 | `blocked-by-robots` (×2) | pages cachées de robots.txt (admin, tokenized) : comportement voulu, pas un bug | — |
| 5 | `description-missing` (×1) | meta description absente | — |
| 6 | `noindex` (×1) | signalé à titre d'info (volontaire sur 4 pages de brouillon) | — |
| 7 | `a11y-input-no-label` (×1) | un champ sans `<label>` | — |

### Notices

| # | Rule | Détail |
|---|---|---|
| 1 | `schema-missing-recommended` (×5) | `Offer: missing availability, url, priceValidUntil` |
| 2 | `geo-not-answerable` (×3) | la page ne répond pas directement à une intention en entrée |
| 3 | `geo-no-author` (×3) | aucun auteur déclaré |
| 4 | `title-too-short` (×2) | — |
| 5 | `structured-data-missing` (×2) | — |
| 6 | `nofollow` (×1) | lien `rel=nofollow` sur une page de brouillon : attendu |
| 7 | `canonical-missing` (×1) | — |
| 8 | `thin-content` (×1) | page brouillon : attendu |
| 9 | `geo-no-llms-txt` (×1) | `llms.txt` à ajouter après J0 (gelé pendant J0) |
| 10 | `h1-multiple` (×1) | — |

## Lecture par la checklist C01 à C10

| # | Contrôle | Résultat | Commentaire |
|---|---|---|---|
| C01 | Fiche Google Business Profile | **manuel** | Crawlie ne la voit pas. À relever par Mickaël. HANDOFF §3 : fiche manquante selon le plan SEO. |
| C02 | Avis clients | **manuel** | Hors du site. |
| C03 | Mentions hors site | **manuel + Elmo plus tard** | Elmo n'a pas encore tourné. |
| C04 | Prix et infos clés sans JavaScript | **avertissement** | 5 × `schema-missing-required` = `Offer: missing price, priceCurrency`. Les prix dans l'offre JSON-LD ne sont pas renseignés. Voir aussi plan SEO action 2.1 (prix à publier dans le HTML), couverte par le gel J0. |
| C05 | Robots des IA | **vérification manuelle à prévoir** | `robots.txt` autorise `/` pour tous les user-agents (voir `integrite-j0.md`). Pas de blocage ciblé. |
| C06 | Search Console, Bing Webmaster | **non audité** | CrawlSEO non branché cette nuit. |
| C07 | IndexNow | **pris en charge** | `.github/workflows/indexnow.yml` + fichier de clé racine (HANDOFF §3). |
| C08 | Réponse directe en tête | **notice** | 3 × `geo-not-answerable` : les pages brouillon n'ouvrent pas par une réponse directe. Chantier post-J0. |
| C09 | Page à propos | **manuel** | À inventorier. |
| C10 | Santé technique | **moyen** | `avgResponseMs=400` (correct). Lighthouse CI tourne déjà sur chaque push (HANDOFF §3), couverture performance OK ; catégories a11y/best-practices restent à vérifier. |

## Recommandations à préparer (schéma E2 à venir)

- **TECH_FIX (haute confiance)** : `JSON-LD Offer` sans `price` ni `priceCurrency` sur `/`. Impact direct sur la lisibilité des prix par les IA. À faire après la fin de J0 (gel) et après l'ADR 0002 sur le connecteur de dépôt.
- **CONTENT_GAP** : deux `image-missing-alt` sur `/`. A11y + AEO. Rapide.
- **CONTENT_GAP** : `description-missing` sur une page. Rapide.
- **WATCH** : l'avertissement `noindex` et les notices `thin-content`, `nofollow` sont voulus (brouillon) ; à relever lors du lever de gel.

## Journal

- Dump JSON brut : `crawlie.json` (37 Ko), structure `{config, pages, issues, summary, robotsFound, sitemapUrls, sitemapFound, robotsBlocked, llmsTxtFound, linkGraph, seedRedirectedFrom, startedAt}`.
- Aucune modification du site ni du dépôt `~/CoachGari`.
- Aucune donnée inventée : les mentions de prix et d'offre viennent du JSON-LD existant du site.

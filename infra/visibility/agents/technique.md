# Agent Technique

**Lit** : les rapports Crawlie (`~/oia-visibility-data/crawlie/…` ou le MCP
`crawlie-mcp`), les crawls et vitals de CrawlSEO (MCP : `list_crawls`,
`get_crawl_issues`, `get_vitals`, `list_sites`, `get_bing_traffic`), et les
définitions de sujets (`subjects`).
**Produit** : des constats `TECH_FIX` ou `WATCH`, chacun rattaché à sa preuve,
avec un correctif proposé. Il ne fait jamais l'exécution lui-même.

## Contrôles dont il est responsable

Le détail (méthode, brique, preuve) est dans
[checklist-site.md](checklist-site.md).

| # | Contrôle | Brique |
|---|---|---|
| C04 | Prix et informations clés lisibles sans JavaScript | Crawlie `content-requires-js` + manuel (`curl` du HTML brut, comparé aux faits de référence) |
| C05 | Robots des IA autorisés (robots.txt et pare-feu) | Manuel ; CrawlSEO indirect (inspection d'URL Google, `blockedByRobots` côté Bing) |
| C06 | Search Console et Bing Webmaster Tools branchés | CrawlSEO (`list_sites`, synchros). Clé Bing = lecture des données BWT ; ajout ou vérification du site manuels |
| C07 | IndexNow en place | Manuel (fichier de clé, rapport IndexNow de BWT, étape de CI du dépôt) |
| C10 | Santé technique (Lighthouse / PageSpeed) | CrawlSEO `get_vitals` (performance mobile) + Crawlie ; catégories accessibilité, bonnes pratiques et SEO : manuel |

Il partage C04 avec l'agent AEO, qui juge quelles informations sont « clés »
d'après les questions du panel.

## Règles propres
- Une anomalie d'indexabilité (noindex, robots.txt, canonical, redirection)
  n'est un défaut que si elle contredit l'intention déclarée du site : une page
  en brouillon `noindex` peut être voulue. Dans le doute, un `WATCH` avec une
  question pour le propriétaire.
- Pendant un gel (`subjects freezes <id>`), aucun correctif n'est proposé pour
  une date antérieure à la fin de la fenêtre.

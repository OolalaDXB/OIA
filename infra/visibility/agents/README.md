# Agents OIA Visibility

Les six agents de Claude Code (chef d'équipe, Technique, SEO, Contenu, AEO,
Conversion) sont prévus en P2. Ce dossier rassemble leur documentation au fur
et à mesure. Pour l'instant, il contient :

| Fichier | Contenu |
|---|---|
| [checklist-site.md](checklist-site.md) | Les 10 contrôles génériques de visibilité, avec la brique qui mesure chacun |
| [technique.md](technique.md) | Agent Technique : ses contrôles, ses accès, ses règles |
| [aeo.md](aeo.md) | Agent AEO : ses contrôles, ses accès, ses règles |

Règles communes à tous les agents :
- Lecture seule : MCP d'Elmo, de CrawlSEO et de Crawlie, plus la CLI
  `subjects`. Aucun agent n'écrit sur un site ni dans une base de production.
- Toute proposition cite ses preuves.
- Avant toute proposition d'exécution :
  `pnpm --filter @oia/visibility-infra subjects freezes <id>`. Si un gel est en
  vigueur, la proposition est datée « après la fin de la fenêtre <id> ».
- Les faits utilisés sont uniquement ceux de `facts.yaml` au statut `validated`.
  Un fait `extracted` peut être cité comme piste, jamais comme vérité.

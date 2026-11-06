# @oia/visibility-console

**Console locale** d'OIA Visibility. NON DÉPLOYÉE : `vercel.json` cible explicitement `@oia/web` (voir H1 du mandat P1 v5.2). Lancée uniquement en local.

Six vues (CLI cette nuit ; une UI React viendra quand H3 sera acté) :

- `portfolio` : portefeuille de clients et de sites.
- `site <subjectId>` : tableau par site (métriques fictives de la nuit).
- `actions` : recommandations en attente de validation.
- `history` : historique des décisions.
- `costs` : coûts par client / site / fournisseur.
- `seo-command` : vue SEO Command (missions, agents, planification, journal).

## Utilisation

```
pnpm --filter @oia/visibility-console console <vue> [args]
```

## Pourquoi CLI et pas UI React

Le mandat H2 demande une console locale. Le temps imparti cette nuit fait un paquet minimal en TypeScript/Node, aligné sur la chaîne de tests existants, sans build front. L'UI React vivra quand le contrat de données de H3 sera validé.

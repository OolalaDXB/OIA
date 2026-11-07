# Interface web OIA sous `/oia` · bascule désactivée

2026-11-08 · session web parallèle · statut : livré, **éteint**.

## Ce qui existe

- Route `/oia` dans `apps/web` (export statique, déployé par Vercel avec le
  reste de la console).
- Bascule : variable de build `NEXT_PUBLIC_OIA_INTERFACE`. Seule la valeur
  exacte `on` l'allume (`apps/web/src/lib/oiaFlag.ts`). Aucune valeur n'est
  posée dans `vercel.json`, `next.config.mjs` ni ailleurs dans le dépôt.
- Bascule éteinte (cas par défaut, donc en production) :
  - `/oia/` affiche seulement « Interface OIA désactivée » ;
  - l'entrée « OIA » n'apparaît pas dans le rail ;
  - la page est marquée `noindex, nofollow` ;
  - elle n'importe aucune donnée et n'appelle aucun service.
- Bascule allumée : vue de lecture (trois identités, phases P0 à P6 et P9,
  piste Shyrka en quatre étapes), tirée de la roadmap 3.6 et de
  `docs/shyrka/CADRE.md` (`apps/web/src/lib/oiaOverview.ts`). Aucune action,
  aucun appel à un fournisseur.

## Tests

`apps/web/test/oia.test.ts` : bascule éteinte par défaut et pour toute valeur
autre que `on` ; jamais allumée dans un fichier suivi ; rail conditionné ;
page éteinte sans donnée ni appel.
`apps/web/test/oia-roadmap.test.ts` (ajouté avec la roadmap 3.6) : chaque phase affichée existe dans la
roadmap ; P7 et P8 ne sont plus des phases ; les quatre étapes Shyrka sont
alignées sur P1, P2, P5 et P6.

Vérifié dans Chromium (build allumé en local) : page rendue, zéro erreur
console. Build par défaut : la page éteinte est servie, le rail n'a pas
l'entrée.

## Allumer (décision de Mickaël)

En local :

```sh
NEXT_PUBLIC_OIA_INTERFACE=on pnpm --filter @oia/web build
cd apps/web/out && python3 -m http.server 4311   # puis http://127.0.0.1:4311/oia/
```

Sur Vercel : ajouter la variable `NEXT_PUBLIC_OIA_INTERFACE=on` au projet
`oia` (environnement Preview d'abord), puis redéployer. La protection Vercel
Authentication reste la seule barrière d'accès : à vérifier avant d'allumer en
production (`docs/access-and-data.md`).

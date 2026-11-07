# Interface web OIA sous `/oia`

2026-11-08 · session web · mandat v7, bloc F, avec l'amendement du
7 novembre (§ 6). **Allumée sur les déploiements Preview de Vercel seulement,
jamais en production.** La bascule en production reste une décision de
Mickaël.

## Réception, écran par écran, contre le prototype et le mandat

| Écran | Mandat v7 | État |
| --- | --- | --- |
| Colonne des modules | F2 : Accueil, Visibility, Opportunités, CRM, Portefeuille, Data, Training ; Personnel ; Shyrka et Réglages en bas ; dépense du mois sous la colonne ; couleur sourde et point d'état par module ; navigation dans un seul fichier de configuration | fait, testé ; fichier `apps/web/src/oia/config/navigation.ts` |
| Opportunités | F2 : onglets Financements, Appels d'offres, Investisseurs, Veille, Montants, à partir des pages actuelles | fait : les pages `/grants`, `/tenders`, `/investors`, `/alerts`, `/money` sont affichées telles quelles dans un cadre de même origine, rail masqué |
| CRM, Portefeuille | F2 : pages Contacts et Projets réutilisées | fait, même méthode |
| Data, Training | F2 : « Module en préparation » | fait |
| Accueil | F3 : « Bonjour Mickaël », À décider, grille des modules, dépense du mois, activité récente, depuis les sources existantes | fait : À décider tiré de la veille du jour de la console (`buildDigest` : tâches, éléments à trier, approbations bloquées) ; activité récente tirée du journal de revue. **Partiel** : les décisions de Visibility et la dépense du mois sont des données de démonstration signalées |
| Visibility | F4 : vue d'ensemble, sites, vue d'un site, SEO Command, rapports ; « Préparer les corrections » ouvre la fiche de décision, sans rien publier | fait, en données de démonstration signalées (amendement § 6). La fiche de décision en ligne est fictive ; la vraie se lit en local |
| Shyrka | F5 : panneau, page plein écran, présence en points, réponses simulées signalées, mode présence (micro simulé, pause, quitter) | fait. **Partiel** : l'image de profondeur du visage manque (voir plus bas) |
| Bascule | F6 : une ligne de configuration, désactivée | fait : `BASCULE_ACCUEIL = false`, table de redirections, testé |
| Connexion | F1 : derrière `AuthGate` | fait |
| Jetons | F1 : `packages/ui-tokens` | fait : variables de base, états et modules tirées des jetons |
| Données de client | Amendement § 6 : aucune donnée réelle de client dans les fichiers publics | fait : test qui cherche les noms des clients dans les sources de `/oia` et dans `public/` |

## Pourquoi Visibility reste en démonstration

L'écran de connexion d'une console statique ne protège pas les fichiers
servis : tout ce qui est dans `apps/web/out` est lisible par qui obtient l'URL
du déploiement. Les réponses des assistants et le rapport J0 de Coach Gari ne
sont donc pas embarqués. Ils restent dans `pnpm vis:j0-view`, en local,
jusqu'à ce qu'un accès protégé côté serveur existe. La protection Vercel
Authentication du projet ne suffit pas pour des données de client : elle
dépend d'un réglage du projet, pas du code.

## Source

Portage du prototype Lovable « OIA Dashoard », lu sans être modifié :

- projet Lovable `b746af25-5095-475b-9e8d-4c9a88b0d4bd`, commit
  `c6470e86c6c5843d7c49197f4bff006ea2aab481` (dernière édition le
  2026-11-07 à 15:43 UTC), lu par l'outil `read_file` seulement ;
- branche `lovable/oia-visibility-prototype` (copie plus ancienne), d'où
  viennent tels quels les composants shadcn (`button`, `checkbox`, `input`,
  `sheet`, `tabs`) et `lib/utils.ts`.

La branche ne contient ni la colonne des modules ni Shyrka : ces éléments
n'existent que dans le projet Lovable, plus récent. C'est donc lui qui sert de
référence.

## Ce qui existe

| Écran | URL | Origine |
|---|---|---|
| Colonne des modules (huit modules, Personnel, Shyrka, Réglages) | toutes les pages | `components/oia/ui.tsx` |
| Accueil OIA | `/oia/` | `routes/index.tsx` |
| Visibility (vue d'ensemble, sites, SEO Command, rapports) | `/oia/visibility/…` | `components/oia/visibility.tsx`, `routes/visibility.*` |
| Vue d'un site, ajout d'un compte en cinq étapes | `/oia/sites/studio-ardoise/`, `/oia/nouveau-compte/` | `routes/sites/$slug.tsx`, `routes/nouveau-compte.tsx` |
| Shyrka en page (présence, conversation, journal) | `/oia/shyrka/` | `routes/shyrka.tsx` |
| Shyrka en panneau (bouton « Shyrka » en bas à droite) et en plein écran | toutes les pages | `components/oia/shyrka.tsx` |
| Opportunités, CRM, Portefeuille, Data, Training | `/oia/<module>/` | navigation du mandat v7 (F2), au lieu des modules du prototype |
| Personnel : Agenda, Santé, Famille (en préparation) | `/oia/personnel/<module>/` | `routes/personnel/$module.tsx` |

**Pages existantes réutilisées.** Les pages actuelles de la console
s'affichent dans la nouvelle coquille, sans être réécrites ni modifiées
(`components/oia/page-existante.tsx`). Elles passent par un cadre de même
origine dont on masque seulement le rail. Elles gardent leurs données, leur
connexion, leurs exports, leur stockage local et leur bouton de langue.

La page de lecture précédente (identités, phases) est supprimée.

## Comment c'est construit

- `apps/web/src/oia/` : fichiers du prototype. L'alias `@/` pointe sur ce
  dossier, comme dans Lovable.
- Changements par rapport au prototype, limités au strict nécessaire :
  - `"use client"` en tête des composants à état (exigence de Next) ;
  - `@tanstack/react-router` remplacé par une cale (`src/oia/lib/router.tsx`),
    qui reproduit `Link`, `useRouter().subscribe` et `useRouterState` et
    place toutes les routes sous `/oia` ;
  - routes TanStack transformées en vues (`src/oia/pages/`) appelées par des
    pages Next (`src/app/(oia)/oia/**/page.tsx`) ;
  - navigation, accueil, Opportunités, CRM, Portefeuille, Data et Training
    selon le mandat v7 (le prototype avait Funding, Tenders, Ventures,
    Signals) ;
  - données réelles facultatives lues à `/oia/data/visibility.json`, au lieu
    de `/data/visibility.json` ; absentes, les données fictives s'affichent ;
  - un seul changement dans la présence de Shyrka : l'import Vite de l'image
    est remplacé par son URL, `/oia/shyrka-face-depth.jpg`.
- **Lovable Shyrka v0 n'est pas modifiée par Claude Code** (CADRE.md). Un test
  fige l'empreinte SHA-256 de `shyrka-particles.tsx` et de `shyrka.tsx` :
  toute retouche le fait échouer.
- Deux layouts racines (groupes de routes Next) :
  - `src/app/(console)/` : la console existante, avec ses styles ;
  - `src/app/(oia)/` : l'interface OIA, avec Tailwind 4 (`oia.css`).

  Next recharge la page en passant de l'un à l'autre, si bien que les styles
  ne se mélangent pas. Les URL de la console ne changent pas.
- Dépendances ajoutées à `apps/web`, versions exactes :
  - styles : `tailwindcss`, `@tailwindcss/postcss` 4.2.1 et
    `tw-animate-css` 1.3.4 ;
  - rendu de la présence : `three` 0.187.0 et `@types/three` ;
  - icônes : `lucide-react` 0.575.0 ;
  - composants Radix : `react-dialog`, `react-tabs`, `react-checkbox`,
    `react-slot` ;
  - utilitaires : `class-variance-authority`, `clsx`, `tailwind-merge`.

  Ce sont les versions du prototype.
- Le prototype tourne avec React 19 ; la console reste en React 18. Les
  composants portés fonctionnent avec React 18.

## Bascule

Règle dans `apps/web/oia-flag.mjs`, figée au build par `next.config.mjs` :

| Environnement | `/oia` |
|---|---|
| Vercel Production (`VERCEL_ENV=production`) | éteinte, même si `NEXT_PUBLIC_OIA_INTERFACE=on` |
| Vercel Preview (`VERCEL_ENV=preview`) | allumée |
| Local, CI | éteinte, sauf `NEXT_PUBLIC_OIA_INTERFACE=on` |

Bascule éteinte : chaque page `/oia` n'affiche que « Interface OIA
désactivée », sans données ni Shyrka. L'entrée « OIA » du rail de la console
disparaît. Toutes les pages `/oia` portent `noindex, nofollow`.

## Reste à faire

1. **Image de profondeur du visage** (`src/assets/shyrka-face-depth.jpg` dans
   Lovable). Je n'ai pas pu la récupérer : l'outil de lecture de Lovable rend
   le texte, pas les octets, et l'aperçu Lovable est bloqué par le réseau de
   la session. Il faut la télécharger depuis l'éditeur Lovable et la déposer
   dans `apps/web/public/oia/shyrka-face-depth.jpg`. Sans elle, la présence
   reste un fond nuit vide, et le composant le signale par
   `data-render-error="true"`. Avec une image de substitution locale, non
   commitée, la sphère de particules cyan s'affiche bien.
2. **Copie des fichiers.** Un agent a recopié les fichiers depuis les
   résultats de `read_file`, sans somme de contrôle par rapport à la source.
   À comparer une fois avec le projet Lovable, `shyrka-particles.tsx` en
   priorité.

## Vérifié

- Build Preview : 36 pages, dont 21 sous `/oia`.
- Chromium à 1440 × 900 : accueil (identique à la capture Lovable),
  Visibility, vue d'un site, Tenders avec « Dans la console », Shyrka en page
  (conversation simulée), panneau, plein écran. Seules erreurs console : les
  deux fichiers absents (image et `visibility.json`).
- Console existante (`/`, `/digest/`) inchangée.
- Build Production : `/oia` éteinte, rail sans entrée « OIA ».
- Tests :
  - `apps/web/test/oia.test.ts` : bascule, séparation des layouts, liens
    vers des pages qui existent, cale de routage, empreintes de Shyrka v0 ;
  - `apps/web/test/oia-prototype/*.test.ts` : les quatre tests du prototype,
    repris tels quels.

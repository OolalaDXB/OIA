# Audit structurel · branche Transformation 90 et Espace personnel · 2026-11-08

**Statut : lecture seule.** Aucun code exécuté. Aucune donnée personnelle reproduite.

## Synthèse des constats

| Constat | Gravité | Fichier(s) |
|---|---|---|
| Données personnelles de santé écrites en dur dans le code source et commitées | bloquant | `plan.ts`, `TransformationDashboard.tsx`, `SchedulePlanner.tsx` |
| Ces données sont compilées dans le bundle JavaScript statique de la route | bloquant | `next.config.mjs` (`output: "export"`), `transformation/*` |
| Aucune garde serveur. La garde d'accès est côté client et s'efface sans Supabase | bloquant | `AuthGate.tsx`, `lib/supabase.ts` |
| Mesures, journal et photos stockés en clair dans le navigateur, sans lien au compte | bloquant | `TransformationDashboard.tsx`, `SchedulePlanner.tsx` |
| Historique sans base commune avec `main` : fusion directe impossible | bloquant | toute la branche |
| PR #3 ouverte sur cette branche : les diffs restent visibles sur GitHub | bloquant | PR #3 |
| Déploiements Preview de la branche sur Vercel, protégés par Vercel Authentication | à corriger | projet Vercel `oia` |
| Photos stockées sans retrait des métadonnées EXIF | à corriger | `TransformationDashboard.tsx` |
| Lien du rail de la console professionnelle vers l'espace personnel | à corriger | `Console.tsx` |
| Aucun test sur le module | à corriger | `apps/web/test/` |
| Aucune image personnelle commitée, aucun envoi réseau, aucun secret | note | toute la branche |
| Aucune dépendance ajoutée, aucune table ni migration Supabase | note | `apps/web/package.json` |

## 1. Objet et méthode

- Dépôt : `/home/user/OIA`. Branche : `origin/feature/transformation-90-personal`.
- Commit de tête : `19fbbb7` (`19fbbb7930e6afc888cc2edebb8a41cbed9ef668`).
- La branche n'a aucune base commune avec `origin/main` (`8219e45` au moment de l'audit).
- La PR GitHub #3 est ouverte avec cette branche comme source. Elle n'est pas fusionnée.
- Le dépôt GitHub est privé.
- Méthode : `git ls-tree`, `git show <ref>:<chemin>`, `git log` et `git show --stat`. Aucune extraction de la branche dans l'arbre de travail.
- Aucun fichier image n'a été ouvert. Aucun code de la branche n'a été lancé.
- Le rapport décrit la structure uniquement. Il ne cite aucune valeur, mesure, note, nom de proche ni description de photo.

## 2. Ce qui existe

### 2.1 Commits propres à la branche

Neuf commits du 2026-10-31 forment le module. Ils touchent sept fichiers.

| Commit | Objet | Fichier touché |
|---|---|---|
| `61b6678` | plan sur 13 semaines | `apps/web/src/app/transformation/plan.ts` |
| `a053748` | route dédiée | `apps/web/src/app/transformation/page.tsx` |
| `004afea` | cockpit, journal, galerie photo locale, budget | `TransformationDashboard.tsx` |
| `cb66c59` | styles responsives | `transformation.css` |
| `e281173` | planning, routines, localisation volontaire | `SchedulePlanner.tsx` |
| `6fd07df` | onglet planning branché | `TransformationDashboard.tsx` |
| `ce0e2bc` | lien depuis le rail OIA | `apps/web/src/app/Console.tsx` |
| `8aa4d81` | styles du planning | `transformation.css` |
| `19fbbb7` | document produit commerce | `docs/TRANSFORMATION_COMMERCE_MARKETPLACE.md` |

Le reste de la branche est un instantané ancien de la console OIA. Il précède la refonte en groupes de routes `(console)` et `(oia)` de `main`.

### 2.2 Routes et pages

- `/transformation/` : une seule route. Fichier `apps/web/src/app/transformation/page.tsx` (10 lignes).
- La page rend `TransformationDashboard`. Elle hérite du `RootLayout` et donc de `AuthGate`.
- La branche ne contient aucune route `/oia/personnel/*`.

### 2.3 Composants

- `TransformationDashboard.tsx` (295 lignes, environ 23 Ko). Composant client à six onglets : `today`, `schedule`, `journal`, `weeks`, `photos`, `care`.
- `SchedulePlanner.tsx` (86 lignes, environ 8,6 Ko). Composant client : ville et fuseau, agenda du jour, routines récurrentes éditables.
- `plan.ts` (104 lignes, environ 6,7 Ko). Types, constantes et fonctions utilitaires.
- `transformation.css` (environ 7,4 Ko). Styles préfixés `t90-`, CSS pur, sans Tailwind.

### 2.4 Modèles de données (noms de champs uniquement)

- `DailyEntry` : `date`, `weight`, `waist`, `sleepHours`, `sleepQuality`, `energy`, `stress`, `steps`, `waterMl`, `proteinG`, `activityMinutes`, `training`, `diary`, `intake[]`, `done[]`, `updatedAt`.
- `IntakeItem` : `id`, `at`, `kind`, `name`, `quantity`, `calories`, `protein`. `kind` vaut `repas`, `boisson`, `complement` ou `medicament`.
- `PhotoRecord` : `id`, `date`, `category`, `blob`, `type`.
- `Routine` : `id`, `title`, `time`, `duration`, `days[]`, `kind`, `note`, `enabled`. `kind` vaut `rose`, `glaive` ou `other`.
- `EventItem` : `id`, `date`, `time`, `title`, `note`.
- `Settings` : `city`, `timezone`, `travelNote`.
- Constantes exportées par `plan.ts` : `START`, `END`, `START_WEIGHT`, `HEIGHT_CM`, `RITUALS`, `WEEKS`, `CARE`, `BUDGET`.
- Fonctions de `plan.ts` : `dateISO`, `dayNumber`, `weekNumber`, `emptyEntry`, `intention`.

### 2.5 Stockage

- `localStorage` clé `oia:personal:transformation90:v1` : dictionnaire `date -> DailyEntry`, JSON en clair.
- `localStorage` clé `oia:transformation90:schedule:v1` : objet `{routines, events, settings}`, JSON en clair.
- IndexedDB base `oia-personal-transformation-v1`, version 1, magasin `photos`, clé `id`. Les fichiers image sont stockés tels quels en `Blob`.
- Export : téléchargement local `oia-transformation-journal.json`, champs `version`, `start`, `end`, `entries`. Les photos ne sont pas exportées.
- Remise à zéro : vide le magasin `photos` et supprime la première clé `localStorage`. La clé du planning n'est pas supprimée.
- Supabase : aucune table, aucune migration, aucun appel. `useAuth` sert seulement à afficher un message.
- `public/` : aucun ajout. Seules les polices Inter y figurent.
- Fichiers JSON de données personnelles : aucun. Les données personnelles sont dans des fichiers `.ts` et `.tsx` (voir section 3.1).

### 2.6 Dépendances

- Les commits du module ne modifient pas `apps/web/package.json`.
- Le `package.json` de la branche est un sous-ensemble de celui de `main`. Il lui manque Radix, Tailwind, lucide, three et leurs utilitaires.
- Aucune dépendance ajoutée.

### 2.7 Tests et documentation

- Tests : aucun. `apps/web/test/imports.test.ts` est antérieur et ne couvre pas le module.
- Documentation : `docs/TRANSFORMATION_COMMERCE_MARKETPLACE.md` (92 lignes, environ 9,7 Ko). Spécification produit d'une plateforme commerce, academy et coachs. Elle ne contient pas de données de santé. Elle décrit déjà les exigences de séparation des données privées.

### 2.8 Points de contact avec `apps/web` et le rail

- Tout le module vit dans `apps/web/src/app/transformation/`.
- `ce0e2bc` ajoute un bloc `railGroup` dans `Rail` (`Console.tsx`). Il pointe vers `/transformation/`.
- Sur `main`, `Console.tsx` a migré vers `apps/web/src/app/(console)/Console.tsx`. Le correctif ne s'applique donc plus tel quel.
- Sur `main`, l'espace personnel existe déjà en coquille : `apps/web/src/app/(oia)/oia/personnel/[module]/page.tsx` et `apps/web/src/oia/pages/personnel.tsx`. Modules `agenda`, `sante`, `famille` dans `apps/web/src/oia/data/demo.ts`. La page indique un module en préparation, sans donnée.

## 3. Failles à régler avant toute mise en ligne

### 3.1 Données personnelles commitées dans git (bloquant)

- **3 fichiers contiennent des données personnelles commitées** : `plan.ts`, `TransformationDashboard.tsx`, `SchedulePlanner.tsx`.
- Nature : constantes biométriques, contexte médical, objectifs, budget, lieu et habitudes par défaut. Les valeurs ne sont pas reproduites ici.
- Commits concernés : `61b6678`, `004afea`, `e281173`, `6fd07df`.
- Les messages de commit sont neutres. Les autres fichiers du module ne portent pas de données personnelles.
- Conséquence : l'historique de la branche doit être purgé avant toute publication. Un simple commit de suppression ne suffit pas.
- La PR #3 conserve ses commits sur GitHub (`refs/pull/3/head`). Une purge complète demande de fermer la PR et de solliciter le support GitHub pour les vues en cache.

### 3.2 Exposition par l'export statique (bloquant)

- `next.config.mjs` impose `output: "export"`. Toute la route devient des fichiers statiques.
- Les constantes de `plan.ts` et les textes du composant sont compilés dans le chunk JavaScript de `/transformation/`.
- Ce chunk se télécharge sans session. `AuthGate` masque l'interface mais ne protège pas les fichiers.
- Si Supabase n'est pas configuré au build, `AuthGate` s'efface complètement (`UNCONFIGURED`).
- La seule barrière réelle est Vercel Authentication au niveau du projet.

### 3.3 Déploiements Vercel (à corriger, bloquant si domaine personnalisé)

- Le projet Vercel déploie les branches en Preview. Des déploiements Preview de cette branche existent (audit antérieur).
- Protection en place : Vercel Authentication, réglage `ssoProtection all_except_custom_domains` (voir `docs/access-and-data.md`).
- Tout membre de l'équipe Vercel peut ouvrir ces déploiements et leurs fichiers source.
- Le jour où un domaine personnalisé est rattaché, la protection ne le couvre plus.
- La route `/transformation/` n'a pas de bascule. Sur `main`, `oia-flag.mjs` coupe `/oia` en production. Ce module n'a pas d'équivalent.
- Les anciens déploiements Preview gardent le code. Il faut les supprimer après la purge git.

### 3.4 Protection des photos (à corriger)

- Aucune photo n'est commitée. Les seuls fichiers image de la branche sont trois captures antérieures de la console dans `outputs/milestone-0/screenshots/`. Elles n'ont pas été ouvertes.
- Les photos téléversées restent dans IndexedDB, sur l'appareil. Elles ne passent pas par `public/` ni par un serveur.
- Les fichiers sont stockés bruts. Les métadonnées EXIF, dont la position GPS éventuelle, sont conservées.
- Aucun chiffrement au repos. Toute extension ou script injecté sur l'origine peut lire la base.
- Contrôles présents : type MIME ou extension, taille maximale par fichier.

### 3.5 Données de santé (bloquant)

- Stockage : `localStorage` et IndexedDB de l'origine Vercel, en clair.
- Le journal accepte des médicaments, des compléments et des notes libres de douleur ou d'humeur.
- Aucun envoi réseau dans les fichiers du module. Aucun appel `fetch`, Supabase ou balise.
- La géolocalisation est demandée à la volée. Les coordonnées ne sont ni stockées ni transmises. Seule la précision est affichée.
- L'export JSON est un fichier en clair, sans avertissement de destination.

### 3.6 Authentification et autorisation (bloquant)

- Aucune garde propre au module. Toute session OIA voit la route.
- Les données ne sont pas liées à un compte. Deux utilisateurs du même navigateur voient les mêmes données.
- Aucune séparation entre l'espace professionnel et l'espace personnel. Le rail les relie directement.

### 3.7 Secrets et RLS (note)

- Aucun secret dans les fichiers du module. `.env.example` ne contient que des noms de variables.
- Aucune RLS, car aucune donnée n'est stockée côté serveur. Toute future synchronisation exigera des tables à accès propriétaire seul, un bucket privé et des URL signées.

### 3.8 Défauts mineurs (à corriger)

- `SchedulePlanner` écrit dans `localStorage` sans `try/catch`.
- La détection de conflit compare seulement des heures de début identiques. Elle ignore la durée.
- Le format HEIC est accepté mais ne s'affiche pas dans la plupart des navigateurs.
- La remise à zéro oublie la clé du planning.
- Textes uniquement en français, hors du système `lang.ts` et `vocabulary.ts`.

## 4. Ce qui est réutilisable pour Agenda, Santé et Famille

Condition générale : porter le code à la main dans `apps/web/src/oia/`, jamais par fusion. Retirer toute constante personnelle. Utiliser `Shell`, `ui.tsx` et Tailwind de `main`. Garder le module derrière `OIA_INTERFACE`.

### 4.1 Agenda (`/oia/personnel/agenda`)

- Réutilisable : modèles `Routine`, `EventItem`, `Settings`.
- Réutilisable : logique d'affichage du jour, fusion routines récurrentes par jour de semaine et événements ponctuels, tri par heure.
- Réutilisable : éditeur de routines (activation, heure, durée, jours).
- Réutilisable : géolocalisation volontaire sans stockage, avec repli sur saisie manuelle.
- Conditions : valeurs par défaut vides. Détection de conflit sur intervalles. Fuseau appliqué aux calculs. Synchronisation calendrier externe hors périmètre.

### 4.2 Santé (`/oia/personnel/sante`)

- Réutilisable : modèles `DailyEntry` et `IntakeItem`, sans les constantes.
- Réutilisable : validation numérique `setNumber`, journal des prises, totaux du jour, tableau d'historique.
- Réutilisable : magasin photo IndexedDB (`openPhotos`, `photoAction`, `savePhoto`, `removePhoto`) et ses contrôles de type et de taille.
- Réutilisable : bandeau de confidentialité, export JSON, effacement complet avec confirmation.
- Réutilisable : `dateISO`, et `dayNumber` ou `weekNumber` si les dates de programme deviennent des paramètres.
- Conditions : plan, soins et budget deviennent des données saisies par l'utilisateur. Retrait EXIF avant stockage. Chiffrement local ou stockage serveur à accès propriétaire seul. Clés namespacées par identifiant de compte.

### 4.3 Famille (`/oia/personnel/famille`)

- Aucun composant dédié dans la branche.
- Réutilisable par analogie : le motif d'événements ponctuels de l'agenda et le magasin photo local.
- Réutilisable : les principes du document produit sur la séparation des données, l'accès propriétaire seul et la politique tuteur pour les enfants.
- Conditions : modèle par membre, consentement explicite, aucune donnée réelle avant backend sécurisé.

## 5. Recommandations

1. Ne jamais fusionner la branche dans `main`. L'historique est disjoint et l'arbre est ancien.
2. Fermer la PR #3 sans fusion. Conserver une copie locale chiffrée si Mickaël le souhaite.
3. Purger les trois fichiers de l'historique de la branche distante, ou supprimer la branche distante. Demander au support GitHub la purge des références de la PR.
4. Supprimer les déploiements Preview Vercel de cette branche après la purge.
5. Garder Vercel Authentication active et ne rattacher aucun domaine personnalisé à `oia` sans revoir la protection.
6. Porter les composants listés en section 4 dans `apps/web/src/oia/`, sans aucune constante personnelle.
7. Ajouter une bascule dédiée à l'espace personnel, coupée en production, comme `oia-flag.mjs`.
8. Ajouter le retrait EXIF, la remise à zéro complète et des clés de stockage par compte.
9. Avant toute synchronisation : tables Supabase à accès propriétaire seul avec RLS, bucket privé, URL signées, journal d'accès, export et suppression.
10. Ajouter des tests : validation numérique, fusion agenda, remise à zéro, absence de constante personnelle dans les bundles.
11. Retirer le lien du rail professionnel. L'accès passe par `/oia/personnel/*`.

### Questions pour Mickaël

- Souhaites-tu conserver la branche ailleurs, hors du dépôt OIA, avant purge ?
- Qui d'autre a accès à l'équipe Vercel et au dépôt GitHub aujourd'hui ?
- Les données de santé doivent-elles rester sur l'appareil, ou être synchronisées entre appareils ?
- Si synchronisation : Supabase du projet OIA, ou un projet séparé dédié au personnel ?
- Le module Famille doit-il contenir des données de mineurs ? Si oui, avec quel consentement ?
- Le projet commerce décrit dans le document produit reste-t-il dans ce dépôt, ou part-il dans un dépôt propre ?
- Un domaine personnalisé est-il prévu pour OIA à court terme ?

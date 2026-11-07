# Intégration du prototype Lovable dans la console OIA

2026-11-08 · session web · mandat v6, bloc C (C1 et C3), avec l'amendement du
7 novembre.

> **Statut au 2026-11-08 : en grande partie caduc.** Décision de Mickaël du
> 7 novembre et mandat v8 : le design appartient à Lovable, et Claude Code
> n'importe, ne copie et n'exporte aucun fichier du projet Lovable. Le bloc C2
> du mandat v6 (jetons de design) et le bloc F du mandat v7 (interface sous
> `/oia`) sont annulés. `packages/ui-tokens` et `/oia` sont retirés, et la
> console est revenue à son état d'avant la session. Ce document ne reste
> qu'à titre d'inventaire. Le lien entre Lovable et OIA passe désormais par
> les contrats de données du mandat v8 (`docs/interface/contrat-donnees-*.md`).

## 1. Sources lues

| Source | Référence | Mode |
| --- | --- | --- |
| Branche `lovable/oia-visibility-prototype` | commit `a9e7a1f`, dossier `prototypes/oia-prototype/` | `git show`, lecture seule, aucun worktree |
| Projet Lovable « OIA Dashoard » | commit `c6470e86`, édité le 2026-11-07 à 15:43 UTC | outil `read_file`, lecture seule |

La branche est une copie ponctuelle, plus ancienne. Le projet Lovable a ensuite
reçu la colonne des modules, Shyrka, l'espace Personnel et les onglets de
Visibility. L'inventaire ci-dessous distingue les deux.

## 2. Inventaire des écrans et composants (C1)

### Écrans

| Écran | Branche | Projet Lovable | Contenu |
| --- | --- | --- | --- |
| Accueil | oui | oui | « Bonjour Mickaël », À décider (5), sites suivis, SEO Command, dépenses ; dans Lovable : grille des modules et activité récente |
| Nouveau compte | oui | oui | Cinq étapes : le site, ce que nous avons compris, connexions, questions, lancement |
| Vue d'un site | oui | oui | Présence dans les IA avec intervalle, par assistant, sources citées, concurrents, recommandations, historique |
| SEO Command | oui (« Bientôt ») | onglet de Visibility | Six agents en veille, file vide, planificateur désactivé |
| Funding | oui (« Bientôt ») | oui (« En pause ») | Module en pause |
| Réglages | oui (« Bientôt ») | oui (« Bientôt ») | Compte, plafonds, cadre de l'assistant |
| Visibility, onglets | non | oui | Vue d'ensemble, Sites, SEO Command, Rapports |
| Modules Tenders, Ventures, Signals, CRM, Data, Training | non | oui | Page de module générique |
| Personnel : Agenda, Santé, Famille | non | oui | « Module en préparation » |
| Shyrka | non | oui | Page à trois colonnes (présence, conversation, journal), panneau latéral, plein écran avec micro simulé et pause |

### Composants

- **Coquille** (`components/oia/ui.tsx`). Dans la branche : barre d'en-tête
  horizontale. Dans Lovable : colonne de gauche, avec les modules, Personnel,
  puis Shyrka et Réglages.
- **Primitives OIA** : `Section` (carte titrée), `Statut` (point d'état
  désaturé), `Barre` (pourcentage), `Check`, `Fictif` (« Exemple fictif »),
  classes de boutons et de champs.
- **Visibility** (Lovable) : `VisibilityShell` (fil d'Ariane et onglets),
  `SitesSuivis`, `SeoResume`, `AjouterCompte`.
- **Shyrka** (Lovable) :
  - `ShyrkaProvider` (session partagée, sauvegarde locale versionnée) ;
  - `PresenceShyrka` et `ShyrkaParticles` (sphère de 32 000 particules,
    Three.js, carte de profondeur `shyrka-face-depth.jpg`) ;
  - `ConversationShyrka`, `JournalShyrka`, `ShyrkaGlobale` (lanceur, panneau,
    plein écran).
- **shadcn/ui** : 46 composants Radix copiés par Lovable. La console n'en
  utiliserait que cinq : `button`, `checkbox`, `input`, `sheet`, `tabs`.
- **Données** : `data/demo.ts`, entièrement fictives (Studio Ardoise, Maison
  Kerlo, Le Comptoir Iodé). Dans Lovable, un fournisseur facultatif lit
  `visibility.json` s'il existe.
- **Styles** : `styles.css` (Tailwind 4, couleurs en oklch, Helvetica Neue,
  rayon 6 px, couleurs sourdes par module).

## 3. Correspondance proposée (C1)

Proposition faite pendant la session, sans objet désormais : la navigation
relève de Lovable.

| Nouveau module | Contenu | Pages actuelles reprises |
| --- | --- | --- |
| Accueil | Bonjour, À décider (tâches, éléments à trier, décisions de Visibility), modules, dépense du mois, activité récente | `/digest` (Aujourd'hui), `/tasks` et `/notes` (via l'espace de travail) |
| Visibility | Vue d'ensemble, Sites, vue d'un site, SEO Command en onglet, Rapports | aucune (module neuf) |
| Opportunités | Onglets Financements, Appels d'offres, Investisseurs, Veille, Montants | `/grants`, `/tenders`, `/investors`, `/alerts`, `/money` (et `/metrics`) |
| CRM | Contacts | `/contacts` |
| Portefeuille | Projets | `/projects` |
| Data, Training | À cadrer | aucune |
| Personnel | Agenda, Santé, Famille, en préparation | aucune (voir `docs/audits/2026-11-08-espace-personnel.md`) |
| Shyrka | Page, panneau, plein écran | aucune |
| Réglages | Compte, plafonds, cadre de l'assistant | aucune |

### Redirections des anciennes adresses, à la bascule seulement

| Ancienne adresse | Nouvelle adresse |
| --- | --- |
| `/` (Opportunités) | `/oia/opportunites/` |
| `/digest` | `/oia/` |
| `/grants` | `/oia/opportunites/?onglet=financements` |
| `/tenders` | `/oia/opportunites/?onglet=appels-offres` |
| `/investors` | `/oia/opportunites/?onglet=investisseurs` |
| `/alerts` | `/oia/opportunites/?onglet=veille` |
| `/money`, `/metrics` | `/oia/opportunites/?onglet=montants` |
| `/projects` | `/oia/portefeuille/` |
| `/workspace`, `/tasks`, `/notes` | `/oia/` (les tâches et notes restent dans l'espace de travail, ouvert depuis l'accueil) |
| `/contacts` | `/oia/crm/` |

La table vit dans le même fichier de configuration que la navigation.

### À conserver

- **L'écran de connexion** (`AuthGate`). `/oia` est placée derrière lui.
- **Le bouton de langue FR / EN** des pages actuelles. Le prototype est en
  français seulement : traduire `/oia` est une étape à part.
- **Les exports** : shortlist CSV et Markdown, journal d'audit,
  sauvegarde et restauration de la couche humaine.
- **Le stockage local et son avertissement** (« conservé dans ce navigateur »).
  La conversation de Shyrka suit la même règle.

### Écarts techniques

| Point | Prototype | Console |
| --- | --- | --- |
| Cadre | TanStack Start et TanStack Router, rendu serveur | Next.js 14, export statique (`apps/web/out`) |
| Outils | Vite, Bun | pnpm, Turbo |
| React | 19 | 18.3 |
| Styles | Tailwind 4, shadcn/ui | CSS simple (`globals.css`) |
| Données | `demo.ts`, `visibility.json` facultatif | `console.json` embarqué, couche humaine en `localStorage`, Supabase si configuré |
| Rendu 3D | Three.js | aucun |

Réponses retenues :
- **Routage.** Une petite cale reproduit `Link`, `useRouter().subscribe` et
  `useRouterState`, pour que les composants du prototype restent tels quels.
- **Styles.** Deux layouts racines (groupes de routes Next), pour que
  Tailwind ne touche pas la console.
- **Versions.** Dépendances en versions exactes. Composants compatibles
  React 18.

## 4. Plan de mise en œuvre (C3)

Caduc. Le plan prévoyait de porter le prototype dans `apps/web`. Ce portage a
été fait puis retiré le 2026-11-08, sur décision de Mickaël. L'interface se
construit dans Lovable, à partir des contrats de données du mandat v8.

## 5. Questions pour Mickaël

Sans objet depuis la décision du 7 novembre.

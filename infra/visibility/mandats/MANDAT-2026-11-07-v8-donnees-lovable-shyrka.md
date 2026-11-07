# Mandat v8 · OIA · données pour Lovable et architecture de Shyrka

7 novembre 2026 · Mickaël Thomas

> Emplacement de référence : `infra/visibility/mandats/MANDAT-2026-11-07-v8-donnees-lovable-shyrka.md`. À exécuter par la session web. L'amendement du 7 novembre s'applique.

> **Avant toute modification**, vérifie les chemins et les responsabilités réels du dépôt. Réutilise l'emplacement canonique des migrations, ne crée aucun second historique SQL, préserve les données utilisateur non exportées et supprime uniquement le portage de l'interface Lovable. Aucun changement en production.

## 0. Principe

**Lovable possède l'interface. Claude Code possède les données, les calculs, la sécurité et l'architecture.** Claude Code ne modifie, ne copie et n'exporte aucun fichier du projet Lovable. Le lien entre les deux est un contrat de données : des vues Supabase en lecture, protégées côté serveur, que l'application Lovable lit avec la session de l'utilisateur.

| Ordre | Bloc | Résultat |
| --- | --- | --- |
| 1 | A · Money Lookup | Les données de Funding, Tenders, Ventures, Signals, Montants et du travail de tri, prêtes pour Lovable |
| 2 | B · Visibility | Les données de mesure prêtes pour les écrans retravaillés |
| 3 | C · Shyrka autonome | L'architecture d'une Shyrka utilisable seule et intégrable dans d'autres applications |
| 4 | Z · Clôture | Roadmap, rapport |

## 1. Règles

1. Commits directs sur `main`, push autorisé, après `git pull --rebase origin main`.
2. **Rien n'est appliqué à la base Supabase OIA** (`iywmvyebuikxyvnrcnoy`, production). Les migrations sont des fichiers, testées sur un Postgres jetable avec des tests adverses, puis relues par Mickaël, qui décide de leur application.
3. Aucune donnée réelle de client dans un fichier public, un test ou un exemple.
4. Aucun appel payant. Aucune modification d'Elmo ni de J0.
5. Zones : celles de la session web (amendement, § 2), plus, pour ce mandat, les migrations Supabase d'OIA dans leur emplacement canonique (`packages/database/supabase/migrations/`, à confirmer par l'audit A0), **uniquement pour produire des fichiers et des tests**, sans aucun déploiement. `infra/visibility/` se lit seulement.
6. Ne t'arrête pas pour poser une question : consigne-la dans le rapport.

## 2. Exigences ajoutées après revue

Elles s'appliquent à tous les blocs et priment sur le reste du mandat.

1. **Commence par un audit (A0)** : migrations réellement appliquées sur la base OIA (lecture seule, liste des migrations et des politiques), tables utilisées par la console, données stockées dans le navigateur à préserver. Rapport `docs/audits/2026-11-08-donnees-existantes.md` avant toute migration.
2. **Migrations incrémentales** : `0002_watch_and_workspace.sql` décrit une base déjà déployée. Ne le rejoue jamais comme création initiale ; chaque changement est une migration qui part de l'état réel.
3. **Fermer les politiques trop larges** : les politiques actuelles laissent tout utilisateur connecté lire les opportunités et écrire dans les tables de travail. Les nouvelles migrations les remplacent par des politiques fondées sur l'appartenance (`auth.uid()` et table des membres). Tests adverses : un utilisateur non membre ne lit et n'écrit rien.
4. **Vues sûres** : toute vue exposée à l'application est créée avec `security_invoker = true` (ou un mécanisme équivalent documenté), pour qu'elle respecte les droits de l'appelant. Test d'accès croisé entre deux clients pour chaque vue.
5. **Reprise des données** : import transactionnel, identifiants stables, reprenable, sans doublon, avec retour arrière documenté et testé.
6. **Typologie financière obligatoire** dans Money Lookup : subvention, chiffre d'affaires contractuel potentiel, investissement en capital, prêt, aide fiscale, montant inconnu. Les totaux se filtrent par catégorie, devise et état de vérification ; aucun total global qui mélange ces catégories.
7. **Indicateurs de Visibility documentés** : formule, dénominateur, traitement des réponses manquantes, méthode de l'intervalle (statistique explicitée, ou simple plage observée sur un petit échantillon), et un état « non mesurable » distinct de zéro.
8. **Contrats de données versionnés** : pour chaque vue, son schéma et sa version, les droits nécessaires, les états vide, chargement et erreur, un exemple fictif, et la règle pour les changements incompatibles.
9. **Shyrka** (bloc C), quatre exigences de plus :
   - les permissions accordées à une application hôte sont vérifiées par le noyau et révocables immédiatement ; une application ne s'accorde jamais une capacité elle-même ;
   - l'identité évolue dans un périmètre distinct des permissions : Shyrka choisit sa voix, son apparence et sa façon de s'exprimer, jamais ses droits d'accès ;
   - l'oubli efface la mémoire active, les index et les copies dérivées ; le sort des sauvegardes et du journal est défini par écrit ;
   - le mode privé précise ce qui n'est pas conservé : conversation, mémoire, télémétrie, et le journal technique minimal qui reste.
10. L'interface `/oia` portée depuis Lovable dans `apps/web` est retirée (message de Mickaël du 7 novembre) : aucune seconde interface n'est maintenue. Seuls les fichiers issus du portage disparaissent ; tout service ou composant partagé avec la console actuelle reste intact, et la console est vérifiée identique avant et après.
11. Le bloc C prépare l'autonomie de Shyrka (ADR, interfaces, tests simulés) ; il ne la réalise pas. L'évolution réelle de sa personnalité, de sa voix et de son apparence viendra plus tard, en fonctionnement réel.

## Bloc A · Money Lookup

Aujourd'hui, la console lit un instantané embarqué (`apps/web/src/data/console.json`) et garde les décisions, étiquettes, notes, tâches et contacts **dans le navigateur seulement**. Le schéma `docs/architecture/schema/0002_watch_and_workspace.sql` et `apps/web/src/lib/remoteWorkspace.ts` préparent déjà leur passage en base.

### A1 · Contrat de données

`docs/interface/contrat-donnees-money-lookup.md`, écran par écran (Aujourd'hui, Toutes, Financements, Appels d'offres, Investisseurs, Signals, Montants, fiche d'une opportunité) : les champs affichés, leur source, leur statut de vérification, et la vue Supabase qui les sert. Règle : un montant inconnu reste inconnu, jamais zéro ; rien n'est présenté comme vérifié sans décision humaine.

### A2 · Migrations et vues

Dans l'emplacement canonique des migrations (`packages/database/supabase/migrations/`, confirmé par A0 ; aucun second historique), fichiers seulement :
- les tables nécessaires à partir de `0002_watch_and_workspace.sql`, mises à jour si besoin ;
- des vues en lecture par écran ;
- des règles d'accès fondées sur l'utilisateur connecté (`auth.uid()`) et une table des membres, sur le modèle des correctifs S1 à S3 de Visibility ;
- les décisions, étiquettes et notes écrites seulement par des fonctions qui vérifient l'identité, et journalisées.

Tests adverses sur Postgres jetable : un utilisateur non membre ne lit rien, un utilisateur ne modifie pas la décision d'un autre, aucune écriture directe dans les tables.

### A3 · Chargement des données

Un script de chargement idempotent qui alimente ces tables depuis les sorties existantes (`outputs/`, `registry/`, le pipeline de découverte), sans les modifier. Il s'exécute sur le Postgres jetable dans ce mandat ; son exécution sur Supabase est réservée à Mickaël.

### A4 · Reprise du travail stocké dans le navigateur

Une procédure, avec un écran d'import décrit pour Lovable, pour transférer les décisions, étiquettes, notes, tâches et contacts aujourd'hui dans le navigateur de Mickaël vers la base. Claude Code ne peut pas lire ce navigateur : l'import part de l'export « sauvegarder » fait par Mickaël, conservé hors du dépôt. Inventaire des clés stockées, format attendu, import sans perte, sans doublon, réversible, testé sur un export fictif.

## Bloc B · Visibility

### B1 · Contrat de données

`docs/interface/contrat-donnees-visibility.md`, pour les onglets décrits dans le brief Lovable : Vue d'ensemble (quatre indicateurs avec intervalles, état « mesure en cours, jour N sur 5 »), Réponses, Citations, Concurrents, Réseaux sociaux, Questions, Recommandations, Rapports, SEO Command.

### B2 · Vues

Des vues en lecture alimentées par la table des preuves et le journal de décision de Visibility (migrations `infra/visibility/migrations/`, lues sans être modifiées), plus les migrations propres à l'interface. Les données d'un client ne sont lisibles que par les membres de ce client. Tests adverses.

### B3 · Données de démonstration

Un jeu de démonstration qui respecte exactement le contrat, pour que Lovable avance avant l'arrivée des vraies données.

## Bloc C · Shyrka autonome et intégrable

Shyrka doit pouvoir devenir un jour un produit seul, et s'intégrer à de nombreuses applications (OIA aujourd'hui, d'autres demain).

### C1 · Architecture

ADR `docs/shyrka/adr/0003-shyrka-autonome.md` :
- **le noyau** : identité (choisie par Shyrka), cadre, mémoire, permissions, voix, journal, indépendants de toute application hôte ;
- **l'intégration** : une application hôte s'enregistre, déclare ce qu'elle fournit (contexte) et ce qu'elle autorise (actions), et n'accède qu'à ce que Mickaël lui accorde ;
- **le contexte** : chaque élément a une source, une date, un statut (à valider, validé, retiré) et peut être oublié ;
- **la confidentialité** : traitement local par défaut, aucun contexte d'une application transmis à une autre sans autorisation, mode privé sans apprentissage ;
- **l'export** : Mickaël peut exporter tout son contexte, dans un format ouvert.

### C2 · Interfaces et données

Dans `packages/shyrka` : les interfaces du noyau (contexte, sources, permissions, applications hôtes, journal), avec des versions simulées et des tests, dont les tests adverses : une application hôte ne lit pas le contexte d'une autre, une permission non accordée est refusée, un élément oublié n'est plus jamais servi.

Contrat de données `docs/interface/contrat-donnees-shyrka.md` pour les onglets de la zone Contexte décrite dans le brief Lovable : Contexte, Sources, Permissions, Cadre, Identité, Applications, Journal.

## Bloc Z · Clôture

1. Roadmap : Money Lookup remplace Funding, Tenders, Ventures et Signals comme module ; le principe Lovable pour l'interface, Claude Code pour les données ; la piste Shyrka autonome.
2. Tests : monorepo au vert.
3. Rapport : `infra/shyrka/reports/2026-11-08-mandat-v8.md`, avec les migrations à relire par Mickaël, dans l'ordre où il devra les appliquer.

# Spécification · Console OIA Visibility

Ce document spécifie les vues de la console (H3). La version CLI de H2 (`apps/visibility-console`) couvre les trois premières en mode textuel. Une UI React dans `apps/web` est prévue plus tard, derrière l'AuthGate existante.

## Principes

- **Jamais déployée automatiquement** cette nuit : `vercel.json` ne vise que `@oia/web` (H1).
- **Données scopées par client** (RLS A5/C1) : l'AuthGate pose `vis.client_id` dans la session SQL avant toute requête.
- **Aucun chiffre composite** (une règle non négociable de la roadmap 3.3) : afficher les métriques avec leur intervalle et leur jour.
- **Pas de couleur sur la base d'un score** : la couleur indique un statut (attendu/en attente/validé/alerte), pas un classement.
- **Lecture seule par défaut** : chaque action qui écrit demande un consentement explicite (règle 16).

## Vues

### V1. Portefeuille de clients et de sites

- Liste des clients (`ownership`, `monthlyBudgetUsd`, statut).
- Sous chaque client : les sites (URL, mode d'action de dépôt, repo) + les sujets rattachés.
- Rangées cliquables ouvrent la vue V2.

**Contrat de données** : `GET /console/portfolio` → `{ clients: Array<{ id, displayName, ownership, monthlyBudgetUsd, sites: [{id, primaryUrl, repoActionMode, subjects: [{id, status}]}] }> }`

### V2. Tableau par site

- Métriques par fenêtre × fournisseur : visibilité Google (quand CrawlSEO sera branché), visibilité IA (mentions, citations, intervalle, moyenne).
- Jours manquants, raison.
- Alerte explicite en haut si un gel est en vigueur.

**Contrat** : `GET /console/site/:subjectId/window/:windowId` → `WindowStats[]` (F1) + `citations[]` + `factualErrors[]`.

### V3. Concurrents et citations

- Liste des concurrents du sujet (depuis `subject.yaml`), avec leur taux d'apparition dans les réponses IA.
- Sources citées par les IA, par catégorie.

**Contrat** : `GET /console/site/:subjectId/competitors` → `{ competitors: [...], citations: [{url, category, count}] }`

### V4. Anomalies

- `FIX_FACT` et `ENTITY_INCONSISTENCY` détectées par F3 et F4.
- Toujours horodatées, toujours sourcées.

**Contrat** : `GET /console/site/:subjectId/anomalies` → `{ facts: [...], entities: [...] }`

### V5. Recommandations par priorité

- Triage : `WATCH` en bas, `FIX_FACT` et `TECH_FIX` en haut.
- Filtres : état (pending/accepted/rejected/obsolete), risque, confiance, créateur.

**Contrat** : `GET /console/site/:subjectId/recommendations` → `Recommendation[]` (E2).

### V6. Actions à valider

- Les missions de SEO Command en `waiting-validation` et les recommandations en `pending`.
- Pour chaque : qui a créé, quand, quelles preuves, que se passe-t-il si on accepte.
- Bouton « valider » protégé par règle 16 : exige `OIA_SEO_HUMAN_IDENTITY` + rôle `owner`.

**Contrat** : `GET /console/actions-pending`, `POST /console/actions-pending/:id/accept` (header `X-OIA-Human-Id`).

### V7. Historique des décisions

- Journal des décisions : accepté/rejeté avec motif, auteur, date, jamais modifié.
- Journal des actions SEO Command (append-only).

**Contrat** : `GET /console/history`, `GET /console/action-log`.

### V8. Coûts par client, site, fournisseur

- Barre par client avec la ligne de plafond.
- Détail par fournisseur (Elmo, OpenRouter, direct).
- Coût réel vs estimation Elmo, flag si l'écart > 20 %.

**Contrat** : `GET /console/costs?scope=client|site|provider`.

### V9. Vue SEO Command

- File de missions, état de chacune.
- Activité de chaque agent (orchestrateur + 5 spécialistes).
- Planification (visible, **affichée comme désactivée** tant que `OIA_SEO_COMMAND_SCHEDULER_ENABLED=false`).
- Validations en attente.
- Journal des actions.
- Coût par mission.

**Contrat** : `GET /console/seo-command/missions`, `GET /console/seo-command/schedule`, `GET /console/seo-command/action-log`.

## Plan d'intégration dans la console OIA principale (`@oia/web`)

1. **Phase 0 (fait cette nuit)** : paquet CLI `@oia/visibility-console`, non déployé. Permet de valider les contrats de données ci-dessus sur des sujets locaux.
2. **Phase 1** : créer `apps/web/app/visibility/` (routes App Router), derrière l'AuthGate existante. Lire les données via une API `apps/web/src/server/visibility/*` qui parle à `vis.*` en Postgres (C1).
3. **Phase 2** : ajouter la vue SEO Command V9 et les boutons de validation (règle 16).
4. **Phase 3** : brancher les métriques réelles (F1 + F2) une fois que la fenêtre J0 réelle sera prise.

## AuthGate

- `vis.client_id` est posé en session par un middleware `apps/web/src/server/middleware/tenant.ts` qui lit l'identité utilisateur, détermine son client (table `user_client`), et exécute `SELECT set_config('vis.client_id', $1, true)` avant chaque requête.
- Côté client web, aucune valeur ne quitte le périmètre du client courant : le middleware refuse toute requête sans `client_id`.
- Les boutons d'action demandent une double confirmation pour chaque passage de `pending` à `accepted` (règle 16).

## Non-objectifs

- Pas de « bureau de contrôle en temps réel » : la console est un tableau de bord, pas un trading desk. Les actions ne s'enchaînent pas sans intervention humaine.
- Pas de notification push, pas de messagerie interne : les alertes passent par les mêmes canaux que Funding V0 (voir `docs/roadmap.md`).
- Pas d'export brut depuis la console : les exports passent par les scripts `window-day.sh`, `backup.sh`, pour éviter qu'un collaborateur sorte 2 000 lignes en un clic.

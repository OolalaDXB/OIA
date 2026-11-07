# Parité · console actuelle et cockpit Lovable · Money Lookup

2026-11-08 · contrat Money Lookup version 2
(`docs/interface/contrat-donnees-money-lookup.md`), migration
`0008_money_lookup_v2.sql` (**en fichier, non appliquée**).

But : que le cockpit Lovable remplace entièrement la console
(`apps/web`), sans perdre une seule fonction. Ce document fait deux choses :

1. l'inventaire de chaque fonction des pages de la console, et la vue ou la
   fonction de la base qui la sert, ou son absence ;
2. la liste de contrôle de parité, et la condition pour retirer l'ancienne
   console.

Sources lues : `apps/web/src/app/*`, `lib/workspaceStore.ts`,
`lib/remoteWorkspace.ts`, `lib/watchData.ts`, `packages/workspace`,
`packages/registry`, `packages/ingestion`.

**Légende :**
- **servie** : une vue ou une fonction de la base la fournit ;
- **cockpit** : à calculer ou présenter par Lovable, à partir de vues servies ;
- **manque** : rien ne la sert aujourd'hui, et c'est une condition de retrait.

## 1. Inventaire, page par page

### Navigation et cadre (toutes les pages)

| Fonction de la console | Servie par | État |
| --- | --- | --- |
| Connexion, déconnexion (Supabase) | authentification Supabase, même projet | servie |
| Pastille du nombre d'alertes ouvertes | `ml_signals_v1` (`type = 'alerte'`, `acquitte_le` null) | servie |
| Export du journal d'audit (JSON) | `ml_avis_v1` (historique complet) | servie (v2) |
| Choix de la langue | interface | cockpit |
| Indicateur de stockage (base, navigateur, mémoire) | sans objet : le cockpit lit toujours la base | sans objet |
| Sauvegarde du navigateur (fichier `oia.workspace.backup`) | sans objet dans le cockpit ; la reprise passe par `oia_importer_sauvegarde` | sans objet |
| Restaurer une sauvegarde dans le navigateur | remplacée par `oia_importer_sauvegarde`, historique `ml_imports_v1`, retour arrière `oia_annuler_import` | servie (v2) |
| « Déplacer les éléments locaux vers la base » | remplacée par l'import A4 (sans doublon, réversible) | servie |

### Opportunités (`/`), et `grants`, `tenders`, `investors`

| Fonction | Servie par | État |
| --- | --- | --- |
| Liste des opportunités | `ml_toutes_v1` ; par famille : `ml_financements_v1`, `ml_appels_offres_v1`, `ml_investisseurs_v1` | servie |
| Filtres nature, recommandation, vérification, décision humaine, projet, échéance | colonnes de `ml_toutes_v1` ; projet selon la règle de `ml_rattachement_v1` | servie |
| Filtre « non triée » (`__untagged`) | `ml_rattachement_v1` (`rattachement = 'aucun'`) | servie (v2) |
| Filtre par raison de blocage | `ml_toutes_v1.raisons_gate` | servie |
| Filtres verdict de l'analyste, route stratégique, fraîcheur | seulement dans `ml_fiche_v1.source`, une fiche à la fois | **manque** (colonnes de liste) |
| Tri par publication, échéance, confiance, titre | échéance et titre servis ; date de publication et confiance seulement dans la source | **manque** (colonnes de liste) |
| Compteurs d'en-tête (affichées / total, recommandations) | `ml_toutes_v1`, `ml_indicateurs_repartition_v1` (`axe = 'recommandation'`) | servie (v2) |
| Écarts du dernier passage (`discrepancies`) | rapport du pipeline, hors base | **manque** |
| Export CSV et Markdown de la liste filtrée | à produire par le cockpit depuis les vues | cockpit |
| Enregistrer une vue | `oia_enregistrer_vue` ; lecture `ml_vues_enregistrees_v1` | servie (v2) |
| Appliquer une vue enregistrée | `ml_vues_enregistrees_v1` | servie (v2) |
| Fiche : faits, échéances, preuves, gate, questions ouvertes, liens | `ml_fiche_v1` (`source` = contenu complet) | servie |
| Suggestions de projets (top 5) | `ml_projets_v1` (mots-clés, secteurs, géographies, exclusions) et `ml_fiche_v1.source` ; la règle de score est à reprendre | cockpit, ou **manque** (calcul côté base) |
| Étiqueter vers un projet, retirer l'étiquette | `oia_etiqueter` ; liste des projets `ml_projets_v1` | servie (v2) |
| Ajouter une note à l'opportunité | `oia_noter` ; lecture `ml_notes_v1` ou `ml_fiche_v1.notes` | servie |
| Créer une tâche sur l'opportunité | `oia_creer_tache` | servie |
| Basculer une tâche faite ou rouverte | `oia_basculer_tache`, **réservée à l'auteur de la tâche** | **manque** (voir § 2) |
| Avis humain (approuver, rejeter, à vérifier, commentaire) | `oia_decider` | servie |
| Journal d'audit de la fiche | `ml_fiche_v1.decisions`, `ml_avis_v1` | servie |

### Aujourd'hui (`/digest`), et `alerts`

| Fonction | Servie par | État |
| --- | --- | --- |
| Raisons : bientôt clos, approuvé mais bloqué, à trier, tâche en retard, tâche à faire | `ml_aujourdhui_v1` | servie, avec des écarts (ci-dessous) |
| Horizon 7, 14 ou 30 jours | `ml_aujourdhui_v1` fixe 7 jours (tâches) et 14 jours (échéances) ; le cockpit peut filtrer `ml_taches_v1` et `ml_toutes_v1` | cockpit |
| Raison « juste expirée » (échue, déjà décidée) | absente de `ml_aujourdhui_v1` ; calculable depuis `ml_toutes_v1` | cockpit |
| « À trier » limité aux 5 plus récentes | `ml_aujourdhui_v1` les rend toutes | cockpit |
| Export Markdown du digest | à produire par le cockpit | cockpit |
| Liste des alertes ouvertes, acquitter | `ml_signals_v1`, `oia_acquitter_alerte` | servie |

### Money (`/money`), et `metrics`

| Fonction | Servie par | État |
| --- | --- | --- |
| Rattachement aux projets (étiquette, sinon découverte) | `ml_rattachement_v1` | servie (v2) |
| Par projet : opportunités, avec montant, couverture, peu sûrs, prêtes, closes sous 14 jours, sortantes | `ml_indicateurs_v1` | servie (v2) |
| Ligne « non triée » | `ml_indicateurs_v1` (`projet` null) | servie (v2) |
| Montants par projet et par devise | `ml_indicateurs_montants_v1` : par catégorie, sens, devise et vérification | servie (v2), **écart voulu** |
| Totaux « sur l'ensemble » par devise | `ml_montants_v1` (espace entier, sans mélange de catégories) | servie, **écart voulu** |
| Répartition par nature | `ml_indicateurs_repartition_v1` (`axe = 'nature'`) | servie (v2) |
| Ce qui bloque l'argent (raisons du gate) | `ml_indicateurs_repartition_v1` (`axe = 'blocage'`) ; `pretes` dans `ml_indicateurs_v1` | servie (v2) |

**Écart voulu.** La console additionne, par devise, des subventions et des
appels d'offres dans un même « entrant ». Le contrat l'interdit : aucun écran
n'additionne deux catégories, deux sens ou deux devises. Le cockpit montre
donc une ligne par catégorie.

### Espace de travail (`/workspace`), et `contacts`, `notes`, `tasks`

| Fonction | Servie par | État |
| --- | --- | --- |
| Tâches : liste, filtres ouvertes, faites, toutes, en retard | `ml_taches_v1` (`en_retard`) | servie (v2) |
| Créer une tâche | `oia_creer_tache` | servie |
| Basculer une tâche | `oia_basculer_tache` (auteur seulement) | **manque** (voir § 2) |
| Supprimer une tâche | aucune fonction | **manque** |
| Notes : liste, filtre libre ou par projet | `ml_notes_v1` | servie (v2) |
| Écrire une note | `oia_noter` | servie |
| Supprimer une note | aucune fonction | **manque** |
| Contacts : liste, filtre par projet | `ml_contacts_v1` | servie (v2) |
| Ajouter un contact | `oia_creer_contact` | servie |
| Supprimer un contact | aucune fonction | **manque** |
| Lier à une opportunité ou à un projet (sélecteurs) | `ml_toutes_v1`, `ml_projets_v1` | servie (v2) |

### Projets (`/projects`)

| Fonction | Servie par | État |
| --- | --- | --- |
| Liste et fiche des projets du registre (statut, type, découverte, revue du profil, secteurs, entités…) | `ml_projets_v1` (`profil` complet) | servie (v2), après chargement des projets |
| Nombre d'opportunités étiquetées | `ml_projets_v1.opportunites_etiquetees` | servie (v2) |
| Argent en jeu pour le projet | `ml_indicateurs_v1`, `ml_indicateurs_montants_v1` | servie (v2) |
| Sources du projet | `ml_projets_v1.sources` | servie (v2) |
| Statut des liens (site, sources, opportunités) | `ml_liens_v1` ; « non vérifié » sans ligne | servie (v2) |
| Opportunités étiquetées, tâches et notes du projet | `ml_toutes_v1`, `ml_taches_v1`, `ml_notes_v1` | servie (v2) |
| Suggestions (10 non étiquetées) | comme les suggestions de la fiche | cockpit, ou **manque** |
| Lancer une recherche pour le projet | `oia_demander('DISCOVERY', { projects: [slug] })` ; suivi `ml_demandes_v1` | servie (v2 pour le suivi) |
| Ajouter une opportunité par lien | `oia_demander('INGEST_URL', { url, projectSlug, kindHint })` ; suivi `ml_demandes_v1` | servie (v2 pour le suivi) |
| Créer un projet | brouillon dans `project_drafts` : **aucune fonction** ; lecture `ml_brouillons_projet_v1` | **manque** (écriture) |

## 2. Liste de contrôle de parité

Chaque ligne doit être cochée avant de retirer la console.

### Données servies (contrat version 2)

- [ ] 0008 relue et appliquée par Mickaël (après 0007), inscrite dans
  `supabase_migrations.schema_migrations`.
- [ ] Projets chargés : `pnpm --filter @oia/money-lookup charger -- --projets`,
  puis ajouté au rafraîchissement quotidien (`scripts/rafraichir.sh`).
- [ ] Le cockpit lit les quatorze vues de la version 2 et les neuf de la
  version 1, avec les états chargement, vide, erreur et accès non accordé.

### Écritures qui manquent (proposées pour une migration 0009, à décider)

- [ ] `oia_supprimer(espace, 'note' | 'tache' | 'contact' | 'vue', id)` :
  suppression journalisée, éditeur ou propriétaire. La console supprime
  aujourd'hui notes, tâches et contacts.
- [ ] `oia_modifier_tache(tache, titre, echeance)`, et basculer une tâche
  quel que soit son auteur parmi les éditeurs de l'espace : avec deux comptes,
  Mickaël ne peut pas aujourd'hui fermer depuis l'un une tâche créée depuis
  l'autre.
- [ ] `oia_proposer_projet(espace, slug, contenu)` : brouillon de projet
  `PENDING`, au format du registre, puis demande `DISCOVERY`.

### Colonnes de liste qui manquent (ajout compatible à `ml_toutes_v1`, à décider)

- [ ] Date de publication, confiance de l'information, verdict de l'analyste,
  route stratégique, type d'avis : pour filtrer et trier la liste sans ouvrir
  chaque fiche. Un ajout de colonnes garde `_v1` (règle du contrat), mais le
  contrat v1 du cockpit est figé : à décider entre cet ajout et une vue
  `ml_liste_v1`.
- [ ] Fraîcheur : la console recalcule à la lecture qu'une opportunité échue
  est « expirée », non éligible et rejetée. La base garde l'état de la source.
  Le cockpit montre « expirée » d'après `echeance` ; les indicateurs de la v2
  ne comptent jamais une opportunité échue comme prête. **Écart à noter** :
  la console prend l'échéance de candidature, la base la date la plus
  tardive citée par la source.

### Calculs à porter par le cockpit (ou par la base, à décider)

- [ ] Suggestions de projets (score mots-clés, secteurs, géographies,
  exclusions), sur `ml_projets_v1` et la source de la fiche.
- [ ] Digest : horizon 7, 14 ou 30 jours, « juste expirée », limite de 5 « à
  trier » ; ou une `ml_aujourdhui_v2` qui les sert.
- [ ] Exports CSV, Markdown, digest et journal d'audit, depuis les vues.
- [ ] Écarts du dernier passage du pipeline : à servir (rapport) ou à
  abandonner.

### Vérifications avant retrait

- [ ] Mickaël a refait, dans le cockpit, chaque fonction cochée « servie »
  ou « cockpit » des tableaux du § 1, sur données réelles.
- [ ] Aucune écriture directe ne reste nécessaire : le cockpit n'appelle que
  les fonctions `oia_*` (les écritures « manque » ci-dessus sont livrées).
- [ ] Le travail resté dans le navigateur est repris : sauvegarde faite
  depuis la console, puis `oia_importer_sauvegarde`, bilan vérifié dans
  `ml_imports_v1`.
- [ ] Une semaine d'usage du cockpit seul, sans retour à la console.

### Condition de retrait de l'ancienne console

La console est retirée quand **toutes les cases ci-dessus sont cochées** et
que Mickaël le décide. Le retrait se fait alors en deux temps :

1. retirer la migration transitoire 0003a (bloc de retrait en tête du
   fichier) : la console perd ses écritures directes, le cockpit n'est pas
   touché ;
2. retirer `apps/web` du déploiement Vercel, après une dernière sauvegarde du
   navigateur importée et vérifiée.

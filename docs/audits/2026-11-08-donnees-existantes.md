# Audit A0 · données existantes d'OIA · 2026-11-08

Mandat v8, exigence 1. Audit fait avant toute migration, **mis à jour le
2026-11-08** après la décision de Mickaël : la base est désormais réservée à
OIA. Lecture seule : la base Supabase n'a été interrogée que par des `SELECT`
sur le catalogue (`information_schema`, `pg_policies`,
`supabase_migrations`, `storage.buckets`) et par des comptages, sans lire
aucune ligne de donnée ni aucun compte.

## 1. Où vivent les migrations

| Emplacement | Contenu | Déployé sur la base OIA ? |
| --- | --- | --- |
| `packages/database/supabase/migrations/0002_watch_and_workspace.sql` | **Migration de départ** : registre de veille (`watch_*`, `alerts`), couche humaine (`reviews`, `project_tags`, `notes`, `tasks`, `contacts`, `saved_views`), file de travail (`requests`, `project_drafts`, `link_checks`). Rangée ici le 2026-11-08 depuis `docs/architecture/schema/` | **Oui**, par trois migrations Supabase du 16 septembre 2026 : `watch_ledger_and_workspace`, `rename_dedup_key_to_watch_key`, `requests_drafts_and_link_checks` |
| `packages/database/supabase/archive/0001_init.sql` | Schéma M0 : `projects`, `sources`, `opportunities`, `evidence`, `claims`, `eligibility_assessments`, `opportunity_scores`, `recommendations`, `llm_runs`, `pipeline_runs`, `audit_log`. Archivé le 2026-11-08 | **Non**, jamais. Aucune de ces tables n'existe en base |
| `docs/architecture/schema/0001_init.sql` | Copie de conception identique du précédent | Non |
| `infra/visibility/migrations/0001` à `0004` | Schéma `vis` de Visibility : preuves, journal de décision, journal des actions client, identité et membres | Non : appliqué seulement sur le Postgres local de Visibility |

**Emplacement canonique : `packages/database/supabase/migrations/`.** Un seul
historique : `0002` (déployée), puis `0002a`, `0003` à `0006` (fichiers à
relire, non appliqués). Aucune migration ne rejoue `0002` comme création
initiale (exigence 2).

## 2. La base Supabase « OIA » (`iywmvyebuikxyvnrcnoy`)

- Postgres 17.6, région eu-central-1.
- **Réservée à OIA depuis le 7 novembre 2026** (décision de Mickaël). La
  copie de BEAU, qui la partageait, en a été retirée : tables, fonctions,
  comptes de démonstration, files d'e-mails. Vérifié ce jour :
  - deux migrations du 7 novembre consignent ce retrait :
    `vider_beau_garder_oia` et `retirer_files_email_beau` ;
  - le schéma `public` ne contient plus que les 13 tables d'OIA, ses 4 types
    énumérés (`watch_event_type`, `alert_kind`, `request_kind`,
    `request_status`), aucune vue et aucune fonction ;
  - `auth.users` compte **2 comptes**, ceux de Mickaël ;
  - aucune tâche planifiée (`cron.job` vide), aucun secret dans `vault`.
- **Reste à nettoyer** : trois compartiments de stockage, vides, qui ne
  servent pas à OIA : `asset-images` et `documents` (privés), `email-assets`
  (public). Aucun objet dedans. À supprimer par Mickaël s'ils viennent de BEAU.
- **Pas de projet Supabase séparé pour OIA** (décision de Mickaël).

### Tables d'OIA en base

| Table | Lignes | Rôle |
| --- | --- | --- |
| `watch_opportunities` | 1 | Une ligne par opportunité suivie (identité `watch_key`, état du gate, `payload` jsonb = `ConsoleRecord`) |
| `watch_events`, `watch_runs`, `alerts` | 1, 0, 0 | Événements de veille, exécutions, alertes |
| `reviews` | 0 | Décisions humaines (ajout seul) |
| `project_tags`, `notes`, `tasks`, `contacts`, `saved_views` | 0 | Couche humaine |
| `requests`, `project_drafts`, `link_checks` | 0 | File de travail entre la console et le worker |

RLS activé partout. Aucun déclencheur.

### Politiques en place : encore larges

Les 18 politiques de `0002` sont toujours en place :

| Table | Politique | Effet |
| --- | --- | --- |
| `watch_opportunities`, `watch_events`, `watch_runs`, `link_checks`, `requests`, `project_drafts` | `authenticated read` : `true` | Tout compte connecté lit tout |
| `alerts` | lecture `true`, `UPDATE` `true` | Tout compte connecté lit et acquitte |
| `reviews` | lecture `true`, `INSERT` `true` | Tout compte connecté ajoute une décision, sous n'importe quel nom (`actor` libre) |
| `notes`, `tasks`, `contacts`, `project_tags`, `saved_views` | `ALL` : `true` / `true` | Tout compte connecté lit, crée, modifie et supprime |
| `requests`, `project_drafts` | `INSERT` si statut initial | Tout compte connecté met du travail en file |

**Risque.** Le constat bloquant de la première version (comptes d'un autre
produit sur la même base) est levé : seuls les deux comptes de Mickaël
existent. Le risque qui reste : tout compte créé plus tard, par erreur ou par
une inscription restée ouverte, lirait et écrirait le travail d'OIA.
`0002a_comptes_de_mickael.sql` le ferme dès maintenant, sans toucher à la
console : les politiques sont les mêmes, réservées aux comptes de Mickaël.

Les droits `anon` sont ceux que Supabase accorde par défaut sur `public`.
Ils sont neutralisés par RLS, faute de politique `anon`. `0003` les retirera.

## 3. Tables utilisées par la console

- **`apps/web/src/lib/remoteWorkspace.ts`** et `workspaceStore.ts` : lecture
  et écriture de `reviews`, `project_tags`, `notes`, `tasks`, `contacts`,
  `saved_views` quand Supabase est configuré. Sinon, stockage local.
  **Décision de Mickaël du 2026-11-08 : la console garde son stockage
  local ; 0003 attendra l'application Lovable.**
- **`apps/web/src/lib/watchData.ts`** : lecture de `watch_opportunities`,
  d'`alerts` et de `link_checks`, acquittement des alertes.
- `apps/web/src/app/projects/*` : `requests`, `project_drafts`.
- **Workers** (rôle `service_role`) : `process-requests.ts` traite
  `requests` et `project_drafts` ; la publication de la veille alimente
  `watch_*` et `alerts`. `persistence.supabase.ts` et `run.ts` citent aussi
  des tables de `0001_init.sql` (`opportunities`, `sources`, `claims`…), qui
  n'existent pas en base : ce chemin n'a jamais tourné contre Supabase.

Toutes ces opérations restent permises aux comptes de Mickaël après `0002a`
(test `packages/database/test/comptes-mickael.test.ts`).

## 4. Données stockées dans le navigateur, à préserver

Six clés, dans le stockage local du navigateur de Mickaël
(`packages/workspace/src/store.ts`, `WORKSPACE_KEYS`) :

| Clé | Contenu | Identifiant |
| --- | --- | --- |
| `oia.audit.v1` | Décisions de revue (`AuditEvent` : `recordId`, `action`, `comment`, `at`, `actor`, état du gate) | texte, `audit-<base36>-<n>` |
| `oia.tags.v1` | Étiquettes d'opportunité vers projet (`recordId` → `projectSlug`) | la clé `recordId` |
| `oia.notes.v1`, `oia.tasks.v1`, `oia.contacts.v1` | Notes, tâches, contacts (`WorkspaceItemBase` : `id`, `at`, `actor`, `projectSlug`, `recordId`) | texte, `<table>-<base36>-<n>` |
| `oia.views.v1` | Vues sauvegardées | texte |

Plus `oia.lang` (choix de langue), qui reste dans le navigateur. Le bouton
« sauvegarder » produit un fichier `{ "kind": "oia.workspace.backup",
"version": 1, "data": { <clé>: <valeur> } }`. La reprise (A4, migration 0005)
part de ce fichier. **Rien n'est effacé du navigateur.** Comme la console
garde son stockage local, ces données y restent la référence jusqu'à la
reprise.

## 5. Conséquences pour les migrations

1. `0002a_comptes_de_mickael.sql` : à appliquer maintenant. Tables réservées
   aux comptes de Mickaël, lus par e-mail au moment de l'application.
2. `0003_membres_et_politiques.sql` : attend l'application Lovable. Espaces,
   membres, fonctions d'écriture journalisées ; elle retire les politiques de
   `0002a` et fait des comptes de Mickaël les propriétaires du studio.
3. `0004_money_lookup.sql` : typologie financière, montants, vues par écran
   en `security_invoker`.
4. `0005_reprise_navigateur.sql` : identifiants d'origine, journal d'import et
   retour arrière.
5. `0006_visibility_vues.sql` : vues de lecture sur le schéma `vis`, après
   `infra/visibility/migrations/0001` à `0004` (`0004` corrigée pour
   Supabase par la session Visibility, commit `7093687`).

Toutes sont testées sur un Postgres 16 jetable, sans Docker, avec une
émulation d'`auth.uid()` et des rôles Supabase.

## 6. Questions tranchées par Mickaël le 2026-11-08

1. `0002` est rangée dans `packages/database/supabase/migrations/` comme
   migration de départ, marquée déjà déployée.
2. `0001_init.sql` est archivée (`packages/database/supabase/archive/`).
3. Pas de projet Supabase séparé : la base est réservée à OIA.

Question restante : supprimer les trois compartiments de stockage vides
(§ 2) ?

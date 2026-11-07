# Audit A0 · données existantes d'OIA · 2026-11-08

Mandat v8, exigence 1. Audit fait avant toute migration. Lecture seule : la
base Supabase n'a été interrogée que par des `SELECT` sur le catalogue
(`pg_policies`, `information_schema`) et sur le nombre d'utilisateurs, sans
lire aucune ligne de donnée.

## 1. Où vivent les migrations (instruction de tête du mandat)

| Emplacement | Contenu | Déployé sur la base OIA ? |
| --- | --- | --- |
| `packages/database/supabase/migrations/0001_init.sql` | Schéma M0 : `projects`, `sources`, `opportunities`, `evidence`, `claims`, `eligibility_assessments`, `opportunity_scores`, `recommendations`, `llm_runs`, `pipeline_runs`, `audit_log` | **Non.** Aucune de ces tables n'existe en base |
| `docs/architecture/schema/0001_init.sql` | Copie identique du précédent | Non |
| `docs/architecture/schema/0002_watch_and_workspace.sql` | Registre de veille (`watch_*`, `alerts`), couche humaine (`reviews`, `project_tags`, `notes`, `tasks`, `contacts`, `saved_views`), file de travail (`requests`, `project_drafts`, `link_checks`) | **Oui**, par trois migrations Supabase du 16 septembre 2026 : `watch_ledger_and_workspace`, `rename_dedup_key_to_watch_key`, `requests_drafts_and_link_checks` |
| `infra/visibility/migrations/0001` à `0004` | Schéma `vis` de Visibility : preuves, journal de décision, journal des actions client, identité et membres (S1 à S4) | Non : appliqué seulement sur le Postgres local de Visibility |

**Emplacement canonique retenu : `packages/database/supabase/migrations/`.**
Les nouvelles migrations y sont numérotées à partir de `0003`. Elles partent
de l'état réel décrit par `0002_watch_and_workspace.sql`, sans jamais le
rejouer comme création initiale (exigence 2). Aucun second historique n'est
créé. `0002` reste où il est ; le déplacer est une question pour Mickaël.

## 2. La base Supabase « OIA » (`iywmvyebuikxyvnrcnoy`)

- Postgres 17.6, région eu-central-1.
- 151 migrations au total. Les 3 dernières sont celles d'OIA ; les
  précédentes, de décembre 2025 à juin 2026, appartiennent à un autre produit.
- **La base est partagée avec BEAU**, un autre produit qui contient des
  données financières personnelles (tables `beau_*`, `assets`, `liabilities`,
  `loan_*`, `receivables`, `documents`…). L'audit n'a lu aucune de ces
  tables. Il ne décrit que celles d'OIA.
- 6 comptes dans `auth.users`, communs aux deux produits.

### Tables d'OIA en base

| Table | Lignes | Rôle |
| --- | --- | --- |
| `watch_opportunities` | 1 | Une ligne par opportunité suivie (identité `watch_key`, état du gate, `payload` jsonb = `ConsoleRecord`) |
| `watch_events`, `watch_runs`, `alerts` | 1, 0, 0 | Événements de veille, exécutions, alertes |
| `reviews` | 0 | Décisions humaines (ajout seul) |
| `project_tags`, `notes`, `tasks`, `contacts`, `saved_views` | 0 | Couche humaine |
| `requests`, `project_drafts`, `link_checks` | 0 | File de travail entre la console et le worker |

Aucune vue, aucun déclencheur sur ces tables. RLS activé partout.

### Politiques en place : trop larges (exigence 3)

| Table | Politique | Effet |
| --- | --- | --- |
| `watch_opportunities`, `watch_events`, `watch_runs`, `link_checks`, `requests`, `project_drafts` | `authenticated read` : `true` | Tout compte connecté lit tout |
| `alerts` | lecture `true`, `UPDATE` `true` | Tout compte connecté lit et acquitte |
| `reviews` | lecture `true`, `INSERT` `true` | Tout compte connecté ajoute une décision, sous n'importe quel nom (`actor` libre) |
| `notes`, `tasks`, `contacts`, `project_tags`, `saved_views` | `ALL` : `true` / `true` | Tout compte connecté lit, crée, modifie et supprime |
| `requests`, `project_drafts` | `INSERT` si statut initial | Tout compte connecté met du travail en file |

**Constat bloquant.** La base est partagée avec BEAU, dont les utilisateurs
sont aussi des comptes `authenticated`. Un utilisateur de BEAU peut donc
lire, modifier et supprimer les tâches, notes et contacts d'OIA, et y
déposer des décisions. Le risque est faible aujourd'hui, car ces tables sont
vides, mais il deviendra réel dès la reprise des données du navigateur (A4).
La migration `0003` le corrige ; **elle doit être appliquée avant toute
reprise.**

Les droits `anon` sont ceux que Supabase accorde par défaut sur `public`.
Ils sont neutralisés par RLS, faute de politique `anon`. `0003` les retire
par défense en profondeur.

## 3. Tables utilisées par la console

- **`apps/web/src/lib/remoteWorkspace.ts`** et `workspaceStore.ts` : lecture
  et écriture de `reviews`, `project_tags`, `notes`, `tasks`, `contacts`,
  `saved_views` quand Supabase est configuré. Sinon, stockage local.
- **`apps/web/src/lib/watchData.ts`** : lecture de `watch_opportunities`,
  d'`alerts` et de `link_checks`, acquittement des alertes.
- `apps/web/src/app/projects/*` : `requests`, `project_drafts`.
- **Workers** (rôle `service_role`) : `process-requests.ts` traite
  `requests` et `project_drafts` ; la publication de la veille alimente
  `watch_*` et `alerts`. `persistence.supabase.ts` et `run.ts` citent aussi
  des tables de `0001_init.sql` (`opportunities`, `sources`, `claims`…), qui
  n'existent pas en base : ce chemin n'a jamais tourné contre Supabase.

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
"version": 1, "data": { <clé>: <valeur> } }`. La reprise (A4) part de ce
fichier. **Rien n'est effacé du navigateur** : la console d'origine est
remise à l'identique et garde ses clés.

## 5. Conséquences pour les migrations

1. `0003_membres_et_politiques.sql` : espace de travail, table des membres,
   colonne `workspace_id` sur chaque table d'OIA. Les politiques
   `authenticated … true` sont remplacées par des politiques d'appartenance,
   et les écritures passent par des fonctions qui vérifient l'identité et
   journalisent.
2. `0004_money_lookup.sql` : typologie financière, montants, vues par écran
   en `security_invoker`.
3. `0005_reprise_navigateur.sql` : colonnes d'identifiant d'origine, journal
   d'import et retour arrière.
4. `0006_visibility_vues.sql` : vues de lecture sur le schéma `vis`. Elle
   exige que les migrations `infra/visibility/migrations/0001` à `0004` aient
   été appliquées d'abord.

Toutes sont testées sur un Postgres 16 jetable, sans Docker, avec une
émulation d'`auth.uid()` et des rôles Supabase.

## 6. Questions pour Mickaël

1. Faut-il déplacer `docs/architecture/schema/0002_watch_and_workspace.sql`
   dans `packages/database/supabase/migrations/`, pour n'avoir qu'un dossier ?
2. `0001_init.sql` n'est pas déployé. Faut-il le marquer « jamais appliqué »,
   ou le retirer du dossier canonique ?
3. La base est partagée avec BEAU. Faut-il, à terme, un projet Supabase
   propre à OIA ? En attendant, `0003` ferme l'accès des comptes qui ne sont
   pas membres.

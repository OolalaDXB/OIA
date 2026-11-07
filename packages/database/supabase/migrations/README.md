# Migrations Supabase d'OIA

Emplacement canonique, confirmé par l'audit A0
(`docs/audits/2026-11-08-donnees-existantes.md`). Il n'existe qu'un historique.
La base OIA (`iywmvyebuikxyvnrcnoy`) est réservée à OIA depuis le 7 novembre
2026 (décision de Mickaël) : il n'y aura pas de projet Supabase séparé.

| Fichier | État sur la base OIA |
| --- | --- |
| `0002_watch_and_workspace.sql` | **Migration de départ, déjà déployée** le 16 septembre 2026, en trois migrations Supabase. Ne jamais la rejouer sur cette base ; elle sert aux tests et à une base neuve |
| `0002a_comptes_de_mickael.sql` | À relire, puis à appliquer **maintenant** : réserve les tables aux comptes de Mickaël, la console garde ses droits |
| `0003_membres_et_politiques.sql` | **Attend l'application Lovable** (décision du 2026-11-08) : elle coupe les écritures directes de la console |
| `0004_money_lookup.sql` | Après 0003 |
| `0005_reprise_navigateur.sql` | Après 0004 |
| `0006_visibility_vues.sql` | Après le schéma `vis` de Visibility (`infra/visibility/migrations/0001` à `0004`), `0004` corrigée pour Supabase par la session Visibility (commit `7093687`) |

Archive : `../archive/0001_init.sql`, schéma M0 jamais appliqué (copie de
conception : `docs/architecture/schema/0001_init.sql`).

`0002a` s'appelle ainsi pour se ranger entre `0002`, déjà déployée, et `0003`,
sans renuméroter les fichiers suivants.

Rien n'a été appliqué par Claude Code. Chaque fichier est testé sur un
Postgres jetable : `pnpm --filter @oia/database test` (tests adverses dans
`packages/database/test/`). Les tests s'ignorent eux-mêmes si Postgres n'est
pas installé (`initdb` introuvable).

## Maintenant : 0002a, par Mickaël

Dans l'éditeur SQL de Supabase, en une seule exécution :

```sql
select set_config('oia.comptes_mickael', '<e-mail du premier compte>, <e-mail du second compte>', false);
-- puis tout le contenu de 0002a_comptes_de_mickael.sql
```

- Les identifiants sont lus dans `auth.users` par e-mail, en lecture seule.
  Les e-mails ne sont pas écrits dans le dépôt.
- Un e-mail introuvable, ou aucun e-mail : la migration s'arrête et rien ne
  change (transaction).
- Effet : chaque politique « authenticated … true » de 0002 devient la même
  politique, réservée à ces comptes. La console, connectée avec un de ces
  comptes, garde exactement ses droits (lecture, décisions en ajout seul,
  étiquettes, notes, tâches, contacts, vues, acquittement des alertes,
  demandes `QUEUED`, brouillons `PENDING`). Tout autre compte connecté ne lit
  ni n'écrit plus rien. Le rôle de service des workers n'est pas concerné.
- Vérification après application :

  ```sql
  select count(*) from public.oia_compte_autorise;          -- 2
  select policyname, tablename from pg_policies where schemaname = 'public' order by 2, 1;
  ```

- Ajouter un compte plus tard :
  `insert into public.oia_compte_autorise (user_id) select id from auth.users where email = '<e-mail>';`

## Plus tard : quand l'application Lovable appellera les fonctions `oia_*`

1. **Appliquer 0003, 0004 et 0005**, dans cet ordre, chacune dans sa
   transaction. 0003 retire les politiques de 0002a et fait des comptes de
   `oia_compte_autorise` les propriétaires du studio : pas d'ajout de membre à
   la main.
2. **Charger les opportunités** (`packages/money-lookup`, A3). Le chargeur
   refuse une adresse Supabase sans `OIA_CHARGEMENT_SUPABASE=oui`.
3. **Reprendre le travail du navigateur** (A4) : `select
   oia_importer_sauvegarde('<espace>', '<contenu du fichier>'::jsonb)`,
   connecté avec son compte. Le retour arrière se fait par
   `select oia_annuler_import('<import_id>')`.
4. **0006** seulement quand le schéma `vis` de Visibility sera sur la base.
   `infra/visibility/migrations/0004_auth_identity.sql` a été corrigée pour Supabase par la session Visibility (commit `7093687`),
   test dans `test/visibility.test.ts`. 0006 pose aussi une politique RLS sur
   `vis.client_member` (un compte de l'interface ne voit que ses propres
   appartenances) : à relire avec elle. Les tables `vis` appartenant à
   `vis_admin`, 0006 s'applique avec un rôle qui peut accorder leurs droits.

## Retour arrière

- 0006 : `drop view` des vues `vis_*_v1`, `drop function vis_valider_recommandation,
  vis_rejeter_recommandation`, `drop schema vis_ui cascade`, puis
  `alter table vis.client_member disable row level security` et
  `drop policy interface_ses_lignes on vis.client_member`.
- 0005 : `oia_annuler_import` pour un import. Pour la migration elle-même :
  `drop function oia_importer_sauvegarde, oia_annuler_import`, puis
  `drop table oia_import cascade`. Les colonnes `id_origine`,
  `auteur_origine` et `import_id` peuvent rester.
- 0004 : `drop view` des vues `ml_*`, puis `drop table ml_montant, ml_lot`,
  puis `alter table watch_opportunities drop column lot_initial`.
- 0003 : recréer les politiques de 0002a (ou de 0002). Les colonnes
  `espace_id` restent, avec une valeur par défaut.
- 0002a : pour chaque table, `drop policy` des politiques `mickael …`, puis
  recréer celles de 0002 (`0002_watch_and_workspace.sql`, section des
  politiques), puis `drop function oia_compte_de_mickael` et
  `drop table oia_compte_autorise`. **Déconseillé** : cela rouvre les tables à
  tout compte connecté.

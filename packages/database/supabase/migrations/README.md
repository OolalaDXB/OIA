# Migrations Supabase d'OIA

Emplacement canonique, confirmé par l'audit A0
(`docs/audits/2026-11-08-donnees-existantes.md`). Il n'existe qu'un historique :

| Fichier | État sur la base OIA (`iywmvyebuikxyvnrcnoy`) |
| --- | --- |
| `0001_init.sql` | **Jamais appliqué.** Schéma M0, conservé pour mémoire |
| `0002` (`docs/architecture/schema/0002_watch_and_workspace.sql`) | **Appliqué** le 16 septembre 2026, en trois migrations Supabase |
| `0003_membres_et_politiques.sql` | À relire par Mickaël, puis à appliquer |
| `0004_money_lookup.sql` | À relire, puis à appliquer après 0003 |
| `0005_reprise_navigateur.sql` | À relire, puis à appliquer après 0004 |
| `0006_visibility_vues.sql` | À relire ; prérequis : le schéma `vis` (`infra/visibility/migrations/0001` à `0004`) |

Rien n'a été appliqué par Claude Code. Chaque fichier est testé sur un
Postgres jetable : `pnpm --filter @oia/database test` (tests adverses dans
`packages/database/test/`). Les tests s'ignorent eux-mêmes si Postgres n'est
pas installé (`initdb` introuvable).

## Ordre d'application, par Mickaël

1. **Préparer la console.** Après 0003, la console actuelle ne peut plus
   écrire directement dans les tables (`apps/web/src/lib/remoteWorkspace.ts`
   fait des `insert` et des `update`). Deux choix :
   - laisser la console sur son stockage local, sans Supabase, jusqu'à ce que
     l'interface Lovable appelle les fonctions `oia_*` ;
   - ou adapter `remoteWorkspace.ts` aux fonctions.

   C'est une décision de Mickaël.
2. **Appliquer 0003, 0004 et 0005**, dans cet ordre, chacune dans sa
   transaction.
3. **S'ajouter comme membre**, avec son identifiant de compte (Supabase,
   Authentication, Users) :

   ```sql
   insert into public.oia_membre (user_id, espace_id, role)
   values ('<identifiant de Mickaël>', '00000000-0000-4000-8000-000000000001', 'proprietaire');
   ```

   Sans cette ligne, personne ne lit rien : c'est voulu.
4. **Charger les opportunités** (`packages/money-lookup`, A3). Le chargeur
   refuse une adresse Supabase sans `OIA_CHARGEMENT_SUPABASE=oui`.
5. **Reprendre le travail du navigateur** (A4) : `select
   oia_importer_sauvegarde('<espace>', '<contenu du fichier>'::jsonb)`,
   connecté avec son compte. Le retour arrière se fait par
   `select oia_annuler_import('<import_id>')`.
6. **0006** seulement quand le schéma `vis` de Visibility sera sur la base.

## Retour arrière

- 0005 : `oia_annuler_import` pour un import. Pour la migration elle-même :
  `drop function oia_importer_sauvegarde, oia_annuler_import`, puis
  `drop table oia_import cascade`. Les colonnes `id_origine`,
  `auteur_origine` et `import_id` peuvent rester.
- 0004 : `drop view` des vues `ml_*`, puis `drop table ml_montant, ml_lot`,
  puis `alter table watch_opportunities drop column lot_initial`.
- 0003 : recréer les politiques de 0002 (`docs/architecture/schema/0002_watch_and_workspace.sql`,
  lignes 264 à 297). Les colonnes `espace_id` restent, avec une valeur par
  défaut. **Déconseillé** : la base est partagée avec un autre produit.

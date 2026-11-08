# Migrations Supabase d'OIA

Emplacement canonique, confirmé par l'audit A0
(`docs/audits/2026-11-08-donnees-existantes.md`). Il n'existe qu'un historique.
La base OIA (`iywmvyebuikxyvnrcnoy`) est réservée à OIA depuis le 7 novembre
2026 (décision de Mickaël) : il n'y aura pas de projet Supabase séparé.

## État de la base OIA (mandat v9, nuit du 8 novembre 2026)

Sauvegarde de référence, prise avant toute migration :
`~/oia-sauvegardes/avant-v9/` (vidage complet `oia-complet.dump`, schéma,
données, `SHA256SUMS`), relue sur un Postgres jetable.

| Ordre | Fichier | Version inscrite dans `supabase_migrations.schema_migrations` |
| --- | --- | --- |
| — | `0002_watch_and_workspace.sql` | Migration de départ, déployée le 16 septembre 2026 (trois versions `20260916…`). Ne jamais la rejouer sur cette base |
| 1 | `0002a_comptes_de_mickael.sql` | `20261108010000` |
| 2 | `0003_membres_et_politiques.sql` | `20261108010100` |
| 3 | `0003a_transition_console.sql` (**transitoire**) | `20261108010200` |
| 4 | `0004_money_lookup.sql` | `20261108010300` |
| 5 | `0005_reprise_navigateur.sql` | `20261108010400` |
| 6 | `infra/visibility/migrations/0001` à `0004` | `20261108010500` à `20261108010800` |
| 7 | `0006_visibility_vues.sql` | `20261108010900` |
| 8 | `0007_shyrka.sql` (bloc G) | voir le rapport du mandat v9 |
| 9 | `0008_money_lookup_v2.sql` | `20261108011100` (8 novembre 2026, sauvegarde `~/oia-sauvegardes/avant-0008/`) |
| 10 | `0009_ia_couts.sql` | `20261108011200` (8 novembre 2026, sauvegarde `~/oia-sauvegardes/avant-0009/`) ; alimentée chaque jour par `infra/visibility/scripts/couts-sync.sh` |

## Dépenses d'IA (0009, appliquée)

| Ordre | Fichier | Effet | Prérequis |
| --- | --- | --- | --- |
| 10 | `0009_ia_couts.sql` | Dépenses d'IA d'OIA, vue unique `oia_ia_couts_v1` du contrat de Lovable (`prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md`, `91cecd5`) : coûts estimé, retenu et facturé distincts ; table `oia_ia_cout` alimentée chaque jour depuis le Mac (`infra/visibility/scripts/couts-sync.sh`, tâche de J0) ; money-match et shyrka lus en direct dans le compteur de budget (0007) ; factures relevées par un propriétaire (`oia_ia_relever_facture`, `oia_ia_retirer_facture`), NULL tant qu'elles ne le sont pas, jamais réparties ; `oia_ia_factures_v1`. Membres de l'espace seulement | 0008 appliquée |

Tests : `test/ia-couts.test.ts` (séquence de production puis 0009, tests adverses) et
`infra/visibility/test/couts-sync.test.ts`. Retour arrière : bloc en fin de fichier.

## Contrat Money Lookup version 2 (0008, appliquée)

Contenu de `0008_money_lookup_v2.sql` : contrat Money Lookup **version 2**, d'après les écarts relevés par Lovable (`1e3040c`) et les décisions de Mickaël du 8 novembre : import A4 corrigé (valeurs `null`, conflits au bilan, aperçu et confirmation d'annulation) ; vues `_v2` sur lesquelles se branche le cockpit (COMMENT ignoré, REGULATORY hors de Toutes et des montants, tri sans échéances dépassées, échéance de candidature et la plus tardive, fraîcheur recalculée, Aujourd'hui à 7, 14 et 30 jours) ; seize lectures nouvelles, dont suggestions de projets et « clos depuis la dernière visite », et tables `oia_projet`, `oia_import_element`, `oia_visite` ; `oia_supprimer`, `oia_proposer_projet`, `oia_marquer_visite` ; `oia_basculer_tache` ouverte aux propriétaires. Les vues `_v1` restent servies sans changement.

Projets du registre chargés le 8 novembre 2026 (16, idempotent) ; le
rafraîchissement quotidien (`packages/money-lookup/scripts/rafraichir.sh`)
les recharge après les opportunités (`charger -- --projets`).
Retour arrière : bloc en fin de `0008_money_lookup_v2.sql`. Tests :
`test/money-lookup-v2.test.ts` (séquence de production puis 0008, tests
adverses), `packages/money-lookup/test/reprise.test.ts` (sauvegarde réelle
de la console, à clés `null`) et `packages/money-lookup/test/projets.test.ts`. Parité avec la
console : `docs/interface/parite-console-cockpit.md`.

Données posées après les migrations (pas de structure) :
`../production/a3_membres.sql` (A3).

Archive : `../archive/0001_init.sql`, schéma M0 jamais appliqué.

**Pourquoi pas `supabase db push`.** Le registre des migrations de ce projet
contient environ 150 versions héritées d'un autre produit (décembre 2025 à
juin 2026), absentes du dépôt ; `db push` exigerait de les « réparer » une à
une. Chaque fichier a donc été appliqué par `psql`, **en une transaction**, et
inscrit dans `supabase_migrations.schema_migrations` dans la même transaction
(script local `~/.oia/bin/oia-appliquer`, hors dépôt). Avant l'application
réelle, toute la séquence a été rejouée en production dans une seule
transaction terminée par `rollback` (répétition générale).

## Un seul modèle d'appartenance

Toute la base décide des accès de la même façon : **une ligne d'appartenance
lue avec `auth.uid()`**, jamais un paramètre fourni par l'appelant, jamais un
second système d'identité.

| Portée | Table | Rôles | Fonctions |
| --- | --- | --- | --- |
| Espaces d'OIA (Money Lookup, Shyrka, travail de tri) | `public.oia_membre` | `proprietaire`, `editeur`, `lecteur` | `oia_est_membre`, `oia_role`, `oia_exiger_editeur`, `oia_proprietaire` |
| Clients de Visibility | `vis.client_member` (`user_id` en texte : `auth.uid()::text`) | `owner`, `approver`, `viewer` | `vis.caller_role` |

- Les deux comptes de Mickaël sont `proprietaire` du studio
  (`00000000-0000-4000-8000-000000000001`) et `owner` des clients `oia` et
  `coach-gari`.
- La liste `oia_compte_autorise` de 0002a n'a servi qu'à amorcer
  `oia_membre` (0003) ; 0003a la retire avec sa fonction.
- Les tables `vis` appartiennent à `vis_admin` ; le rôle `postgres` en est
  membre (vis 0004), ce qui lui permet d'appliquer 0006 et d'écrire les
  preuves de la synchronisation.
- Ajouter un compte plus tard : une ligne dans `oia_membre` et, pour
  Visibility, dans `vis.client_member` (rôle d'administration).

## 0003a · transition de la console (à retirer)

La console en ligne écrit encore directement dans les tables. 0003a lui rend
exactement les écritures de 0002a, réservées aux propriétaires du studio,
sous des politiques nommées « transitoire console … ». **À retirer quand
Mickaël aura validé le cockpit Lovable** : le bloc SQL de retrait est en tête
du fichier. Les tables nouvelles (`ml_*`, `oia_*`, `vis*`, `shy_*`) ne
s'écrivent que par fonctions, pour tout le monde.

## Tests

Chaque fichier est testé sur un Postgres jetable :
`pnpm --filter @oia/database test`. `test/production-v9.test.ts` rejoue la
séquence exacte de production, puis les tests adverses du bloc A4.

## Retour arrière

Le plus sûr : restaurer la sauvegarde `~/oia-sauvegardes/avant-v9/oia-complet.dump`
(`pg_restore --clean`), après avoir sauvegardé l'état courant. Sinon, à
l'unité, en ordre inverse, chaque fois dans une transaction, puis
`delete from supabase_migrations.schema_migrations where version = '…'` :

- 0007 : voir l'en-tête de `0007_shyrka.sql`.
- 0006 : `drop view` des vues `vis_*_v1`, `drop function vis_valider_recommandation,
  vis_rejeter_recommandation`, `drop schema vis_ui cascade`, puis
  `alter table vis.client_member disable row level security` et
  `drop policy interface_ses_lignes on vis.client_member`.
- vis 0001 à 0004 : `drop schema vis cascade`, puis `drop role vis_admin`.
- 0005 : `oia_annuler_import` pour un import. Pour la migration elle-même :
  `drop function oia_importer_sauvegarde, oia_annuler_import`, puis
  `drop table oia_import cascade`.
- 0004 : `drop view` des vues `ml_*`, puis `drop table ml_montant, ml_lot`,
  puis `alter table watch_opportunities drop column lot_initial`.
- 0003a : bloc de retrait en tête du fichier (la console perd alors ses
  écritures directes).
- 0003 : recréer les politiques de 0002 (section des politiques de
  `0002_watch_and_workspace.sql`) et rendre les droits d'écriture à
  `authenticated`. Les colonnes `espace_id` restent, avec une valeur par
  défaut. **Déconseillé** : cela rouvre les tables à tout compte connecté.

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

## Contrat Visibility version 2 (0010, appliquée le 2026-11-16)

Mandat v13, bloc F. **Proposée, non appliquée** : à appliquer selon la procédure de
la 0008 (sauvegarde, répétition générale terminée par `rollback`, chaque commande
d'écriture validée par Mickaël).

Les vues `vis_*_v1` (0006) exposent déjà toutes les fenêtres d'un sujet : chacune
porte `window_id`, aucune ne filtre sur J0, `vis_mesure_v1` donne une ligne par
fenêtre. Elles ne sont pas modifiées. Il leur manque la comparaison entre fenêtres
et la fenêtre qui mesure une recommandation exécutée ; 0010 ajoute :

| Objet | Rôle |
| --- | --- |
| `vis_ui.comparaison` | Une ligne par fichier `comparaison-<fenêtre>-<référence>.json` (src/window-compare.ts, format 1), document entier en `jsonb`, colonnes extraites : sujet, fenêtre, référence, verdict du total non marqué, nombres de preuves et empreintes des deux fenêtres, SHA-256 du fichier. Ajout seul (modification, suppression et `truncate` refusées), identifiant dérivé de l'empreinte : rejouer ne change rien, la plus récente fait foi. Écrite par `tsx src/vis-sync.ts --comparaison <fichier>` |
| `vis_ui.execution_mesure` | `measured_by_window` d'une exécution (`vis.execution`, ajout seul, sans colonne pour elle) : même client, fenêtre du sujet de la recommandation (déclencheur), ajout seul, la plus récente fait foi |
| `vis_mesure_v2` | Colonnes de `vis_mesure_v1`, plus `rang_fenetre`, `fenetre_reference`, `comparaison_id`, `verdict_non_marque` (dernière comparaison) |
| `vis_comparaisons_v2` | Une ligne par comparaison, `derniere`, verdicts non marqué et marqué, provenance, recommandations exécutées (contexte, jamais cause), document |
| `vis_comparaison_moteurs_v2` | Par comparaison, famille (non marquée, marquée) et moteur (`tous` pour le total) : moyenne et intervalle à 95 % de chaque fenêtre, jours, verdict, fragilité, versions, réponses non mesurées. Rien n'est recalculé en SQL |
| `vis_recommandations_v2` | Colonnes de `vis_recommandations_v1`, plus `mesuree_par_fenetre`, `mesure_declaree_le` |

Vues `security_invoker`, lecture aux seuls `authenticated` (membres du client par la
RLS), insertion au service. La synchronisation des preuves (`vis-sync.sh`) n'écrit
rien dans ces tables : elle fonctionne avant comme après 0010.
Tests : `test/vis-sync-v2.test.ts` (Postgres jetable : J0 puis une J1 fictive, 0010
par-dessus, tests adverses). Retour arrière : bloc en fin de fichier.

## Contrat Visibility version 2 : pilotage depuis le cockpit (vis 0006_pilotage et 0011, appliquées le 2026-11-16)

Mandat v16, bloc A. **Proposées, non appliquées** : à appliquer selon la procédure de
la 0008 (sauvegarde, répétition générale terminée par `rollback`, chaque commande
d'écriture validée par Mickaël). Contrat : `docs/interface/contrat-donnees-visibility-v2.md`.

| Ordre | Fichier | Version proposée | Prérequis |
| --- | --- | --- | --- |
| après vis 0005 (`20261116140000`) | `0010_visibility_vues_v2.sql`, si elle n'est pas déjà appliquée | `20261116150000` | 0006 appliquée |
| suivante | `infra/visibility/migrations/0006_pilotage.sql` | `20261116150100` | vis 0001 à 0005, 0006, 0010 |
| suivante | `0011_visibility_pilotage.sql` | `20261116150200` | vis 0006_pilotage |

| Objet | Rôle |
| --- | --- |
| vis 0006_pilotage | Tables en ajout seul du schéma `vis` : `geste` (journal des gestes), `demande` et `demande_etat` (file du moteur : `QUEUED`, `RUNNING` avec tentative et hôte, `DONE`, `FAILED`, `CANCELLED`), `proposition` (versionnée), `proposition_decision`, `panel`, `fenetre`, `fenetre_estimation`, `fenetre_statut`, `fenetre_go`, `fenetre_jour`, `plafond` (client, ou global si `client_id` est nul), `alerte`, `alerte_acquit`, `moteur_signe`, `page`, `page_validation`. RLS : lecture par les membres du client ; aucune écriture accordée, ni à `authenticated` ni à `service_role`. `vis.window.kind` accepte `reconnaissance` ; `vis.execution.kind` accepte `url` et `other` |
| 0011 | Vues `vis_portefeuille_v2`, `vis_demandes_v2`, `vis_propositions_v2`, `vis_fenetres_v2`, `vis_budget_v2`, `vis_alertes_v2`, `vis_moteur_v2`, `vis_pages_client_v2` ; 14 fonctions de geste (`authenticated`) ; 13 fonctions du moteur `vis_moteur_*` (`service_role`), dont la reprise en base des demandes `RUNNING` depuis plus de 30 minutes |

Tests : `test/visibility-pilotage.test.ts` (Postgres jetable : parcours complet d'un site
fictif, refus du contrat par rôle et par étape, RLS entre clients, prise unique par trois
moteurs en concurrence, reprise après 30 minutes, colonnes des vues identiques au contrat,
vues v1 et de 0010 inchangées, démonstration figée, retour arrière). Démonstration :
`demo/visibility-v2-demo.sql`, `docs/interface/demo/visibility-v2-demo.json`.

Retour arrière : le bloc en tête de `0011_visibility_pilotage.sql`, puis celui de
`0006_pilotage.sql` (il supprime le contenu des tables : l'exporter d'abord), chacun dans
une transaction, puis `delete from supabase_migrations.schema_migrations where version = '…'`.

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

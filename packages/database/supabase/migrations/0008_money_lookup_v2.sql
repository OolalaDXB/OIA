-- 0008 · Money Lookup, contrat version 2 : les vues de lecture qui manquent
-- pour que le cockpit Lovable remplace entièrement la console.
-- Contrat : docs/interface/contrat-donnees-money-lookup.md (version 2).
--
-- Fichier seulement : Mickaël l'applique, après 0007, dans une transaction.
--
-- Ajoute :
--   * oia_projet : les projets du registre (registry/projects/*.yaml), copiés
--     par le chargeur (`charger -- --projets`), jamais écrits par le
--     navigateur ; le registre reste la référence ;
--   * quatorze vues `_v1`, en security_invoker, lisibles par les membres de
--     l'espace seulement : projets, contacts, notes, tâches, vues
--     enregistrées, demandes, brouillons de projet, contrôle des liens,
--     imports, rattachement aux projets, indicateurs (trois vues), historique
--     des avis humains.
--
-- Ne change aucune vue ni aucune fonction existante. Rejouable.
--
-- Retour arrière :
--   begin;
--   drop view if exists public.ml_avis_v1, public.ml_indicateurs_repartition_v1, public.ml_indicateurs_montants_v1,
--     public.ml_indicateurs_v1, public.ml_rattachement_v1, public.ml_imports_v1, public.ml_liens_v1,
--     public.ml_brouillons_projet_v1, public.ml_demandes_v1, public.ml_vues_enregistrees_v1,
--     public.ml_taches_v1, public.ml_notes_v1, public.ml_contacts_v1, public.ml_projets_v1;
--   drop table if exists public.oia_projet;
--   delete from supabase_migrations.schema_migrations where version = '<version inscrite>';
--   commit;

begin;

-- 1. Projets du registre ------------------------------------------------------------
create table if not exists public.oia_projet (
  espace_id          uuid not null default '00000000-0000-4000-8000-000000000001' references public.oia_espace (id),
  slug               text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  nom                text not null check (char_length(nom) between 1 and 200),
  type               text not null,
  statut             text not null,
  actif              boolean not null,
  une_ligne          text not null default '',
  url                text,
  secteurs           text[] not null default '{}',
  geographies        text[] not null default '{}',
  types_financement  text[] not null default '{}',
  natures_suivies    text[] not null default '{}',
  decouverte_active  boolean not null default false,
  mots_cles          text[] not null default '{}',
  exclusions         text[] not null default '{}',
  -- Entrée complète du registre (entités, découverte, revue du profil…) et sources prévues pour le projet.
  profil             jsonb not null default '{}'::jsonb,
  sources            jsonb not null default '[]'::jsonb,
  revue_profil       text not null check (revue_profil in ('DRAFT', 'CONFIRMED_BY_OWNER')),
  empreinte          text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  charge_le          timestamptz not null default now(),
  -- Un projet sorti du registre n'est pas supprimé (des étiquettes peuvent le viser) : il est marqué.
  retire_du_registre_le timestamptz,
  primary key (espace_id, slug)
);
alter table public.oia_projet enable row level security;
drop policy if exists membres_lisent on public.oia_projet;
create policy membres_lisent on public.oia_projet for select to authenticated using (public.oia_est_membre(espace_id));
revoke all on public.oia_projet from public, anon, authenticated;
revoke insert, update, delete, truncate on public.oia_projet from authenticated;
grant select on public.oia_projet to authenticated;

-- 2. Vues ---------------------------------------------------------------------------

-- Projets, pour l'étiquetage et la page Projets : registre, plus le travail rattaché.
create or replace view public.ml_projets_v1 with (security_invoker = true) as
select p.espace_id, p.slug, p.nom, p.type, p.statut, p.actif, p.une_ligne, p.url,
       p.secteurs, p.geographies, p.types_financement, p.natures_suivies, p.decouverte_active, p.revue_profil,
       p.mots_cles, p.exclusions, p.profil, p.sources,
       (select count(*) from public.project_tags t where t.espace_id = p.espace_id and t.project_slug = p.slug) as opportunites_etiquetees,
       (select count(*) from public.tasks k where k.espace_id = p.espace_id and k.project_slug = p.slug and k.status = 'OPEN') as taches_ouvertes,
       (select count(*) from public.notes n where n.espace_id = p.espace_id and n.project_slug = p.slug) as notes,
       p.charge_le, p.retire_du_registre_le
from public.oia_projet p;

create or replace view public.ml_contacts_v1 with (security_invoker = true) as
select c.id, c.espace_id, c.name as nom, c.organisation, c.role, c.email, c.phone as telephone, c.note,
       c.record_id, c.project_slug as projet, c.at as cree_le, c.actor as auteur, c.import_id
from public.contacts c;

create or replace view public.ml_notes_v1 with (security_invoker = true) as
select n.id, n.espace_id, n.text as texte, n.record_id, n.project_slug as projet, n.at as cree_le, n.actor as auteur, n.import_id
from public.notes n;

create or replace view public.ml_taches_v1 with (security_invoker = true) as
select k.id, k.espace_id, k.title as titre, k.due as echeance, k.status as statut, k.completed_at as faite_le,
       (k.status = 'OPEN' and k.due is not null and k.due < current_date) as en_retard,
       k.record_id, k.project_slug as projet, k.at as cree_le, k.actor as auteur, k.import_id
from public.tasks k;

create or replace view public.ml_vues_enregistrees_v1 with (security_invoker = true) as
select v.id, v.espace_id, v.name as nom, v.kind as type, v.filters as filtres, v.sort_field as tri, v.sort_direction as sens, v.created_at as cree_le
from public.saved_views v;

create or replace view public.ml_demandes_v1 with (security_invoker = true) as
select r.id, r.espace_id, r.kind::text as type, r.payload as charge, r.status::text as statut, r.requested_at as demande_le,
       r.requested_by as demande_par, r.started_at as commencee_le, r.finished_at as terminee_le, r.result as resultat, r.error as erreur
from public.requests r;

create or replace view public.ml_brouillons_projet_v1 with (security_invoker = true) as
select d.slug, d.espace_id, d.entry as contenu, d.status as statut, d.created_at as cree_le, d.created_by as cree_par,
       d.applied_at as applique_le, d.applied_commit as commit_applique, d.error as erreur
from public.project_drafts d;

-- Contrôle des liens : une adresse sans ligne n'a jamais été vérifiée (« non vérifié », pas « valide »).
create or replace view public.ml_liens_v1 with (security_invoker = true) as
select l.url, l.espace_id, l.status as statut, l.http_code as code_http, l.final_url as url_finale, l.checked_at as verifie_le,
       l.note, l.where_found as trouve_dans
from public.link_checks l;

create or replace view public.ml_imports_v1 with (security_invoker = true) as
select i.id, i.espace_id, i.user_id as importe_par, i.exporte_le, i.importe_le, i.bilan, i.annule_le, (i.annule_le is null) as actif
from public.oia_import i;

-- Rattachement d'une opportunité aux projets, règle de la console (page « money ») :
-- l'étiquette posée par un humain ; sinon chaque projet connu du registre dont la
-- requête de découverte l'a trouvée ; sinon aucun projet (`projet` null, « non triée »).
-- Une opportunité non étiquetée peut donc compter pour plusieurs projets.
create or replace view public.ml_rattachement_v1 with (security_invoker = true) as
select v.id, v.espace_id, r.projet, r.rattachement
from public.ml_toutes_v1 v
cross join lateral (
  select v.projet_etiquete as projet, 'etiquette'::text as rattachement where v.projet_etiquete is not null
  union all
  select d.slug, 'decouverte' from unnest(v.projets_decouverte) as d(slug)
  where v.projet_etiquete is null and exists (select 1 from public.oia_projet p where p.espace_id = v.espace_id and p.slug = d.slug)
  union all
  select null, 'aucun' where v.projet_etiquete is null
    and not exists (select 1 from unnest(v.projets_decouverte) as d(slug) join public.oia_projet p on p.espace_id = v.espace_id and p.slug = d.slug)
) r;

-- Indicateurs de la page « metrics » (aujourd'hui fusionnée dans « money »), 1/3 :
-- comptes par espace et par projet. Aucune somme ici. « Expirée » : échéance passée,
-- comme la console le recalcule à la lecture ; une opportunité expirée n'est jamais
-- comptée comme prête.
create or replace view public.ml_indicateurs_v1 with (security_invoker = true) as
select v.espace_id,
       r.projet,
       count(*)                                                        as opportunites,
       count(*) filter (where r.rattachement = 'etiquette')            as etiquetees,
       count(*) filter (where v.disparu_le is null)                    as actives,
       count(*) filter (where v.decision_humaine = 'PENDING' and v.disparu_le is null) as a_trier,
       count(*) filter (where v.decision_humaine = 'APPROVE')          as approuvees,
       count(*) filter (where v.decision_humaine = 'REJECT')           as rejetees,
       count(*) filter (where v.decision_humaine = 'NEEDS_VERIFICATION') as a_verifier,
       count(*) filter (where v.decision_humaine = 'APPROVE' and not v.gate_ok) as approuvees_bloquees,
       count(*) filter (where v.gate_ok and (v.echeance is null or v.echeance >= now()) and v.sens = 'entrant') as pretes,
       count(*) filter (where v.verifie_par_humain)                    as verifiees,
       count(*) filter (where v.montant_connu)                         as avec_montant,
       count(*) filter (where not v.montant_connu)                     as sans_montant,
       count(*) filter (where v.confiance_montant = 'BASSE')           as montants_peu_surs,
       count(*) filter (where v.sens = 'sortant')                      as sortantes,
       count(*) filter (where v.echeance between now() and now() + interval '14 days') as closes_sous_14_jours,
       count(*) filter (where v.echeance < now())                      as expirees,
       count(*) filter (where v.echeance is null)                      as sans_echeance,
       max(v.vu_la_derniere_fois)                                      as derniere_veille
from public.ml_toutes_v1 v
join public.ml_rattachement_v1 r on r.id = v.id
group by v.espace_id, r.projet;

-- Indicateurs 2/3 : montants par projet, jamais mélangés. Une ligne par projet,
-- catégorie, sens, devise et état de vérification ; les montants inconnus forment
-- des lignes à part (devise et somme null), comme ml_montants_v1.
create or replace view public.ml_indicateurs_montants_v1 with (security_invoker = true) as
select v.espace_id, r.projet, v.categorie, v.sens, v.devise, v.verifie_par_humain,
       count(*)                                            as opportunites,
       count(*) filter (where v.gate_ok and (v.echeance is null or v.echeance >= now())) as pretes,
       count(*) filter (where v.echeance between now() and now() + interval '14 days') as closes_sous_14_jours,
       sum(v.montant)                                      as somme_connue,
       sum(v.montant) filter (where v.gate_ok and (v.echeance is null or v.echeance >= now())) as somme_pretes,
       count(*) filter (where v.confiance_montant = 'BASSE') as montants_peu_surs
from public.ml_toutes_v1 v
join public.ml_rattachement_v1 r on r.id = v.id
where v.montant is not null
group by v.espace_id, r.projet, v.categorie, v.sens, v.devise, v.verifie_par_humain
union all
select v.espace_id, r.projet, v.categorie, v.sens, null, v.verifie_par_humain,
       count(*), count(*) filter (where v.gate_ok and (v.echeance is null or v.echeance >= now())),
       count(*) filter (where v.echeance between now() and now() + interval '14 days'),
       null, null, 0
from public.ml_toutes_v1 v
join public.ml_rattachement_v1 r on r.id = v.id
where v.montant is null
group by v.espace_id, r.projet, v.categorie, v.sens, v.verifie_par_humain;

-- Indicateurs 3/3 : répartitions par axe (nature, raison de blocage, recommandation,
-- vérification, décision humaine), par projet et pour l'espace entier (`projet` null
-- et `portee` = 'espace').
create or replace view public.ml_indicateurs_repartition_v1 with (security_invoker = true) as
with axes as (
  select v.id, v.espace_id, x.axe, x.valeur
  from public.ml_toutes_v1 v
  cross join lateral (
    select 'nature'::text as axe, v.nature as valeur
    union all select 'recommandation', v.recommandation
    union all select 'verification', v.statut_verification
    union all select 'decision', v.decision_humaine
    union all select 'blocage', b from unnest(coalesce(v.raisons_gate, '{}')) as b
  ) x
)
select a.espace_id, 'espace'::text as portee, null::text as projet, a.axe, a.valeur, count(*) as opportunites
from axes a group by a.espace_id, a.axe, a.valeur
union all
select a.espace_id, 'projet', r.projet, a.axe, a.valeur, count(*)
from axes a join public.ml_rattachement_v1 r on r.id = a.id
group by a.espace_id, r.projet, a.axe, a.valeur;

-- Historique complet des avis humains (journal d'audit de la console, export compris).
create or replace view public.ml_avis_v1 with (security_invoker = true) as
select r.id, r.espace_id, r.record_id, r.action, r.comment as commentaire, r.at as le, r.actor as auteur,
       r.gate_pursue_eligible_at_decision as gate_ok_au_moment, r.import_id
from public.reviews r;

do $$
declare
  v text;
begin
  foreach v in array array['ml_projets_v1', 'ml_contacts_v1', 'ml_notes_v1', 'ml_taches_v1', 'ml_vues_enregistrees_v1', 'ml_demandes_v1',
                           'ml_brouillons_projet_v1', 'ml_liens_v1', 'ml_imports_v1', 'ml_rattachement_v1', 'ml_indicateurs_v1',
                           'ml_indicateurs_montants_v1', 'ml_indicateurs_repartition_v1', 'ml_avis_v1'] loop
    -- Supabase accorde par défaut tous les droits sur les nouvelles vues : on les retire tous,
    -- y compris à authenticated, puis on ne rend que la lecture (aucune écriture par une vue).
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
    execute format('comment on view public.%I is %L', v, 'Contrat de données Money Lookup, version 2 (docs/interface/contrat-donnees-money-lookup.md). security_invoker : droits de l''appelant.');
  end loop;
end $$;

commit;

-- 0004 · Money Lookup : typologie financière, montants, vues par écran
-- Mandat v8, bloc A2, exigences 4, 6 et 8. Contrat : docs/interface/contrat-donnees-money-lookup.md.
-- Prérequis : 0003_membres_et_politiques.sql.
--
-- Règles :
--   * chaque opportunité porte une catégorie financière parmi six : subvention,
--     chiffre d'affaires contractuel potentiel, investissement en capital,
--     prêt, aide fiscale, montant inconnu ;
--   * un montant inconnu reste inconnu (NULL), jamais zéro ;
--   * aucun total global : les totaux se lisent par catégorie, sens, devise et
--     état de vérification, et ne mélangent jamais deux catégories ;
--   * toutes les vues sont en security_invoker : elles respectent les droits
--     de l'appelant (politiques de 0003).

begin;

do $$ begin
  create type public.ml_categorie as enum
    ('subvention', 'chiffre_affaires_contractuel_potentiel', 'investissement_capital', 'pret', 'aide_fiscale', 'montant_inconnu');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.ml_sens as enum ('entrant', 'sortant');
exception when duplicate_object then null; end $$;

-- Nature normalisée (taxonomie de packages/ingestion/src/opportunity-kinds.ts, valeurs historiques comprises).
create or replace function public.ml_nature(p_kind text) returns text
language sql immutable as $$
  select case
    when p_kind is null or p_kind = '' then 'GRANT'
    when p_kind = 'TENDER_RFP' then 'TENDER'
    when p_kind = 'VC_INVESTOR' then 'EQUITY'
    when p_kind in ('TENDER', 'PRE_SOLICITATION', 'GRANT', 'TAX_INCENTIVE', 'EQUITY', 'DEBT_GUARANTEE', 'PRIZE',
                    'CONSORTIUM_CALL', 'MARKETPLACE_PROJECT', 'ACQUISITION', 'REGULATORY') then p_kind
    else 'GRANT'
  end
$$;

-- Catégorie financière par nature. Sans montant lisible, la catégorie reste celle
-- de la nature ; « montant_inconnu » désigne les natures sans flux d'argent défini.
create or replace function public.ml_categorie_de(p_nature text) returns public.ml_categorie
language sql immutable as $$
  select (case p_nature
    when 'GRANT' then 'subvention'
    when 'PRIZE' then 'subvention'
    when 'TENDER' then 'chiffre_affaires_contractuel_potentiel'
    when 'PRE_SOLICITATION' then 'chiffre_affaires_contractuel_potentiel'
    when 'MARKETPLACE_PROJECT' then 'chiffre_affaires_contractuel_potentiel'
    when 'EQUITY' then 'investissement_capital'
    when 'ACQUISITION' then 'investissement_capital'
    when 'DEBT_GUARANTEE' then 'pret'
    when 'TAX_INCENTIVE' then 'aide_fiscale'
    else 'montant_inconnu'
  end)::public.ml_categorie
$$;

-- L'acquisition est de l'argent qui sort ; tout le reste entre ou n'est pas un flux.
create or replace function public.ml_sens_de(p_nature text) returns public.ml_sens
language sql immutable as $$
  select (case when p_nature = 'ACQUISITION' then 'sortant' else 'entrant' end)::public.ml_sens
$$;

-- Lots de chargement (A3) : traçabilité et retour arrière.
create table if not exists public.ml_lot (
  id         uuid primary key,
  espace_id  uuid not null references public.oia_espace (id),
  source     text not null,
  empreinte  text not null,
  charge_le  timestamptz not null default now(),
  annule_le  timestamptz
);
alter table public.watch_opportunities add column if not exists lot_initial uuid references public.ml_lot (id);

-- Montant lu dans l'opportunité, par le chargeur (lecture prudente de packages/workspace/src/finance.ts).
create table if not exists public.ml_montant (
  opportunity_id uuid primary key references public.watch_opportunities (id) on delete cascade,
  espace_id      uuid not null references public.oia_espace (id),
  valeur         numeric check (valeur is null or valeur > 0),
  devise         text check (devise is null or devise ~ '^[A-Z]{3}$'),
  confiance      text check (confiance is null or confiance in ('HAUTE', 'BASSE')),
  source         text,
  lot_id         uuid references public.ml_lot (id),
  constraint ml_montant_devise_requise check ((valeur is null) = (devise is null))
);

alter table public.ml_lot enable row level security;
alter table public.ml_montant enable row level security;
drop policy if exists membres_lisent on public.ml_lot;
create policy membres_lisent on public.ml_lot for select to authenticated using (public.oia_est_membre(espace_id));
drop policy if exists membres_lisent on public.ml_montant;
create policy membres_lisent on public.ml_montant for select to authenticated using (public.oia_est_membre(espace_id));
revoke all on public.ml_lot, public.ml_montant from anon;
revoke insert, update, delete, truncate on public.ml_lot, public.ml_montant from authenticated;

-- Dernière décision humaine par opportunité et par espace.
create or replace view public.ml_decision_v1 with (security_invoker = true) as
select distinct on (r.espace_id, r.record_id)
  r.espace_id, r.record_id, r.action as decision, r.at as decide_le, r.actor as decide_par
from public.reviews r
order by r.espace_id, r.record_id, r.at desc;

-- « Toutes » : une ligne par opportunité, avec sa typologie financière.
create or replace view public.ml_toutes_v1 with (security_invoker = true) as
select
  o.id,
  o.espace_id,
  o.record_id,
  o.title                                   as titre,
  o.issuer                                  as emetteur,
  public.ml_nature(o.opportunity_kind)      as nature,
  public.ml_categorie_de(public.ml_nature(o.opportunity_kind)) as categorie,
  public.ml_sens_de(public.ml_nature(o.opportunity_kind))      as sens,
  m.valeur                                  as montant,
  m.devise,
  m.confiance                               as confiance_montant,
  (m.valeur is not null)                    as montant_connu,
  o.deadline_at                             as echeance,
  o.recommendation                          as recommandation,
  o.verification_status                     as statut_verification,
  -- « vérifié » seulement après une décision humaine d'approbation (règle A1).
  coalesce(o.verification_status = 'VERIFIED' and d.decision = 'APPROVE', false) as verifie_par_humain,
  o.gate_pursue_eligible                    as gate_ok,
  o.gate_failed_reasons                     as raisons_gate,
  coalesce(d.decision, 'PENDING')           as decision_humaine,
  d.decide_le,
  t.project_slug                            as projet_etiquete,
  o.discovered_for                          as projets_decouverte,
  o.official_url                            as url_officielle,
  o.first_seen_at                           as vu_la_premiere_fois,
  o.last_seen_at                            as vu_la_derniere_fois,
  o.disappeared_at                          as disparu_le
from public.watch_opportunities o
left join public.ml_montant m on m.opportunity_id = o.id
left join public.ml_decision_v1 d on d.espace_id = o.espace_id and d.record_id = o.record_id
left join public.project_tags t on t.espace_id = o.espace_id and t.record_id = o.record_id;

create or replace view public.ml_financements_v1 with (security_invoker = true) as
  select * from public.ml_toutes_v1 where nature in ('GRANT', 'PRIZE', 'TAX_INCENTIVE', 'DEBT_GUARANTEE');
create or replace view public.ml_appels_offres_v1 with (security_invoker = true) as
  select * from public.ml_toutes_v1 where nature in ('TENDER', 'PRE_SOLICITATION', 'MARKETPLACE_PROJECT', 'CONSORTIUM_CALL');
create or replace view public.ml_investisseurs_v1 with (security_invoker = true) as
  select * from public.ml_toutes_v1 where nature in ('EQUITY', 'ACQUISITION');

-- « Signals » : alertes de la veille et signaux réglementaires.
create or replace view public.ml_signals_v1 with (security_invoker = true) as
select a.id, a.espace_id, 'alerte'::text as type, a.kind::text as nature_signal, a.headline as titre, a.detail, a.next_action as action_suivante,
       a.severity as gravite, a.created_at as le, a.acknowledged_at as acquitte_le, o.record_id, a.project_slug as projet
from public.alerts a left join public.watch_opportunities o on o.id = a.opportunity_id
union all
select o.id, o.espace_id, 'reglementaire', 'REGULATORY', o.title, '', '', 5, o.first_seen_at, null, o.record_id, null
from public.watch_opportunities o where public.ml_nature(o.opportunity_kind) = 'REGULATORY';

-- « Aujourd'hui » : ce qui demande une attention, avec la raison.
create or replace view public.ml_aujourdhui_v1 with (security_invoker = true) as
select t.espace_id, case when t.due < current_date then 'TACHE_EN_RETARD' else 'TACHE_A_FAIRE' end as raison,
       t.title as titre, t.record_id, t.project_slug as projet, t.due::timestamptz as echeance, t.id::text as reference
from public.tasks t where t.status = 'OPEN' and t.due is not null and t.due <= current_date + 7
union all
select a.espace_id, 'ALERTE', a.headline, null, a.project_slug, null, a.id::text
from public.alerts a where a.acknowledged_at is null
union all
select v.espace_id, 'BIENTOT_CLOS', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v1 v where v.echeance between now() and now() + interval '14 days' and v.decision_humaine <> 'REJECT'
union all
select v.espace_id, 'APPROUVE_MAIS_BLOQUE', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v1 v where v.decision_humaine = 'APPROVE' and not v.gate_ok
union all
select v.espace_id, 'EN_ATTENTE_DE_TRI', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v1 v where v.decision_humaine = 'PENDING' and v.disparu_le is null;

-- « Montants » : jamais un total global. Une ligne par catégorie, sens, devise et vérification.
create or replace view public.ml_montants_v1 with (security_invoker = true) as
select espace_id, categorie, sens, devise, verifie_par_humain,
       count(*)                       as opportunites,
       count(montant)                 as avec_montant,
       sum(montant)                   as somme_connue,
       count(*) filter (where confiance_montant = 'BASSE') as montants_peu_surs
from public.ml_toutes_v1
where montant is not null
group by espace_id, categorie, sens, devise, verifie_par_humain
union all
-- Les montants inconnus sont comptés à part, sans somme.
select espace_id, categorie, sens, null, verifie_par_humain, count(*), 0, null, 0
from public.ml_toutes_v1
where montant is null
group by espace_id, categorie, sens, verifie_par_humain;

-- Fiche d'une opportunité : la ligne, son contenu source et la couche humaine.
create or replace view public.ml_fiche_v1 with (security_invoker = true) as
select v.*,
       o.payload as source,
       (select coalesce(jsonb_agg(jsonb_build_object('action', r.action, 'commentaire', r.comment, 'le', r.at, 'par', r.actor) order by r.at desc), '[]'::jsonb)
          from public.reviews r where r.espace_id = v.espace_id and r.record_id = v.record_id) as decisions,
       (select coalesce(jsonb_agg(jsonb_build_object('texte', n.text, 'le', n.at, 'par', n.actor) order by n.at desc), '[]'::jsonb)
          from public.notes n where n.espace_id = v.espace_id and n.record_id = v.record_id) as notes,
       (select coalesce(jsonb_agg(jsonb_build_object('titre', k.title, 'echeance', k.due, 'statut', k.status) order by k.due nulls last), '[]'::jsonb)
          from public.tasks k where k.espace_id = v.espace_id and k.record_id = v.record_id) as taches
from public.ml_toutes_v1 v
join public.watch_opportunities o on o.id = v.id;

do $$
declare
  v text;
begin
  foreach v in array array['ml_decision_v1', 'ml_toutes_v1', 'ml_financements_v1', 'ml_appels_offres_v1', 'ml_investisseurs_v1',
                           'ml_signals_v1', 'ml_aujourdhui_v1', 'ml_montants_v1', 'ml_fiche_v1'] loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select on public.%I to authenticated', v);
    execute format('comment on view public.%I is %L', v, 'Contrat de données Money Lookup, version 1 (docs/interface/contrat-donnees-money-lookup.md). security_invoker : droits de l''appelant.');
  end loop;
end $$;

commit;

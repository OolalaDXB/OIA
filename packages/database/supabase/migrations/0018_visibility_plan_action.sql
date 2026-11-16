-- 0018 · Visibility : plan d'action unique, avec l'origine ; rapports externes en texte libre pour
-- enrichir le contexte, et extraction de leur plan d'action ; demandes remplacées par une relance.
--
-- Un seul endroit pour savoir quoi faire : les recommandations (mesure J0, audit IA express, audits
-- et rapports externes, humain) et les constats ouverts (Lighthouse, lecture du site, note du
-- contenu), chacun avec son origine, sa priorité, son horizon, quoi faire et pourquoi.
--
-- Rapports externes : n'importe quel rapport (Markdown ou texte, extrait d'un PDF par le cockpit)
-- s'importe comme audit externe sans matrice. Il sert de contexte à l'audit IA express (plan
-- d'action) et peut être transformé en actions (demande EXTRAIRE_PLAN : un appel Mistral, coût
-- affiché, sous les plafonds).
--
-- Retour arrière : drop view public.vis_plan_action_v3 ; drop function
--   public.vis_importer_rapport_externe(text, text, date, text, text), public.vis_extraire_plan(uuid, numeric),
--   public.vis_moteur_plan_debut(uuid), public.vis_moteur_contexte(text) ; drop table vis.extraction_plan ;
--   contrainte demande_type_check sans EXTRAIRE_PLAN ; vis_demandes_v2 sans remplacee_par.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA','NOTE_CONTENU','EXTRAIRE_PLAN'));

-- Demandes : une demande en échec relancée depuis n'a plus de bouton « Relancer ».
create or replace view public.vis_demandes_v2 with (security_invoker = true) as
select d.id, d.client_id, d.subject_id, d.type, d.charge, d.statut, d.demande_le, d.demande_par, d.commencee_le, d.terminee_le,
       d.resultat, d.erreur, d.tentatives,
       (select r.id from vis.demande r where r.relance_de = d.id order by r.demande_le desc limit 1) as remplacee_par
from vis_ui.demande_courante d;

-- Origine lisible d'une recommandation, d'après son auteur.
create or replace function vis_ui.origine_reco(p_cree_par text)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_cree_par like 'audit-ia-express:%' then jsonb_build_object('type', 'audit_ia', 'libelle', 'Audit IA express', 'date', split_part(p_cree_par, ':', 2))
    when p_cree_par like 'audit-externe:%' then jsonb_build_object('type', 'audit_externe',
         'libelle', 'Audit externe · ' || initcap(replace(split_part(p_cree_par, ':', 2), '-', ' ')), 'date', split_part(p_cree_par, ':', 3))
    when p_cree_par like 'rapport-externe:%' then jsonb_build_object('type', 'rapport_externe',
         'libelle', 'Rapport externe · ' || initcap(replace(split_part(p_cree_par, ':', 2), '-', ' ')), 'date', split_part(p_cree_par, ':', 3))
    when p_cree_par like 'oia-visibility/%' or p_cree_par = 'moteur' then jsonb_build_object('type', 'mesure', 'libelle', 'Mesure OIA (J0)', 'date', null)
    else jsonb_build_object('type', 'humain', 'libelle', coalesce(p_cree_par, 'Équipe'), 'date', null)
  end
$$;

-- Plan d'action unique.
create or replace view public.vis_plan_action_v3 with (security_invoker = true) as
with recos as (
  select r.id, r.client_id, r.subject_id, 'recommandation'::text as nature,
         vis_ui.origine_reco(r.cree_par) as origine, r.cree_par as origine_ref,
         upper(coalesce(nullif(rec.payload ->> 'priorite_audit', ''), substring(r.id from '-(p[0-3])(?:-|$)'),
               case when r.impact = 'high' and r.effort in ('XS','S') then 'P0' when r.impact = 'high' then 'P1' when r.impact = 'medium' then 'P2' else 'P3' end)) as priorite,
         r.titre,
         btrim(split_part(r.enonce, ' Pourquoi :', 1)) as quoi_faire,
         nullif(btrim(split_part(r.enonce, ' Pourquoi :', 2)), '') as pourquoi,
         r.type as categorie, r.impact, r.effort, null::text as qui,
         case r.etat when 'pending' then 'a_valider' when 'approved' then 'a_faire' when 'executed' then 'fait' when 'measured' then 'mesure' when 'rejected' then 'refuse' else r.etat end as etat,
         r.cree_le as le, r.window_id as reference
  from public.vis_recommandations_v2 r
  left join vis.recommendation rec on rec.id = r.id
), constats as (
  select c.id::text, c.client_id, c.subject_id, 'constat'::text,
         jsonb_build_object('type', c.source, 'libelle',
           case c.source when 'lighthouse' then 'Analyse Lighthouse' when 'crawl' then 'Lecture du site (Crawlie)' when 'contenu' then 'Note du contenu' else initcap(c.source) end,
           'date', to_char(c.derniere_fois at time zone 'UTC', 'YYYY-MM-DD')),
         c.cle,
         case c.gravite when 'critique' then 'P0' when 'important' then 'P1' else 'P2' end,
         c.titre, c.correction, c.explication, c.categorie, c.impact, c.effort, c.qui,
         'a_faire', c.derniere_fois, c.analyse_id::text
  from public.vis_constats_v3 c
  where c.etat = 'ouvert'
)
select x.*,
       case x.priorite when 'P0' then 'Cette semaine' when 'P1' then 'Sous 2 à 6 semaines' when 'P2' then 'Sous 3 à 10 semaines' else 'Ensuite' end as horizon,
       case x.priorite when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end as ordre
from (select * from recos union all select * from constats) x;
revoke all on public.vis_plan_action_v3 from public, anon, authenticated;
grant select on public.vis_plan_action_v3 to authenticated;

-- Geste : importer un rapport externe en texte (Markdown ; le cockpit extrait le texte d'un PDF).
create or replace function public.vis_importer_rapport_externe(p_subject text, p_outil text, p_realise_le date, p_titre text, p_rapport_md text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_rapport_md, '')) < 200 then raise exception 'rapport trop court (200 caractères au moins)' using errcode = '22023'; end if;
  if char_length(p_rapport_md) > 400000 then raise exception 'rapport trop long (400 000 caractères au plus)' using errcode = '22023'; end if;
  return public.vis_importer_audit_externe(p_subject, p_outil, p_realise_le, coalesce(nullif(btrim(p_titre), ''), 'Rapport externe'),
    '{}'::text[], null, left(regexp_replace(p_rapport_md, '\s+', ' ', 'g'), 600), p_rapport_md, '[]'::jsonb);
end $$;
revoke all on function public.vis_importer_rapport_externe(text, text, date, text, text) from public, anon;
grant execute on function public.vis_importer_rapport_externe(text, text, date, text, text) to authenticated;

-- GO de l'extraction du plan d'un audit ou rapport externe.
create table if not exists vis.extraction_plan (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references vis.client(id) on delete restrict,
  subject_id       text not null references vis.subject(id) on delete restrict,
  audit_externe_id uuid not null references vis.audit_externe(id) on delete restrict,
  cout_max_usd     numeric(10,2) not null,
  cout_vu_usd      numeric(10,2) not null,
  mois             date not null,
  par              text not null,
  le               timestamptz not null default now()
);
create trigger extraction_plan_ajout_seul before update or delete on vis.extraction_plan for each row execute function vis.pilotage_ajout_seul();
create trigger extraction_plan_ajout_seul_truncate before truncate on vis.extraction_plan for each statement execute function vis.pilotage_ajout_seul();
alter table vis.extraction_plan enable row level security;
alter table vis.extraction_plan owner to vis_admin;
revoke all on vis.extraction_plan from public, anon, authenticated, service_role;
grant select on vis.extraction_plan to authenticated;
create policy tenant_isolation_auth on vis.extraction_plan for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = extraction_plan.client_id));

insert into vis.tarif_moteur (moteur, cible, langues, majorant_usd, habituel_usd, source) values
  ('extraction_plan', 'mistral-api:mistral-large-4', null, 0.2500, 0.0300, '2026-11-16 : 1 appel (2 au pire), rapport tronqué à 60 000 caractères');

-- Geste : transformer le plan d'un audit ou rapport externe en actions (coût vu, plafonds).
create or replace function public.vis_extraire_plan(p_audit_externe uuid, p_cout_vu_usd numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a vis.audit_externe;
  uid text;
  maxu numeric;
  pl numeric;
  plg numeric;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
  eid uuid;
begin
  select * into a from vis.audit_externe where id = p_audit_externe;
  if a.id is null then raise exception 'audit externe introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(a.client_id);
  perform pg_advisory_xact_lock(hashtext('vis.go'));
  select e.id into eid from vis.extraction_plan e join vis_ui.demande_courante d on d.type = 'EXTRAIRE_PLAN' and (d.charge ->> 'extraction_id')::uuid = e.id
   where e.audit_externe_id = p_audit_externe and d.statut in ('QUEUED','RUNNING') limit 1;
  if eid is not null then return eid; end if;
  select round(majorant_usd, 2) into maxu from vis.tarif_moteur where moteur = 'extraction_plan' order by id desc limit 1;
  if p_cout_vu_usd is null or round(p_cout_vu_usd, 2) <> maxu then
    raise exception 'estimation changée, recharger (au plus % $)', to_char(maxu, 'FM999990.00') using errcode = '22023';
  end if;
  pl := vis_ui.plafond(a.client_id);
  plg := vis_ui.plafond(null);
  if plg is null or pl is null then raise exception 'extraction refusée : plafonds non fixés' using errcode = '22023'; end if;
  if vis_ui.reel(a.client_id, mois) + vis_ui.engage(a.client_id, mois) + maxu > pl then raise exception 'extraction refusée : plafond du client dépassé' using errcode = '22023'; end if;
  if vis_ui.reel(null, mois) + vis_ui.engage(null, mois) + maxu > plg then raise exception 'extraction refusée : plafond global dépassé' using errcode = '22023'; end if;
  insert into vis.extraction_plan (client_id, subject_id, audit_externe_id, cout_max_usd, cout_vu_usd, mois, par)
    values (a.client_id, a.subject_id, a.id, maxu, round(p_cout_vu_usd, 2), mois, uid) returning id into eid;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (a.client_id, a.subject_id, 'EXTRAIRE_PLAN', jsonb_build_object('extraction_id', eid, 'audit_externe_id', a.id, 'cout_max_usd', maxu), uid);
  perform vis_ui.journaliser('vis_extraire_plan', a.client_id, a.subject_id, jsonb_build_object('p_audit_externe', p_audit_externe, 'p_cout_vu_usd', p_cout_vu_usd), jsonb_build_object('extraction', eid), uid);
  return eid;
end $$;
revoke all on function public.vis_extraire_plan(uuid, numeric) from public, anon;
grant execute on function public.vis_extraire_plan(uuid, numeric) to authenticated;

-- Moteur : rapport à extraire (refusé sans GO).
create or replace function public.vis_moteur_plan_debut(p_demande uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  e vis.extraction_plan;
  a vis.audit_externe;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'EXTRAIRE_PLAN' then raise exception 'demande d''extraction introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  select * into e from vis.extraction_plan where id = (d.charge ->> 'extraction_id')::uuid and subject_id = d.subject_id;
  if e.id is null then raise exception 'extraction refusée : aucun GO enregistré' using errcode = '42501'; end if;
  select * into a from vis.audit_externe where id = e.audit_externe_id;
  return jsonb_build_object('audit_externe_id', a.id, 'outil', a.outil, 'realise_le', a.realise_le, 'methode', a.methode,
    'resume', a.resume, 'rapport_md', left(a.rapport_md, 60000), 'matrice', jsonb_array_length(a.matrice) > 0, 'cout_max_usd', e.cout_max_usd);
end $$;
revoke all on function public.vis_moteur_plan_debut(uuid) from public, anon, authenticated;
grant execute on function public.vis_moteur_plan_debut(uuid) to service_role;

-- Moteur : contexte d'un site pour un plan d'action (constats ouverts, audits et rapports externes,
-- actions déjà proposées), pour ne pas répéter ni contredire ce qui est connu.
create or replace function public.vis_moteur_contexte(p_subject text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform vis_ui.exiger_moteur();
  return jsonb_build_object(
    'constats', coalesce((select jsonb_agg(x.t) from (select c.titre || ' (' || c.gravite || ')' as t from public.vis_constats_v3 c where c.subject_id = p_subject and c.etat = 'ouvert' order by c.ordre limit 25) x), '[]'::jsonb),
    'externes', coalesce((select jsonb_agg(jsonb_build_object('outil', x.outil, 'date', x.realise_le, 'resume', x.resume, 'extrait', left(x.rapport_md, 6000)))
                          from (select * from vis.audit_externe a where a.subject_id = p_subject and a.outil <> 'OIA · Audit IA express' order by a.realise_le desc, a.importe_le desc limit 3) x), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(x.titre) from (select r.titre from public.vis_recommandations_v2 r where r.subject_id = p_subject and r.etat not in ('rejected') order by r.cree_le desc limit 40) x), '[]'::jsonb));
end $$;
revoke all on function public.vis_moteur_contexte(text) from public, anon, authenticated;
grant execute on function public.vis_moteur_contexte(text) to service_role;

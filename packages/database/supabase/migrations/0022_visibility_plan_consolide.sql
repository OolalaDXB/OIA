-- 0022 · Visibility : plan consolidé — croiser, prioriser, préparer.
--
-- Toutes les actions ouvertes d'un site (recommandations de toutes origines, rapports externes
-- compris, et constats) sont croisées par le moteur (Mistral, offre gratuite) :
--   - regroupées quand elles visent le même problème (une action relevée par plusieurs sources pèse plus) ;
--   - priorisées (impact, effort, nombre de sources) ;
--   - préparées : étapes à cocher, critère de réussite vérifiable, et un prompt prêt à coller dans
--     Lovable ou Claude Code pour faire la correction (sans rien inventer : seulement ce que disent
--     les actions et les rapports).
-- Le suivi (vis_suivre_action) reste porté par chaque action d'origine : cocher un groupe coche ses
-- actions. Une consolidation est rejouable : chaque version est gardée (ajout seul).
--
-- Retour arrière : drop view public.vis_plan_consolide_v3 ; drop function public.vis_demander_consolidation(text),
--   public.vis_moteur_plan_entree(text), public.vis_moteur_plan_consolide(uuid, jsonb) ;
--   drop table vis.plan_consolide ; contrainte demande_type_check sans CONSOLIDER_PLAN.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA','NOTE_CONTENU','EXTRAIRE_PLAN','HYGIENE','CONSOLIDER_PLAN'));

create table if not exists vis.plan_consolide (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  demande_id  uuid references vis.demande(id) on delete restrict,
  resume      text not null check (char_length(resume) between 1 and 3000),
  groupes     jsonb not null check (jsonb_typeof(groupes) = 'array'),
  sources     jsonb not null default '[]'::jsonb,
  actions_lues int not null,
  modele      text not null,
  le          timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists plan_consolide_idx on vis.plan_consolide (subject_id, le desc);
create trigger plan_consolide_ajout_seul before update or delete on vis.plan_consolide for each row execute function vis.pilotage_ajout_seul();
create trigger plan_consolide_ajout_seul_truncate before truncate on vis.plan_consolide for each statement execute function vis.pilotage_ajout_seul();
alter table vis.plan_consolide enable row level security;
alter table vis.plan_consolide owner to vis_admin;
revoke all on vis.plan_consolide from public, anon, authenticated, service_role;
grant select on vis.plan_consolide to authenticated;
create policy tenant_isolation_auth on vis.plan_consolide for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = plan_consolide.client_id));

-- Geste : consolider maintenant (gratuit : Mistral sur l'offre gratuite).
create or replace function public.vis_demander_consolidation(p_subject text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  did uuid;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  select d.id into did from vis_ui.demande_courante d where d.subject_id = p_subject and d.type = 'CONSOLIDER_PLAN' and d.statut in ('QUEUED','RUNNING') limit 1;
  if did is not null then return did; end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par) values (cid, p_subject, 'CONSOLIDER_PLAN', '{}'::jsonb, uid) returning id into did;
  perform vis_ui.journaliser('vis_demander_consolidation', cid, p_subject, jsonb_build_object('p_subject', p_subject), jsonb_build_object('demande', did), uid);
  return did;
end $$;
revoke all on function public.vis_demander_consolidation(text) from public, anon;
grant execute on function public.vis_demander_consolidation(text) to authenticated;

-- Moteur : ce qu'il faut croiser (actions ouvertes, rapports externes, dépôt lié, dernier état).
create or replace function public.vis_moteur_plan_entree(p_subject text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform vis_ui.exiger_moteur();
  return jsonb_build_object(
    'site', (select jsonb_build_object('nom', coalesce(su.extra ->> 'displayName', su.id), 'url', st.primary_url, 'langues', su.extra -> 'langues')
             from vis.subject su join vis.subject_site ss on ss.subject_id = su.id join vis.site st on st.id = ss.site_id where su.id = p_subject limit 1),
    'depot', (select d.depot from public.vis_depots_v3 d where d.subject_id = p_subject),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('cle', p.action_cle, 'origine', p.origine ->> 'libelle', 'priorite', p.priorite, 'titre', p.titre,
                          'quoi', left(coalesce(p.quoi_faire, ''), 600), 'pourquoi', left(coalesce(p.pourquoi, ''), 400), 'effort', p.effort, 'qui', p.qui, 'suivi', p.suivi) order by p.ordre)
                         from public.vis_plan_suivi_v3 p where p.subject_id = p_subject and p.suivi not in ('fait','abandonne')), '[]'::jsonb),
    'rapports', coalesce((select jsonb_agg(jsonb_build_object('outil', a.outil, 'date', a.realise_le, 'resume', left(coalesce(a.resume, ''), 800), 'extrait', left(coalesce(a.rapport_md, ''), 5000)))
                          from (select * from vis.audit_externe x where x.subject_id = p_subject order by x.realise_le desc, x.importe_le desc limit 4) a), '[]'::jsonb),
    'etat', (select jsonb_build_object('score_indexation', e.score_indexation, 'google_pages_indexees', e.google_pages_indexees, 'google_pages_inspectees', e.google_pages_inspectees,
                                       'google_impressions_28j', e.google_impressions_28j, 'bing_pages_indexees', e.bing_pages_indexees)
             from public.vis_efficacite_v3 e where e.subject_id = p_subject order by e.recu_le desc limit 1));
end $$;
revoke all on function public.vis_moteur_plan_entree(text) from public, anon, authenticated;
grant execute on function public.vis_moteur_plan_entree(text) to service_role;

create or replace function public.vis_moteur_plan_consolide(p_demande uuid, p_plan jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  pid uuid;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'CONSOLIDER_PLAN' then raise exception 'demande de consolidation introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  insert into vis.plan_consolide (client_id, subject_id, demande_id, resume, groupes, sources, actions_lues, modele)
    values (d.client_id, d.subject_id, d.id, p_plan ->> 'resume', p_plan -> 'groupes', coalesce(p_plan -> 'sources', '[]'::jsonb), (p_plan ->> 'actions_lues')::int, p_plan ->> 'modele')
    returning id into pid;
  return pid;
end $$;
revoke all on function public.vis_moteur_plan_consolide(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.vis_moteur_plan_consolide(uuid, jsonb) to service_role;

-- Dernière consolidation par site, avec le suivi courant de chaque action regroupée.
create or replace view public.vis_plan_consolide_v3 with (security_invoker = true) as
select distinct on (p.subject_id) p.client_id, p.subject_id, p.id as plan_id, p.le, p.resume, p.sources, p.actions_lues, p.modele,
       (select jsonb_agg(g || jsonb_build_object(
          'suivi_actions', (select coalesce(jsonb_agg(jsonb_build_object('cle', s.action_cle, 'suivi', s.suivi, 'verification', s.verification)), '[]'::jsonb)
                            from public.vis_plan_suivi_v3 s where s.subject_id = p.subject_id and s.action_cle in (select jsonb_array_elements_text(g -> 'actions')))))
        from jsonb_array_elements(p.groupes) g) as groupes
from vis.plan_consolide p
order by p.subject_id, p.le desc;
revoke all on public.vis_plan_consolide_v3 from public, anon, authenticated;
grant select on public.vis_plan_consolide_v3 to authenticated;

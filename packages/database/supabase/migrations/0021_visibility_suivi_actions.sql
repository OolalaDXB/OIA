-- 0021 · Visibility : suivi du plan d'action — planifier, cocher, vérifier, évaluer.
--
-- 1. Planifier : chaque action du plan unique (recommandation ou constat) reçoit un responsable et
--    une échéance (par défaut selon la priorité : P0 7 jours, P1 42 jours, P2 70 jours, P3 90 jours).
-- 2. Cocher : planifié → en cours → fait (avec preuve : lien, commit, capture) ou abandonné.
-- 3. Vérifier, sans intervention : quand une action issue d'un constat est cochée « fait », le moteur
--    relance le contrôle gratuit qui l'avait trouvée (hygiène d'indexation ou analyse Lighthouse) ;
--    si le constat n'est plus relevé : « corrigé, vérifié » ; s'il l'est encore : « pas encore corrigé ».
-- 4. Évaluer l'effet : 14 jours au moins après « fait », comparaison avant / après (pages indexées
--    Google, impressions et clics Google et Bing, score d'indexation), tirée de vis_efficacite_v3.
--    Une variation n'est pas une preuve de cause : l'écran le dit.
--
-- Retour arrière : drop view public.vis_plan_suivi_v3 ; drop function public.vis_suivre_action(...) ;
--   drop table vis.action_suivi.

create table if not exists vis.action_suivi (
  id           bigserial primary key,
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  -- « constat:<cle> » ou « recommandation:<id> » : stable d'une analyse à l'autre.
  action_cle   text not null check (action_cle ~ '^(constat|recommandation):.{3,200}$'),
  etat         text not null check (etat in ('planifie','en_cours','fait','abandonne')),
  responsable  text check (responsable is null or char_length(responsable) between 1 and 120),
  echeance     date,
  note         text check (note is null or char_length(note) <= 2000),
  preuve       text check (preuve is null or char_length(preuve) <= 1000),
  par          text not null,
  le           timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists action_suivi_idx on vis.action_suivi (subject_id, action_cle, id desc);
create trigger action_suivi_ajout_seul before update or delete on vis.action_suivi for each row execute function vis.pilotage_ajout_seul();
create trigger action_suivi_ajout_seul_truncate before truncate on vis.action_suivi for each statement execute function vis.pilotage_ajout_seul();
alter table vis.action_suivi enable row level security;
alter table vis.action_suivi owner to vis_admin;
revoke all on vis.action_suivi from public, anon, authenticated, service_role;
grant select on vis.action_suivi to authenticated;
create policy tenant_isolation_auth on vis.action_suivi for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = action_suivi.client_id));

-- Geste : planifier, cocher, abandonner. Une action cochée « fait » relance le contrôle gratuit qui l'avait relevée.
create or replace function public.vis_suivre_action(p_subject text, p_action_cle text, p_etat text,
  p_responsable text default null, p_echeance date default null, p_note text default null, p_preuve text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  nid bigint;
  src text;
  url_ text;
  typ text;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_etat not in ('planifie','en_cours','fait','abandonne') then raise exception 'état refusé' using errcode = '22023'; end if;
  if p_action_cle !~ '^(constat|recommandation):.{3,200}$' then raise exception 'action refusée' using errcode = '22023'; end if;
  if p_preuve is not null and p_preuve ~* '<script|javascript:' then raise exception 'preuve refusée' using errcode = '22023'; end if;
  insert into vis.action_suivi (client_id, subject_id, action_cle, etat, responsable, echeance, note, preuve, par)
    values (cid, p_subject, p_action_cle, p_etat, nullif(btrim(coalesce(p_responsable, '')), ''), p_echeance,
            nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_preuve, '')), ''), uid)
    returning id into nid;
  -- Vérification : contrôle gratuit relancé (hygiène pour l'indexation, analyse pour Lighthouse et la lecture du site).
  if p_etat = 'fait' and p_action_cle like 'constat:%' then
    select c.source into src from vis.constat c where c.subject_id = p_subject and c.cle = substr(p_action_cle, 9) order by c.cree_le desc limit 1;
    typ := case src when 'indexation' then 'HYGIENE' when 'lighthouse' then 'ANALYSE' when 'crawl' then 'ANALYSE' else null end;
    if typ is not null and not exists (select 1 from vis_ui.demande_courante d where d.subject_id = p_subject and d.type = typ and d.statut in ('QUEUED','RUNNING')) then
      select st.primary_url into url_ from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = p_subject order by st.id limit 1;
      if url_ is not null then
        insert into vis.demande (client_id, subject_id, type, charge, demande_par)
          values (cid, p_subject, typ, case typ when 'ANALYSE' then jsonb_build_object('url', url_, 'strategies', jsonb_build_array('mobile','ordinateur')) else jsonb_build_object('url', url_) end,
                  'vérification d''une action cochée « fait »');
      end if;
    end if;
  end if;
  perform vis_ui.journaliser('vis_suivre_action', cid, p_subject,
    jsonb_build_object('p_action_cle', p_action_cle, 'p_etat', p_etat, 'p_echeance', p_echeance), jsonb_build_object('suivi', nid), uid);
  return nid;
end $$;
revoke all on function public.vis_suivre_action(text, text, text, text, date, text, text) from public, anon;
grant execute on function public.vis_suivre_action(text, text, text, text, date, text, text) to authenticated;

-- Plan d'action suivi : l'action, son suivi, sa vérification, son effet.
create or replace view public.vis_plan_suivi_v3 with (security_invoker = true) as
with plan as (
  select p.*, case p.nature when 'constat' then 'constat:' || p.origine_ref else 'recommandation:' || p.id end as action_cle
  from public.vis_plan_action_v3 p
), suivi as (
  select distinct on (s.subject_id, s.action_cle) s.* from vis.action_suivi s order by s.subject_id, s.action_cle, s.id desc
), fait as (
  select s.subject_id, s.action_cle, max(s.le) as fait_le from vis.action_suivi s where s.etat = 'fait' group by 1, 2
), resolus as (
  -- Constats qui ne sont plus relevés : ils sortent du plan (état « resolu ») mais gardent leur suivi.
  select c.client_id, c.subject_id, 'constat'::text as nature, c.cle, c.titre, c.correction, c.explication, c.source, c.gravite, c.categorie, c.effort, c.qui, c.derniere_fois
  from public.vis_constats_v3 c where c.etat = 'resolu'
), lignes as (
  select pl.client_id, pl.subject_id, pl.action_cle, pl.nature, pl.origine, pl.priorite, pl.horizon, pl.ordre, pl.titre, pl.quoi_faire, pl.pourquoi,
         pl.categorie, pl.effort, coalesce(pl.qui, 'equipe') as qui, pl.le as releve_le, true as encore_releve
  from plan pl
  union all
  select r.client_id, r.subject_id, 'constat:' || r.cle, 'constat', jsonb_build_object('type', r.source), case r.gravite when 'critique' then 'P0' when 'important' then 'P1' else 'P2' end,
         null::text, case r.gravite when 'critique' then 0 when 'important' then 1 else 2 end, r.titre, r.correction, r.explication, r.categorie, r.effort, coalesce(r.qui, 'equipe'), r.derniere_fois, false
  from resolus r
  where exists (select 1 from vis.action_suivi s where s.subject_id = r.subject_id and s.action_cle = 'constat:' || r.cle)
)
select l.client_id, l.subject_id, l.action_cle, l.nature, l.origine, l.priorite, l.horizon, l.ordre, l.titre, l.quoi_faire, l.pourquoi, l.categorie, l.effort, l.qui, l.releve_le,
       coalesce(s.etat, 'a_planifier') as suivi,
       s.responsable,
       coalesce(s.echeance, (l.releve_le + case l.priorite when 'P0' then interval '7 days' when 'P1' then interval '42 days' when 'P2' then interval '70 days' else interval '90 days' end)::date) as echeance,
       s.echeance is null as echeance_proposee,
       s.note, s.preuve, f.fait_le,
       (coalesce(s.etat, '') not in ('fait','abandonne') and coalesce(s.echeance, (l.releve_le + case l.priorite when 'P0' then interval '7 days' when 'P1' then interval '42 days' when 'P2' then interval '70 days' else interval '90 days' end)::date) < (now() at time zone 'UTC')::date) as en_retard,
       -- Vérification : pour un constat, le contrôle qui l'avait trouvé l'a-t-il encore relevé après « fait » ?
       case
         when l.nature = 'recommandation' then case when f.fait_le is null then null else 'a_mesurer' end
         when not l.encore_releve then 'corrige_verifie'
         when f.fait_le is null then null
         when l.releve_le > f.fait_le then 'pas_encore_corrige'
         else 'verification_en_attente'
       end as verification,
       case when not l.encore_releve then public.vis_constat_resolu_le(l.subject_id, substr(l.action_cle, 9)) end as verifie_le,
       -- Effet : avant (dernier relevé avant « fait ») et après (dernier relevé, 14 jours au moins après).
       av.jour as avant_le, ap.jour as apres_le,
       case when f.fait_le is null then null when ap.jour is null then 'trop_tot' else 'mesure' end as effet,
       ap.google_pages_indexees - av.google_pages_indexees as delta_google_pages_indexees,
       ap.google_impressions_28j - av.google_impressions_28j as delta_google_impressions,
       ap.google_clics_28j - av.google_clics_28j as delta_google_clics,
       ap.bing_impressions_28j - av.bing_impressions_28j as delta_bing_impressions,
       ap.score_indexation - av.score_indexation as delta_score_indexation
from lignes l
left join suivi s on s.subject_id = l.subject_id and s.action_cle = l.action_cle
left join fait f on f.subject_id = l.subject_id and f.action_cle = l.action_cle
left join lateral (select e.* from public.vis_efficacite_v3 e where e.subject_id = l.subject_id and f.fait_le is not null and e.recu_le <= f.fait_le order by e.recu_le desc limit 1) av on true
left join lateral (select e.* from public.vis_efficacite_v3 e where e.subject_id = l.subject_id and f.fait_le is not null and e.recu_le >= f.fait_le + interval '14 days' order by e.recu_le desc limit 1) ap on true;
revoke all on public.vis_plan_suivi_v3 from public, anon, authenticated;
grant select on public.vis_plan_suivi_v3 to authenticated;

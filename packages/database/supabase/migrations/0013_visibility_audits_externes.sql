-- 0013 · Visibility : audits externes (Perplexity Computer, autres outils), importés en
-- complément des mesures d'OIA, jamais mélangés avec elles.
--
-- Un audit externe garde sa méthode (interfaces grand public ou API, lieu, date, une ou
-- plusieurs passes), sa matrice question × moteur, son score à lui et son rapport en
-- Markdown. Le score d'OIA (vis_score_v3) ne l'intègre pas : méthodes non comparables.
-- Import par le cockpit (vis_importer_audit_externe), ajout seul, RLS par client.
--
-- Retour arrière : drop view public.vis_audit_externe_lignes_v3, public.vis_audits_externes_v3;
--   drop function public.vis_importer_audit_externe(text, text, date, text, text[], numeric, text, text, jsonb);
--   drop table vis.audit_externe;

create table if not exists vis.audit_externe (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  outil        text not null check (char_length(outil) between 2 and 80),
  realise_le   date not null,
  methode      text not null check (char_length(methode) >= 10),
  moteurs      text[] not null check (cardinality(moteurs) between 1 and 12),
  score        numeric check (score is null or (score >= 0 and score <= 100)),
  resume       text,
  rapport_md   text check (rapport_md is null or (char_length(rapport_md) <= 300000 and rapport_md !~* '<script|javascript:')),
  -- [{id, sujet, question, scores: {moteur: 0..3}, concurrents: {moteur: [..]}, domaines: {moteur: [..]}}]
  matrice      jsonb not null default '[]'::jsonb check (jsonb_typeof(matrice) = 'array' and jsonb_array_length(matrice) <= 200),
  importe_par  text not null check (char_length(importe_par) >= 2),
  importe_le   timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists audit_externe_sujet_idx on vis.audit_externe (subject_id, realise_le desc);

create trigger audit_externe_ajout_seul before update or delete on vis.audit_externe for each row execute function vis.pilotage_ajout_seul();
create trigger audit_externe_ajout_seul_truncate before truncate on vis.audit_externe for each statement execute function vis.pilotage_ajout_seul();
alter table vis.audit_externe enable row level security;
create policy tenant_isolation_auth on vis.audit_externe for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis.audit_externe.client_id));
alter table vis.audit_externe owner to vis_admin;
revoke all on vis.audit_externe from public, anon, authenticated, service_role;
grant select on vis.audit_externe to authenticated;

create or replace view public.vis_audits_externes_v3 with (security_invoker = true) as
select a.id, a.client_id, a.subject_id, a.outil, a.realise_le, a.methode, a.moteurs, a.score, a.resume, a.rapport_md,
       jsonb_array_length(a.matrice) as questions, a.importe_par, a.importe_le,
       a.id = (select x.id from vis.audit_externe x where x.subject_id = a.subject_id and x.outil = a.outil order by x.realise_le desc, x.importe_le desc limit 1) as dernier
from vis.audit_externe a;

-- Une ligne par question et par moteur : score (0 absent, 1 cité parce que nommé ou
-- inexact, 2 listé, 3 premier choix avec lien), concurrents cités à la place, domaines.
create or replace view public.vis_audit_externe_lignes_v3 with (security_invoker = true) as
select a.id as audit_id, a.client_id, a.subject_id, a.outil, a.realise_le,
       l.x ->> 'id' as question_id, l.x ->> 'sujet' as sujet, l.x ->> 'question' as question, l.o::int as ordre,
       m.moteur,
       nullif(l.x #>> array['scores', m.moteur], '')::int as score,
       coalesce(l.x #> array['concurrents', m.moteur], '[]'::jsonb) as concurrents,
       coalesce(l.x #> array['domaines', m.moteur], '[]'::jsonb) as domaines
from vis.audit_externe a
cross join lateral jsonb_array_elements(a.matrice) with ordinality as l(x, o)
cross join lateral unnest(a.moteurs) as m(moteur);

revoke all on public.vis_audits_externes_v3, public.vis_audit_externe_lignes_v3 from public, anon, authenticated;
grant select on public.vis_audits_externes_v3, public.vis_audit_externe_lignes_v3 to authenticated;

create or replace function public.vis_importer_audit_externe(p_subject text, p_outil text, p_realise_le date, p_methode text,
  p_moteurs text[], p_score numeric, p_resume text, p_rapport_md text, p_matrice jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  aid uuid;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_realise_le is null or p_realise_le > (now() at time zone 'UTC')::date then raise exception 'date de l''audit refusée' using errcode = '22023'; end if;
  if p_matrice is null or jsonb_typeof(p_matrice) <> 'array' then raise exception 'matrice : tableau attendu' using errcode = '22023'; end if;
  if p_rapport_md ~* '<script|javascript:' then raise exception 'rapport refusé : script interdit' using errcode = '22023'; end if;
  -- Même audit importé deux fois : la même ligne.
  select id into aid from vis.audit_externe where subject_id = p_subject and outil = btrim(p_outil) and realise_le = p_realise_le and matrice = p_matrice limit 1;
  if aid is not null then return aid; end if;
  insert into vis.audit_externe (client_id, subject_id, outil, realise_le, methode, moteurs, score, resume, rapport_md, matrice, importe_par)
  values (cid, p_subject, btrim(p_outil), p_realise_le, p_methode, p_moteurs, p_score, p_resume, p_rapport_md, p_matrice, uid)
  returning id into aid;
  perform vis_ui.journaliser('vis_importer_audit_externe', cid, p_subject,
    jsonb_build_object('p_outil', p_outil, 'p_realise_le', p_realise_le, 'questions', jsonb_array_length(p_matrice)), jsonb_build_object('audit', aid), uid);
  return aid;
end $$;
revoke all on function public.vis_importer_audit_externe(text, text, date, text, text[], numeric, text, text, jsonb) from public, anon;
grant execute on function public.vis_importer_audit_externe(text, text, date, text, text[], numeric, text, text, jsonb) to authenticated;

comment on table vis.audit_externe is 'Audits de visibilité IA faits par d''autres outils (Perplexity Computer…), en complément ; jamais dans le score d''OIA.';

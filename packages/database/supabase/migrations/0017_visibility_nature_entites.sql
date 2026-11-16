-- 0017 · Visibility : nature des entités citées (concurrent, plateforme, application…), fenêtres
-- d'audit vides closes, Mistral pour toutes les langues.
--
-- Les IA citent, à la place de la marque, de vrais concurrents mais aussi des plateformes de
-- réservation (Playtomic), des applications (Future, Caliber), des annuaires et des médias. Les
-- confondre fausse la part de voix et le plan d'action. Chaque entité reçoit une nature :
-- « concurrent » (même métier, même marché), « plateforme » (place de marché, réservation),
-- « application », « annuaire », « media », « autre ». Sans classement : « a_classer ».
-- Classement par le moteur (audit IA express, Mistral) ou par un humain (cockpit) ; le plus récent
-- fait foi ; un classement humain n'est jamais remplacé par le moteur.
--
-- Retour arrière : drop function public.vis_classer_entite(text, text, text),
--   public.vis_moteur_classer_entites(text, jsonb) ; drop view public.vis_entites_v3 ;
--   vis_concurrents_v1 sans la colonne nature ; drop table vis.entite_nature ;
--   vis_moteur_audit_debut de la 0015 ; tarif mistral réservé au français.

create table if not exists vis.entite_nature (
  id         bigserial primary key,
  client_id  text not null references vis.client(id) on delete restrict,
  subject_id text not null references vis.subject(id) on delete restrict,
  entite     text not null check (char_length(entite) between 1 and 160),
  nature     text not null check (nature in ('concurrent','plateforme','application','annuaire','media','autre')),
  origine    text not null check (origine in ('humain','moteur')),
  par        text not null,
  le         timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists entite_nature_idx on vis.entite_nature (subject_id, lower(entite), id desc);
create trigger entite_nature_ajout_seul before update or delete on vis.entite_nature for each row execute function vis.pilotage_ajout_seul();
create trigger entite_nature_ajout_seul_truncate before truncate on vis.entite_nature for each statement execute function vis.pilotage_ajout_seul();
alter table vis.entite_nature enable row level security;
alter table vis.entite_nature owner to vis_admin;
revoke all on vis.entite_nature from public, anon, authenticated, service_role;
grant select on vis.entite_nature to authenticated;
create policy tenant_isolation_auth on vis.entite_nature for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = entite_nature.client_id));

-- Nature en vigueur : le dernier classement humain, sinon le dernier du moteur.
create or replace function vis_ui.nature_entite(p_subject text, p_entite text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select n.nature from vis.entite_nature n where n.subject_id = p_subject and lower(n.entite) = lower(p_entite) and n.origine = 'humain' order by n.id desc limit 1),
    (select n.nature from vis.entite_nature n where n.subject_id = p_subject and lower(n.entite) = lower(p_entite) order by n.id desc limit 1),
    'a_classer')
$$;
revoke all on function vis_ui.nature_entite(text, text) from public, anon;
grant execute on function vis_ui.nature_entite(text, text) to authenticated, service_role;

create or replace view public.vis_entites_v3 with (security_invoker = true) as
select distinct on (n.subject_id, lower(n.entite)) n.client_id, n.subject_id, n.entite,
       vis_ui.nature_entite(n.subject_id, n.entite) as nature, n.origine, n.par, n.le
from vis.entite_nature n
order by n.subject_id, lower(n.entite), (n.origine = 'humain') desc, n.id desc;
revoke all on public.vis_entites_v3 from public, anon, authenticated;
grant select on public.vis_entites_v3 to authenticated;

-- Concurrents : la nature en dernière colonne (ajout seul, la v1 reste compatible).
create or replace view public.vis_concurrents_v1 with (security_invoker = true) as
 WITH rep AS (
         SELECT base_reponse.id, base_reponse.client_id, base_reponse.subject_id, base_reponse.site_id, base_reponse.window_id,
            base_reponse.prompt_id, base_reponse.prompt_version, base_reponse.prompt_language, base_reponse.engine,
            base_reponse.engine_version, base_reponse.collector_name, base_reponse.received_at, base_reponse.observed_on,
            base_reponse.raw_text, base_reponse.raw_sha256, base_reponse.citations, base_reponse.cost_usd, base_reponse.marque_citee,
            base_reponse.concurrents, base_reponse.recherche_web, base_reponse.fournisseur
           FROM vis_ui.base_reponse
          WHERE (base_reponse.marque_citee IS NOT NULL)
        ), ent AS (
         SELECT rep.client_id, rep.subject_id, rep.window_id, rep.engine, rep.prompt_id, rep.id, rep.subject_id AS entite, true AS est_marque
           FROM rep
          WHERE rep.marque_citee
        UNION ALL
         SELECT r.client_id, r.subject_id, r.window_id, r.engine, r.prompt_id, r.id, c_1.c, false
           FROM (rep r CROSS JOIN LATERAL unnest(r.concurrents) c_1(c))
        ), den AS (
         SELECT rep.window_id, COALESCE(rep.engine, 'tous'::text) AS moteur, count(*) AS reponses_jugees,
            (sum((rep.marque_citee)::integer) + sum(cardinality(rep.concurrents))) AS mentions_totales
           FROM rep
          GROUP BY GROUPING SETS ((rep.window_id, rep.engine), (rep.window_id))
        ), cpt AS (
         SELECT ent.client_id, ent.subject_id, ent.window_id, COALESCE(ent.engine, 'tous'::text) AS moteur, ent.entite, ent.est_marque,
            count(DISTINCT ent.id) AS reponses_avec_entite, count(DISTINCT ent.prompt_id) AS questions
           FROM ent
          GROUP BY GROUPING SETS ((ent.client_id, ent.subject_id, ent.window_id, ent.engine, ent.entite, ent.est_marque), (ent.client_id, ent.subject_id, ent.window_id, ent.entite, ent.est_marque))
        )
 SELECT c.client_id, c.subject_id, c.window_id, c.moteur, c.entite, c.est_marque,
    c.reponses_avec_entite AS mentions,
    d.mentions_totales AS denominateur_part,
        CASE WHEN (d.mentions_totales > 0) THEN round(((c.reponses_avec_entite)::numeric / (d.mentions_totales)::numeric), 4) ELSE NULL::numeric END AS part_de_voix,
    d.reponses_jugees,
    round(((c.reponses_avec_entite)::numeric / (d.reponses_jugees)::numeric), 4) AS taux_apparition,
        CASE WHEN (d.reponses_jugees >= 30) THEN 'wilson_95'::text ELSE 'effectif_insuffisant'::text END AS methode_intervalle,
        CASE WHEN (d.reponses_jugees >= 30) THEN vis_ui.wilson(c.reponses_avec_entite, d.reponses_jugees, false) ELSE NULL::numeric END AS borne_basse,
        CASE WHEN (d.reponses_jugees >= 30) THEN vis_ui.wilson(c.reponses_avec_entite, d.reponses_jugees, true) ELSE NULL::numeric END AS borne_haute,
    c.questions,
    CASE WHEN c.est_marque THEN 'marque' ELSE vis_ui.nature_entite(c.subject_id, c.entite) END AS nature
   FROM (cpt c JOIN den d ON (((d.window_id = c.window_id) AND (d.moteur = c.moteur))));

-- Geste : classer une entité (humain ; prime sur le moteur).
create or replace function public.vis_classer_entite(p_subject text, p_entite text, p_nature text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  nid bigint;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_nature not in ('concurrent','plateforme','application','annuaire','media','autre') then raise exception 'nature refusée' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_entite, ''))) = 0 then raise exception 'entité vide' using errcode = '22023'; end if;
  insert into vis.entite_nature (client_id, subject_id, entite, nature, origine, par) values (cid, p_subject, btrim(p_entite), p_nature, 'humain', uid) returning id into nid;
  perform vis_ui.journaliser('vis_classer_entite', cid, p_subject, jsonb_build_object('p_entite', p_entite, 'p_nature', p_nature), jsonb_build_object('id', nid), uid);
  return nid;
end $$;
revoke all on function public.vis_classer_entite(text, text, text) from public, anon;
grant execute on function public.vis_classer_entite(text, text, text) to authenticated;

-- Moteur : classements proposés (jamais par-dessus un classement humain).
create or replace function public.vis_moteur_classer_entites(p_subject text, p_entites jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  e jsonb;
  n int := 0;
begin
  perform vis_ui.exiger_moteur();
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_entites, '[]'::jsonb)) loop
    continue when coalesce(e ->> 'nature', '') not in ('concurrent','plateforme','application','annuaire','media','autre');
    continue when char_length(btrim(coalesce(e ->> 'entite', ''))) = 0 or char_length(e ->> 'entite') > 160;
    continue when exists (select 1 from vis.entite_nature x where x.subject_id = p_subject and lower(x.entite) = lower(btrim(e ->> 'entite')) and x.origine = 'humain');
    continue when vis_ui.nature_entite(p_subject, btrim(e ->> 'entite')) = e ->> 'nature';
    insert into vis.entite_nature (client_id, subject_id, entite, nature, origine, par) values (cid, p_subject, btrim(e ->> 'entite'), e ->> 'nature', 'moteur', 'moteur');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.vis_moteur_classer_entites(text, jsonb) from public, anon, authenticated;
grant execute on function public.vis_moteur_classer_entites(text, jsonb) to service_role;

-- Audit : à chaque début, les fenêtres d'audit précédentes restées vides (essai en échec) sont closes.
create or replace function public.vis_moteur_audit_debut(p_demande uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  wid text;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'AUDIT_IA' then raise exception 'demande d''audit introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  if not exists (select 1 from vis.audit_ia a where a.id = (d.charge ->> 'audit_id')::uuid and a.subject_id = d.subject_id) then
    raise exception 'audit refusé : aucun GO enregistré' using errcode = '42501';
  end if;
  update vis.window w set status = 'aborted'
   where w.subject_id = d.subject_id and w.id like d.subject_id || '-audit-%' and w.status = 'running'
     and not exists (select 1 from vis.evidence e where e.window_id = w.id);
  wid := left(d.subject_id || '-audit-' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'), 63);
  insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on, note)
    values (wid, d.subject_id, d.client_id, 'reconnaissance', 1, 'running', (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date,
            'Audit IA express (une passe par question), demande ' || p_demande::text)
    on conflict (id) do nothing;
  return wid;
end $$;

-- Fenêtres d'audit vides déjà laissées par des essais en échec.
update vis.window w set status = 'aborted'
 where w.id like '%-audit-%' and w.status = 'running' and not exists (select 1 from vis.evidence e where e.window_id = w.id);

-- Mistral (Le Chat) pour toutes les langues (demande de Mickaël, 16 novembre 2026).
insert into vis.tarif_moteur (moteur, cible, langues, majorant_usd, habituel_usd, source)
select moteur, cible, null, majorant_usd, habituel_usd, source || ' ; toutes langues depuis le 2026-11-16'
from (select * from vis.tarif_moteur where moteur = 'mistral' order by id desc limit 1) t;

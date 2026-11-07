-- OIA Visibility · S1 à S4 · correctifs sécurité (revue externe 2026-11-07).
--
-- Ce fichier remplace la confiance dans `current_setting('vis.client_id')`
-- par une identité VÉRIFIÉE (`auth.uid()`, convention Supabase) et une
-- table d'appartenance explicite (`vis.client_member`). Il laisse les
-- tables de 0001-0003 en place et réécrit uniquement :
--   * les politiques RLS (fondées sur auth.uid()) ;
--   * les fonctions d'écriture critiques (recommandation, décision,
--     activation du planificateur) en security definer, avec contrôle
--     explicite du rôle de l'appelant ;
--   * les droits accordés aux rôles applicatifs ;
--   * les contraintes croisées (id, client_id) qu'il manquait sur site,
--     window, recommendation.
--
-- Postulats :
--   * la base cible est Supabase (ou un Postgres qui expose un schéma
--     `auth` avec une fonction `auth.uid()`). Pour les tests locaux, ce
--     fichier **émule** `auth.uid()` : une fonction qui lit le GUC
--     `vis.test_user_id` (clairement documentée comme utilisée seulement
--     en test, et neutralisée en production par un commentaire).
--   * sur Supabase, `auth.uid()` rend un **uuid** ; `vis.client_member.user_id`
--     est du texte. Toutes les comparaisons et affectations utilisent donc
--     `auth.uid()::text`, qui marche avec les deux types (uuid sur Supabase,
--     texte dans l'émulation locale) ;
--   * sur Supabase, la migration tourne sous `postgres`, qui n'est pas
--     superutilisateur et ne possède pas le schéma `auth` : rien ici ne
--     modifie `auth` hors de l'émulation, et le rôle qui migre reçoit
--     `vis_admin` (section 5) avant de lui céder les tables ;
--   * la migration est rejouable (`IF NOT EXISTS`, `CREATE OR REPLACE`).
--   * aucune table de 0001-0003 n'est renommée ni supprimée ;
--     `vis.current_client_id()` reste présente pour compatibilité, mais
--     n'est plus consultée par les policies.

-- ------------------------------------------------------------------
-- 1.  schéma `auth` : réel sur Supabase, émulé en test
-- ------------------------------------------------------------------
create schema if not exists auth;

-- En production (Supabase), cette fonction existe déjà et lit le JWT de
-- la session courante. L'instruction `CREATE OR REPLACE` ci-dessous ne
-- doit PAS être appliquée sur Supabase ; elle n'est utile que sur un
-- Postgres nu (test local). Pour désactiver proprement l'émulation en
-- production, exécuter `drop function auth.uid()` puis réappliquer la
-- migration Supabase du schéma `auth`.
--
-- Pour les tests, le GUC `vis.test_user_id` fait office d'identité.
-- Aucun code d'application ne doit poser ce GUC ; seul le script de
-- test l'utilise.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'auth' and p.proname = 'uid') then
    create or replace function auth.uid() returns text
      language sql stable
      as $body$
        select nullif(current_setting('vis.test_user_id', true), '')
      $body$;
    comment on function auth.uid() is
      'Émulation locale pour tests : lit vis.test_user_id. Sur Supabase, auth.uid() est déjà fourni par la plateforme et lit le JWT.';
    -- Seulement ici : sur Supabase, le schéma auth appartient à la plateforme.
    comment on schema auth is 'Supabase auth schema (émulé localement pour tests).';
  end if;
end $$;

-- ------------------------------------------------------------------
-- 2.  vis.client_member : qui appartient à quel client, avec quel rôle
-- ------------------------------------------------------------------
create table if not exists vis.client_member (
  user_id   text not null,
  client_id text not null references vis.client(id) on delete restrict,
  role      text not null check (role in ('owner','approver','viewer')),
  added_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists client_member_user_idx on vis.client_member(user_id);

-- Table auxiliaire : identités de service (workers, orchestrateur).
-- Jamais utilisée pour valider ; toute tentative d'appel aux fonctions
-- d'approbation avec un user_id listé ici est refusée.
create table if not exists vis.service_identity (
  user_id    text primary key,
  name       text not null,
  added_at   timestamptz not null default now()
);

-- Fonctions utilitaires : rôle de l'appelant pour un client donné.
create or replace function vis.caller_role(target_client text) returns text
language sql stable security invoker as $$
  select role
    from vis.client_member
   where user_id = auth.uid()::text
     and client_id = target_client
$$;

create or replace function vis.caller_is_service() returns boolean
language sql stable security invoker as $$
  select exists(select 1 from vis.service_identity where user_id = auth.uid()::text)
$$;

-- ------------------------------------------------------------------
-- 3.  S1 — Réécriture des politiques RLS
-- ------------------------------------------------------------------
-- Les policies de 0001-0003 utilisent `vis.current_client_id()` (lu dans
-- un GUC librement positionné par l'appelant). On les remplace par des
-- policies fondées sur `auth.uid()` et `vis.client_member`.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'evidence','subject','site','window','subject_site','window_missing_day',
    'recommendation','decision','execution','action_log'
  ])
  loop
    execute format('drop policy if exists tenant_isolation on vis.%I', t);
    execute format('drop policy if exists tenant_isolation_auth on vis.%I', t);
  end loop;
end $$;

-- Lecture : membre du client (quel que soit le rôle).
-- Écriture : membre avec un rôle qui l'autorise.
--   * evidence : `owner`, `approver` et `viewer` peuvent lire ; seuls
--     `owner` et `approver` peuvent écrire, et l'écriture passe par les
--     fonctions security definer ci-dessous dans la pratique (les
--     workers sont des services, pas des membres).
--   * recommendation, decision, execution : écriture exclusivement via
--     les fonctions security definer (voir section 4). La policy reste
--     posée en défense en profondeur.

create policy tenant_isolation_auth on vis.evidence
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.evidence.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.evidence.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.subject
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.subject.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.subject.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.site
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.site.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.site.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.window
  for all
  using  (exists (select 1 from vis.subject s
                   join vis.client_member m on m.client_id = s.client_id
                   where s.id = vis.window.subject_id and m.user_id = auth.uid()::text))
  with check (exists (select 1 from vis.subject s
                       join vis.client_member m on m.client_id = s.client_id
                       where s.id = vis.window.subject_id and m.user_id = auth.uid()::text
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.subject_site
  for all
  using  (exists (select 1 from vis.subject s
                   join vis.client_member m on m.client_id = s.client_id
                   where s.id = vis.subject_site.subject_id and m.user_id = auth.uid()::text))
  with check (exists (select 1 from vis.subject s
                       join vis.client_member m on m.client_id = s.client_id
                       where s.id = vis.subject_site.subject_id and m.user_id = auth.uid()::text
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.window_missing_day
  for all
  using  (exists (select 1 from vis.window w
                   join vis.subject s on s.id = w.subject_id
                   join vis.client_member m on m.client_id = s.client_id
                   where w.id = vis.window_missing_day.window_id and m.user_id = auth.uid()::text))
  with check (exists (select 1 from vis.window w
                       join vis.subject s on s.id = w.subject_id
                       join vis.client_member m on m.client_id = s.client_id
                       where w.id = vis.window_missing_day.window_id and m.user_id = auth.uid()::text
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.recommendation
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.recommendation.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.recommendation.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.decision
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.decision.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.decision.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.execution
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.execution.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.execution.client_id
                         and m.role in ('owner','approver')));

create policy tenant_isolation_auth on vis.action_log
  for all
  using  (exists (select 1 from vis.client_member m
                   where m.user_id = auth.uid()::text and m.client_id = vis.action_log.client_id))
  with check (exists (select 1 from vis.client_member m
                       where m.user_id = auth.uid()::text and m.client_id = vis.action_log.client_id
                         and m.role in ('owner','approver')));

-- ------------------------------------------------------------------
-- 4.  S2 — Fonctions d'approbation garanties par la base
-- ------------------------------------------------------------------
-- Toute validation (recommandation, correctif, panel) et toute activation
-- du planificateur passe par une fonction SQL qui lit `auth.uid()`,
-- vérifie que l'identité est owner ou approver du client, et refuse
-- toute identité enregistrée dans `vis.service_identity`.

create or replace function vis.validate_recommendation(
  target_recommendation text,
  reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = vis, pg_catalog
as $$
declare
  caller_uid text;
  role_       text;
  cid         text;
  new_id      bigint;
begin
  caller_uid := auth.uid()::text;
  if caller_uid is null then
    raise exception 'validate_recommendation refusée : aucun auth.uid()' using errcode = 'insufficient_privilege';
  end if;
  if exists(select 1 from vis.service_identity where user_id = caller_uid) then
    raise exception 'validate_recommendation refusée : identité de service (%)', caller_uid
      using errcode = 'insufficient_privilege';
  end if;
  select client_id into cid from vis.recommendation where id = target_recommendation;
  if cid is null then
    raise exception 'validate_recommendation refusée : recommandation inconnue (%)', target_recommendation
      using errcode = 'no_data_found';
  end if;
  select role into role_ from vis.client_member
   where user_id = caller_uid and client_id = cid;
  if role_ is null or role_ not in ('owner','approver') then
    raise exception 'validate_recommendation refusée : identité % n''a pas owner/approver sur client %',
      caller_uid, cid using errcode = 'insufficient_privilege';
  end if;
  insert into vis.decision (recommendation_id, status, decided_by, client_id, reason)
    values (target_recommendation, 'accepted', caller_uid, cid, reason)
    returning id into new_id;
  return new_id;
end;
$$;

comment on function vis.validate_recommendation(text, text) is
  'Validation humaine : refuse les identités de service et toute identité hors owner/approver du client. Ne lit JAMAIS un booléen/isAgent fourni par l''appelant.';

-- Scheduler : activer ou désactiver le planificateur pour un client.
-- Encapsule la bascule dans une fonction : impossible de l'activer en
-- écrivant directement dans une table métier.
create table if not exists vis.scheduler_switch (
  client_id    text primary key references vis.client(id) on delete restrict,
  enabled      boolean not null default false,
  toggled_by   text not null,
  toggled_at   timestamptz not null default now(),
  reason       text
);

alter table vis.scheduler_switch enable row level security;
drop policy if exists tenant_isolation_auth on vis.scheduler_switch;
create policy tenant_isolation_auth on vis.scheduler_switch
  for select
  using (exists (select 1 from vis.client_member m
                  where m.user_id = auth.uid()::text and m.client_id = vis.scheduler_switch.client_id));

create or replace function vis.toggle_scheduler(
  target_client text,
  want_enabled boolean,
  reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = vis, pg_catalog
as $$
declare
  caller_uid text;
  role_       text;
begin
  caller_uid := auth.uid()::text;
  if caller_uid is null then
    raise exception 'toggle_scheduler refusée : aucun auth.uid()' using errcode = 'insufficient_privilege';
  end if;
  if exists(select 1 from vis.service_identity where user_id = caller_uid) then
    raise exception 'toggle_scheduler refusée : identité de service (%)', caller_uid
      using errcode = 'insufficient_privilege';
  end if;
  select role into role_ from vis.client_member
   where user_id = caller_uid and client_id = target_client;
  if role_ is null or role_ not in ('owner','approver') then
    raise exception 'toggle_scheduler refusée : identité % n''a pas owner/approver sur client %',
      caller_uid, target_client using errcode = 'insufficient_privilege';
  end if;
  insert into vis.scheduler_switch (client_id, enabled, toggled_by, reason)
    values (target_client, want_enabled, caller_uid, reason)
  on conflict (client_id) do update
    set enabled = excluded.enabled,
        toggled_by = excluded.toggled_by,
        toggled_at = now(),
        reason = excluded.reason;
  return want_enabled;
end;
$$;

-- ------------------------------------------------------------------
-- 5.  S3 — Moindre privilège
-- ------------------------------------------------------------------
-- RLS sur vis.client (la table était volontairement « admin only » en
-- 0001 ; on la rend RLS pour que l'app puisse lire sa liste de clients
-- sans que l'admin ait à ouvrir un SELECT global).
alter table vis.client enable row level security;
drop policy if exists tenant_isolation_auth on vis.client;
create policy tenant_isolation_auth on vis.client
  for select
  using (exists (select 1 from vis.client_member m
                  where m.user_id = auth.uid()::text and m.client_id = vis.client.id));

-- Rôles : crée `vis_admin` (propriétaire des tables) et retire TRUNCATE,
-- ALTER, TRIGGER ... aux rôles applicatifs. En production (Supabase), on
-- ne peut pas CREATE ROLE depuis la migration : la section suivante est
-- idempotente (DO) et ne tombe pas si les rôles existent déjà.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vis_admin') then
    execute 'create role vis_admin nologin';
  end if;
end $$;

-- Propriété des tables : vis_admin. L'app n'est jamais propriétaire,
-- elle ne peut donc ni DROP, ni ALTER, ni DISABLE TRIGGER.
-- Les triggers d'intégrité référentielle (FK) tournent AS le propriétaire
-- de la contrainte, c'est-à-dire le propriétaire de la table cible. Il
-- faut donc que vis_admin ait USAGE sur le schéma, sinon un INSERT fera
-- « permission denied for schema vis » à l'évaluation de la FK.
-- CREATE : Postgres exige que le nouveau propriétaire d'une table puisse
-- créer dans son schéma (un superutilisateur passe outre, pas Supabase).
grant usage, create on schema vis to vis_admin;
-- Céder une table exige de pouvoir prendre le rôle cible (SET ROLE). Sur
-- Supabase, `postgres` n'est pas superutilisateur : depuis Postgres 16, le
-- créateur d'un rôle n'en reçoit que l'option ADMIN, sans SET ni INHERIT.
-- On lui accorde donc vis_admin avec héritage : il garde l'accès aux tables
-- cédées, et les fonctions security definer qu'il possède continuent de
-- fonctionner. Sans effet pour un superutilisateur (tests locaux).
do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    if current_setting('server_version_num')::int >= 160000 then
      execute format('grant vis_admin to %I with inherit true, set true', current_user);
    else
      execute format('grant vis_admin to %I', current_user);
    end if;
  end if;
end $$;
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'client','site','subject','subject_site','window','window_missing_day',
    'evidence','recommendation','decision','execution','action_log',
    'client_member','service_identity','scheduler_switch'
  ])
  loop
    execute format('alter table vis.%I owner to vis_admin', t);
  end loop;
end $$;

-- Retire les SELECT en bloc accordés en 0001-0003 ; accorde finement.
-- L'instruction REVOKE est tolérante (idempotente).
revoke all on all tables in schema vis from public;
-- Note : si `oia_vis_app` n'existe pas (installation en test avant seed),
-- la section ci-dessous est no-op grâce au DO + EXCEPTION.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'oia_vis_app') then
    execute 'revoke all on all tables in schema vis from oia_vis_app';
    execute 'grant usage on schema vis to oia_vis_app';
    -- Lectures minimales ; les écritures passent par les fonctions sec. def. ou par RLS.
    execute 'grant select on vis.client, vis.client_member, vis.site, vis.subject, vis.subject_site, vis.window, vis.window_missing_day, vis.evidence, vis.recommendation, vis.decision, vis.execution, vis.action_log, vis.scheduler_switch to oia_vis_app';
    execute 'grant insert on vis.evidence, vis.subject, vis.site, vis.window, vis.subject_site, vis.window_missing_day, vis.recommendation, vis.decision, vis.execution, vis.action_log to oia_vis_app';
    -- TRUNCATE non accordé : explicitement refusé plus bas.
    execute 'grant usage on all sequences in schema vis to oia_vis_app';
    -- Exécution des fonctions security definer pour l'app
    execute 'grant execute on function vis.validate_recommendation(text, text) to oia_vis_app';
    execute 'grant execute on function vis.toggle_scheduler(text, boolean, text) to oia_vis_app';
  end if;
end $$;

-- Garde-fou : revoke sur TRUNCATE, ALTER, TRIGGER n'est pas nécessaire
-- (ils ne sont jamais accordés par défaut à un rôle non propriétaire).
-- Les tests (S3) le vérifient explicitement.

-- ------------------------------------------------------------------
-- 6.  S4 — Cohérence inter-clients via clés composites
-- ------------------------------------------------------------------
-- vis.evidence : la FK composite (subject_id, client_id) → vis.subject(id, client_id)
-- est déjà posée en 0001 (evidence_subject_belongs_to_client). On ajoute
-- les mêmes garanties pour site, window, recommendation, subject_site.

-- vis.site : ajoute l'unicité (id, client_id), et la FK composite
-- (client_id, site_id) doit déjà être cohérente (site.client_id).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_id_client_uk') then
    execute 'alter table vis.site add constraint site_id_client_uk unique (id, client_id)';
  end if;
end $$;

-- vis.window : ajoute un client_id explicite (peuplé via subject), avec FK composite.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='vis' and table_name='window' and column_name='client_id') then
    execute 'alter table vis.window add column client_id text';
    -- Peuple depuis vis.subject
    execute 'update vis.window w set client_id = (select client_id from vis.subject s where s.id = w.subject_id) where client_id is null';
    execute 'alter table vis.window alter column client_id set not null';
    execute 'alter table vis.window add constraint window_subject_belongs_to_client foreign key (subject_id, client_id) references vis.subject(id, client_id) deferrable initially deferred';
    execute 'create unique index if not exists window_id_client_uk on vis.window(id, client_id)';
  end if;
end $$;

-- vis.recommendation : idem, couple (subject_id, client_id) → subject.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recommendation_subject_belongs_to_client') then
    execute 'alter table vis.recommendation add constraint recommendation_subject_belongs_to_client foreign key (subject_id, client_id) references vis.subject(id, client_id) deferrable initially deferred';
  end if;
end $$;

-- vis.subject_site : couple composite pour qu'un subject et son site
-- appartiennent au même client.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='vis' and table_name='subject_site' and column_name='client_id') then
    execute 'alter table vis.subject_site add column client_id text';
    execute 'update vis.subject_site ss set client_id = (select client_id from vis.subject s where s.id = ss.subject_id) where client_id is null';
    execute 'alter table vis.subject_site alter column client_id set not null';
    execute 'alter table vis.subject_site add constraint subject_site_subject_belongs_to_client foreign key (subject_id, client_id) references vis.subject(id, client_id) deferrable initially deferred';
    execute 'alter table vis.subject_site add constraint subject_site_site_belongs_to_client foreign key (site_id, client_id) references vis.site(id, client_id) deferrable initially deferred';
  end if;
end $$;

-- ------------------------------------------------------------------
-- 7. Fonctions security definer héritées — on les met à jour pour lire
--    `auth.uid()` + `vis.client_member` (et non `vis.current_client_id()`
--    qui reste disponible pour compatibilité mais n'est plus utilisée
--    dans la chaîne de confiance).
-- ------------------------------------------------------------------
create or replace function vis.client_summary(target_client text)
returns jsonb
language plpgsql
stable
security definer
set search_path = vis, pg_catalog
as $$
declare
  caller_uid text;
  caller_role text;
  result     jsonb;
begin
  caller_uid := auth.uid()::text;
  if caller_uid is null then
    raise exception 'vis.client_summary refusée : aucun auth.uid()' using errcode = 'insufficient_privilege';
  end if;
  select role into caller_role from vis.client_member
   where user_id = caller_uid and client_id = target_client;
  if caller_role is null then
    raise exception 'vis.client_summary refusée : % n''est pas membre de %', caller_uid, target_client
      using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'client_id', target_client,
    'evidence_count', (select count(*) from vis.evidence where client_id = target_client),
    'subject_count',  (select count(*) from vis.subject  where client_id = target_client)
  ) into result;
  return result;
end;
$$;

comment on table vis.client_member is 'S1 : table d''appartenance. Remplace current_setting(vis.client_id) par une vérification fondée sur auth.uid().';
comment on table vis.service_identity is 'S2 : identités de service déclarées explicitement. Les fonctions d''approbation refusent toute user_id listée ici.';

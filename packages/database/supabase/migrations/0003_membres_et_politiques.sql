-- 0003 · Espaces, membres et politiques fondées sur l'appartenance
-- Mandat v8, exigences 2 et 3 ; audit docs/audits/2026-11-08-donnees-existantes.md.
--
-- Part de l'état DÉPLOYÉ décrit par packages/database/supabase/migrations/0002_watch_and_workspace.sql
-- (migrations Supabase watch_ledger_and_workspace, rename_dedup_key_to_watch_key,
-- requests_drafts_and_link_checks). Ne le rejoue jamais.
--
-- Effets :
--   * un espace de travail (le studio) et une table des membres ;
--   * une colonne espace_id sur chaque table d'OIA ;
--   * les politiques « authenticated … true » de 0002, et celles de 0002a si
--     elle a été appliquée, sont supprimées : un compte connecté qui n'est pas
--     membre ne lit et n'écrit plus rien ;
--   * plus aucune écriture directe par les rôles applicatifs : décisions,
--     étiquettes, notes, tâches, contacts, vues, acquittements et demandes
--     passent par des fonctions qui vérifient l'identité et journalisent.
--
-- Après application, seuls les comptes de 0002a (s'il y en a) deviennent
-- propriétaires du studio ; sinon personne ne lit rien tant que Mickaël ne
-- s'est pas ajouté (voir README.md de ce dossier).
-- AVANT application : la console écrit aujourd'hui directement dans ces tables
-- (apps/web/src/lib/remoteWorkspace.ts) ; ces écritures seront refusées. Décision
-- de Mickaël du 2026-11-08 : 0003 attend l'application Lovable.

begin;

-- 1. Espaces et membres --------------------------------------------------------
create table if not exists public.oia_espace (
  id      uuid primary key,
  nom     text not null unique,
  cree_le timestamptz not null default now()
);
insert into public.oia_espace (id, nom)
values ('00000000-0000-4000-8000-000000000001', 'studio')
on conflict (id) do nothing;

create table if not exists public.oia_membre (
  user_id   uuid not null,
  espace_id uuid not null references public.oia_espace (id) on delete restrict,
  role      text not null check (role in ('proprietaire', 'editeur', 'lecteur')),
  ajoute_le timestamptz not null default now(),
  primary key (user_id, espace_id)
);
create index if not exists oia_membre_espace_idx on public.oia_membre (espace_id);

-- Journal des écritures : ajout seul, alimenté par les fonctions ci-dessous.
create table if not exists public.oia_journal (
  id        bigserial primary key,
  espace_id uuid not null references public.oia_espace (id),
  user_id   uuid,
  action    text not null,
  cible     text not null,
  cible_id  text,
  detail    jsonb not null default '{}'::jsonb,
  le        timestamptz not null default now()
);
create index if not exists oia_journal_espace_idx on public.oia_journal (espace_id, le desc);

-- Rôle de l'appelant dans un espace. Security definer : lit oia_membre sans
-- dépendre de ses propres politiques, et ne rend que la ligne de l'appelant.
create or replace function public.oia_role(p_espace uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.oia_membre where user_id = auth.uid() and espace_id = p_espace
$$;

create or replace function public.oia_est_membre(p_espace uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.oia_membre where user_id = auth.uid() and espace_id = p_espace)
$$;

-- Exige un rôle d'écriture ; lève une erreur sinon.
create or replace function public.oia_exiger_editeur(p_espace uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role text := public.oia_role(p_espace);
begin
  if auth.uid() is null then
    raise exception 'oia: identité requise' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('proprietaire', 'editeur') then
    raise exception 'oia: droit d''écriture refusé dans cet espace' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- 2. Colonne espace_id sur chaque table d'OIA -----------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'watch_opportunities', 'watch_events', 'watch_runs', 'alerts', 'reviews', 'project_tags',
    'notes', 'tasks', 'contacts', 'saved_views', 'requests', 'project_drafts', 'link_checks'
  ] loop
    execute format(
      'alter table public.%I add column if not exists espace_id uuid not null default %L references public.oia_espace (id)',
      t, '00000000-0000-4000-8000-000000000001');
    execute format('create index if not exists %I on public.%I (espace_id)', t || '_espace_idx', t);
  end loop;
end $$;

-- Une étiquette est propre à un espace.
alter table public.project_tags drop constraint if exists project_tags_pkey;
alter table public.project_tags add primary key (espace_id, record_id);

-- Les comptes réservés par 0002a deviennent propriétaires du studio.
do $$
begin
  if to_regclass('public.oia_compte_autorise') is not null then
    insert into public.oia_membre (user_id, espace_id, role)
    select user_id, '00000000-0000-4000-8000-000000000001', 'proprietaire' from public.oia_compte_autorise
    on conflict do nothing;
  end if;
end $$;

-- Politiques de 0002a, si elle a été appliquée.
do $$
declare t text; p text;
begin
  for t, p in select tablename, policyname from pg_policies
              where schemaname = 'public' and policyname in ('mickael read', 'mickael all', 'mickael acknowledge', 'mickael append', 'mickael ask', 'mickael draft', 'mickael edit own draft')
  loop
    execute format('drop policy %I on public.%I', p, t);
  end loop;
end $$;

-- 3. Politiques : suppression des politiques trop larges --------------------------
drop policy if exists "authenticated read"        on public.watch_opportunities;
drop policy if exists "authenticated read"        on public.watch_events;
drop policy if exists "authenticated read"        on public.watch_runs;
drop policy if exists "authenticated read"        on public.link_checks;
drop policy if exists "authenticated read"        on public.alerts;
drop policy if exists "authenticated acknowledge" on public.alerts;
drop policy if exists "authenticated read"        on public.reviews;
drop policy if exists "authenticated append"      on public.reviews;
drop policy if exists "authenticated all"         on public.project_tags;
drop policy if exists "authenticated all"         on public.notes;
drop policy if exists "authenticated all"         on public.tasks;
drop policy if exists "authenticated all"         on public.contacts;
drop policy if exists "authenticated all"         on public.saved_views;
drop policy if exists "authenticated read"        on public.requests;
drop policy if exists "authenticated ask"         on public.requests;
drop policy if exists "authenticated read"        on public.project_drafts;
drop policy if exists "authenticated draft"       on public.project_drafts;
drop policy if exists "authenticated edit own draft" on public.project_drafts;

-- 4. Politiques : lecture par les membres de l'espace, aucune écriture directe ----
do $$
declare
  t text;
begin
  foreach t in array array[
    'watch_opportunities', 'watch_events', 'watch_runs', 'alerts', 'reviews', 'project_tags',
    'notes', 'tasks', 'contacts', 'saved_views', 'requests', 'project_drafts', 'link_checks'
  ] loop
    execute format('drop policy if exists membres_lisent on public.%I', t);
    execute format('create policy membres_lisent on public.%I for select to authenticated using (public.oia_est_membre(espace_id))', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.oia_espace  enable row level security;
alter table public.oia_membre  enable row level security;
alter table public.oia_journal enable row level security;
drop policy if exists membres_lisent on public.oia_espace;
create policy membres_lisent on public.oia_espace for select to authenticated using (public.oia_est_membre(id));
drop policy if exists soi_meme on public.oia_membre;
create policy soi_meme on public.oia_membre for select to authenticated using (user_id = auth.uid());
drop policy if exists membres_lisent on public.oia_journal;
create policy membres_lisent on public.oia_journal for select to authenticated using (public.oia_est_membre(espace_id));
revoke all on public.oia_espace, public.oia_membre, public.oia_journal from anon;
revoke insert, update, delete, truncate on public.oia_espace, public.oia_membre, public.oia_journal from authenticated;

-- 5. Fonctions d'écriture : identité vérifiée, auteur imposé, journal ------------
create or replace function public.oia_journaliser(p_espace uuid, p_action text, p_cible text, p_cible_id text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.oia_journal (espace_id, user_id, action, cible, cible_id, detail)
  values (p_espace, auth.uid(), p_action, p_cible, p_cible_id, coalesce(p_detail, '{}'::jsonb))
$$;
revoke execute on function public.oia_journaliser(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Décision humaine : ajout seul ; l'auteur est l'appelant, jamais un paramètre.
create or replace function public.oia_decider(p_espace uuid, p_record_id text, p_action text, p_commentaire text, p_gate_ok boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  if p_action not in ('APPROVE', 'REJECT', 'NEEDS_VERIFICATION', 'COMMENT') then
    raise exception 'oia: action inconnue %', p_action using errcode = '22023';
  end if;
  insert into public.reviews (record_id, action, comment, actor, gate_pursue_eligible_at_decision, espace_id)
  values (p_record_id, p_action, coalesce(p_commentaire, ''), v_uid::text, coalesce(p_gate_ok, false), p_espace)
  returning id into v_id;
  perform public.oia_journaliser(p_espace, 'decider', 'reviews', v_id::text, jsonb_build_object('record_id', p_record_id, 'action', p_action));
  return v_id;
end $$;

create or replace function public.oia_etiqueter(p_espace uuid, p_record_id text, p_projet text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
begin
  if p_projet is null or p_projet = '' then
    delete from public.project_tags where espace_id = p_espace and record_id = p_record_id;
  else
    insert into public.project_tags (espace_id, record_id, project_slug, actor)
    values (p_espace, p_record_id, p_projet, v_uid::text)
    on conflict (espace_id, record_id) do update set project_slug = excluded.project_slug, actor = excluded.actor, at = now();
  end if;
  perform public.oia_journaliser(p_espace, 'etiqueter', 'project_tags', p_record_id, jsonb_build_object('projet', p_projet));
end $$;

create or replace function public.oia_noter(p_espace uuid, p_texte text, p_record_id text default null, p_projet text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  insert into public.notes (text, record_id, project_slug, actor, espace_id)
  values (p_texte, p_record_id, p_projet, v_uid::text, p_espace) returning id into v_id;
  perform public.oia_journaliser(p_espace, 'noter', 'notes', v_id::text);
  return v_id;
end $$;

-- Modifier une note : seulement la sienne.
create or replace function public.oia_modifier_note(p_note uuid, p_texte text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_actor text;
  v_uid uuid;
begin
  select espace_id, actor into v_espace, v_actor from public.notes where id = p_note;
  if v_espace is null then raise exception 'oia: note introuvable' using errcode = 'P0002'; end if;
  v_uid := public.oia_exiger_editeur(v_espace);
  if v_actor is distinct from v_uid::text then
    raise exception 'oia: on ne modifie que ses propres notes' using errcode = '42501';
  end if;
  update public.notes set text = p_texte where id = p_note;
  perform public.oia_journaliser(v_espace, 'modifier', 'notes', p_note::text);
end $$;

create or replace function public.oia_creer_tache(p_espace uuid, p_titre text, p_echeance date default null, p_record_id text default null, p_projet text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  insert into public.tasks (title, due, record_id, project_slug, actor, espace_id)
  values (p_titre, p_echeance, p_record_id, p_projet, v_uid::text, p_espace) returning id into v_id;
  perform public.oia_journaliser(p_espace, 'creer', 'tasks', v_id::text);
  return v_id;
end $$;

-- Basculer une tâche : seulement la sienne.
create or replace function public.oia_basculer_tache(p_tache uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_actor text;
  v_statut text;
  v_uid uuid;
begin
  select espace_id, actor, status into v_espace, v_actor, v_statut from public.tasks where id = p_tache;
  if v_espace is null then raise exception 'oia: tâche introuvable' using errcode = 'P0002'; end if;
  v_uid := public.oia_exiger_editeur(v_espace);
  if v_actor is distinct from v_uid::text then
    raise exception 'oia: on ne modifie que ses propres tâches' using errcode = '42501';
  end if;
  update public.tasks
     set status = case when status = 'OPEN' then 'DONE' else 'OPEN' end,
         completed_at = case when status = 'OPEN' then now() else null end
   where id = p_tache returning status into v_statut;
  perform public.oia_journaliser(v_espace, 'basculer', 'tasks', p_tache::text, jsonb_build_object('statut', v_statut));
  return v_statut;
end $$;

create or replace function public.oia_creer_contact(p_espace uuid, p_nom text, p_organisation text default null, p_role text default null,
  p_email text default null, p_telephone text default null, p_note text default null, p_record_id text default null, p_projet text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  insert into public.contacts (name, organisation, role, email, phone, note, record_id, project_slug, actor, espace_id)
  values (p_nom, p_organisation, p_role, p_email, p_telephone, p_note, p_record_id, p_projet, v_uid::text, p_espace) returning id into v_id;
  perform public.oia_journaliser(p_espace, 'creer', 'contacts', v_id::text);
  return v_id;
end $$;

create or replace function public.oia_enregistrer_vue(p_espace uuid, p_nom text, p_filtres jsonb, p_tri text, p_sens text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  insert into public.saved_views (name, filters, sort_field, sort_direction, espace_id)
  values (p_nom, coalesce(p_filtres, '{}'::jsonb), coalesce(p_tri, 'pubDate'), coalesce(p_sens, 'desc'), p_espace) returning id into v_id;
  perform public.oia_journaliser(p_espace, 'creer', 'saved_views', v_id::text, jsonb_build_object('par', v_uid));
  return v_id;
end $$;

create or replace function public.oia_acquitter_alerte(p_alerte uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_uid uuid;
begin
  select espace_id into v_espace from public.alerts where id = p_alerte;
  if v_espace is null then raise exception 'oia: alerte introuvable' using errcode = 'P0002'; end if;
  v_uid := public.oia_exiger_editeur(v_espace);
  update public.alerts set acknowledged_at = now(), acknowledged_by = v_uid::text where id = p_alerte and acknowledged_at is null;
  perform public.oia_journaliser(v_espace, 'acquitter', 'alerts', p_alerte::text);
end $$;

create or replace function public.oia_demander(p_espace uuid, p_type request_kind, p_charge jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_id uuid;
begin
  insert into public.requests (kind, payload, requested_by, espace_id)
  values (p_type, coalesce(p_charge, '{}'::jsonb), v_uid::text, p_espace) returning id into v_id;
  perform public.oia_journaliser(p_espace, 'demander', 'requests', v_id::text, jsonb_build_object('type', p_type));
  return v_id;
end $$;

-- Exécutables seulement par les comptes connectés ; l'appartenance est vérifiée dedans.
revoke execute on function public.oia_decider(uuid, text, text, text, boolean),
                           public.oia_etiqueter(uuid, text, text),
                           public.oia_noter(uuid, text, text, text),
                           public.oia_modifier_note(uuid, text),
                           public.oia_creer_tache(uuid, text, date, text, text),
                           public.oia_basculer_tache(uuid),
                           public.oia_creer_contact(uuid, text, text, text, text, text, text, text, text),
                           public.oia_enregistrer_vue(uuid, text, jsonb, text, text),
                           public.oia_acquitter_alerte(uuid),
                           public.oia_demander(uuid, request_kind, jsonb),
                           public.oia_exiger_editeur(uuid)
  from public, anon;
grant execute on function public.oia_decider(uuid, text, text, text, boolean),
                          public.oia_etiqueter(uuid, text, text),
                          public.oia_noter(uuid, text, text, text),
                          public.oia_modifier_note(uuid, text),
                          public.oia_creer_tache(uuid, text, date, text, text),
                          public.oia_basculer_tache(uuid),
                          public.oia_creer_contact(uuid, text, text, text, text, text, text, text, text),
                          public.oia_enregistrer_vue(uuid, text, jsonb, text, text),
                          public.oia_acquitter_alerte(uuid),
                          public.oia_demander(uuid, request_kind, jsonb)
  to authenticated;

commit;

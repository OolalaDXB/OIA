-- 0005 · Reprise du travail stocké dans le navigateur (mandat v8, A4, exigence 5)
-- Prérequis : 0003 et 0004.
--
-- Source : le fichier « sauvegarder » de la console (packages/workspace/src/store.ts,
-- kind « oia.workspace.backup », version 1), fait par Mickaël et conservé hors du
-- dépôt. Claude Code ne lit jamais le navigateur.
--
-- Garanties :
--   * transactionnel : la fonction s'exécute en une transaction, tout ou rien ;
--   * identifiants stables : l'identifiant du navigateur est gardé (id_origine),
--     unique par espace ;
--   * reprenable et sans doublon : relancer le même fichier n'ajoute rien ;
--   * sans perte : texte, dates, auteur d'origine et liens sont conservés ;
--   * réversible : chaque import a un identifiant, et oia_annuler_import
--     retire exactement ce qu'il a ajouté.

begin;

create table if not exists public.oia_import (
  id         uuid primary key default gen_random_uuid(),
  espace_id  uuid not null references public.oia_espace (id),
  user_id    uuid not null,
  exporte_le timestamptz,
  importe_le timestamptz not null default now(),
  bilan      jsonb not null default '{}'::jsonb,
  annule_le  timestamptz
);
alter table public.oia_import enable row level security;
drop policy if exists membres_lisent on public.oia_import;
create policy membres_lisent on public.oia_import for select to authenticated using (public.oia_est_membre(espace_id));
revoke all on public.oia_import from anon;
revoke insert, update, delete, truncate on public.oia_import from authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['reviews', 'notes', 'tasks', 'contacts', 'saved_views'] loop
    execute format('alter table public.%I add column if not exists id_origine text', t);
    execute format('alter table public.%I add column if not exists auteur_origine text', t);
    execute format('alter table public.%I add column if not exists import_id uuid references public.oia_import (id)', t);
    execute format('create unique index if not exists %I on public.%I (espace_id, id_origine) where id_origine is not null', t || '_origine_uidx', t);
  end loop;
end $$;
alter table public.project_tags add column if not exists import_id uuid references public.oia_import (id);

create or replace function public.oia_importer_sauvegarde(p_espace uuid, p_sauvegarde jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_import uuid := gen_random_uuid();
  v_data jsonb := p_sauvegarde -> 'data';
  n_dec int := 0; n_not int := 0; n_tac int := 0; n_con int := 0; n_vue int := 0; n_eti int := 0;
  v_bilan jsonb;
begin
  if p_sauvegarde ->> 'kind' is distinct from 'oia.workspace.backup' or (p_sauvegarde ->> 'version')::int is distinct from 1 then
    raise exception 'oia: fichier de sauvegarde non reconnu (kind oia.workspace.backup, version 1 attendus)' using errcode = '22023';
  end if;
  insert into public.oia_import (id, espace_id, user_id, exporte_le) values (v_import, p_espace, v_uid, (p_sauvegarde ->> 'exportedAt')::timestamptz);

  with ins as (
    insert into public.reviews (record_id, action, comment, at, actor, gate_pursue_eligible_at_decision, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'recordId', e ->> 'action', coalesce(e ->> 'comment', ''), (e ->> 'at')::timestamptz, v_uid::text,
           coalesce((e ->> 'gatePursueEligibleAtDecision')::boolean, false), p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(coalesce(v_data -> 'oia.audit.v1', '[]'::jsonb)) e
    where e ->> 'action' in ('APPROVE', 'REJECT', 'NEEDS_VERIFICATION', 'COMMENT')
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning 1)
  select count(*) into n_dec from ins;

  with ins as (
    insert into public.notes (text, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'text', e ->> 'recordId', e ->> 'projectSlug', (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(coalesce(v_data -> 'oia.notes.v1', '[]'::jsonb)) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning 1)
  select count(*) into n_not from ins;

  with ins as (
    insert into public.tasks (title, due, status, completed_at, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'title', (e ->> 'due')::date, coalesce(e ->> 'status', 'OPEN'), (e ->> 'completedAt')::timestamptz, e ->> 'recordId', e ->> 'projectSlug',
           (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(coalesce(v_data -> 'oia.tasks.v1', '[]'::jsonb)) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning 1)
  select count(*) into n_tac from ins;

  with ins as (
    insert into public.contacts (name, organisation, role, email, phone, note, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'name', e ->> 'organisation', e ->> 'role', e ->> 'email', e ->> 'phone', e ->> 'note', e ->> 'recordId', e ->> 'projectSlug',
           (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(coalesce(v_data -> 'oia.contacts.v1', '[]'::jsonb)) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning 1)
  select count(*) into n_con from ins;

  with ins as (
    insert into public.saved_views (name, kind, filters, sort_field, sort_direction, created_at, espace_id, id_origine, import_id)
    select e ->> 'name', coalesce(e ->> 'kind', 'OPPORTUNITY'), coalesce(e -> 'filters', '{}'::jsonb), coalesce(e ->> 'sortField', 'pubDate'),
           coalesce(e ->> 'sortDirection', 'desc'), coalesce((e ->> 'createdAt')::timestamptz, now()), p_espace, e ->> 'id', v_import
    from jsonb_array_elements(coalesce(v_data -> 'oia.views.v1', '[]'::jsonb)) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning 1)
  select count(*) into n_vue from ins;

  -- Étiquettes : une existante n'est jamais écrasée par un import.
  with ins as (
    insert into public.project_tags (espace_id, record_id, project_slug, actor, import_id)
    select p_espace, k, v #>> '{}', v_uid::text, v_import
    from jsonb_each(coalesce(v_data -> 'oia.tags.v1', '{}'::jsonb)) as x(k, v)
    where coalesce(v #>> '{}', '') <> ''
    on conflict (espace_id, record_id) do nothing
    returning 1)
  select count(*) into n_eti from ins;

  v_bilan := jsonb_build_object('import_id', v_import, 'decisions', n_dec, 'notes', n_not, 'taches', n_tac, 'contacts', n_con, 'vues', n_vue, 'etiquettes', n_eti);
  update public.oia_import set bilan = v_bilan where id = v_import;
  perform public.oia_journaliser(p_espace, 'importer', 'oia_import', v_import::text, v_bilan);
  return v_bilan;
end $$;

-- Retour arrière : retire exactement ce que cet import a ajouté. Par l'auteur de l'import ou le propriétaire.
create or replace function public.oia_annuler_import(p_import uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_auteur uuid;
  v_uid uuid;
  v_bilan jsonb;
  n int;
begin
  select espace_id, user_id into v_espace, v_auteur from public.oia_import where id = p_import and annule_le is null;
  if v_espace is null then raise exception 'oia: import introuvable ou déjà annulé' using errcode = 'P0002'; end if;
  v_uid := public.oia_exiger_editeur(v_espace);
  if v_uid <> v_auteur and public.oia_role(v_espace) <> 'proprietaire' then
    raise exception 'oia: seul l''auteur de l''import ou le propriétaire peut l''annuler' using errcode = '42501';
  end if;
  v_bilan := '{}'::jsonb;
  delete from public.reviews where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('decisions', n);
  delete from public.notes where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('notes', n);
  delete from public.tasks where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('taches', n);
  delete from public.contacts where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('contacts', n);
  delete from public.saved_views where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('vues', n);
  delete from public.project_tags where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('etiquettes', n);
  update public.oia_import set annule_le = now() where id = p_import;
  perform public.oia_journaliser(v_espace, 'annuler_import', 'oia_import', p_import::text, v_bilan);
  return v_bilan;
end $$;

revoke execute on function public.oia_importer_sauvegarde(uuid, jsonb), public.oia_annuler_import(uuid) from public, anon;
grant execute on function public.oia_importer_sauvegarde(uuid, jsonb), public.oia_annuler_import(uuid) to authenticated;

commit;

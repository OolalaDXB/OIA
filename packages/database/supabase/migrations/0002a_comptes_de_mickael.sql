-- 0002a · Tables d'OIA réservées aux comptes de Mickaël.
-- Décision de Mickaël du 2026-11-08. Part de l'état déployé (0002) et se place
-- avant 0003, qui attend l'application Lovable. Fichier seulement : Mickaël
-- l'applique lui-même.
--
-- Ce que fait cette migration :
--  * une table `oia_compte_autorise`, remplie ici en lisant `auth.users` par
--    e-mail, en lecture seule (aucune écriture dans `auth`) ;
--  * chaque politique « authenticated … true » de 0002 est remplacée par la
--    même politique, mêmes commandes et mêmes conditions, limitée à ces
--    comptes. La console garde exactement ses droits ; tout autre compte
--    connecté ne lit ni n'écrit plus rien. Le rôle de service (workers) n'est
--    pas concerné.
--
-- Les e-mails ne sont pas écrits dans ce fichier (dépôt) : ils se donnent au
-- moment de l'application, dans la même exécution, par exemple dans l'éditeur
-- SQL de Supabase :
--
--   select set_config('oia.comptes_mickael', 'premier@exemple, second@exemple', false);
--   -- puis le contenu de ce fichier
--
-- Tout se passe dans une transaction : un e-mail introuvable, et rien ne change.
-- Rejouable : relancer avec les mêmes e-mails ne change rien.
-- Retour arrière : packages/database/supabase/migrations/README.md.

begin;

create table if not exists public.oia_compte_autorise (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);
alter table public.oia_compte_autorise enable row level security;
-- Aucune politique, aucun droit : la liste ne se lit ni ne s'écrit par l'API.
revoke all on public.oia_compte_autorise from public, anon, authenticated;

-- Remplissage par e-mail, en lecture seule sur auth.users.
do $$
declare
  courriels text[];
  attendus  int;
  trouves   int;
begin
  courriels := array(
    select distinct lower(btrim(x))
    from unnest(string_to_array(coalesce(current_setting('oia.comptes_mickael', true), ''), ',')) x
    where btrim(x) <> ''
  );
  attendus := cardinality(courriels);
  if attendus = 0 then
    raise exception 'indiquer les e-mails des comptes de Mickaël : select set_config(''oia.comptes_mickael'', ''…'', false)'
      using errcode = '22023';
  end if;
  select count(*) into trouves from auth.users u where lower(u.email) = any(courriels);
  if trouves <> attendus then
    raise exception 'comptes introuvables : % trouvé(s) pour % e-mail(s) ; rien n''est appliqué', trouves, attendus
      using errcode = 'P0002';
  end if;
  insert into public.oia_compte_autorise (user_id)
  select u.id from auth.users u where lower(u.email) = any(courriels)
  on conflict (user_id) do nothing;
end $$;

-- Vrai si l'appelant est un compte de Mickaël. Security definer : la liste
-- reste illisible par l'appelant.
create or replace function public.oia_compte_de_mickael() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.oia_compte_autorise where user_id = auth.uid())
$$;
revoke all on function public.oia_compte_de_mickael() from public, anon;
grant execute on function public.oia_compte_de_mickael() to authenticated;

-- Politiques de 0002, retirées une par une.
drop policy if exists "authenticated read"           on public.watch_opportunities;
drop policy if exists "authenticated read"           on public.watch_events;
drop policy if exists "authenticated read"           on public.watch_runs;
drop policy if exists "authenticated read"           on public.link_checks;
drop policy if exists "authenticated read"           on public.alerts;
drop policy if exists "authenticated acknowledge"    on public.alerts;
drop policy if exists "authenticated read"           on public.reviews;
drop policy if exists "authenticated append"         on public.reviews;
drop policy if exists "authenticated all"            on public.project_tags;
drop policy if exists "authenticated all"            on public.notes;
drop policy if exists "authenticated all"            on public.tasks;
drop policy if exists "authenticated all"            on public.contacts;
drop policy if exists "authenticated all"            on public.saved_views;
drop policy if exists "authenticated read"           on public.requests;
drop policy if exists "authenticated ask"            on public.requests;
drop policy if exists "authenticated read"           on public.project_drafts;
drop policy if exists "authenticated draft"          on public.project_drafts;
drop policy if exists "authenticated edit own draft" on public.project_drafts;

-- Mêmes politiques, réservées aux comptes de Mickaël (rejouable).
do $$
declare t text;
begin
  for t in select unnest(array['watch_opportunities', 'watch_events', 'watch_runs', 'link_checks', 'alerts', 'reviews', 'requests', 'project_drafts']) loop
    execute format('drop policy if exists "mickael read" on public.%I', t);
    execute format('create policy "mickael read" on public.%I for select to authenticated using (public.oia_compte_de_mickael())', t);
  end loop;
  for t in select unnest(array['project_tags', 'notes', 'tasks', 'contacts', 'saved_views']) loop
    execute format('drop policy if exists "mickael all" on public.%I', t);
    execute format('create policy "mickael all" on public.%I for all to authenticated using (public.oia_compte_de_mickael()) with check (public.oia_compte_de_mickael())', t);
  end loop;
end $$;

drop policy if exists "mickael acknowledge" on public.alerts;
create policy "mickael acknowledge" on public.alerts for update to authenticated
  using (public.oia_compte_de_mickael()) with check (public.oia_compte_de_mickael());

-- Décisions toujours en ajout seul : aucune politique de modification ni de suppression.
drop policy if exists "mickael append" on public.reviews;
create policy "mickael append" on public.reviews for insert to authenticated
  with check (public.oia_compte_de_mickael());

drop policy if exists "mickael ask" on public.requests;
create policy "mickael ask" on public.requests for insert to authenticated
  with check (public.oia_compte_de_mickael() and status = 'QUEUED'::request_status);

drop policy if exists "mickael draft" on public.project_drafts;
create policy "mickael draft" on public.project_drafts for insert to authenticated
  with check (public.oia_compte_de_mickael() and status = 'PENDING');
drop policy if exists "mickael edit own draft" on public.project_drafts;
create policy "mickael edit own draft" on public.project_drafts for update to authenticated
  using (public.oia_compte_de_mickael() and status = 'PENDING')
  with check (public.oia_compte_de_mickael() and status = 'PENDING');

commit;

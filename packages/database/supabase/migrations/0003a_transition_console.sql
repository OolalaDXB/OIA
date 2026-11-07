-- 0003a · TRANSITOIRE · la console actuelle garde ses écritures directes.
-- Mandat v9, bloc A2 (« Compatibilité de la console actuelle »).
--
-- 0003 retire aux rôles applicatifs toute écriture directe dans les tables
-- d'OIA : seules les fonctions `oia_*` écrivent. La console en ligne
-- (apps/web/src/lib/remoteWorkspace.ts, watchData.ts, pages projets) écrit
-- encore directement. Jusqu'à la validation du cockpit Lovable par Mickaël,
-- cette migration rend à la console exactement les écritures de 0002a, et à
-- personne d'autre :
--   * réservées aux PROPRIÉTAIRES de l'espace de la ligne (`oia_membre`,
--     `auth.uid()`), c'est-à-dire aux comptes de Mickaël : même modèle
--     d'appartenance que le reste de la base, aucune liste à part ;
--   * mêmes commandes et mêmes conditions que 0002a (décisions en ajout seul,
--     demandes `QUEUED`, brouillons `PENDING`, acquittement des alertes) ;
--   * aucune écriture directe dans les tables nouvelles (ml_*, oia_*, vis*,
--     shy_*) : celles-là ne s'écrivent que par fonctions.
--
-- Toutes les politiques et tous les droits rendus portent le préfixe
-- « transitoire console ». À RETIRER après validation du cockpit Lovable :
--
--   begin;
--   do $$ declare t text; p text; begin
--     for t, p in select tablename, policyname from pg_policies
--                 where schemaname = 'public' and policyname like 'transitoire console%'
--     loop execute format('drop policy %I on public.%I', p, t); end loop;
--   end $$;
--   revoke insert, update, delete on public.reviews, public.project_tags, public.notes, public.tasks,
--     public.contacts, public.saved_views, public.alerts, public.requests, public.project_drafts from authenticated;
--   commit;
--
-- Retire aussi la liste d'amorçage de 0002a (`oia_compte_autorise`) et sa
-- fonction, devenues inutiles : l'appartenance ne se lit plus que dans
-- `oia_membre`. Rejouable.

begin;

create or replace function public.oia_proprietaire(p_espace uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.oia_role(p_espace) = 'proprietaire', false)
$$;
revoke all on function public.oia_proprietaire(uuid) from public, anon;
grant execute on function public.oia_proprietaire(uuid) to authenticated;

-- Droits de table rendus, au plus juste des opérations de la console.
grant insert                 on public.reviews       to authenticated;
grant insert, update, delete on public.project_tags  to authenticated;
grant insert, update, delete on public.notes         to authenticated;
grant insert, update, delete on public.tasks         to authenticated;
grant insert, update, delete on public.contacts      to authenticated;
grant insert, update, delete on public.saved_views   to authenticated;
grant update                 on public.alerts        to authenticated;
grant insert                 on public.requests      to authenticated;
grant insert, update         on public.project_drafts to authenticated;

do $$
declare t text;
begin
  foreach t in array array['project_tags', 'notes', 'tasks', 'contacts', 'saved_views'] loop
    execute format('drop policy if exists "transitoire console ecrit" on public.%I', t);
    execute format('create policy "transitoire console ecrit" on public.%I for all to authenticated '
                   'using (public.oia_proprietaire(espace_id)) with check (public.oia_proprietaire(espace_id))', t);
  end loop;
end $$;

drop policy if exists "transitoire console acquitte" on public.alerts;
create policy "transitoire console acquitte" on public.alerts for update to authenticated
  using (public.oia_proprietaire(espace_id)) with check (public.oia_proprietaire(espace_id));

-- Décisions toujours en ajout seul.
drop policy if exists "transitoire console decide" on public.reviews;
create policy "transitoire console decide" on public.reviews for insert to authenticated
  with check (public.oia_proprietaire(espace_id));

drop policy if exists "transitoire console demande" on public.requests;
create policy "transitoire console demande" on public.requests for insert to authenticated
  with check (public.oia_proprietaire(espace_id) and status = 'QUEUED'::request_status);

drop policy if exists "transitoire console brouillon" on public.project_drafts;
create policy "transitoire console brouillon" on public.project_drafts for insert to authenticated
  with check (public.oia_proprietaire(espace_id) and status = 'PENDING');
drop policy if exists "transitoire console modifie brouillon" on public.project_drafts;
create policy "transitoire console modifie brouillon" on public.project_drafts for update to authenticated
  using (public.oia_proprietaire(espace_id) and status = 'PENDING')
  with check (public.oia_proprietaire(espace_id) and status = 'PENDING');

comment on function public.oia_proprietaire(uuid) is
  'Vrai si l''appelant est propriétaire de l''espace (oia_membre, auth.uid()). Sert aux politiques « transitoire console » et à Shyrka.';

-- Un seul modèle d'appartenance : la liste de 0002a a servi à amorcer
-- oia_membre (0003) et n'est plus lue par aucune politique. On la retire, après
-- avoir vérifié que le studio a bien ses propriétaires.
do $$
begin
  if to_regclass('public.oia_compte_autorise') is not null then
    if exists (select 1 from public.oia_compte_autorise a
               where not exists (select 1 from public.oia_membre m
                                 where m.user_id = a.user_id and m.espace_id = '00000000-0000-4000-8000-000000000001' and m.role = 'proprietaire')) then
      raise exception '0003a: un compte de 0002a n''est pas propriétaire du studio ; rien n''est appliqué' using errcode = 'P0002';
    end if;
    drop function if exists public.oia_compte_de_mickael();
    drop table public.oia_compte_autorise;
  end if;
end $$;

commit;

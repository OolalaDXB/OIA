-- A3 (mandat v9) · DONNÉES, pas de structure : les comptes propriétaires du
-- studio (oia_membre, amorcés par 0002a puis 0003) deviennent propriétaires
-- (`owner`) des clients Visibility « oia » (client interne d'OIA) et
-- « coach-gari ». Aucun identifiant ni e-mail dans ce fichier : ils sont lus
-- en base. Rejouable, en une transaction.

begin;

insert into vis.client (id, display_name, ownership, status, default_repo_action_mode)
values ('oia', 'OIA', 'internal', 'active', 'lecture'),
       ('coach-gari', 'Coach Gari', 'internal', 'active', 'lecture')
on conflict (id) do nothing;

insert into vis.client_member (user_id, client_id, role)
select m.user_id::text, c.id, 'owner'
from public.oia_membre m
cross join (values ('oia'), ('coach-gari')) as c(id)
where m.espace_id = '00000000-0000-4000-8000-000000000001' and m.role = 'proprietaire'
on conflict (user_id, client_id) do update set role = 'owner';

do $$
begin
  if (select count(*) from vis.client_member where client_id in ('oia', 'coach-gari') and role = 'owner') < 2 then
    raise exception 'A3: aucun propriétaire du studio à rattacher ; rien n''est appliqué' using errcode = 'P0002';
  end if;
end $$;

commit;

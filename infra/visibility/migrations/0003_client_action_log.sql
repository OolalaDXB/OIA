-- OIA Visibility · C1 · modèle client/site/sujet (complet) + journal d'actions
-- persistant (vis.action_log). Les tables vis.client / vis.site / vis.subject
-- et la RLS par client existent depuis 0001_evidence.sql. C1 ajoute :
--  * `vis.action_log` pour le journal d'actions SEO Command (E5), persistant.
--  * `vis.client_summary(text) returns jsonb security definer` : fonction
--    d'exemple, correctement gardée, qui lit les totaux d'un client en
--    assumant que l'appelant a déjà fait `set local vis.client_id = ?`.
--    Un test prouve qu'elle ne fuit rien entre clients.
create schema if not exists vis;

create table if not exists vis.action_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  who        text not null,
  what       text not null,
  client_id  text not null references vis.client(id) on delete restrict,
  subject_id text          references vis.subject(id) on delete restrict,
  mission_id text,
  cost_usd   numeric(10,6),
  details    jsonb not null default '{}'::jsonb
);

create index if not exists action_log_client_idx on vis.action_log(client_id, at desc);

alter table vis.action_log enable row level security;
drop policy if exists tenant_isolation on vis.action_log;
create policy tenant_isolation on vis.action_log
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create or replace function vis.action_log_block_mutation()
returns trigger as $$
begin
  raise exception 'vis.action_log est append-only : % refusée',
    tg_op using errcode = 'read_only_sql_transaction';
end;
$$ language plpgsql;

drop trigger if exists action_log_block_update on vis.action_log;
create trigger action_log_block_update
  before update on vis.action_log
  for each row execute function vis.action_log_block_mutation();

drop trigger if exists action_log_block_delete on vis.action_log;
create trigger action_log_block_delete
  before delete on vis.action_log
  for each row execute function vis.action_log_block_mutation();

-- `vis.client_summary` : lit les totaux PUBLICS d'un client (nombre de
-- preuves, nombre de missions). `security definer` + `set search_path`
-- figé + lecture seule. **Ne retourne rien hors du client passé en paramètre.**
-- Un test prouve qu'un appel avec un client_id différent de celui du GUC
-- échoue explicitement (pas de fuite silencieuse).
create or replace function vis.client_summary(target_client text)
returns jsonb
language plpgsql
stable
security definer
set search_path = vis, pg_catalog
as $$
declare
  caller_client text;
  result        jsonb;
begin
  caller_client := vis.current_client_id();
  if caller_client is null then
    raise exception 'vis.client_summary refusée : vis.client_id non défini' using errcode = 'insufficient_privilege';
  end if;
  if caller_client <> target_client then
    raise exception 'vis.client_summary refusée : scope du caller (%) ≠ target (%)',
      caller_client, target_client using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'client_id', target_client,
    'evidence_count', (select count(*) from vis.evidence where client_id = target_client),
    'subject_count',  (select count(*) from vis.subject  where client_id = target_client)
  ) into result;
  return result;
end;
$$;

-- Retirer les droits par défaut (`public`) ; n'autoriser que les rôles utiles.
revoke all on function vis.client_summary(text) from public;

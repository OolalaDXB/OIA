-- OIA Visibility · E3 · journal de décision (proposition, schéma à valider).
--
-- Chaque ligne est un évènement immutable : recommandation, décision,
-- exécution (PR ou commit), vérification après déploiement, rattachement à une
-- remesure. Append-only via les mêmes gardes que A5.
--
-- Pré-requis : la migration 0001_evidence.sql est appliquée (schema `vis`).
create schema if not exists vis;

create table if not exists vis.recommendation (
  id            text primary key check (id ~ '^rec-[a-z0-9-]{6,}$'),
  client_id     text not null references vis.client(id)  on delete restrict,
  site_id       text          references vis.site(id)    on delete restrict,
  subject_id    text not null references vis.subject(id) on delete restrict,
  window_id     text          references vis.window(id)  on delete restrict,
  type          text not null check (type in ('FIX_FACT','CONTENT_GAP','ENTITY_INCONSISTENCY','SOURCE_TARGET','TECH_FIX','WATCH')),
  title         text not null,
  statement     text not null,
  impact_level  text not null check (impact_level in ('low','medium','high')),
  effort_level  text not null check (effort_level in ('XS','S','M','L','XL')),
  risk          text not null check (risk in ('low','medium','high')),
  confidence    text not null check (confidence in ('low','medium','high')),
  fix_kind      text,
  fix_generator text,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  payload       jsonb not null  -- JSON intégral conforme à recommendation.schema.json
);

create index if not exists recommendation_subject_idx on vis.recommendation(subject_id);
create index if not exists recommendation_client_idx  on vis.recommendation(client_id);

alter table vis.recommendation enable row level security;
drop policy if exists tenant_isolation on vis.recommendation;
create policy tenant_isolation on vis.recommendation
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create or replace function vis.recommendation_block_mutation()
returns trigger as $$
begin
  raise exception 'vis.recommendation est append-only : % refusée',
    tg_op using errcode = 'read_only_sql_transaction';
end;
$$ language plpgsql;

drop trigger if exists recommendation_block_update on vis.recommendation;
create trigger recommendation_block_update
  before update on vis.recommendation
  for each row execute function vis.recommendation_block_mutation();

drop trigger if exists recommendation_block_delete on vis.recommendation;
create trigger recommendation_block_delete
  before delete on vis.recommendation
  for each row execute function vis.recommendation_block_mutation();

-- Décisions : append-only. Une décision écrase logiquement la précédente
-- mais ne la supprime jamais ; la plus récente (`decided_at`, rang par n°)
-- fait foi.
create table if not exists vis.decision (
  id             bigserial primary key,
  recommendation_id text not null references vis.recommendation(id) on delete restrict,
  status         text not null check (status in ('pending','accepted','rejected','obsolete')),
  decided_by     text not null,
  decided_at     timestamptz not null default now(),
  reason         text,
  client_id      text not null references vis.client(id)
);
create index if not exists decision_rec_idx on vis.decision(recommendation_id, decided_at desc);

alter table vis.decision enable row level security;
drop policy if exists tenant_isolation on vis.decision;
create policy tenant_isolation on vis.decision
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create or replace function vis.decision_block_mutation()
returns trigger as $$
begin
  raise exception 'vis.decision est append-only : % refusée',
    tg_op using errcode = 'read_only_sql_transaction';
end;
$$ language plpgsql;

drop trigger if exists decision_block_update on vis.decision;
create trigger decision_block_update
  before update on vis.decision
  for each row execute function vis.decision_block_mutation();

drop trigger if exists decision_block_delete on vis.decision;
create trigger decision_block_delete
  before delete on vis.decision
  for each row execute function vis.decision_block_mutation();

-- Exécutions : commit / PR fusionnée.
create table if not exists vis.execution (
  id            bigserial primary key,
  recommendation_id text not null references vis.recommendation(id) on delete restrict,
  client_id     text not null references vis.client(id),
  kind          text not null check (kind in ('pr-opened','pr-merged','commit','rollback')),
  ref           text not null,  -- URL de la PR, SHA du commit, etc.
  happened_at   timestamptz not null default now(),
  payload       jsonb not null default '{}'::jsonb
);
create index if not exists execution_rec_idx on vis.execution(recommendation_id, happened_at desc);

alter table vis.execution enable row level security;
drop policy if exists tenant_isolation on vis.execution;
create policy tenant_isolation on vis.execution
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create or replace function vis.execution_block_mutation()
returns trigger as $$
begin
  raise exception 'vis.execution est append-only : % refusée',
    tg_op using errcode = 'read_only_sql_transaction';
end;
$$ language plpgsql;

drop trigger if exists execution_block_update on vis.execution;
create trigger execution_block_update
  before update on vis.execution
  for each row execute function vis.execution_block_mutation();

drop trigger if exists execution_block_delete on vis.execution;
create trigger execution_block_delete
  before delete on vis.execution
  for each row execute function vis.execution_block_mutation();

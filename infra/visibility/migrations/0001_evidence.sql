-- OIA Visibility · A5 · table des preuves (proposition, schéma à valider).
--
-- Objectifs :
--  * ajout seul (un trigger refuse UPDATE et DELETE) ;
--  * empreinte SHA-256 calculée côté serveur sur le texte brut (impossible à
--    trafiquer côté client) ;
--  * isolation client / sujet via RLS, policies alignées sur le contrat
--    src/tenancy.ts (client_id, site_id nullable, subject_id) ;
--  * fenêtres de mesure + jours manquants, côté métadonnées.
--
-- Rôles attendus (créés dans le fichier d'install, pas ici) :
--  * oia_vis_app  : identité de l'application (utilisée pour INSERT).
--                   NE DOIT PAS avoir BYPASSRLS.
--  * oia_vis_ro   : lecture seule, pour le reporting.
--  * oia_vis_admin: super-utilisateur du schéma, uniquement pour les migrations.
--
-- Cette migration ne touche que son schéma dédié (`vis`). Elle ne modifie
-- aucune table existante. Elle est pensée pour être rejouable (`IF NOT EXISTS`).

create schema if not exists vis;

create extension if not exists pgcrypto;

-- Clients : réplique en base du contrat `Client` de src/tenancy.ts. Les
-- colonnes nécessaires à la RLS sont normalisées ; le reste (monthly budget,
-- contacts) est stocké en JSONB pour accélérer les évolutions tant que le
-- schéma n'est pas gelé.
create table if not exists vis.client (
  id            text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name  text not null,
  ownership     text not null check (ownership in ('internal','external')),
  status        text not null check (status in ('active','paused','archived')),
  default_repo_action_mode text not null
    check (default_repo_action_mode in ('lecture','proposition','direct')),
  monthly_budget_usd numeric(10,2) not null default 0 check (monthly_budget_usd >= 0),
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- A client of type "external" cannot inherit default_repo_action_mode=direct
-- (défense en profondeur ; checkTenancy() côté TS refuse aussi).
alter table vis.client drop constraint if exists client_external_not_direct;
alter table vis.client add constraint client_external_not_direct
  check (ownership = 'internal' or default_repo_action_mode <> 'direct');

create table if not exists vis.site (
  id             text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  client_id      text not null references vis.client(id) on delete restrict,
  primary_url    text not null check (primary_url like 'https://%'),
  additional_urls jsonb not null default '[]'::jsonb,
  status         text not null check (status in ('active','paused','archived')),
  repo_url       text,
  repo_branch    text not null default 'main',
  repo_action_mode text check (repo_action_mode in ('lecture','proposition','direct')),
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists site_client_idx on vis.site(client_id);

create table if not exists vis.subject (
  id         text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  client_id  text not null references vis.client(id) on delete restrict,
  status     text not null check (status in ('draft','active','paused','archived')),
  extra      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subject_client_idx on vis.subject(client_id);

-- Composite uniqueness: needed by the FK on vis.evidence(subject_id, client_id)
-- to guarantee a subject's client cannot change under its evidence.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subject_id_client_uk' and conrelid = 'vis.subject'::regclass
  ) then
    execute 'alter table vis.subject add constraint subject_id_client_uk unique (id, client_id)';
  end if;
end $$;

-- Attache un sujet à un ou plusieurs sites (le même client partout).
create table if not exists vis.subject_site (
  subject_id text not null references vis.subject(id) on delete restrict,
  site_id    text not null references vis.site(id)    on delete restrict,
  primary key (subject_id, site_id)
);

-- Fenêtre de mesure (baseline, follow-up).
create table if not exists vis.window (
  id           text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  subject_id   text not null references vis.subject(id) on delete restrict,
  kind         text not null check (kind in ('baseline','follow-up')),
  panel_version int not null check (panel_version >= 1),
  status       text not null check (status in ('planned','running','done','aborted')),
  starts_on    date,
  ends_on      date,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists window_subject_idx on vis.window(subject_id);

-- Jours manquants d'une fenêtre (reason obligatoire).
create table if not exists vis.window_missing_day (
  window_id text not null references vis.window(id) on delete restrict,
  missing_on date not null,
  reason     text not null check (char_length(reason) >= 3),
  primary key (window_id, missing_on)
);

-- Table des preuves : chaque ligne est UNE réponse brute d'un moteur à une
-- question, à un instant donné, telle que la collecte l'a reçue.
--  * engine : identifiant Elmo ou alias ("chatgpt","claude","gemini","perplexity","mistral","chatgpt-app",…) ;
--  * collector_name : "elmo","oia-direct","manual" (voir Collector dans src/collector.ts) ;
--  * raw_text : texte brut reçu, jamais modifié ;
--  * raw_sha256 : empreinte calculée côté serveur, voir trigger ci-dessous ;
--  * tenancy : (client_id, site_id, subject_id) obligatoires pour la RLS.
create table if not exists vis.evidence (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references vis.client(id)  on delete restrict,
  site_id          text          references vis.site(id)    on delete restrict,
  subject_id       text not null references vis.subject(id) on delete restrict,
  window_id        text not null references vis.window(id)  on delete restrict,
  prompt_id        text not null,
  prompt_version   int  not null check (prompt_version >= 1),
  prompt_language  text not null check (prompt_language ~ '^[a-z]{2}$'),
  engine           text not null,
  engine_version   text,
  collector_name   text not null,
  collector_run_id text,
  received_at      timestamptz not null default now(),
  observed_on      date generated always as ((received_at at time zone 'UTC')::date) stored,
  raw_text         text not null check (char_length(raw_text) >= 1),
  raw_sha256       bytea not null,            -- rempli par le trigger
  structured       jsonb not null default '{}'::jsonb,
  citations        jsonb not null default '[]'::jsonb,
  cost_usd         numeric(10,6) not null default 0 check (cost_usd >= 0),
  constraint evidence_subject_belongs_to_client
    foreign key (subject_id, client_id)
    references vis.subject(id, client_id)
    deferrable initially deferred
);
-- subject_id_client_uk est posé plus haut, juste après la création de vis.subject.

create index if not exists evidence_subject_day_idx on vis.evidence(subject_id, observed_on);
create index if not exists evidence_window_idx      on vis.evidence(window_id);
create index if not exists evidence_client_idx      on vis.evidence(client_id);

-- Empreinte serveur : impossible de poser un raw_sha256 incohérent avec le
-- raw_text. Le trigger écrase toute valeur fournie côté client.
create or replace function vis.evidence_set_hash()
returns trigger as $$
begin
  new.raw_sha256 := digest(new.raw_text, 'sha256');
  return new;
end;
$$ language plpgsql;

drop trigger if exists evidence_set_hash on vis.evidence;
create trigger evidence_set_hash
  before insert on vis.evidence
  for each row execute function vis.evidence_set_hash();

-- Immutabilité : aucune UPDATE, aucune DELETE n'est acceptée. La trace reste
-- lisible pour toujours ; une erreur humaine se corrige par une nouvelle
-- ligne qui pointe la précédente via `structured.corrects_id`.
create or replace function vis.evidence_block_mutation()
returns trigger as $$
begin
  raise exception 'vis.evidence est append-only : % refusée',
    tg_op using errcode = 'read_only_sql_transaction';
end;
$$ language plpgsql;

drop trigger if exists evidence_block_update on vis.evidence;
create trigger evidence_block_update
  before update on vis.evidence
  for each row execute function vis.evidence_block_mutation();

drop trigger if exists evidence_block_delete on vis.evidence;
create trigger evidence_block_delete
  before delete on vis.evidence
  for each row execute function vis.evidence_block_mutation();

-- RLS : le client en cours est annoncé par la session via
-- `SET LOCAL vis.client_id = 'x'`. L'app (oia_vis_app) et le lecteur
-- (oia_vis_ro) sont soumis à la policy ; seul oia_vis_admin peut lire
-- en travers (pour les migrations).
alter table vis.evidence  enable row level security;
alter table vis.subject   enable row level security;
alter table vis.site      enable row level security;
alter table vis.window    enable row level security;
alter table vis.subject_site enable row level security;
alter table vis.window_missing_day enable row level security;

create or replace function vis.current_client_id() returns text
language sql stable as $$
  select nullif(current_setting('vis.client_id', true), '')
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'evidence','subject','site','window','subject_site','window_missing_day'
  ])
  loop
    execute format('drop policy if exists tenant_isolation on vis.%I', t);
  end loop;
end $$;

create policy tenant_isolation on vis.evidence
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create policy tenant_isolation on vis.subject
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create policy tenant_isolation on vis.site
  for all
  using  (client_id = vis.current_client_id())
  with check (client_id = vis.current_client_id());

create policy tenant_isolation on vis.window
  for all
  using  (exists (select 1 from vis.subject s where s.id = vis.window.subject_id and s.client_id = vis.current_client_id()))
  with check (exists (select 1 from vis.subject s where s.id = vis.window.subject_id and s.client_id = vis.current_client_id()));

create policy tenant_isolation on vis.subject_site
  for all
  using  (exists (select 1 from vis.subject s where s.id = vis.subject_site.subject_id and s.client_id = vis.current_client_id()))
  with check (exists (select 1 from vis.subject s where s.id = vis.subject_site.subject_id and s.client_id = vis.current_client_id()));

create policy tenant_isolation on vis.window_missing_day
  for all
  using  (exists (select 1 from vis.window w join vis.subject s on s.id = w.subject_id where w.id = vis.window_missing_day.window_id and s.client_id = vis.current_client_id()))
  with check (exists (select 1 from vis.window w join vis.subject s on s.id = w.subject_id where w.id = vis.window_missing_day.window_id and s.client_id = vis.current_client_id()));

-- `vis.client` n'est pas RLS-isolée : c'est la table qui permet à un
-- admin de voir la liste. L'app ne peut pas la lire (lecture refusée par
-- défaut car on ne lui donne pas de GRANT SELECT). Le reporting lit via
-- oia_vis_ro, en se scopant à son client.

comment on table  vis.evidence is 'Réponses brutes IA. Append-only. Empreinte SHA-256 côté serveur. RLS par client.';
comment on column vis.evidence.raw_sha256 is 'digest(sha256) calculé par trigger vis.evidence_set_hash (bytea 32).';

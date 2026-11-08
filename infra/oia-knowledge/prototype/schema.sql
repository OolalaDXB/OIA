-- OIA Knowledge Engine · prototype comparatif, version 2 (ADR 0005 proposée, non appliquée).
-- Index, références et extraits autorisés ; jamais une copie des bases métier.
-- Droits appliqués par la base (RLS) AVANT tout classement : un rôle ne voit
-- que les compartiments que lui accorde ke.droits, qu'il ne peut pas modifier.

create extension if not exists vector;

drop schema if exists ke cascade;
create schema ke;

create table ke.source (
  id             text primary key,
  connecteur     text not null check (connecteur in ('depot-git', 'fichiers', 'supabase', 'app-oolala', 'conversation', 'public')),
  uri            text not null,                 -- référence vers la source de vérité
  compartiment   text not null,
  classification text not null check (classification in ('interne', 'mickael_seulement')),
  version        text not null,
  date_source    timestamptz not null,
  indexe_le      timestamptz not null default now()
);

create table ke.extrait (
  id             bigserial primary key,
  source_id      text not null references ke.source (id) on delete cascade,  -- révocation : tout disparaît avec la source
  compartiment   text not null,
  classification text not null,
  titre          text not null,
  section        text not null,
  ligne          int not null,
  texte          text not null,
  identifiants   text[] not null default '{}',  -- identifiants exacts (vues SQL, fichiers, migrations, décisions)
  tsv_fr         tsvector generated always as (to_tsvector('french', titre || ' ' || section || ' ' || texte)) stored,
  tsv_simple     tsvector generated always as (to_tsvector('simple', titre || ' ' || section || ' ' || texte)) stored,
  embedding      vector(1024) not null,
  date_source    timestamptz not null
);
create index extrait_tsv_fr on ke.extrait using gin (tsv_fr);
create index extrait_tsv_simple on ke.extrait using gin (tsv_simple);
create index extrait_identifiants on ke.extrait using gin (identifiants);
create index extrait_embedding on ke.extrait using hnsw (embedding vector_cosine_ops) with (m = 24, ef_construction = 200);
create index extrait_source on ke.extrait (source_id);
create index extrait_compartiment on ke.extrait (compartiment);

-- Requête lexicale : mots porteurs reliés par OU (un ET exigerait tous les mots).
create or replace function public.ke_ou(cfg regconfig, q text) returns tsquery
language sql immutable as $$
  select nullif(replace(plainto_tsquery(cfg, q)::text, ' & ', ' | '), '')::tsquery
$$;
grant execute on function public.ke_ou(regconfig, text) to public;

-- Empreintes des sources révoquées ; un déclencheur refuse leur retour, quel que soit le connecteur.
-- lsn : position du journal (WAL) à la révocation ; tout segment antérieur doit disparaître (purger.sh).
-- purge_le, preuve : purge physique faite et sa preuve (fichiers réécrits, WAL, sauvegardes), sans le texte.
create table ke.revocation (
  empreinte  text primary key,
  revoque_le timestamptz not null default now(),
  motif      text not null,
  lsn        pg_lsn not null default pg_current_wal_lsn(),
  purge_le   timestamptz,
  preuve     jsonb
);
create function ke.refuser_revoquee() returns trigger language plpgsql as $$
begin
  if exists (select 1 from ke.revocation where empreinte = encode(sha256(new.uri::bytea), 'hex')) then
    raise exception 'ke: source révoquée, réindexation refusée' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger source_non_revoquee before insert or update of uri on ke.source for each row execute function ke.refuser_revoquee();

-- Droits par rôle (Shyrka, agents) ; écrits par l'administrateur seulement.
create table ke.droits (
  role           text primary key,
  compartiments  text[] not null,
  modele_externe boolean not null default false  -- un rôle qui alimente un modèle externe ne lit jamais « mickael_seulement »
);

-- Droits du rôle connecté, lus par une fonction de confiance (les agents ne lisent pas ke.droits).
-- session_user et non current_user : dans une fonction security definer, current_user est son propriétaire.
create function ke.mes_compartiments() returns text[]
language sql stable security definer set search_path = ke, pg_temp as $$
  select coalesce((select compartiments from ke.droits where role = session_user), '{}')
$$;
create function ke.lit_le_prive() returns boolean
language sql stable security definer set search_path = ke, pg_temp as $$
  select coalesce((select not modele_externe from ke.droits where role = session_user), false)
$$;

alter table ke.extrait enable row level security;
alter table ke.source enable row level security;
create policy lecture_autorisee on ke.extrait for select
  using (compartiment = any (ke.mes_compartiments()) and (classification = 'interne' or ke.lit_le_prive()));
create policy lecture_autorisee on ke.source for select
  using (compartiment = any (ke.mes_compartiments()) and (classification = 'interne' or ke.lit_le_prive()));

-- Rôles d'essai.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ke_shyrka') then create role ke_shyrka login password 'essai'; end if;
  if not exists (select 1 from pg_roles where rolname = 'ke_agent') then create role ke_agent login password 'essai'; end if;
  if not exists (select 1 from pg_roles where rolname = 'ke_agent_visibility') then create role ke_agent_visibility login password 'essai'; end if;
end $$;
grant usage on schema ke to ke_shyrka, ke_agent, ke_agent_visibility;
grant execute on function ke.mes_compartiments(), ke.lit_le_prive() to ke_shyrka, ke_agent, ke_agent_visibility;
grant select on ke.extrait, ke.source to ke_shyrka, ke_agent, ke_agent_visibility;
revoke all on ke.droits, ke.revocation from ke_shyrka, ke_agent, ke_agent_visibility;
revoke insert, update, delete, truncate on ke.extrait, ke.source from ke_shyrka, ke_agent, ke_agent_visibility;

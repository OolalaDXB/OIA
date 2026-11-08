-- OIA Knowledge Engine · prototype comparatif (ADR 0005 proposée, non appliquée).
-- Index, références et extraits autorisés ; jamais une copie des bases métier.
-- Les droits sont appliqués par la base (RLS) AVANT tout classement : un rôle
-- ne voit que les compartiments que lui accorde ke_droits, qu'il ne peut pas
-- modifier lui-même.

create extension if not exists vector;

drop schema if exists ke cascade;
create schema ke;

-- Une source : un document, un enregistrement d'application ou une conversation autorisée.
create table ke.source (
  id             text primary key,
  connecteur     text not null check (connecteur in ('depot-git', 'fichiers', 'supabase', 'app-oolala', 'conversation')),
  uri            text not null,                 -- référence vers la source de vérité (jamais son contenu complet)
  compartiment   text not null,
  classification text not null check (classification in ('interne', 'mickael_seulement')),
  version        text not null,                 -- SHA du blob, horodatage ou version applicative
  date_source    timestamptz not null,
  indexe_le      timestamptz not null default now()
);

-- Un extrait : un passage autorisé, avec sa référence, son vecteur et son index lexical.
create table ke.extrait (
  id             bigserial primary key,
  source_id      text not null references ke.source (id) on delete cascade,  -- révocation : tout disparaît avec la source
  compartiment   text not null,                 -- dérivé de la source, pour filtrer avant le classement
  classification text not null,
  section        text not null,
  ligne          int not null,
  texte          text not null,
  tsv            tsvector generated always as (to_tsvector('french', section || ' ' || texte)) stored,
  embedding      vector(1024) not null,
  date_source    timestamptz not null
);
create index extrait_tsv on ke.extrait using gin (tsv);
create index extrait_embedding on ke.extrait using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index extrait_source on ke.extrait (source_id);
create index extrait_compartiment on ke.extrait (compartiment);

-- Requête lexicale : les mots porteurs de la question reliés par OU (un ET exigerait tous les mots,
-- ce qu'aucune question ne passe), racinisation et mots vides du français.
create or replace function public.ke_ou(q text) returns tsquery
language sql immutable as $$
  select nullif(replace(plainto_tsquery('french', q)::text, ' & ', ' | '), '')::tsquery
$$;
grant execute on function public.ke_ou(text) to public;

-- Empreintes des sources révoquées : une source révoquée ne revient pas par une réindexation.
create table ke.revocation (
  empreinte  text primary key,
  revoque_le timestamptz not null default now(),
  motif      text not null
);

-- Droits : compartiments lisibles par rôle (Shyrka, agents). Écrits par l'administrateur seulement.
create table ke.droits (
  role          text primary key,
  compartiments text[] not null,
  modele_externe boolean not null default false  -- un rôle qui alimente un modèle externe ne lit jamais « mickael_seulement »
);

-- Droits du rôle connecté, lus par une fonction de confiance : les agents ne lisent pas ke.droits.
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

-- Rôles d'essai : Shyrka locale (tout, modèle local) ; un agent (compartiments limités, modèle externe).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ke_shyrka') then create role ke_shyrka login password 'essai'; end if;
  if not exists (select 1 from pg_roles where rolname = 'ke_agent') then create role ke_agent login password 'essai'; end if;
end $$;
grant usage on schema ke to ke_shyrka, ke_agent;
grant execute on function ke.mes_compartiments(), ke.lit_le_prive() to ke_shyrka, ke_agent;
grant select on ke.extrait, ke.source to ke_shyrka, ke_agent;
revoke all on ke.droits, ke.revocation from ke_shyrka, ke_agent;

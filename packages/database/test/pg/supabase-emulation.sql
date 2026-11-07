-- Émulation minimale de Supabase pour les tests, sur un Postgres nu et jetable.
-- JAMAIS appliquée sur Supabase : la plateforme fournit déjà ces rôles,
-- le schéma auth et auth.uid().
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;
create schema auth;
create table auth.users (id uuid primary key, email text);
-- Comme sur Supabase : auth.uid() lit l'identité du JWT, ici le GUC request.jwt.claim.sub.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Comme sur Supabase : droits par défaut larges sur public, que RLS doit contenir.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

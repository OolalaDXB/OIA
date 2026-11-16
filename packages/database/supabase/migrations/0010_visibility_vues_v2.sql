-- 0010 · Visibility : contrat version 2 (PROPOSÉE, NON APPLIQUÉE).
-- Mandat v13, bloc F. Les vues `vis_*_v1` de 0006 ne sont pas modifiées : elles
-- restent servies telles quelles ; les vues `_v2` s'y ajoutent.
--
-- Constat sur la v1 : toutes les vues portent `window_id` et aucune ne filtre
-- sur J0 ; `vis_mesure_v1` donne une ligne par fenêtre de chaque sujet. Il
-- manque au contrat :
--  * la comparaison d'une fenêtre à sa référence (src/window-compare.ts,
--    format 1) : ni table, ni vue ;
--  * la fenêtre qui mesure une recommandation exécutée (`execution.measuredBy`
--    de subjects/<sujet>/recommendations.yaml) : `vis.execution` est en ajout
--    seul et n'a pas de colonne pour elle.
--
-- Prérequis : 0006 appliquée. Rien n'est écrit dans les tables `vis` : deux
-- tables nouvelles dans `vis_ui`, en ajout seul, écrites par le service
-- (vis-sync : `tsx src/vis-sync.ts --comparaison <comparaison.json>`), lues
-- par les membres. Mêmes principes que 0006 : vues `security_invoker`, aucune
-- vue n'utilise `now()`, droits de lecture aux seuls `authenticated`.

-- ------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------

-- Une comparaison par fichier comparaison-<fenêtre>-<référence>.json : le
-- document entier en jsonb, quelques colonnes extraites. Identifiant dérivé de
-- l'empreinte du fichier : rejouer ne change rien, une comparaison refaite
-- (nouvelles preuves) est une nouvelle ligne ; la plus récente fait foi.
create table if not exists vis_ui.comparaison (
  id                  uuid primary key,
  client_id           text not null references vis.client(id) on delete restrict,
  subject_id          text not null references vis.subject(id) on delete restrict,
  window_id           text not null,
  reference_window_id text not null,
  format              int  not null check (format = 1),
  verdict_non_marque  text not null check (verdict_non_marque in ('hausse', 'baisse', 'pas de changement démontrable', 'non comparable')),
  preuves_reference   int  not null check (preuves_reference >= 0),
  empreinte_reference text not null check (char_length(empreinte_reference) >= 8),
  preuves_courantes   int  not null check (preuves_courantes >= 0),
  empreinte_courante  text not null check (char_length(empreinte_courante) >= 8),
  empreinte           text not null unique check (empreinte ~ '^[0-9a-f]{64}$'),
  donnees             jsonb not null check (jsonb_typeof(donnees) = 'object' and (donnees ->> 'comparisonFormat') = '1'),
  recu_le             timestamptz not null default now(),
  check (window_id <> reference_window_id),
  foreign key (subject_id, client_id) references vis.subject(id, client_id),
  foreign key (window_id, client_id) references vis.window(id, client_id),
  foreign key (reference_window_id, client_id) references vis.window(id, client_id)
);
create index if not exists comparaison_fenetre_idx on vis_ui.comparaison (window_id, reference_window_id, recu_le desc);
create index if not exists comparaison_client_idx on vis_ui.comparaison (client_id);
create index if not exists comparaison_reference_idx on vis_ui.comparaison (reference_window_id);

-- Fenêtre qui mesure une exécution. Ajout seul : si la fenêtre prévue change
-- (J1 reportée), on ajoute une ligne ; la plus récente fait foi.
create table if not exists vis_ui.execution_mesure (
  id                 bigserial primary key,
  execution_id       bigint not null references vis.execution(id) on delete restrict,
  client_id          text not null references vis.client(id) on delete restrict,
  measured_by_window text not null,
  declared_by        text not null check (char_length(declared_by) >= 2),
  declared_at        timestamptz not null default now(),
  foreign key (measured_by_window, client_id) references vis.window(id, client_id)
);
create index if not exists execution_mesure_exec_idx on vis_ui.execution_mesure (execution_id, declared_at desc);
create index if not exists execution_mesure_fenetre_idx on vis_ui.execution_mesure (measured_by_window, client_id);
create index if not exists execution_mesure_client_idx on vis_ui.execution_mesure (client_id);

-- L'exécution est celle du même client, et la fenêtre celle du sujet de sa
-- recommandation. Lit `vis` avec les droits du propriétaire de la fonction.
create or replace function vis_ui.execution_mesure_coherente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from vis.execution x
    join vis.recommendation rc on rc.id = x.recommendation_id
    join vis.window w on w.id = new.measured_by_window
    where x.id = new.execution_id and x.client_id = new.client_id and w.subject_id = rc.subject_id
  ) then
    raise exception 'execution_mesure : exécution % et fenêtre % de clients ou de sujets différents', new.execution_id, new.measured_by_window
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function vis_ui.execution_mesure_coherente() from public, anon, authenticated;

-- Ajout seul, propriétaire compris (même règle que vis.evidence).
create or replace function vis_ui.ajout_seul() returns trigger
language plpgsql as $$
begin
  raise exception '%.% est en ajout seul : % refusée', tg_table_schema, tg_table_name, tg_op using errcode = 'read_only_sql_transaction';
end $$;
revoke all on function vis_ui.ajout_seul() from public, anon, authenticated;

drop trigger if exists execution_mesure_coherente on vis_ui.execution_mesure;
create trigger execution_mesure_coherente before insert on vis_ui.execution_mesure
  for each row execute function vis_ui.execution_mesure_coherente();
drop trigger if exists comparaison_ajout_seul on vis_ui.comparaison;
create trigger comparaison_ajout_seul before update or delete on vis_ui.comparaison
  for each row execute function vis_ui.ajout_seul();
drop trigger if exists comparaison_ajout_seul_truncate on vis_ui.comparaison;
create trigger comparaison_ajout_seul_truncate before truncate on vis_ui.comparaison
  for each statement execute function vis_ui.ajout_seul();
drop trigger if exists execution_mesure_ajout_seul on vis_ui.execution_mesure;
create trigger execution_mesure_ajout_seul before update or delete on vis_ui.execution_mesure
  for each row execute function vis_ui.ajout_seul();
drop trigger if exists execution_mesure_ajout_seul_truncate on vis_ui.execution_mesure;
create trigger execution_mesure_ajout_seul_truncate before truncate on vis_ui.execution_mesure
  for each statement execute function vis_ui.ajout_seul();

alter table vis_ui.comparaison enable row level security;
alter table vis_ui.execution_mesure enable row level security;
drop policy if exists membres_lisent on vis_ui.comparaison;
drop policy if exists membres_lisent on vis_ui.execution_mesure;
create policy membres_lisent on vis_ui.comparaison for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis_ui.comparaison.client_id));
create policy membres_lisent on vis_ui.execution_mesure for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis_ui.execution_mesure.client_id));
revoke all on vis_ui.comparaison, vis_ui.execution_mesure from public, anon, authenticated;
grant select on vis_ui.comparaison, vis_ui.execution_mesure to authenticated;
grant select, insert on vis_ui.comparaison, vis_ui.execution_mesure to service_role;
grant usage on sequence vis_ui.execution_mesure_id_seq to service_role;

-- ------------------------------------------------------------------
-- 2. Vues v2
-- ------------------------------------------------------------------

-- Dernière comparaison de chaque fenêtre à chaque référence.
create or replace view vis_ui.derniere_comparaison with (security_invoker = true) as
select distinct on (c.window_id, c.reference_window_id) c.*
from vis_ui.comparaison c
order by c.window_id, c.reference_window_id, c.recu_le desc, c.id;

-- État de la mesure : colonnes de la v1, plus le rang de la fenêtre dans son
-- sujet et sa dernière comparaison (null si aucune).
create or replace view public.vis_mesure_v2 with (security_invoker = true) as
select m.*,
       row_number() over (partition by m.subject_id order by m.debut nulls last, m.window_id)::int as rang_fenetre,
       dc.reference_window_id as fenetre_reference,
       dc.id as comparaison_id,
       dc.verdict_non_marque
from public.vis_mesure_v1 m
left join lateral (
  select d.* from vis_ui.derniere_comparaison d where d.window_id = m.window_id order by d.recu_le desc, d.id limit 1
) dc on true;

-- Comparaisons : une ligne par comparaison, `derniere` pour celle qui fait foi.
create or replace view public.vis_comparaisons_v2 with (security_invoker = true) as
select c.id, c.client_id, c.subject_id, c.window_id, c.reference_window_id as fenetre_reference,
       c.format, c.verdict_non_marque,
       c.donnees #>> '{branded,total,verdict}' as verdict_marque,
       c.preuves_reference, c.empreinte_reference, c.preuves_courantes, c.empreinte_courante,
       c.empreinte, c.recu_le,
       exists (select 1 from vis_ui.derniere_comparaison d where d.id = c.id) as derniere,
       coalesce(c.donnees -> 'executedRecommendations', '[]'::jsonb) as recommandations_executees,
       c.donnees
from vis_ui.comparaison c;

-- Par comparaison, famille de questions et moteur (« tous » pour le total) :
-- taux moyen des jours et intervalle à 95 % de chaque fenêtre, verdict.
create or replace view public.vis_comparaison_moteurs_v2 with (security_invoker = true) as
with lignes as (
  select c.id as comparaison_id, c.client_id, c.subject_id, c.window_id, c.reference_window_id,
         f.famille, f.ordre, e.x as ligne, e.total
  from vis_ui.comparaison c
  cross join lateral (values ('non_marquee', 1, c.donnees -> 'unbranded'), ('marquee', 2, c.donnees -> 'branded')) as f(famille, ordre, bloc)
  cross join lateral (
    select x, false as total from jsonb_array_elements(case when jsonb_typeof(f.bloc -> 'perEngine') = 'array' then f.bloc -> 'perEngine' else '[]'::jsonb end) x
    union all
    select f.bloc -> 'total', true where jsonb_typeof(f.bloc -> 'total') = 'object'
  ) e
)
select l.comparaison_id, l.client_id, l.subject_id, l.window_id, l.reference_window_id as fenetre_reference,
       l.famille, l.ordre,
       case when l.total then 'tous' else l.ligne ->> 'engine' end as moteur,
       (l.ligne #>> '{reference,mean}')::numeric as reference_moyenne,
       (l.ligne #>> '{reference,ci95,0}')::numeric as reference_borne_basse,
       (l.ligne #>> '{reference,ci95,1}')::numeric as reference_borne_haute,
       (l.ligne #>> '{reference,days}')::int as reference_jours,
       (l.ligne #>> '{current,mean}')::numeric as courante_moyenne,
       (l.ligne #>> '{current,ci95,0}')::numeric as courante_borne_basse,
       (l.ligne #>> '{current,ci95,1}')::numeric as courante_borne_haute,
       (l.ligne #>> '{current,days}')::int as courante_jours,
       l.ligne ->> 'verdict' as verdict,
       coalesce((l.ligne ->> 'fragile')::boolean, false) as fragile,
       l.ligne ->> 'fragileReason' as raison_fragile,
       l.ligne -> 'versions' as versions,
       l.ligne -> 'unmeasured' as non_mesurees
from lignes l;

-- Recommandations : colonnes de la v1, plus la fenêtre qui mesure leur
-- exécution (dernière déclaration, toutes exécutions confondues).
create or replace view public.vis_recommandations_v2 with (security_invoker = true) as
select r.*, em.measured_by_window as mesuree_par_fenetre, em.declared_at as mesure_declaree_le
from public.vis_recommandations_v1 r
left join lateral (
  select e.measured_by_window, e.declared_at
  from vis_ui.execution_mesure e join vis.execution x on x.id = e.execution_id
  where x.recommendation_id = r.id
  order by e.declared_at desc, e.id desc limit 1
) em on true;

do $$
declare v text;
begin
  for v in select unnest(array['vis_mesure_v2', 'vis_comparaisons_v2', 'vis_comparaison_moteurs_v2', 'vis_recommandations_v2']) loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
  execute 'revoke all on vis_ui.derniere_comparaison from public, anon, authenticated';
  execute 'grant select on vis_ui.derniere_comparaison to authenticated';
end $$;

comment on view public.vis_comparaison_moteurs_v2 is 'Contrat Visibility v2 : comparaison d''une fenêtre à sa référence, par famille et moteur. Verdict et intervalles tels que src/window-compare.ts les calcule, jamais recalculés ici.';

-- ------------------------------------------------------------------
-- Retour arrière (dans une transaction ; les vues v1 ne sont pas touchées) :
--   drop view public.vis_recommandations_v2, public.vis_comparaison_moteurs_v2,
--     public.vis_comparaisons_v2, public.vis_mesure_v2, vis_ui.derniere_comparaison;
--   drop table vis_ui.execution_mesure, vis_ui.comparaison;
--   drop function vis_ui.execution_mesure_coherente(), vis_ui.ajout_seul();
-- ------------------------------------------------------------------

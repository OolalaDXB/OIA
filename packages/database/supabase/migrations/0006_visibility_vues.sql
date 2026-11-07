-- 0006 · Visibility : vues de lecture pour l'interface, par onglet.
-- Mandat v8, bloc B2. Contrat : docs/interface/contrat-donnees-visibility.md (version 1).
--
-- Prérequis : le schéma `vis` de Visibility, migrations
-- infra/visibility/migrations/0001 à 0004, appliquées d'abord. Ces fichiers
-- sont lus, jamais modifiés ici. 0004 a été corrigée pour Supabase par la
-- session Visibility (comparaisons en `auth.uid()::text`). Ce fichier-ci
-- compare aussi `auth.uid()::text`, et fonctionne avec les deux types.
--
-- Principes :
--  * les vues sont dans `public`, en `security_invoker = true` : elles
--    appliquent les politiques RLS de `vis` à l'appelant, donc seuls les
--    membres d'un client (`vis.client_member`) voient ses lignes ;
--  * aucune vue n'utilise `now()` : le résultat ne dépend que des données ;
--  * un indicateur sans dénominateur est « non mesurable », jamais 0 ;
--  * deux tables propres à l'interface, dans le schéma `vis_ui` : textes des
--    questions du panel et rapports de fenêtre. Écrites par le service
--    (worker), lues par les membres ;
--  * deux fonctions d'écriture : valider (enveloppe de
--    `vis.validate_recommendation`) et rejeter une recommandation.

-- ------------------------------------------------------------------
-- 1. Schéma de l'interface et fonctions de calcul
-- ------------------------------------------------------------------
create schema if not exists vis_ui;
revoke all on schema vis_ui from public;
grant usage on schema vis_ui to authenticated, service_role;
grant usage on schema vis to authenticated, service_role;

-- Hôte d'une adresse, en minuscules, sans « www. » (même règle que
-- infra/visibility/src/j0-reanalysis.ts, parseUrl).
create or replace function vis_ui.domaine(adresse text) returns text
language sql immutable as $$
  select nullif(regexp_replace(lower(substring(adresse from '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?#:@]+)')), '^www\.', ''), '')
$$;

-- Vrai si l'hôte est le domaine ou l'un de ses sous-domaines.
create or replace function vis_ui.dans_domaine(hote text, dom text) returns boolean
language sql immutable as $$
  select hote is not null and dom is not null and (hote = dom or hote like '%.' || dom)
$$;

-- Plateforme sociale d'un hôte, ou null. Exactement la liste de Visibility
-- (SOCIAL_HOSTS, infra/visibility/src/j0-reanalysis.ts), sous-domaines compris
-- comme son hostIn. Décision de Mickaël du 2026-11-08 : listes alignées.
create or replace function vis_ui.plateforme_sociale(hote text) returns text
language sql immutable as $$
  select p.nom from (values
    ('instagram.com', 'instagram'), ('tiktok.com', 'tiktok'), ('facebook.com', 'facebook'),
    ('youtube.com', 'youtube'), ('x.com', 'x'), ('twitter.com', 'x'),
    ('linkedin.com', 'linkedin'), ('threads.net', 'threads')
  ) as p(dom, nom)
  where vis_ui.dans_domaine(hote, p.dom)
  limit 1
$$;

-- Intervalle de Wilson à 95 % (z = 1,96) pour k succès sur n essais.
create or replace function vis_ui.wilson(k bigint, n bigint, haut boolean) returns numeric
language sql immutable as $$
  select case when n is null or n = 0 then null else
    round(greatest(0, least(1,
      ((k::numeric / n) + 1.9208 / n
        + (case when haut then 1 else -1 end)
          * 1.96 * sqrt((k::numeric / n) * (1 - k::numeric / n) / n + 0.9604 / (n::numeric * n)))
      / (1 + 3.8416 / n)))::numeric, 4)
  end
$$;

grant execute on all functions in schema vis_ui to authenticated, service_role;

-- ------------------------------------------------------------------
-- 2. Tables propres à l'interface
-- ------------------------------------------------------------------
create table if not exists vis_ui.question (
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  question_id text not null,
  version     int  not null check (version >= 1),
  langue      text not null check (langue ~ '^[a-z]{2}$'),
  texte       text not null check (char_length(texte) >= 3),
  marquee     boolean not null,
  etiquettes  text[] not null default '{}',
  primary key (subject_id, question_id, version),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);

create table if not exists vis_ui.rapport (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null references vis.client(id) on delete restrict,
  subject_id    text not null references vis.subject(id) on delete restrict,
  window_id     text not null references vis.window(id) on delete restrict,
  type          text not null check (type in ('j0', 'remesure')),
  genere_le     timestamptz not null,
  version_panel int  not null check (version_panel >= 1),
  statut        text not null check (statut in ('a_valider', 'valide')),
  fichier       text,
  empreinte     text check (empreinte ~ '^[0-9a-f]{64}$'),
  chiffres      jsonb not null default '{}'::jsonb,
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);

alter table vis_ui.question enable row level security;
alter table vis_ui.rapport enable row level security;
drop policy if exists membres_lisent on vis_ui.question;
drop policy if exists membres_lisent on vis_ui.rapport;
create policy membres_lisent on vis_ui.question for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis_ui.question.client_id));
create policy membres_lisent on vis_ui.rapport for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis_ui.rapport.client_id));
revoke all on vis_ui.question, vis_ui.rapport from public, anon, authenticated;
grant select on vis_ui.question, vis_ui.rapport to authenticated;
grant select, insert, update, delete on vis_ui.question, vis_ui.rapport to service_role;

-- ------------------------------------------------------------------
-- 3. Lecture des tables `vis` par l'appelant connecté
-- ------------------------------------------------------------------
-- Les vues appliquent les droits de l'appelant : il lui faut SELECT sur les
-- tables lues. Les politiques `tenant_isolation_auth` de vis 0004 limitent
-- ces lignes aux membres. Aucune écriture n'est accordée.
grant select on vis.client, vis.site, vis.subject, vis.subject_site, vis.window, vis.window_missing_day,
  vis.evidence, vis.recommendation, vis.decision, vis.execution, vis.action_log, vis.scheduler_switch
  to authenticated;

-- vis.client_member n'a pas de RLS dans vis 0004 : les politiques des autres
-- tables la lisent. Pour qu'un compte connecté ne voie que ses propres
-- appartenances, et rien de celles des autres, on pose ici une politique
-- limitée aux rôles de l'interface (`anon`, `authenticated`). Les autres
-- rôles (application Visibility, administration) gardent l'accès qu'ils ont.
alter table vis.client_member enable row level security;
drop policy if exists interface_ses_lignes on vis.client_member;
create policy interface_ses_lignes on vis.client_member for all
  using (current_user not in ('anon', 'authenticated') or user_id = auth.uid()::text)
  with check (current_user not in ('anon', 'authenticated'));
grant select on vis.client_member to authenticated;

-- ------------------------------------------------------------------
-- 4. Vues
-- ------------------------------------------------------------------

-- Vues de base, dans vis_ui (non exposé à l'interface).
-- Base commune : une ligne par réponse, avec ses drapeaux.
create or replace view vis_ui.base_reponse with (security_invoker = true) as
select
  e.id, e.client_id, e.subject_id, e.site_id, e.window_id,
  e.prompt_id, e.prompt_version, e.prompt_language,
  e.engine, e.engine_version, e.collector_name, e.received_at, e.observed_on,
  e.raw_text, e.raw_sha256, e.citations, e.cost_usd,
  (e.structured ->> 'brandMentioned')::boolean as marque_citee,
  coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(e.structured -> 'competitorsMentioned') = 'array'
                                                      then e.structured -> 'competitorsMentioned' else '[]'::jsonb end)), '{}') as concurrents,
  coalesce((e.structured ->> 'webSearch')::boolean, false) as recherche_web,
  e.structured ->> 'provider' as fournisseur
from vis.evidence e;

-- Domaines de la marque : sites rattachés au sujet, plus le site de la preuve.
create or replace view vis_ui.domaines_marque with (security_invoker = true) as
with sites as (
  select ss.subject_id, s.primary_url, s.additional_urls from vis.subject_site ss join vis.site s on s.id = ss.site_id
  union
  select distinct e.subject_id, s.primary_url, s.additional_urls from vis.evidence e join vis.site s on s.id = e.site_id
)
select distinct subject_id, d as domaine from (
  select subject_id, vis_ui.domaine(primary_url) as d from sites
  union all
  select subject_id, vis_ui.domaine(case jsonb_typeof(a) when 'string' then a #>> '{}' else a ->> 'url' end)
  from sites, jsonb_array_elements(case when jsonb_typeof(additional_urls) = 'array' then additional_urls else '[]'::jsonb end) a
  where jsonb_typeof(a) = 'string' or coalesce(a ->> 'status', '') <> 'rejected'
) x where d is not null;

-- Une ligne par réponse et par citation.
create or replace view vis_ui.base_citation with (security_invoker = true) as
select r.id as reponse_id, r.client_id, r.subject_id, r.window_id, r.prompt_id, r.engine, r.observed_on,
       c.ordre, c.url, vis_ui.domaine(c.url) as domaine
from vis_ui.base_reponse r
cross join lateral (
  select ord as ordre, case jsonb_typeof(x) when 'string' then x #>> '{}' else x ->> 'url' end as url
  from jsonb_array_elements(case when jsonb_typeof(r.citations) = 'array' then r.citations else '[]'::jsonb end) with ordinality as t(x, ord)
) c
where c.url is not null;

-- Sujets et clients visibles par l'appelant, avec son rôle.
create or replace view public.vis_sujets_v1 with (security_invoker = true) as
select c.id as client_id, c.display_name as client_nom, s.id as subject_id, s.status as statut,
       m.role as mon_role,
       coalesce(array(select dm.domaine from vis_ui.domaines_marque dm where dm.subject_id = s.id order by dm.domaine), '{}') as domaines
from vis.subject s
join vis.client c on c.id = s.client_id
join vis.client_member m on m.client_id = c.id and m.user_id = auth.uid()::text;

-- État de la mesure, par fenêtre : « Mesure en cours, jour N sur 5 ».
create or replace view public.vis_mesure_v1 with (security_invoker = true) as
with agg as (
  select r.window_id,
         count(*) as reponses,
         count(*) filter (where r.marque_citee is not null) as reponses_jugees,
         count(distinct r.observed_on) filter (where r.marque_citee is not null) as jours_mesures,
         coalesce(array_agg(distinct r.engine order by r.engine), '{}') as moteurs,
         coalesce(array_agg(distinct r.engine || ':' || coalesce(r.engine_version, '?') order by r.engine || ':' || coalesce(r.engine_version, '?')), '{}') as versions_modele,
         coalesce(array_agg(distinct r.prompt_language order by r.prompt_language), '{}') as langues,
         coalesce(array_agg(distinct r.collector_name order by r.collector_name), '{}') as collecteurs,
         count(distinct r.prompt_id) as questions,
         sum(r.cost_usd) as cout_estime_usd
  from vis_ui.base_reponse r group by r.window_id
), changements as (
  select window_id, bool_or(nb > 1) as changement_modele
  from (select window_id, engine, count(distinct coalesce(engine_version, '?')) as nb from vis_ui.base_reponse group by window_id, engine) t
  group by window_id
)
select w.client_id, w.subject_id, w.id as window_id, w.kind as type_fenetre, w.panel_version as version_panel,
       w.status as statut_fenetre, w.starts_on as debut, w.ends_on as fin,
       coalesce(w.ends_on - w.starts_on + 1, 5) as jours_prevus,
       coalesce(a.jours_mesures, 0) as jours_mesures,
       (select count(*) from vis.window_missing_day md where md.window_id = w.id) as jours_manquants,
       coalesce(a.reponses, 0) as reponses,
       coalesce(a.reponses_jugees, 0) as reponses_jugees,
       coalesce(a.reponses, 0) - coalesce(a.reponses_jugees, 0) as reponses_non_jugees,
       coalesce(a.questions, 0) as questions,
       coalesce(a.moteurs, '{}') as moteurs,
       coalesce(a.versions_modele, '{}') as versions_modele,
       coalesce(ch.changement_modele, false) as changement_modele,
       coalesce(a.langues, '{}') as langues,
       coalesce(a.collecteurs, '{}') as collecteurs,
       a.cout_estime_usd,
       case
         when coalesce(a.reponses_jugees, 0) = 0 then 'non_mesurable'
         when w.status in ('planned', 'running') and coalesce(a.jours_mesures, 0) < coalesce(w.ends_on - w.starts_on + 1, 5) then 'mesure_en_cours'
         when w.status = 'aborted' then 'interrompue'
         else 'mesure_terminee'
       end as etat
from vis.window w
left join agg a on a.window_id = w.id
left join changements ch on ch.window_id = w.id;

-- Vue d'ensemble : quatre indicateurs, par fenêtre et par moteur (« tous »
-- pour l'ensemble), avec numérateur, dénominateur, intervalle et état.
create or replace view public.vis_apercu_v1 with (security_invoker = true) as
with rep as (
  select r.*,
         exists (select 1 from vis_ui.base_citation c join vis_ui.domaines_marque dm on dm.subject_id = r.subject_id
                  where c.reponse_id = r.id and vis_ui.dans_domaine(c.domaine, dm.domaine)) as cite_la_marque
  from vis_ui.base_reponse r
), jour as (
  select client_id, subject_id, window_id, coalesce(engine, 'tous') as moteur, observed_on,
         count(*) filter (where marque_citee is not null) as jugees,
         count(*) filter (where marque_citee) as avec_marque,
         count(*) filter (where marque_citee is false and cardinality(concurrents) > 0) as concurrent_seul,
         coalesce(sum(cardinality(concurrents)) filter (where marque_citee is not null), 0) as mentions_concurrents,
         count(*) filter (where recherche_web) as avec_recherche,
         count(*) filter (where recherche_web and cite_la_marque) as citant_la_marque
  from rep
  group by grouping sets ((client_id, subject_id, window_id, engine, observed_on), (client_id, subject_id, window_id, observed_on))
), ind as (
  select j.client_id, j.subject_id, j.window_id, j.moteur, j.observed_on, i.indicateur, i.ordre, i.k, i.n
  from jour j cross join lateral (values
    ('presence', 1, j.avec_marque, j.jugees),
    ('part_de_voix', 2, j.avec_marque, j.avec_marque + j.mentions_concurrents),
    ('citation_marque', 3, j.citant_la_marque, j.avec_recherche),
    ('concurrent_a_la_place', 4, j.concurrent_seul, j.jugees)
  ) as i(indicateur, ordre, k, n)
), tot as (
  select client_id, subject_id, window_id, moteur, indicateur, ordre,
         sum(k)::bigint as numerateur, sum(n)::bigint as denominateur,
         count(*) filter (where n > 0) as jours_mesures,
         min(k::numeric / n) filter (where n > 0) as plage_min,
         max(k::numeric / n) filter (where n > 0) as plage_max
  from ind group by client_id, subject_id, window_id, moteur, indicateur, ordre
)
select t.client_id, t.subject_id, t.window_id, t.moteur, t.indicateur, t.ordre,
       t.numerateur, t.denominateur,
       case when t.denominateur > 0 then round(t.numerateur::numeric / t.denominateur, 4) end as valeur,
       case when t.denominateur = 0 then null
            when t.indicateur <> 'part_de_voix' and t.denominateur >= 30 then 'wilson_95'
            else 'plage_observee' end as methode_intervalle,
       case when t.denominateur = 0 then null
            when t.indicateur <> 'part_de_voix' and t.denominateur >= 30 then vis_ui.wilson(t.numerateur, t.denominateur, false)
            else round(t.plage_min, 4) end as borne_basse,
       case when t.denominateur = 0 then null
            when t.indicateur <> 'part_de_voix' and t.denominateur >= 30 then vis_ui.wilson(t.numerateur, t.denominateur, true)
            else round(t.plage_max, 4) end as borne_haute,
       t.jours_mesures::int as jours_mesures,
       m.jours_prevus,
       case when t.denominateur = 0 then 'non_mesurable'
            when m.etat = 'mesure_en_cours' then 'mesure_en_cours'
            else 'mesure' end as etat,
       case when t.denominateur > 0 then null
            when t.indicateur = 'citation_marque' then 'recherche_web_desactivee'
            when t.indicateur = 'part_de_voix' then 'aucune_mention'
            else 'aucune_reponse_jugee' end as raison_non_mesurable
from tot t
join public.vis_mesure_v1 m on m.window_id = t.window_id;

-- Réponses brutes.
create or replace view public.vis_reponses_v1 with (security_invoker = true) as
select r.id, r.client_id, r.subject_id, r.window_id,
       r.prompt_id as question_id, r.prompt_version as version_question, r.prompt_language as langue,
       r.engine as moteur, r.engine_version as version_modele, r.fournisseur, r.collector_name as collecteur,
       r.received_at as recu_le, r.observed_on as jour,
       r.raw_text as texte, encode(r.raw_sha256, 'hex') as empreinte,
       case when r.marque_citee is null then 'non_jugee' else 'jugee' end as statut_jugement,
       r.marque_citee, r.concurrents, r.recherche_web,
       (select count(*) from vis_ui.base_citation c where c.reponse_id = r.id) as nb_citations,
       r.cost_usd as cout_usd
from vis_ui.base_reponse r;

-- Citations : une ligne par fenêtre, moteur et adresse.
create or replace view public.vis_citations_v1 with (security_invoker = true) as
select c.client_id, c.subject_id, c.window_id, c.engine as moteur, c.url, c.domaine,
       case when exists (select 1 from vis_ui.domaines_marque dm where dm.subject_id = c.subject_id and vis_ui.dans_domaine(c.domaine, dm.domaine)) then 'marque'
            when vis_ui.plateforme_sociale(c.domaine) is not null then 'reseau_social'
            else 'autre' end as categorie,
       count(*) as citations,
       count(distinct c.reponse_id) as reponses,
       count(distinct c.prompt_id) as questions,
       min(c.observed_on) as premier_jour,
       max(c.observed_on) as dernier_jour
from vis_ui.base_citation c
group by c.client_id, c.subject_id, c.window_id, c.engine, c.url, c.domaine;

-- Réseaux sociaux : citations vers une plateforme sociale, avec leur part
-- dans toutes les citations de la fenêtre (dénominateur explicite).
create or replace view public.vis_reseaux_sociaux_v1 with (security_invoker = true) as
with tot as (
  select window_id, count(*) as toutes from vis_ui.base_citation group by window_id
)
select c.client_id, c.subject_id, c.window_id, vis_ui.plateforme_sociale(c.domaine) as plateforme,
       c.url,
       count(*) as citations, t.toutes as denominateur,
       round(count(*)::numeric / t.toutes, 4) as part,
       count(distinct c.prompt_id) as questions,
       coalesce(array_agg(distinct c.engine order by c.engine), '{}') as moteurs
from vis_ui.base_citation c
join tot t on t.window_id = c.window_id
where vis_ui.plateforme_sociale(c.domaine) is not null
group by c.client_id, c.subject_id, c.window_id, vis_ui.plateforme_sociale(c.domaine), c.url, t.toutes;

-- Concurrents : la marque et chaque concurrent nommé, par fenêtre et moteur.
create or replace view public.vis_concurrents_v1 with (security_invoker = true) as
with rep as (
  select * from vis_ui.base_reponse where marque_citee is not null
), ent as (
  select client_id, subject_id, window_id, engine, prompt_id, id, subject_id as entite, true as est_marque from rep where marque_citee
  union all
  select r.client_id, r.subject_id, r.window_id, r.engine, r.prompt_id, r.id, c, false from rep r cross join lateral unnest(r.concurrents) c
), den as (
  select window_id, coalesce(engine, 'tous') as moteur,
         count(*) as reponses_jugees,
         sum((marque_citee)::int) + sum(cardinality(concurrents)) as mentions_totales
  from rep group by grouping sets ((window_id, engine), (window_id))
), cpt as (
  select client_id, subject_id, window_id, coalesce(engine, 'tous') as moteur, entite, est_marque,
         count(distinct id) as reponses_avec_entite, count(distinct prompt_id) as questions
  from ent group by grouping sets ((client_id, subject_id, window_id, engine, entite, est_marque), (client_id, subject_id, window_id, entite, est_marque))
)
select c.client_id, c.subject_id, c.window_id, c.moteur, c.entite, c.est_marque,
       c.reponses_avec_entite as mentions, d.mentions_totales as denominateur_part,
       case when d.mentions_totales > 0 then round(c.reponses_avec_entite::numeric / d.mentions_totales, 4) end as part_de_voix,
       d.reponses_jugees,
       round(c.reponses_avec_entite::numeric / d.reponses_jugees, 4) as taux_apparition,
       case when d.reponses_jugees >= 30 then 'wilson_95' else 'effectif_insuffisant' end as methode_intervalle,
       case when d.reponses_jugees >= 30 then vis_ui.wilson(c.reponses_avec_entite, d.reponses_jugees, false) end as borne_basse,
       case when d.reponses_jugees >= 30 then vis_ui.wilson(c.reponses_avec_entite, d.reponses_jugees, true) end as borne_haute,
       c.questions
from cpt c
join den d on d.window_id = c.window_id and d.moteur = c.moteur;

-- Questions : par fenêtre, question, version, moteur et jour.
create or replace view public.vis_questions_v1 with (security_invoker = true) as
select r.client_id, r.subject_id, r.window_id, r.prompt_id as question_id, r.prompt_version as version_question,
       r.prompt_language as langue, q.texte, q.marquee, coalesce(q.etiquettes, '{}') as etiquettes,
       r.engine as moteur, r.observed_on as jour,
       count(*) as reponses,
       count(*) filter (where r.marque_citee is not null) as reponses_jugees,
       count(*) filter (where r.marque_citee) as avec_marque,
       case when count(*) filter (where r.marque_citee is not null) = 0 then 'non_mesurable' else 'mesure' end as etat
from vis_ui.base_reponse r
left join vis_ui.question q on q.subject_id = r.subject_id and q.question_id = r.prompt_id and q.version = r.prompt_version
group by r.client_id, r.subject_id, r.window_id, r.prompt_id, r.prompt_version, r.prompt_language, q.texte, q.marquee, q.etiquettes, r.engine, r.observed_on;

-- Recommandations, avec la dernière décision et la dernière exécution.
create or replace view public.vis_recommandations_v1 with (security_invoker = true) as
select rc.id, rc.client_id, rc.subject_id, rc.site_id, rc.window_id, rc.type, rc.title as titre, rc.statement as enonce,
       rc.impact_level as impact, rc.effort_level as effort, rc.risk as risque, rc.confidence as confiance,
       rc.created_by as cree_par, rc.created_at as cree_le,
       case rc.type when 'FIX_FACT' then 1 when 'TECH_FIX' then 2 when 'ENTITY_INCONSISTENCY' then 3
                    when 'CONTENT_GAP' then 4 when 'SOURCE_TARGET' then 5 else 6 end as priorite,
       coalesce(d.status, 'pending') as etat, d.decided_by as decide_par, d.decided_at as decide_le, d.reason as motif,
       x.kind as derniere_execution, x.ref as reference_execution, x.happened_at as execute_le,
       coalesce(rc.payload -> 'evidence', '[]'::jsonb) as preuves
from vis.recommendation rc
left join lateral (select * from vis.decision dd where dd.recommendation_id = rc.id order by dd.decided_at desc, dd.id desc limit 1) d on true
left join lateral (select * from vis.execution xx where xx.recommendation_id = rc.id order by xx.happened_at desc, xx.id desc limit 1) x on true;

-- Rapports de fenêtre.
create or replace view public.vis_rapports_v1 with (security_invoker = true) as
select id, client_id, subject_id, window_id, type, genere_le, version_panel, statut, fichier, empreinte, chiffres
from vis_ui.rapport;

-- SEO Command : journal des actions (ajout seul).
create or replace view public.vis_seo_command_v1 with (security_invoker = true) as
select a.id, a.client_id, a.subject_id, a.at as le, a.who as qui, a.what as quoi, a.mission_id, a.cost_usd as cout_usd, a.details
from vis.action_log a;

-- SEO Command : état du planificateur, par client (désactivé par défaut).
create or replace view public.vis_planificateur_v1 with (security_invoker = true) as
select c.id as client_id, coalesce(s.enabled, false) as actif, s.toggled_by as bascule_par, s.toggled_at as bascule_le, s.reason as motif
from vis.client c
left join vis.scheduler_switch s on s.client_id = c.id;

do $$
declare v text;
begin
  for v in select unnest(array[
    'vis_sujets_v1', 'vis_mesure_v1',
    'vis_apercu_v1', 'vis_reponses_v1', 'vis_citations_v1', 'vis_reseaux_sociaux_v1', 'vis_concurrents_v1',
    'vis_questions_v1', 'vis_recommandations_v1', 'vis_rapports_v1', 'vis_seo_command_v1', 'vis_planificateur_v1'
  ]) loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
  -- Vues de base : lues par les vues ci-dessus, hors de l'interface (vis_ui n'est pas exposé).
  for v in select unnest(array['base_reponse', 'domaines_marque', 'base_citation']) loop
    execute format('revoke all on vis_ui.%I from public, anon, authenticated', v);
    execute format('grant select on vis_ui.%I to authenticated', v);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 5. Écritures : valider ou rejeter une recommandation
-- ------------------------------------------------------------------
-- Valider : enveloppe de vis.validate_recommendation (vis 0004), qui vérifie
-- l'identité, refuse les identités de service et exige owner ou approver.
create or replace function public.vis_valider_recommandation(p_recommandation text, p_motif text default null)
returns bigint
language sql
security invoker
set search_path = public, pg_temp
as $$
  select vis.validate_recommendation(p_recommandation, p_motif)
$$;

-- Rejeter : mêmes contrôles, motif obligatoire. Ajout seul dans vis.decision.
create or replace function public.vis_rejeter_recommandation(p_recommandation text, p_motif text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  appelant text := auth.uid()::text;
  cid text;
  role_ text;
  nouveau bigint;
begin
  if appelant is null then
    raise exception 'identité requise' using errcode = '42501';
  end if;
  if exists (select 1 from vis.service_identity where user_id = appelant) then
    raise exception 'une identité de service ne décide pas' using errcode = '42501';
  end if;
  if p_motif is null or char_length(btrim(p_motif)) < 3 then
    raise exception 'motif de rejet obligatoire' using errcode = '22023';
  end if;
  select client_id into cid from vis.recommendation where id = p_recommandation;
  if cid is null then
    raise exception 'recommandation introuvable' using errcode = 'P0002';
  end if;
  select role into role_ from vis.client_member where user_id = appelant and client_id = cid;
  if role_ is null or role_ not in ('owner', 'approver') then
    raise exception 'droit de décision refusé' using errcode = '42501';
  end if;
  insert into vis.decision (recommendation_id, status, decided_by, client_id, reason)
  values (p_recommandation, 'rejected', appelant, cid, btrim(p_motif))
  returning id into nouveau;
  return nouveau;
end;
$$;

revoke all on function public.vis_valider_recommandation(text, text) from public, anon;
revoke all on function public.vis_rejeter_recommandation(text, text) from public, anon;
grant execute on function public.vis_valider_recommandation(text, text) to authenticated;
grant execute on function public.vis_rejeter_recommandation(text, text) to authenticated;
grant execute on function vis.validate_recommendation(text, text) to authenticated;

comment on view public.vis_apercu_v1 is 'Contrat Visibility v1 : quatre indicateurs par fenêtre et moteur, avec intervalle. Non mesurable si dénominateur nul, jamais 0.';

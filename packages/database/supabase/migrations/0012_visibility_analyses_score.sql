-- 0012 · Visibility v3 : analyses instantanées (Lighthouse mobile et ordinateur, audit de
-- lecture), constats expliqués, score du site et son historique.
-- Contrat : docs/interface/contrat-donnees-visibility-v3.md. Prérequis : 0010, vis 0006_pilotage, 0011.
--
-- Principes inchangés : ajout seul, RLS par client, aucune écriture directe ; le cockpit
-- appelle vis_demander_analyse (gratuit : aucun appel payant, aucun GO), le moteur écrit par
-- vis_moteur_analyse et vis_moteur_constat (service_role seulement).
--
-- Retour arrière (dans une transaction ; il SUPPRIME les analyses et constats) :
--   drop view if exists public.vis_score_historique_v3, public.vis_score_v3, public.vis_constats_v3, public.vis_analyses_v3;
--   drop function if exists public.vis_demander_analyse(text), public.vis_moteur_analyse(uuid, jsonb),
--     public.vis_moteur_constat(text, uuid, jsonb), vis_ui.score_pondere(jsonb);
--   drop table if exists vis.constat, vis.analyse;
--   alter table vis.demande drop constraint demande_type_check;
--   alter table vis.demande add constraint demande_type_check check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE'));

-- ------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------
alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE'));

-- Une analyse : un passage d'un outil sur une adresse.
create table if not exists vis.analyse (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  demande_id  uuid references vis.demande(id) on delete restrict,
  nature      text not null check (nature in ('lighthouse','crawl','indexation')),
  strategie   text check (strategie is null or strategie in ('mobile','ordinateur')),
  url         text not null check (url ~ '^https://'),
  outil       text not null check (char_length(outil) between 2 and 80),
  statut      text not null check (statut in ('fait','echec')),
  -- lighthouse : {performance, accessibilite, bonnes_pratiques, seo} entre 0 et 1.
  scores      jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  -- lighthouse : {lcp_ms, fcp_ms, cls, tbt_ms, si_ms, ttfb_ms, poids_ko, requetes}.
  metriques   jsonb not null default '{}'::jsonb check (jsonb_typeof(metriques) = 'object'),
  -- détail lisible : opportunités, diagnostics, pages, règles (selon la nature).
  resultat    jsonb not null default '{}'::jsonb check (jsonb_typeof(resultat) = 'object'),
  erreur      text,
  recu_le     timestamptz not null default now(),
  check ((nature = 'lighthouse') = (strategie is not null)),
  check (statut <> 'echec' or char_length(btrim(coalesce(erreur, ''))) >= 3),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists analyse_sujet_idx on vis.analyse (subject_id, recu_le desc);

-- Un constat : un problème trouvé par une analyse, expliqué et corrigeable.
create table if not exists vis.constat (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  analyse_id   uuid references vis.analyse(id) on delete restrict,
  demande_id   uuid references vis.demande(id) on delete restrict,
  -- Clé stable d'un même problème d'une analyse à l'autre (ex. lighthouse:largest-contentful-paint:mobile).
  cle          text not null check (cle ~ '^[a-z0-9][a-z0-9:._-]{2,120}$'),
  source       text not null check (source in ('lighthouse','crawl','indexation')),
  categorie    text not null check (categorie in ('performance','seo','accessibilite','bonnes_pratiques','contenu','technique','visibilite_ia')),
  gravite      text not null check (gravite in ('critique','important','mineur')),
  titre        text not null check (char_length(titre) between 3 and 200),
  explication  text not null check (char_length(explication) >= 10),
  correction   text not null check (char_length(correction) >= 10),
  impact       text,
  effort       text not null check (effort in ('XS','S','M','L','XL')),
  qui          text not null check (qui in ('client','equipe')),
  valeur       text,
  preuve       jsonb not null default '{}'::jsonb check (jsonb_typeof(preuve) = 'object'),
  cree_le      timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists constat_sujet_idx on vis.constat (subject_id, cle, cree_le desc);
create index if not exists constat_demande_idx on vis.constat (demande_id);

do $$
declare t text;
begin
  for t in select unnest(array['analyse','constat']) loop
    execute format('drop trigger if exists %I on vis.%I', t || '_ajout_seul', t);
    execute format('create trigger %I before update or delete on vis.%I for each row execute function vis.pilotage_ajout_seul()', t || '_ajout_seul', t);
    execute format('drop trigger if exists %I on vis.%I', t || '_ajout_seul_truncate', t);
    execute format('create trigger %I before truncate on vis.%I for each statement execute function vis.pilotage_ajout_seul()', t || '_ajout_seul_truncate', t);
    execute format('alter table vis.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_auth on vis.%I', t);
    execute format('create policy tenant_isolation_auth on vis.%I for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis.%I.client_id))', t, t);
    execute format('alter table vis.%I owner to vis_admin', t);
    execute format('revoke all on vis.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on vis.%I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 2. Vues v3
-- ------------------------------------------------------------------

-- Analyses : toutes, la plus récente de chaque (nature, stratégie) marquée `derniere`.
create or replace view public.vis_analyses_v3 with (security_invoker = true) as
select a.id, a.client_id, a.subject_id, a.demande_id, a.nature, a.strategie, a.url, a.outil, a.statut,
       a.scores, a.metriques, a.resultat, a.erreur, a.recu_le,
       a.id = (select x.id from vis.analyse x where x.subject_id = a.subject_id and x.nature = a.nature
                and x.strategie is not distinct from a.strategie and x.statut = 'fait'
                order by x.recu_le desc, x.id desc limit 1) as derniere
from vis.analyse a;

-- Constats : un par clé, dans sa dernière version. `ouvert` si la dernière analyse réussie de
-- sa source (et de sa stratégie pour Lighthouse) l'a encore relevé ; `resolu` sinon : c'est
-- l'évolution, d'une analyse à l'autre.
create or replace view public.vis_constats_v3 with (security_invoker = true) as
with dernier as (
  select distinct on (c.subject_id, c.cle) c.*
  from vis.constat c
  order by c.subject_id, c.cle, c.cree_le desc, c.id desc
), derniere_demande as (
  -- Dernière demande ANALYSE terminée pour chaque sujet.
  select distinct on (d.subject_id) d.subject_id, d.id
  from vis.demande d join vis.demande_etat e on e.demande_id = d.id and e.statut = 'DONE'
  where d.type = 'ANALYSE'
  order by d.subject_id, e.le desc
)
select c.id, c.client_id, c.subject_id, c.cle, c.source, c.categorie, c.gravite, c.titre, c.explication,
       c.correction, c.impact, c.effort, c.qui, c.valeur, c.preuve, c.analyse_id,
       (select min(x.cree_le) from vis.constat x where x.subject_id = c.subject_id and x.cle = c.cle) as premiere_fois,
       c.cree_le as derniere_fois,
       case when dd.id is null or c.demande_id = dd.id then 'ouvert' else 'resolu' end as etat,
       case c.gravite when 'critique' then 1 when 'important' then 2 else 3 end as ordre
from dernier c
left join derniere_demande dd on dd.subject_id = c.subject_id;

-- Moyenne pondérée des composantes présentes (une composante absente ne compte pas, elle
-- est signalée dans `manquantes`).
create or replace function vis_ui.score_pondere(c jsonb) returns numeric
language sql immutable as $$
  with p(k, w) as (values ('performance_mobile', 15), ('performance_ordinateur', 5), ('seo_technique', 15),
                          ('accessibilite', 10), ('bonnes_pratiques', 5), ('visibilite_ia', 35), ('notoriete_ia', 15))
  select case when sum(w) filter (where jsonb_typeof(c -> k) = 'number') > 0
              then round(sum(w * (c ->> k)::numeric) filter (where jsonb_typeof(c -> k) = 'number')
                         / sum(w) filter (where jsonb_typeof(c -> k) = 'number'))
         end
  from p
$$;
grant execute on function vis_ui.score_pondere(jsonb) to authenticated;

-- Score du site : une ligne par sujet. Composantes 0 à 100, null si non mesurées.
--  * performance, SEO technique, accessibilité, bonnes pratiques : dernière analyse Lighthouse ;
--  * visibilité IA : présence de la marque sur les questions non marquées, dernière fenêtre close ;
--  * notoriété IA : présence sur les questions marquées (ce que les IA savent du nom).
-- Pondération (docs/interface/contrat-donnees-visibility-v3.md) : visibilité IA 35, SEO 15,
-- performance mobile 15, notoriété IA 15, accessibilité 10, performance ordinateur 5,
-- bonnes pratiques 5 ; renormalisée sur les composantes mesurées.
create or replace view public.vis_score_v3 with (security_invoker = true) as
with lh as (
  select a.subject_id,
         max(case when a.strategie = 'mobile' then round(100 * (a.scores ->> 'performance')::numeric) end) as performance_mobile,
         max(case when a.strategie = 'ordinateur' then round(100 * (a.scores ->> 'performance')::numeric) end) as performance_ordinateur,
         max(case when a.strategie = 'mobile' then round(100 * (a.scores ->> 'seo')::numeric) end) as seo_technique,
         max(case when a.strategie = 'mobile' then round(100 * (a.scores ->> 'accessibilite')::numeric) end) as accessibilite,
         max(case when a.strategie = 'mobile' then round(100 * (a.scores ->> 'bonnes_pratiques')::numeric) end) as bonnes_pratiques,
         max(a.recu_le) as analyse_le
  from public.vis_analyses_v3 a
  where a.derniere and a.nature = 'lighthouse'
  group by a.subject_id
), ia as (
  -- Dernière fenêtre de mesure close du pilotage (référence ou remesure) ; les fenêtres hors
  -- panel n'y sont pas.
  select distinct on (f.subject_id) f.subject_id, f.window_id
  from vis_ui.fenetre_courante f
  where f.statut = 'close' and f.nature in ('reference','remesure')
  order by f.subject_id, f.statut_le desc
), fam as (
  -- Présence par famille (non marquée / marquée), réponses jugées, dernière fenêtre close.
  select r.subject_id, r.window_id,
         round(100.0 * count(*) filter (where r.marque_citee and not coalesce(q.marquee, false)) / nullif(count(*) filter (where r.marque_citee is not null and not coalesce(q.marquee, false)), 0)) as non_marquee,
         round(100.0 * count(*) filter (where r.marque_citee and coalesce(q.marquee, false)) / nullif(count(*) filter (where r.marque_citee is not null and coalesce(q.marquee, false)), 0)) as marquee
  from vis_ui.base_reponse r
  join ia on ia.window_id = r.window_id
  left join vis_ui.question q on q.subject_id = r.subject_id and q.question_id = r.prompt_id and q.version = r.prompt_version
  group by r.subject_id, r.window_id
), s as (
  select su.id as subject_id, su.client_id,
         lh.performance_mobile, lh.performance_ordinateur, lh.seo_technique, lh.accessibilite, lh.bonnes_pratiques, lh.analyse_le,
         fam.non_marquee as visibilite_ia, fam.marquee as notoriete_ia, ia.window_id as fenetre_ia,
         (select count(*) from public.vis_constats_v3 c where c.subject_id = su.id and c.etat = 'ouvert' and c.gravite = 'critique')::int as constats_critiques,
         (select count(*) from public.vis_constats_v3 c where c.subject_id = su.id and c.etat = 'ouvert')::int as constats_ouverts,
         (select count(*) from public.vis_constats_v3 c where c.subject_id = su.id and c.etat = 'resolu')::int as constats_resolus
  from vis.subject su
  left join lh on lh.subject_id = su.id
  left join ia on ia.subject_id = su.id
  left join fam on fam.subject_id = su.id
)
select s.subject_id, s.client_id,
       vis_ui.score_pondere(jsonb_build_object('performance_mobile', s.performance_mobile, 'performance_ordinateur', s.performance_ordinateur,
         'seo_technique', s.seo_technique, 'accessibilite', s.accessibilite, 'bonnes_pratiques', s.bonnes_pratiques,
         'visibilite_ia', s.visibilite_ia, 'notoriete_ia', s.notoriete_ia)) as score,
       s.performance_mobile, s.performance_ordinateur, s.seo_technique, s.accessibilite, s.bonnes_pratiques,
       s.visibilite_ia, s.notoriete_ia,
       array_remove(array[
         case when s.performance_mobile is null then 'performance_mobile' end,
         case when s.performance_ordinateur is null then 'performance_ordinateur' end,
         case when s.seo_technique is null then 'seo_technique' end,
         case when s.accessibilite is null then 'accessibilite' end,
         case when s.bonnes_pratiques is null then 'bonnes_pratiques' end,
         case when s.visibilite_ia is null then 'visibilite_ia' end,
         case when s.notoriete_ia is null then 'notoriete_ia' end], null) as manquantes,
       s.analyse_le, s.fenetre_ia, s.constats_critiques, s.constats_ouverts, s.constats_resolus
from s;

-- Historique : un point par composante et par date (analyses Lighthouse réussies, fenêtres
-- closes). Pour les courbes d'évolution ; jamais de valeur reportée d'une date à l'autre.
create or replace view public.vis_score_historique_v3 with (security_invoker = true) as
select a.client_id, a.subject_id, a.recu_le as le, 'analyse'::text as origine, a.id::text as reference, c.k as composante,
       round(100 * (a.scores ->> c.src)::numeric) as valeur
from vis.analyse a
cross join lateral (values ('performance_mobile', 'performance', 'mobile'), ('performance_ordinateur', 'performance', 'ordinateur'),
                           ('seo_technique', 'seo', 'mobile'), ('accessibilite', 'accessibilite', 'mobile'),
                           ('bonnes_pratiques', 'bonnes_pratiques', 'mobile')) as c(k, src, strat)
where a.nature = 'lighthouse' and a.statut = 'fait' and a.strategie = c.strat and jsonb_typeof(a.scores -> c.src) = 'number'
union all
select r.client_id, r.subject_id, (w.ends_on + 1)::timestamptz, 'fenetre', w.id, f.k,
       round(100.0 * count(*) filter (where r.marque_citee and coalesce(q.marquee, false) = f.marquee)
             / nullif(count(*) filter (where r.marque_citee is not null and coalesce(q.marquee, false) = f.marquee), 0))
from vis_ui.base_reponse r
join vis.window w on w.id = r.window_id and w.status = 'done'
join vis.fenetre fe on fe.window_id = w.id and fe.nature in ('reference','remesure')
left join vis_ui.question q on q.subject_id = r.subject_id and q.question_id = r.prompt_id and q.version = r.prompt_version
cross join (values ('visibilite_ia', false), ('notoriete_ia', true)) as f(k, marquee)
group by r.client_id, r.subject_id, w.ends_on, w.id, f.k, f.marquee;

do $$
declare v text;
begin
  for v in select unnest(array['vis_analyses_v3','vis_constats_v3','vis_score_v3','vis_score_historique_v3']) loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 3. Geste : analyser maintenant (gratuit, aucun GO)
-- ------------------------------------------------------------------
create or replace function public.vis_demander_analyse(p_subject text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  did uuid;
  url_ text;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  perform pg_advisory_xact_lock(hashtext('vis.analyse:' || p_subject));
  -- Une seule analyse à la fois par site : un double clic rend la même demande.
  select d.id into did from vis_ui.demande_courante d
  where d.subject_id = p_subject and d.type = 'ANALYSE' and d.statut in ('QUEUED','RUNNING')
  order by d.demande_le desc limit 1;
  if did is not null then return did; end if;
  select st.primary_url into url_ from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = p_subject order by st.id limit 1;
  if url_ is null then raise exception 'aucune adresse de site pour ce sujet' using errcode = '55000'; end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, p_subject, 'ANALYSE', jsonb_build_object('url', url_, 'strategies', jsonb_build_array('mobile','ordinateur')), uid)
    returning id into did;
  perform vis_ui.journaliser('vis_demander_analyse', cid, p_subject, jsonb_build_object('p_subject', p_subject), jsonb_build_object('demande', did), uid);
  return did;
end $$;
revoke all on function public.vis_demander_analyse(text) from public, anon;
grant execute on function public.vis_demander_analyse(text) to authenticated;

-- ------------------------------------------------------------------
-- 4. Moteur
-- ------------------------------------------------------------------
create or replace function public.vis_moteur_analyse(p_demande uuid, p_analyse jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  aid uuid;
  a jsonb := p_analyse;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null then raise exception 'demande introuvable' using errcode = 'P0002'; end if;
  if d.type <> 'ANALYSE' or d.subject_id is null then raise exception 'demande % : pas une analyse', p_demande using errcode = '22023'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  insert into vis.analyse (client_id, subject_id, demande_id, nature, strategie, url, outil, statut, scores, metriques, resultat, erreur)
  values (d.client_id, d.subject_id, d.id, a ->> 'nature', nullif(a ->> 'strategie', ''), a ->> 'url', a ->> 'outil', a ->> 'statut',
          coalesce(a -> 'scores', '{}'::jsonb), coalesce(a -> 'metriques', '{}'::jsonb), coalesce(a -> 'resultat', '{}'::jsonb), nullif(a ->> 'erreur', ''))
  returning id into aid;
  return aid;
end $$;

create or replace function public.vis_moteur_constat(p_demande uuid, p_analyse uuid, p_constat jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  cid uuid;
  c jsonb := p_constat;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'ANALYSE' then raise exception 'demande d''analyse introuvable' using errcode = 'P0002'; end if;
  if p_analyse is not null and not exists (select 1 from vis.analyse where id = p_analyse and demande_id = p_demande) then
    raise exception 'analyse d''une autre demande' using errcode = '22023';
  end if;
  insert into vis.constat (client_id, subject_id, analyse_id, demande_id, cle, source, categorie, gravite, titre, explication, correction,
                           impact, effort, qui, valeur, preuve)
  values (d.client_id, d.subject_id, p_analyse, d.id, c ->> 'cle', c ->> 'source', c ->> 'categorie', c ->> 'gravite', c ->> 'titre',
          c ->> 'explication', c ->> 'correction', nullif(c ->> 'impact', ''), c ->> 'effort', c ->> 'qui', nullif(c ->> 'valeur', ''),
          coalesce(c -> 'preuve', '{}'::jsonb))
  returning id into cid;
  return cid;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array['public.vis_moteur_analyse(uuid, jsonb)', 'public.vis_moteur_constat(uuid, uuid, jsonb)']) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

comment on view public.vis_score_v3 is 'Contrat Visibility v3 : score du site (0 à 100) et ses composantes ; null si non mesurée, jamais 0.';

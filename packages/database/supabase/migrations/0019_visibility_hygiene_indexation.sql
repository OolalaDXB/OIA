-- 0019 · Visibility : hygiène d'indexation, agentique et gratuite (aucun modèle de langage).
--
-- Chaque jour, pour chaque site, le moteur :
--   1. contrôle le site EN LIGNE (règles fixes) : robots.txt, sitemap (déclaré, lisible, même
--      domaine, pages en 200, sans noindex), llms.txt, vrai statut 404, titre, description
--      (25 à 160 caractères), canonical, langue, JSON-LD, sur l'accueil et un échantillon du sitemap ;
--   2. interroge Bing Webmaster Tools par son API (clé BING_WEBMASTER_API_KEY, secret du dépôt) :
--      site vérifié, sitemaps soumis et leur état, problèmes d'exploration, statistiques ;
--      et SOUMET le sitemap s'il ne l'est pas (action sans risque, idempotente, consignée) ;
--   3. écrit une analyse « indexation » et un constat par écart (source « indexation »), qui
--      entrent dans le plan d'action unique.
--   2 bis. interroge Google Search Console (compte de service, secret GSC_SERVICE_ACCOUNT_JSON) :
--      propriété, sitemaps et erreurs, inspection d'un échantillon (indexée ? canonique ?), requêtes ;
--      et soumet le sitemap s'il manque (autorisation Complète seulement).
--
-- Retour arrière : drop view public.vis_hygiene_v3 ; drop function public.vis_demander_hygiene(text),
--   public.vis_moteur_planifier_hygiene() ; vis_moteur_analyse / vis_moteur_constat de la 0016 ;
--   vis_constats_v3 et vis_plan_action_v3 de la 0016 / 0018 ; contrainte demande_type_check sans HYGIENE.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA','NOTE_CONTENU','EXTRAIRE_PLAN','HYGIENE'));

-- Nature et source « indexation » réservées à HYGIENE, « contenu » à NOTE_CONTENU.
create or replace function vis_ui.nature_attendue(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case p_type when 'NOTE_CONTENU' then 'contenu' when 'HYGIENE' then 'indexation' else null end
$$;

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
  if d.type not in ('ANALYSE', 'NOTE_CONTENU', 'HYGIENE') or d.subject_id is null then raise exception 'demande % : pas une analyse', p_demande using errcode = '22023'; end if;
  if (a ->> 'nature') in ('contenu', 'indexation') or vis_ui.nature_attendue(d.type) is not null then
    if vis_ui.nature_attendue(d.type) is distinct from (a ->> 'nature') then
      raise exception 'nature « % » refusée pour une demande %', a ->> 'nature', d.type using errcode = '22023';
    end if;
  end if;
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
  if d.id is null or d.type not in ('ANALYSE', 'NOTE_CONTENU', 'HYGIENE') then raise exception 'demande d''analyse introuvable' using errcode = 'P0002'; end if;
  if (c ->> 'source') in ('contenu', 'indexation') or vis_ui.nature_attendue(d.type) is not null then
    if vis_ui.nature_attendue(d.type) is distinct from (c ->> 'source') then
      raise exception 'source « % » refusée pour une demande %', c ->> 'source', d.type using errcode = '22023';
    end if;
  end if;
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

-- Constats : l'état se compare aussi à la dernière hygiène terminée.
create or replace view public.vis_constats_v3 with (security_invoker = true) as
with dernier as (
  select distinct on (c.subject_id, c.cle) c.*, dm.type as demande_type
  from vis.constat c join vis.demande dm on dm.id = c.demande_id
  order by c.subject_id, c.cle, c.cree_le desc, c.id desc
), derniere_demande as (
  select distinct on (d.subject_id, d.type) d.subject_id, d.type, d.id
  from vis.demande d join vis.demande_etat e on e.demande_id = d.id and e.statut = 'DONE'
  where d.type in ('ANALYSE', 'NOTE_CONTENU', 'HYGIENE')
  order by d.subject_id, d.type, e.le desc
)
select c.id, c.client_id, c.subject_id, c.cle, c.source, c.categorie, c.gravite, c.titre, c.explication,
       c.correction, c.impact, c.effort, c.qui, c.valeur, c.preuve, c.analyse_id,
       (select min(x.cree_le) from vis.constat x where x.subject_id = c.subject_id and x.cle = c.cle) as premiere_fois,
       c.cree_le as derniere_fois,
       case when dd.id is null or c.demande_id = dd.id then 'ouvert' else 'resolu' end as etat,
       case c.gravite when 'critique' then 1 when 'important' then 2 else 3 end as ordre
from dernier c
left join derniere_demande dd on dd.subject_id = c.subject_id and dd.type = c.demande_type;

-- Plan d'action : libellé de l'origine « indexation ».
create or replace view public.vis_plan_action_v3 with (security_invoker = true) as
with recos as (
  select r.id, r.client_id, r.subject_id, 'recommandation'::text as nature,
         vis_ui.origine_reco(r.cree_par) as origine, r.cree_par as origine_ref,
         upper(coalesce(nullif(rec.payload ->> 'priorite_audit', ''), substring(r.id from '-(p[0-3])(?:-|$)'),
               case when r.impact = 'high' and r.effort in ('XS','S') then 'P0' when r.impact = 'high' then 'P1' when r.impact = 'medium' then 'P2' else 'P3' end)) as priorite,
         r.titre,
         btrim(split_part(r.enonce, ' Pourquoi :', 1)) as quoi_faire,
         nullif(btrim(split_part(r.enonce, ' Pourquoi :', 2)), '') as pourquoi,
         r.type as categorie, r.impact, r.effort, null::text as qui,
         case r.etat when 'pending' then 'a_valider' when 'approved' then 'a_faire' when 'executed' then 'fait' when 'measured' then 'mesure' when 'rejected' then 'refuse' else r.etat end as etat,
         r.cree_le as le, r.window_id as reference
  from public.vis_recommandations_v2 r
  left join vis.recommendation rec on rec.id = r.id
), constats as (
  select c.id::text, c.client_id, c.subject_id, 'constat'::text,
         jsonb_build_object('type', c.source, 'libelle',
           case c.source when 'lighthouse' then 'Analyse Lighthouse' when 'crawl' then 'Lecture du site (Crawlie)' when 'contenu' then 'Note du contenu'
                         when 'indexation' then 'Hygiène d''indexation (site en ligne, Bing)' else initcap(c.source) end,
           'date', to_char(c.derniere_fois at time zone 'UTC', 'YYYY-MM-DD')),
         c.cle,
         case c.gravite when 'critique' then 'P0' when 'important' then 'P1' else 'P2' end,
         c.titre, c.correction, c.explication, c.categorie, c.impact, c.effort, c.qui,
         'a_faire', c.derniere_fois, c.analyse_id::text
  from public.vis_constats_v3 c
  where c.etat = 'ouvert'
)
select x.*,
       case x.priorite when 'P0' then 'Cette semaine' when 'P1' then 'Sous 2 à 6 semaines' when 'P2' then 'Sous 3 à 10 semaines' else 'Ensuite' end as horizon,
       case x.priorite when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end as ordre
from (select * from recos union all select * from constats) x;

-- Geste : contrôler maintenant (gratuit, aucun GO).
create or replace function public.vis_demander_hygiene(p_subject text)
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
  perform pg_advisory_xact_lock(hashtext('vis.hygiene:' || p_subject));
  select d.id into did from vis_ui.demande_courante d
  where d.subject_id = p_subject and d.type = 'HYGIENE' and d.statut in ('QUEUED','RUNNING') order by d.demande_le desc limit 1;
  if did is not null then return did; end if;
  select st.primary_url into url_ from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = p_subject order by st.id limit 1;
  if url_ is null then raise exception 'aucune adresse de site pour ce sujet' using errcode = '55000'; end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, p_subject, 'HYGIENE', jsonb_build_object('url', url_), uid) returning id into did;
  perform vis_ui.journaliser('vis_demander_hygiene', cid, p_subject, jsonb_build_object('p_subject', p_subject), jsonb_build_object('demande', did), uid);
  return did;
end $$;
revoke all on function public.vis_demander_hygiene(text) from public, anon;
grant execute on function public.vis_demander_hygiene(text) to authenticated;

-- Moteur : une hygiène par site et par jour (aucune si une est en file, en cours, ou faite depuis 20 h).
create or replace function public.vis_moteur_planifier_hygiene()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  s record;
begin
  perform vis_ui.exiger_moteur();
  for s in
    select su.id, su.client_id, (select st.primary_url from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = su.id order by st.id limit 1) as url
    from vis.subject su
  loop
    continue when s.url is null;
    continue when exists (select 1 from vis_ui.demande_courante d where d.subject_id = s.id and d.type = 'HYGIENE'
                          and (d.statut in ('QUEUED','RUNNING') or d.demande_le > now() - interval '20 hours'));
    insert into vis.demande (client_id, subject_id, type, charge, demande_par)
      values (s.client_id, s.id, 'HYGIENE', jsonb_build_object('url', s.url), 'moteur (quotidien)');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.vis_moteur_planifier_hygiene() from public, anon, authenticated;
grant execute on function public.vis_moteur_planifier_hygiene() to service_role;

-- Dernière hygiène par site : contrôles, Bing, actions faites.
create or replace view public.vis_hygiene_v3 with (security_invoker = true) as
select distinct on (a.subject_id) a.client_id, a.subject_id, a.id as analyse_id, a.demande_id, a.url, a.statut, a.scores, a.metriques,
       a.resultat -> 'controles' as controles, a.resultat -> 'bing' as bing, a.resultat -> 'actions' as actions, a.recu_le,
       (select count(*) from public.vis_constats_v3 c where c.subject_id = a.subject_id and c.source = 'indexation' and c.etat = 'ouvert')::int as ecarts_ouverts
from vis.analyse a
where a.nature = 'indexation'
order by a.subject_id, a.recu_le desc;
revoke all on public.vis_hygiene_v3 from public, anon, authenticated;
grant select on public.vis_hygiene_v3 to authenticated;

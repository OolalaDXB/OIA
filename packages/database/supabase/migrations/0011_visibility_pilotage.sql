-- 0011 · Visibility : pilotage depuis le cockpit (contrat v2, mandat v16, bloc A).
-- PROPOSÉE, NON APPLIQUÉE. Contrat : docs/interface/contrat-donnees-visibility-v2.md.
--
-- Prérequis, dans cet ordre : vis 0001 à 0005, 0006 (vues v1), 0010 (vues v2 de
-- comparaison), vis 0006_pilotage (tables). Les vues v1 et celles de 0010 ne changent pas.
--
-- Contenu :
--  1. aides internes (vis_ui, non exposé) : heure de référence, contrôles de rôle,
--     validation des contenus, budget, états courants ;
--  2. vues v2 du contrat ;
--  3. fonctions des gestes (accordées à `authenticated`) ;
--  4. fonctions du moteur (accordées à `service_role` seulement).
--
-- Fonctions `security definer`, chemin de recherche vide, avec contrôle explicite du rôle :
--  * geste : auth.uid() non nul, pas une identité de service (vis.service_identity), membre
--    du client au rôle `owner` ou `approver` ; `owner` du client technique `oia` pour un
--    nouveau client et pour les plafonds ;
--  * moteur : exécution révoquée pour `anon` et `authenticated` ; si la session porte un
--    auth.uid(), ce doit être une identité de service.
-- Erreurs : 42501 (droit refusé), 22023 (valeur refusée), P0002 (introuvable), 55000
-- (étape incompatible). Chaque geste réussi écrit une ligne de vis.geste.
--
-- Heure : les fonctions utilisent now(). Les vues qui dépendent du jour (jour courant, mois
-- en cours, état du moteur) lisent vis_ui.maintenant(), égale à now() sauf si la session
-- pose `vis.maintenant` (démonstration et tests seulement ; sans effet sur les écritures).
--
-- Retour arrière (dans une transaction, avant celui de vis 0006_pilotage) :
--   drop view if exists public.vis_jugements_moteurs_v2, public.vis_jugements_v2, public.vis_reponses_sources_v2, public.vis_couts_moteurs_v2;
--   drop view if exists public.vis_portefeuille_v2, public.vis_demandes_v2, public.vis_propositions_v2,
--     public.vis_fenetres_v2, public.vis_budget_v2, public.vis_alertes_v2, public.vis_moteur_v2,
--     public.vis_pages_client_v2, vis_ui.demande_courante, vis_ui.proposition_courante, vis_ui.fenetre_courante;
--   drop function if exists public.vis_demander_site(text, text, text[], text[], text, text),
--     public.vis_modifier_proposition(text, jsonb), public.vis_ajouter_proposition(text, text, jsonb),
--     public.vis_valider_faits(text, text[], text[]), public.vis_valider_panel(text, text[]),
--     public.vis_go_reconnaissance(text, numeric), public.vis_valider_concurrents(text, text[], text[]),
--     public.vis_go_fenetre(text, date, numeric), public.vis_annuler_fenetre(text, text),
--     public.vis_valider_rapport(uuid), public.vis_declarer_execution(text, text, date, text),
--     public.vis_fixer_plafond(text, numeric), public.vis_relancer_demande(uuid), public.vis_acquitter_alerte(uuid),
--     public.vis_moteur_prendre(text), public.vis_moteur_terminer(uuid, jsonb, text),
--     public.vis_moteur_signe(text, text, timestamptz), public.vis_moteur_sujet(text), public.vis_moteur_go(text, text),
--     public.vis_moteur_proposer(text, text, text, jsonb, text),
--     public.vis_moteur_estimer(text, text, text, text, text, int, int, text[], numeric, jsonb, text),
--     public.vis_moteur_fenetre(text, text, text, date), public.vis_moteur_jour(text, text, int, date, text, jsonb),
--     public.vis_moteur_preuves(jsonb), public.vis_moteur_page(text, text, text, text, text),
--     public.vis_moteur_recommandation(text, text, jsonb), public.vis_moteur_alerter(text, text, text, text, text),
--     vis_ui.maintenant(), vis_ui.slug(text), vis_ui.exiger_humain(text, text[]), vis_ui.exiger_moteur(),
--     vis_ui.journaliser(text, text, text, jsonb, jsonb, text), vis_ui.contenu_valide(text, jsonb),
--     vis_ui.statut_demande(uuid), vis_ui.plafond(text), vis_ui.reel(text, date), vis_ui.engage(text, date),
--     vis_ui.go(text, text, date, numeric), vis_ui.role_appelant();

begin;

-- ------------------------------------------------------------------
-- 1. Aides internes
-- ------------------------------------------------------------------
create or replace function vis_ui.maintenant() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('vis.maintenant', true), '')::timestamptz, now())
$$;

create or replace function vis_ui.slug(t text) returns text
language sql immutable as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), 63)
$$;

-- Rôle de la session qui appelle : celui posé par `set role` (PostgREST : authenticated ;
-- moteur : service_role), lu dans le réglage `role`, que `security definer` ne change pas ;
-- sans `set role`, l'utilisateur de connexion.
create or replace function vis_ui.role_appelant() returns text
language sql stable as $$
  select case when current_setting('role') = 'none' then session_user::text else current_setting('role') end
$$;

-- Geste humain : session `authenticated`, identité vérifiée, pas un service, rôle permis sur
-- le client. Rend auth.uid(). `service_role` est refusé, même avec une identité.
create or replace function vis_ui.exiger_humain(p_client text, p_roles text[] default array['owner','approver'])
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  uid text := auth.uid()::text;
  r text;
begin
  if vis_ui.role_appelant() <> 'authenticated' then
    raise exception 'geste humain : session authenticated requise (rôle %)', vis_ui.role_appelant() using errcode = '42501';
  end if;
  if uid is null then raise exception 'identité requise' using errcode = '42501'; end if;
  if exists (select 1 from vis.service_identity where user_id = uid) then
    raise exception 'une identité de service ne fait pas de geste humain' using errcode = '42501';
  end if;
  select role into r from vis.client_member where user_id = uid and client_id = p_client;
  if r is null or not (r = any (p_roles)) then
    raise exception 'droit refusé sur le client % (rôle requis : %)', p_client, array_to_string(p_roles, ' ou ') using errcode = '42501';
  end if;
  return uid;
end $$;

-- Moteur : session `service_role` (le moteur se connecte en postgres et pose
-- `set role service_role`) ; si elle porte une identité, ce doit être une identité de service.
create or replace function vis_ui.exiger_moteur() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid text := auth.uid()::text;
begin
  if vis_ui.role_appelant() <> 'service_role' then
    raise exception 'réservé au moteur : session service_role requise (rôle %)', vis_ui.role_appelant() using errcode = '42501';
  end if;
  if uid is not null and not exists (select 1 from vis.service_identity where user_id = uid) then
    raise exception 'réservé au moteur (identité de service)' using errcode = '42501';
  end if;
  return coalesce(uid, 'moteur');
end $$;

create or replace function vis_ui.journaliser(p_fonction text, p_client text, p_sujet text, p_parametres jsonb, p_resultat jsonb, p_par text)
returns void language sql security definer set search_path = '' as $$
  insert into vis.geste (client_id, subject_id, fonction, parametres, resultat, par)
  values (p_client, p_sujet, p_fonction, coalesce(p_parametres, '{}'::jsonb), p_resultat, p_par);
$$;

-- Contenu d'une proposition, selon sa nature (contrat, « vis_propositions_v2 »).
create or replace function vis_ui.contenu_valide(p_nature text, c jsonb) returns void
language plpgsql immutable as $$
declare
  ok boolean;
begin
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'contenu : objet JSON attendu' using errcode = '22023'; end if;
  ok := case p_nature
    when 'fait' then char_length(coalesce(c ->> 'enonce', '')) >= 5 and char_length(coalesce(c ->> 'categorie', '')) >= 2
    when 'question' then char_length(coalesce(c ->> 'texte', '')) >= 10 and coalesce(c ->> 'langue', '') ~ '^[a-z]{2}$'
                         and jsonb_typeof(c -> 'marquee') = 'boolean' and char_length(coalesce(c ->> 'famille', '')) >= 2
                         and jsonb_typeof(c -> 'moteurs') = 'array'
    when 'concurrent' then char_length(coalesce(c ->> 'nom', '')) >= 2 and coalesce(c ->> 'type', '') in ('personne','structure','plateforme')
                           and jsonb_typeof(c -> 'domaines') = 'array' and jsonb_typeof(c -> 'citations') = 'number'
    when 'homonyme' then char_length(coalesce(c ->> 'nom', '')) >= 2 and jsonb_typeof(c -> 'exemple') = 'string' and jsonb_typeof(c -> 'citations') = 'number'
    when 'audit' then char_length(coalesce(c ->> 'controle', '')) >= 2 and coalesce(c ->> 'etat', '') in ('conforme','alerte','bloquant')
                      and jsonb_typeof(c -> 'detail') = 'string'
    else null
  end;
  if ok is null then raise exception 'nature inconnue « % »', p_nature using errcode = '22023'; end if;
  if not ok then raise exception 'contenu non conforme à la nature « % »', p_nature using errcode = '22023'; end if;
end $$;

create or replace function vis_ui.statut_demande(p_demande uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.statut from vis.demande_etat e where e.demande_id = p_demande order by e.id desc limit 1), 'QUEUED')
$$;

-- Budget : fonctions `security invoker`. Dans une vue, elles ne voient que les lignes
-- permises à l'appelant (RLS) ; dans un geste ou une fonction du moteur, tout.
-- Plafond courant d'un client ; p_client null : plafond global.
create or replace function vis_ui.plafond(p_client text) returns numeric
language sql stable security invoker set search_path = '' as $$
  select p.plafond_usd from vis.plafond p where p.client_id is not distinct from p_client order by p.id desc limit 1
$$;

-- Coût réel d'un mois (UTC) : coûts des preuves du client ; p_client null : tous les clients.
create or replace function vis_ui.reel(p_client text, p_mois date) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(e.cost_usd), 0)::numeric from vis.evidence e
  where (p_client is null or e.client_id = p_client)
    and e.received_at >= p_mois::timestamp at time zone 'UTC' and e.received_at < (p_mois + interval '1 month')::timestamp at time zone 'UTC'
$$;

-- Engagé d'un mois : pour chaque GO du mois dont la fenêtre n'est ni close ni annulée, le
-- coût vu au GO moins ce qui est déjà dépensé par cette fenêtre (jamais négatif).
create or replace function vis_ui.engage(p_client text, p_mois date) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(greatest(g.cout_vu_usd - coalesce((select sum(e.cost_usd) from vis.evidence e where e.window_id = g.window_id), 0), 0)), 0)::numeric
  from vis.fenetre_go g
  where (p_client is null or g.client_id = p_client) and g.mois = p_mois
    and coalesce((select s.statut from vis.fenetre_statut s where s.window_id = g.window_id order by s.id desc limit 1), 'proposee') not in ('close','annulee')
$$;

-- États courants (vues internes, appliquent la RLS de l'appelant).
create or replace view vis_ui.demande_courante with (security_invoker = true) as
select d.id, d.client_id, d.subject_id, d.type, d.charge, d.demande_par, d.demande_le, d.relance_de,
       coalesce(e.statut, 'QUEUED') as statut, e.le as statut_le, e.hote,
       case when e.statut in ('RUNNING','DONE','FAILED') then r.le end as commencee_le,
       f.le as terminee_le, f.resultat, f.erreur,
       (select count(*) from vis.demande_etat x where x.demande_id = d.id and x.statut = 'RUNNING')::int as tentatives
from vis.demande d
left join lateral (select x.statut, x.le, x.hote from vis.demande_etat x where x.demande_id = d.id order by x.id desc limit 1) e on true
left join lateral (select x.le from vis.demande_etat x where x.demande_id = d.id and x.statut = 'RUNNING' order by x.id desc limit 1) r on true
left join lateral (select x.le, x.resultat, x.erreur from vis.demande_etat x where x.demande_id = d.id and x.statut in ('DONE','FAILED','CANCELLED') limit 1) f on true;

create or replace view vis_ui.proposition_courante with (security_invoker = true) as
select p.element_id as id, p.client_id, p.subject_id, p.nature, p.version, p.contenu, p.source, p.propose_par, p.propose_le,
       coalesce(dd.etat, 'propose') as etat, dd.par as decide_par, dd.le as decide_le
from (select distinct on (element_id) * from vis.proposition order by element_id, version desc) p
left join lateral (select x.etat, x.par, x.le from vis.proposition_decision x where x.element_id = p.element_id order by x.id desc limit 1) dd on true;

create or replace view vis_ui.fenetre_courante with (security_invoker = true) as
select f.window_id, f.client_id, f.subject_id, f.nature, f.libelle, f.compare_avec, f.jours_prevus, f.cree_le,
       coalesce(s.statut, 'proposee') as statut, s.le as statut_le,
       coalesce((select x.debut from vis.fenetre_statut x where x.window_id = f.window_id and x.debut is not null order by x.id desc limit 1), g.debut) as debut,
       e.id as estimation_id, e.cout_estime_usd, e.detail as detail_estimation, e.questions, e.moteurs, e.heure_utc, e.le as estime_le,
       g.id as go_id, g.par as go_par, g.le as go_le, g.cout_vu_usd, g.mois as go_mois,
       (select coalesce(sum(ev.cost_usd), 0) from vis.evidence ev where ev.window_id = f.window_id) as cout_reel_usd
from vis.fenetre f
left join lateral (select x.statut, x.le from vis.fenetre_statut x where x.window_id = f.window_id order by x.id desc limit 1) s on true
left join lateral (select x.* from vis.fenetre_estimation x where x.window_id = f.window_id order by x.id desc limit 1) e on true
left join vis.fenetre_go g on g.window_id = f.window_id;

revoke all on function vis_ui.exiger_humain(text, text[]), vis_ui.exiger_moteur(), vis_ui.journaliser(text, text, text, jsonb, jsonb, text),
  vis_ui.statut_demande(uuid) from public, anon, authenticated;
revoke all on function vis_ui.plafond(text), vis_ui.reel(text, date), vis_ui.engage(text, date) from public, anon;
grant execute on function vis_ui.role_appelant() to authenticated, service_role;
grant execute on function vis_ui.maintenant(), vis_ui.slug(text), vis_ui.plafond(text), vis_ui.reel(text, date), vis_ui.engage(text, date) to authenticated;
revoke all on vis_ui.demande_courante, vis_ui.proposition_courante, vis_ui.fenetre_courante from public, anon, authenticated;
grant select on vis_ui.demande_courante, vis_ui.proposition_courante, vis_ui.fenetre_courante to authenticated;

-- ------------------------------------------------------------------
-- 2. Vues v2
-- ------------------------------------------------------------------
create or replace view public.vis_demandes_v2 with (security_invoker = true) as
select id, client_id, subject_id, type, charge, statut, demande_le, demande_par, commencee_le, terminee_le, resultat, erreur, tentatives
from vis_ui.demande_courante;

create or replace view public.vis_propositions_v2 with (security_invoker = true) as
select id, client_id, subject_id, nature, version, contenu, source, propose_par, etat, decide_par, decide_le
from vis_ui.proposition_courante;

create or replace view public.vis_fenetres_v2 with (security_invoker = true) as
select f.window_id, f.client_id, f.subject_id, f.nature, f.libelle, f.compare_avec, f.statut, f.debut, f.jours_prevus,
       (select jsonb_agg(jsonb_build_object('jour', g, 'date', f.debut + g - 1, 'etat', coalesce(j.etat, 'a_venir')) order by g)
          from generate_series(1, f.jours_prevus) g left join vis.fenetre_jour j on j.window_id = f.window_id and j.jour = g) as jours,
       f.questions, f.moteurs, f.cout_estime_usd, f.detail_estimation, f.cout_reel_usd,
       f.go_par, f.go_le, f.cout_vu_usd as cout_vu_au_go_usd, f.heure_utc
from vis_ui.fenetre_courante f;

-- Une ligne par client et par mois : le mois en cours, et tout mois qui a des coûts ou des GO.
create or replace view public.vis_budget_v2 with (security_invoker = true) as
with mois as (
  select c.id as client_id, date_trunc('month', vis_ui.maintenant() at time zone 'UTC')::date as mois from vis.client c
  union
  select e.client_id, date_trunc('month', e.received_at at time zone 'UTC')::date from vis.evidence e
  union
  select g.client_id, g.mois from vis.fenetre_go g
), b as (
  select m.client_id, m.mois, vis_ui.plafond(m.client_id) as plafond_usd, vis_ui.engage(m.client_id, m.mois) as engage_usd,
         vis_ui.reel(m.client_id, m.mois) as reel_usd
  from mois m
  where exists (select 1 from vis.client_member cm where cm.user_id = auth.uid()::text and cm.client_id = m.client_id)
)
select b.client_id, b.mois, b.plafond_usd, b.engage_usd, b.reel_usd,
       case when b.plafond_usd is null then 'non_fixe'
            when b.reel_usd + b.engage_usd >= b.plafond_usd then 'atteint'
            when b.reel_usd + b.engage_usd >= 0.8 * b.plafond_usd then 'proche'
            else 'ok' end as etat,
       vis_ui.plafond(null) as plafond_global_usd
from b;

-- Plus, tant que le moteur est muet, une alerte MOTEUR_MUET calculée (le moteur arrêté ne
-- peut pas la lever) : client `oia`, lisible par ses membres, non acquittable.
create or replace view public.vis_alertes_v2 with (security_invoker = true) as
select a.id, a.client_id, a.subject_id, a.gravite, a.type, a.message, a.cree_le, k.par as acquittee_par, k.le as acquittee_le
from vis.alerte a left join vis.alerte_acquit k on k.alerte_id = a.id
union all
select md5('MOTEUR_MUET:' || coalesce(s.id::text, 'jamais'))::uuid, 'oia', null, 'bloquant', 'MOTEUR_MUET',
       case when s.le is null then 'Le moteur n''a jamais signé : les mesures ne tournent pas'
            else 'Moteur muet depuis le ' || to_char(s.le at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC : les mesures ne tournent pas' end,
       coalesce(s.le + interval '2 hours', vis_ui.maintenant()), null, null
from (select 1) un
left join lateral (select x.id, x.le from vis.moteur_signe x order by x.le desc, x.id desc limit 1) s on true
where (s.le is null or vis_ui.maintenant() - s.le > interval '2 hours')
  and exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = 'oia');

create or replace view public.vis_moteur_v2 with (security_invoker = true) as
select s.hote, s.version, s.le as dernier_signe_le, s.prochain as prochain_passage_le,
       case when s.le is null then 'muet'
            when vis_ui.maintenant() - s.le < interval '15 minutes' then 'actif'
            when vis_ui.maintenant() - s.le <= interval '2 hours' then 'en_retard'
            else 'muet' end as etat,
       (select count(*) from vis_ui.demande_courante d where d.statut = 'QUEUED')::int as demandes_en_file
from (select 1) un
left join lateral (select x.* from vis.moteur_signe x order by x.le desc, x.id desc limit 1) s on true
where exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text);

create or replace view public.vis_pages_client_v2 with (security_invoker = true) as
select p.id, p.client_id, p.subject_id, p.window_id, p.nature, p.langue, p.html, p.genere_le,
       case when v.id is null then 'a_valider' else 'valide' end as etat, v.par as valide_par, v.le as valide_le
from vis.page p left join vis.page_validation v on v.page_id = p.id;

-- Portefeuille : une ligne par sujet ; étape calculée, jamais saisie.
create or replace view public.vis_portefeuille_v2 with (security_invoker = true) as
with s as (
  select su.id as subject_id, su.client_id, c.display_name as client_nom, su.status, su.extra,
         (select st.primary_url from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = su.id order by st.id limit 1) as site_url,
         coalesce(su.extra ->> 'displayName', su.id) as nom,
         coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(su.extra -> 'langues') = 'array' then su.extra -> 'langues' else '[]'::jsonb end)), '{}') as langues,
         coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(su.extra -> 'marches') = 'array' then su.extra -> 'marches' else '[]'::jsonb end)), '{}') as marches
  from vis.subject su join vis.client c on c.id = su.client_id
), mois as (
  select date_trunc('month', vis_ui.maintenant() at time zone 'UTC')::date as m
), f as (
  select s.*,
    (select d.statut from vis_ui.demande_courante d where d.subject_id = s.subject_id order by d.demande_le desc, d.id desc limit 1) as dem_statut,
    (select coalesce(d.terminee_le, d.statut_le, d.demande_le) from vis_ui.demande_courante d where d.subject_id = s.subject_id order by d.demande_le desc, d.id desc limit 1) as dem_le,
    (select d.statut from vis_ui.demande_courante d where d.subject_id = s.subject_id and d.type = 'SITE_ADD' order by d.demande_le desc, d.id desc limit 1) as ajout_statut,
    (select coalesce(d.commencee_le, d.demande_le) from vis_ui.demande_courante d where d.subject_id = s.subject_id and d.type = 'SITE_ADD' order by d.demande_le desc, d.id desc limit 1) as ajout_le,
    exists (select 1 from vis_ui.demande_courante d where d.subject_id = s.subject_id and d.statut in ('QUEUED','RUNNING')) as travail_en_attente,
    (select count(*) from vis_ui.proposition_courante p where p.subject_id = s.subject_id and p.nature <> 'audit') as propositions,
    (select max(p.propose_le) from vis_ui.proposition_courante p where p.subject_id = s.subject_id) as propose_le,
    (select count(*) from vis_ui.proposition_courante p where p.subject_id = s.subject_id and p.nature = 'question' and p.etat = 'propose') as questions_a_valider,
    (select count(*) from vis_ui.proposition_courante p where p.subject_id = s.subject_id and p.nature = 'fait' and p.etat = 'propose') as faits_a_valider,
    (select count(*) from vis_ui.proposition_courante p where p.subject_id = s.subject_id and p.nature = 'concurrent' and p.etat = 'propose') as concurrents_a_valider,
    (select max(p.decide_le) from vis_ui.proposition_courante p where p.subject_id = s.subject_id) as decide_le,
    (select max(pa.version) from vis.panel pa where pa.subject_id = s.subject_id) as panel,
    (select w.statut from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature = 'reconnaissance' order by w.cree_le desc limit 1) as reco_statut,
    (select w.go_le from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature = 'reconnaissance' order by w.cree_le desc limit 1) as reco_go_le,
    (select w.cout_estime_usd from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature = 'reconnaissance' order by w.cree_le desc limit 1) as reco_cout,
    (select w.window_id from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours') order by w.cree_le desc limit 1) as active_id,
    (select w.statut from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours') order by w.cree_le desc limit 1) as active_statut,
    (select w.statut_le from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours') order by w.cree_le desc limit 1) as active_le,
    (select w.debut from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours') order by w.cree_le desc limit 1) as active_debut,
    (select w.jours_prevus from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours') order by w.cree_le desc limit 1) as active_jours,
    (select w.statut from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature = 'reference' order by w.cree_le desc limit 1) as ref_statut,
    (select w.cout_estime_usd from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut = 'proposee' order by w.cree_le desc limit 1) as etude_cout,
    (select w.window_id from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut = 'close' order by w.statut_le desc limit 1) as close_id,
    (select w.statut_le from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature in ('reference','remesure') and w.statut = 'close' order by w.statut_le desc limit 1) as close_le,
    (select count(*) from vis_ui.fenetre_courante w where w.subject_id = s.subject_id and w.nature = 'remesure' and w.statut = 'proposee') as remesures_proposees,
    (select max(p.genere_le) from public.vis_pages_client_v2 p where p.subject_id = s.subject_id and p.etat = 'a_valider') as page_a_valider_le,
    (select count(*) from public.vis_recommandations_v1 r where r.subject_id = s.subject_id and r.etat = 'pending') as recos_a_valider,
    (select count(*) from public.vis_recommandations_v1 r where r.subject_id = s.subject_id and r.etat = 'accepted' and r.derniere_execution is null) as actions,
    (select bool_and(coalesce(rc.payload ->> 'owner', 'team') = 'client') from public.vis_recommandations_v1 r join vis.recommendation rc on rc.id = r.id
      where r.subject_id = s.subject_id and r.etat = 'accepted' and r.derniere_execution is null) as actions_client,
    (select max(r.decide_le) from public.vis_recommandations_v1 r where r.subject_id = s.subject_id and r.etat = 'accepted') as recos_decide_le,
    (select max(r.execute_le) from public.vis_recommandations_v1 r where r.subject_id = s.subject_id and r.etat = 'accepted' and r.derniere_execution is not null) as derniere_execution,
    (select count(*) from public.vis_alertes_v2 a where a.subject_id = s.subject_id and a.acquittee_le is null) as alertes_ouvertes,
    (select max(a.cree_le) from public.vis_alertes_v2 a where a.subject_id = s.subject_id and a.acquittee_le is null and a.gravite = 'bloquant') as bloquant_le,
    vis_ui.reel(s.client_id, (select m from mois)) as cout_mois_usd,
    vis_ui.engage(s.client_id, (select m from mois)) as engage_mois_usd,
    vis_ui.plafond(s.client_id) as plafond_mois_usd,
    (select mv.etat from public.vis_moteur_v2 mv) as moteur_etat,
    (select m.role from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = s.client_id) as mon_role
  from s
), p as (
  -- Présence de la marque, questions non marquées, dernière fenêtre close (vis_ui.question,
  -- à défaut la proposition <sujet>:question:<prompt_id>).
  select distinct on (w.subject_id) w.subject_id, n.k, n.n
  from vis.window w
  cross join lateral (
    select count(*) filter (where r.marque_citee) as k, count(*) filter (where r.marque_citee is not null) as n
    from vis_ui.base_reponse r
    left join vis_ui.question q on q.subject_id = r.subject_id and q.question_id = r.prompt_id and q.version = r.prompt_version
    left join vis_ui.proposition_courante pq on pq.id = r.subject_id || ':question:' || r.prompt_id
    where r.window_id = w.id and coalesce(q.marquee, (pq.contenu ->> 'marquee')::boolean) is false
  ) n
  where w.status = 'done' and w.kind in ('baseline','follow-up') and n.n > 0
  order by w.subject_id, w.ends_on desc nulls last, w.id desc
), e as (
  select f.*,
    case
      when f.dem_statut = 'FAILED' or f.bloquant_le is not null
           or (f.plafond_mois_usd is not null and f.cout_mois_usd >= f.plafond_mois_usd)
           or (f.moteur_etat = 'muet' and (f.travail_en_attente or f.active_statut = 'en_cours')) then 'bloque'
      when f.ajout_statut = 'QUEUED' then 'demande'
      when f.ajout_statut = 'RUNNING' or (f.ajout_statut = 'DONE' and f.propositions = 0) then 'audit_en_cours'
      when (f.panel is null or coalesce(f.reco_statut, 'proposee') = 'proposee') and f.ref_statut is distinct from 'close' then 'a_valider'
      when f.reco_statut in ('go_donne','en_cours') then 'reconnaissance_en_cours'
      when f.concurrents_a_valider > 0 then 'concurrents_a_valider'
      when f.active_id is not null then 'mesure_en_cours'
      when f.ref_statut is null or f.ref_statut = 'proposee' then 'pret_pour_go'
      when f.page_a_valider_le is not null or f.recos_a_valider > 0 then 'rapport_a_valider'
      when f.actions > 0 then 'actions_en_cours'
      when f.derniere_execution is not null or f.remesures_proposees > 0 then 'remesure_proposee'
      else 'rapport_a_valider'
    end as etape
  from f
)
select e.client_id, e.client_nom, e.subject_id, e.site_url, e.nom, e.langues, e.marches, e.etape,
  case e.etape
    when 'bloque' then case when e.dem_statut = 'FAILED' then 'Lire l''erreur de la demande, puis la relancer'
                            when e.moteur_etat = 'muet' then 'Le moteur est muet : les mesures ne tournent pas'
                            else 'Lire l''alerte' end
    when 'demande' then 'Site en file pour le moteur'
    when 'audit_en_cours' then 'Audit, faits et panel en préparation'
    when 'a_valider' then case when e.panel is null then 'Valider les faits et le panel (' || e.questions_a_valider || ' questions)'
                               when e.reco_cout is not null then 'Lancer la reconnaissance (' || to_char(e.reco_cout, 'FM999990.00') || ' $)'
                               else 'Reconnaissance en cours de chiffrage' end
    when 'reconnaissance_en_cours' then 'Journée de reconnaissance en cours'
    when 'concurrents_a_valider' then 'Valider les concurrents (' || e.concurrents_a_valider || ')'
    when 'pret_pour_go' then case when e.etude_cout is not null then 'Donner le GO de l''étude (' || to_char(e.etude_cout, 'FM999990.00') || ' $)'
                                  else 'Chiffrage de l''étude en cours' end
    when 'mesure_en_cours' then case when e.active_statut = 'go_donne' then 'Démarrage le ' || to_char(e.active_debut, 'YYYY-MM-DD') else 'Collecte quotidienne' end
    when 'rapport_a_valider' then case when e.page_a_valider_le is not null then 'Valider le rapport' when e.recos_a_valider > 0 then 'Valider les recommandations (' || e.recos_a_valider || ')' else 'Relire le rapport' end
    when 'actions_en_cours' then 'Déclarer les exécutions (' || e.actions || ' à faire)'
    when 'remesure_proposee' then case when e.etude_cout is not null then 'Donner le GO de la remesure (' || to_char(e.etude_cout, 'FM999990.00') || ' $)'
                                       else 'Remesure au plus tôt le ' || to_char(e.derniere_execution::date + 21, 'YYYY-MM-DD') end
  end as prochaine_action,
  case
    when e.etape in ('demande','audit_en_cours','reconnaissance_en_cours','mesure_en_cours') then 'moteur'
    when e.etape = 'a_valider' and e.panel is not null and e.reco_cout is null then 'moteur'
    when e.etape = 'pret_pour_go' and e.etude_cout is null then 'moteur'
    when e.etape = 'remesure_proposee' and e.etude_cout is null then 'moteur'
    when e.etape = 'actions_en_cours' and e.actions_client then 'client'
    else 'mickael'
  end as qui,
  case e.etape
    when 'bloque' then coalesce(e.bloquant_le, e.dem_le)
    when 'demande' then e.ajout_le
    when 'audit_en_cours' then e.ajout_le
    when 'a_valider' then greatest(e.propose_le, e.decide_le)
    when 'reconnaissance_en_cours' then e.reco_go_le
    when 'concurrents_a_valider' then e.propose_le
    when 'pret_pour_go' then e.decide_le
    when 'mesure_en_cours' then e.active_le
    when 'rapport_a_valider' then coalesce(e.page_a_valider_le, e.close_le)
    when 'actions_en_cours' then e.recos_decide_le
    when 'remesure_proposee' then e.derniere_execution
  end as depuis_le,
  coalesce(e.active_id, case when e.etape = 'rapport_a_valider' then e.close_id end) as fenetre_active,
  case when e.active_statut = 'en_cours' and e.active_debut is not null
       then least(greatest((vis_ui.maintenant() at time zone 'UTC')::date - e.active_debut + 1, 1), e.active_jours) end as jour_courant,
  case when p.n > 0 then round(p.k::numeric / p.n, 4) end as presence_non_marquee,
  case when p.n > 0 then p.k || ' sur ' || p.n end as presence_effectif,
  e.cout_mois_usd, e.plafond_mois_usd, e.alertes_ouvertes::int as alertes_ouvertes, e.mon_role
from e left join p on p.subject_id = e.subject_id;

-- ------------------------------------------------------------------
-- 2 bis. Écarts relevés par Lovable que la base sait déjà fournir
-- ------------------------------------------------------------------

-- Jugement de Jev par réponse, pour la marque : toujours un extrait (Jev 1.13). Preuves
-- d'Elmo 0.7.7 : structured.jev ; collecteur OIA : structured.mentions.judge. Une réponse
-- sans jugement est « non mesurable », avec sa raison, jamais 0.
create or replace view public.vis_jugements_v2 with (security_invoker = true) as
with r as (
  select e.id, e.client_id, e.subject_id, e.window_id, e.engine, e.prompt_id, e.prompt_language, e.received_at, e.collector_name, e.structured as s,
         coalesce((e.structured ->> 'non_mesuree')::boolean, false) as sans_texte,
         (jsonb_typeof(e.structured -> 'jev') = 'object' or e.structured #>> '{mentions,judge,status}' in ('juge', 'non-envoye')) as juge,
         case when jsonb_typeof(e.structured #> '{jev,assessments}') = 'object' then e.structured #> '{jev,assessments}'
              when e.structured #>> '{mentions,judge,status}' = 'juge' then e.structured #> '{mentions,judge,assessments}' end as a
  from vis.evidence e
), j as (
  select r.*, r.juge and not r.sans_texte as mesure from r
)
select j.id as reponse_id, j.client_id, j.subject_id, j.window_id, j.engine as moteur, j.prompt_id as question_id, j.prompt_language as langue,
       j.received_at as recu_le, j.collector_name as collecteur,
       case when j.mesure then 'extrait' else 'non_mesurable' end as etat,
       'extrait (Jev 1.13)'::text as source,
       case when j.mesure then (j.s ->> 'brandMentioned')::boolean end as marque_citee,
       case when j.mesure and (j.a #>> '{brand,mentioned}')::boolean then j.a #>> '{brand,sentiment}' end as sentiment,
       case when j.mesure and (j.a #>> '{brand,mentioned}')::boolean then (j.a #>> '{brand,position}')::int end as position,
       case when j.mesure and (j.a #>> '{brand,mentioned}')::boolean then (j.a #>> '{brand,mentionCount}')::int end as mentions,
       case when j.mesure then j.a #>> '{brand,passageText}' end as passage,
       case when j.mesure then null
            when j.sans_texte then 'réponse reçue sans texte'
            when j.collector_name = 'elmo' then 'synchronisée avant l''import des jugements de Jev'
            when j.s #>> '{mentions,judge,status}' = 'echec' then 'échec du juge'
            else 'aucun jugement de Jev pour cette réponse' end as raison_non_mesurable
from j;

-- Par fenêtre et par assistant (`tous` pour l'ensemble) : sentiments et position moyenne.
create or replace view public.vis_jugements_moteurs_v2 with (security_invoker = true) as
select g.client_id, g.subject_id, g.window_id, coalesce(g.moteur, 'tous') as moteur,
       count(*)::int as reponses,
       count(*) filter (where g.etat = 'extrait')::int as jugees,
       count(*) filter (where g.etat = 'non_mesurable')::int as non_mesurables,
       count(*) filter (where g.marque_citee)::int as marque_citee,
       count(*) filter (where g.sentiment = 'positive')::int as sentiment_positif,
       count(*) filter (where g.sentiment = 'neutral')::int as sentiment_neutre,
       count(*) filter (where g.sentiment = 'negative')::int as sentiment_negatif,
       count(*) filter (where g.sentiment = 'mixed')::int as sentiment_mixte,
       round(avg(g.position), 2) as position_moyenne,
       case when count(*) filter (where g.etat = 'extrait') = 0 then 'non_mesurable' else 'mesure' end as etat,
       case when count(*) filter (where g.etat = 'extrait') = 0 then 'aucune réponse jugée par Jev'
            when count(*) filter (where g.marque_citee) = 0 then 'marque jamais citée : sentiment et position sans objet' end as raison,
       'extrait (Jev 1.13)'::text as source
from public.vis_jugements_v2 g
group by grouping sets ((g.client_id, g.subject_id, g.window_id, g.moteur), (g.client_id, g.subject_id, g.window_id));

-- Sources d'une réponse : adresses citées (vis.evidence.citations) et recherches lancées
-- par l'assistant (structured.webQueries). « unavailable », ou une liste vide d'OpenRouter,
-- veut dire « non fourni », jamais « aucune recherche ».
create or replace view public.vis_reponses_sources_v2 with (security_invoker = true) as
select e.id as reponse_id, e.client_id, e.subject_id, e.window_id, e.engine as moteur, e.prompt_id as question_id, e.received_at as recu_le,
       coalesce((select jsonb_agg(jsonb_build_object('ordre', c.o, 'url', c.url, 'titre', c.x ->> 'title', 'domaine', vis_ui.domaine(c.url)) order by c.o)
                 from (select x, o, case jsonb_typeof(x) when 'string' then x #>> '{}' else x ->> 'url' end as url
                       from jsonb_array_elements(case when jsonb_typeof(e.citations) = 'array' then e.citations else '[]'::jsonb end) with ordinality as t(x, o)) c
                 where c.url is not null), '[]'::jsonb) as citations,
       (select count(*) from jsonb_array_elements(case when jsonb_typeof(e.citations) = 'array' then e.citations else '[]'::jsonb end))::int as nb_citations,
       case w.etat when 'fourni' then w.q end as recherches,
       w.etat as etat_recherches
from vis.evidence e
cross join lateral (
  select e.structured -> 'webQueries' as q,
         case when e.structured -> 'webQueries' is null then 'non_fourni'
              when jsonb_typeof(e.structured -> 'webQueries') = 'string' then 'non_fourni'
              when jsonb_typeof(e.structured -> 'webQueries') <> 'array' then 'non_fourni'
              when e.structured -> 'webQueries' @> '["unavailable"]'::jsonb then 'non_fourni'
              when jsonb_array_length(e.structured -> 'webQueries') = 0 and coalesce(e.structured ->> 'provider', '') like 'openrouter%' then 'non_fourni'
              when jsonb_array_length(e.structured -> 'webQueries') = 0 then 'aucune'
              else 'fourni' end as etat
) w;

-- Coût par fenêtre et par assistant (`tous` pour l'ensemble) : estimé (somme de cost_usd de
-- toutes les réponses) ; réel quand le collecteur OIA le donne (réponse + juge).
create or replace view public.vis_couts_moteurs_v2 with (security_invoker = true) as
select e.client_id, e.subject_id, e.window_id, coalesce(e.engine, 'tous') as moteur,
       count(*)::int as reponses,
       sum(e.cost_usd) as cout_estime_usd,
       count(*) filter (where e.collector_name = 'oia-direct')::int as reponses_cout_reel,
       case when count(*) filter (where e.collector_name = 'oia-direct') > 0
            then sum(e.cost_usd + coalesce((e.structured #>> '{mentions,judge,cost,usd}')::numeric, 0)) filter (where e.collector_name = 'oia-direct') end as cout_reel_usd
from vis.evidence e
group by grouping sets ((e.client_id, e.subject_id, e.window_id, e.engine), (e.client_id, e.subject_id, e.window_id));

do $$
declare v text;
begin
  for v in select unnest(array['vis_portefeuille_v2', 'vis_demandes_v2', 'vis_propositions_v2', 'vis_fenetres_v2', 'vis_budget_v2',
                               'vis_alertes_v2', 'vis_moteur_v2', 'vis_pages_client_v2',
                               'vis_jugements_v2', 'vis_jugements_moteurs_v2', 'vis_reponses_sources_v2', 'vis_couts_moteurs_v2']) loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 3. Gestes du cockpit
-- ------------------------------------------------------------------

create or replace function public.vis_demander_site(p_url text, p_nom text, p_langues text[], p_marches text[], p_client_id text default null, p_client_nom text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid text;
  cid text;
  sid text;
  did uuid;
  x text;
  cnom text;
begin
  if p_url is null or p_url !~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$' then
    raise exception 'adresse refusée : adresse publique en https attendue, en minuscules' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nom, ''))) < 2 then raise exception 'nom de la marque obligatoire' using errcode = '22023'; end if;
  if coalesce(cardinality(p_langues), 0) = 0 then raise exception 'au moins une langue' using errcode = '22023'; end if;
  foreach x in array p_langues loop
    if x !~ '^[a-z]{2}$' then raise exception 'langue refusée « % » (fr, en…)', x using errcode = '22023'; end if;
  end loop;
  if coalesce(cardinality(p_marches), 0) = 0 then raise exception 'au moins un marché' using errcode = '22023'; end if;
  foreach x in array p_marches loop
    if x !~ '^[A-Z]{2}$' then raise exception 'marché refusé « % » (FR, AE…)', x using errcode = '22023'; end if;
  end loop;
  -- Comme dryRunSiteInit (src/site-init.ts) : hôte sans « www. », points et caractères hors
  -- [a-z0-9-] en tirets, tirets finaux retirés.
  sid := regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(substring(p_url from '^https://([^/]+)')), '^www\.', ''), '\.', '-', 'g'), '[^a-z0-9-]', '-', 'g'), '-+$', '');
  if sid !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'adresse refusée : identifiant de sujet impossible (%)', sid using errcode = '22023'; end if;
  cnom := coalesce((select display_name from vis.client where id = p_client_id), btrim(p_client_nom));
  perform pg_advisory_xact_lock(hashtext('vis.site:' || sid));
  if exists (select 1 from vis.subject where id = sid) then
    -- Mêmes paramètres, demande encore en file ou en cours : la même demande (idempotence).
    select d.id, d.client_id into did, cid from vis_ui.demande_courante d
    where d.subject_id = sid and d.type = 'SITE_ADD' and d.statut in ('QUEUED','RUNNING')
      and d.charge = jsonb_build_object('url', p_url, 'nom', btrim(p_nom), 'langues', to_jsonb(p_langues), 'marches', to_jsonb(p_marches), 'client_nom', cnom)
      and (p_client_id is null or d.client_id = p_client_id)
    order by d.demande_le desc limit 1;
    if did is not null then
      perform vis_ui.exiger_humain(cid);
      return did;
    end if;
    raise exception 'site déjà suivi (sujet %)', sid using errcode = '22023';
  end if;
  if p_client_id is not null then
    if not exists (select 1 from vis.client where id = p_client_id) then raise exception 'client introuvable' using errcode = 'P0002'; end if;
    uid := vis_ui.exiger_humain(p_client_id);
    cid := p_client_id;
  else
    uid := vis_ui.exiger_humain('oia', array['owner']);
    if char_length(btrim(coalesce(p_client_nom, ''))) < 2 then raise exception 'client existant (p_client_id) ou nouveau (p_client_nom) obligatoire' using errcode = '22023'; end if;
    cid := vis_ui.slug(p_client_nom);
    if cid !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'nom de client refusé' using errcode = '22023'; end if;
    if exists (select 1 from vis.client where id = cid) then raise exception 'client % déjà existant : passer p_client_id', cid using errcode = '22023'; end if;
    insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values (cid, btrim(p_client_nom), 'external', 'active', 'lecture');
    insert into vis.client_member (user_id, client_id, role) values (uid, cid, 'owner');
  end if;
  insert into vis.site (id, client_id, primary_url, status) values (sid, cid, p_url, 'active');
  insert into vis.subject (id, client_id, status, extra)
    values (sid, cid, 'draft', jsonb_build_object('displayName', btrim(p_nom), 'langues', to_jsonb(p_langues), 'marches', to_jsonb(p_marches)));
  insert into vis.subject_site (subject_id, site_id, client_id) values (sid, sid, cid);
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, sid, 'SITE_ADD', jsonb_build_object('url', p_url, 'nom', btrim(p_nom), 'langues', to_jsonb(p_langues), 'marches', to_jsonb(p_marches), 'client_nom', cnom), uid)
    returning id into did;
  perform vis_ui.journaliser('vis_demander_site', cid, sid,
    jsonb_build_object('p_url', p_url, 'p_nom', p_nom, 'p_langues', to_jsonb(p_langues), 'p_marches', to_jsonb(p_marches), 'p_client_id', p_client_id, 'p_client_nom', p_client_nom),
    jsonb_build_object('demande', did), uid);
  return did;
end $$;

create or replace function public.vis_modifier_proposition(p_id text, p_contenu jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  p record;
  uid text;
begin
  perform pg_advisory_xact_lock(hashtext('vis.proposition:' || coalesce(p_id, '')));
  select * into p from vis_ui.proposition_courante where id = p_id;
  if p.id is null then raise exception 'proposition introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(p.client_id);
  if p.nature = 'audit' then raise exception 'l''audit est en lecture seule' using errcode = '22023'; end if;
  if p.etat <> 'propose' then raise exception 'élément déjà tranché (%)', p.etat using errcode = '55000'; end if;
  perform vis_ui.contenu_valide(p.nature, p_contenu);
  if p_contenu = p.contenu then return p.version; end if;
  insert into vis.proposition (element_id, client_id, subject_id, nature, version, contenu, source, propose_par)
    values (p.id, p.client_id, p.subject_id, p.nature, p.version + 1, p_contenu, p.source, uid);
  perform vis_ui.journaliser('vis_modifier_proposition', p.client_id, p.subject_id, jsonb_build_object('p_id', p_id, 'p_contenu', p_contenu), jsonb_build_object('version', p.version + 1), uid);
  return p.version + 1;
end $$;

create or replace function public.vis_ajouter_proposition(p_subject text, p_nature text, p_contenu jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  eid text;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_nature is null or p_nature not in ('fait','question','concurrent') then raise exception 'nature refusée (fait, question ou concurrent)' using errcode = '22023'; end if;
  perform vis_ui.contenu_valide(p_nature, p_contenu);
  -- Identifiant dérivé du contenu : un double appel rend le même élément.
  eid := p_subject || ':' || p_nature || ':m-' || substr(md5(p_contenu::text), 1, 10);
  if exists (select 1 from vis.proposition where element_id = eid) then return eid; end if;
  insert into vis.proposition (element_id, client_id, subject_id, nature, version, contenu, propose_par)
    values (eid, cid, p_subject, p_nature, 1, p_contenu, uid);
  perform vis_ui.journaliser('vis_ajouter_proposition', cid, p_subject, jsonb_build_object('p_subject', p_subject, 'p_nature', p_nature, 'p_contenu', p_contenu), jsonb_build_object('id', eid), uid);
  return eid;
end $$;

create or replace function public.vis_valider_faits(p_subject text, p_ids text[], p_rejetes text[] default '{}')
returns int language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  v text[] := coalesce(p_ids, '{}');
  r text[] := coalesce(p_rejetes, '{}');
  x text;
  p record;
  n int := 0;
  voulu text;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if cardinality(v) + cardinality(r) = 0 then raise exception 'aucun fait à trancher' using errcode = '22023'; end if;
  if v && r then raise exception 'un même fait ne peut être validé et rejeté' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('vis.decision:' || p_subject));
  foreach x in array v || r loop
    select * into p from vis_ui.proposition_courante where id = x and subject_id = p_subject and nature = 'fait';
    if p.id is null then raise exception 'fait « % » absent des propositions du sujet', x using errcode = 'P0002'; end if;
    voulu := case when x = any (v) then 'valide' else 'rejete' end;
    if p.etat = voulu then continue; end if;  -- double appel : rien de plus
    if p.etat <> 'propose' then raise exception 'fait « % » déjà tranché (%)', x, p.etat using errcode = '55000'; end if;
    insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par) values (x, p.version, cid, p_subject, voulu, uid);
    n := n + 1;
  end loop;
  perform vis_ui.journaliser('vis_valider_faits', cid, p_subject, jsonb_build_object('p_ids', to_jsonb(v), 'p_rejetes', to_jsonb(r)), jsonb_build_object('decisions', n), uid);
  return n;
end $$;

create or replace function public.vis_valider_panel(p_subject text, p_ids text[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  ids text[];
  langues text[];
  l text;
  x text;
  p record;
  derniere vis.panel;
  version_ int;
begin
  select client_id, coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(extra -> 'langues') = 'array' then extra -> 'langues' else '[]'::jsonb end)), '{}')
    into cid, langues from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  ids := array(select distinct unnest(coalesce(p_ids, '{}')) order by 1);
  if cardinality(ids) = 0 then raise exception 'aucune question choisie' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('vis.decision:' || p_subject));
  if exists (select 1 from vis_ui.fenetre_courante w where w.subject_id = p_subject and w.nature in ('reference','remesure') and w.statut in ('go_donne','en_cours')) then
    raise exception 'une étude est lancée : le panel ne change pas pendant la mesure' using errcode = '55000';
  end if;
  foreach x in array ids loop
    select * into p from vis_ui.proposition_courante where id = x and subject_id = p_subject and nature = 'question';
    if p.id is null then raise exception 'question « % » absente des propositions du sujet', x using errcode = 'P0002'; end if;
    if p.etat = 'rejete' then raise exception 'question « % » déjà rejetée', x using errcode = '55000'; end if;
  end loop;
  if cardinality(langues) = 0 then
    langues := array(select distinct q.contenu ->> 'langue' from vis_ui.proposition_courante q where q.id = any (ids));
  end if;
  foreach l in array langues loop
    if not exists (select 1 from vis_ui.proposition_courante q where q.id = any (ids) and q.contenu ->> 'langue' = l) then
      raise exception 'panel refusé : aucune question en « % »', l using errcode = '22023';
    end if;
    if not exists (select 1 from vis_ui.proposition_courante q where q.id = any (ids) and q.contenu ->> 'langue' = l and (q.contenu ->> 'marquee')::boolean is false) then
      raise exception 'panel refusé : aucune question non marquée en « % »', l using errcode = '22023';
    end if;
  end loop;
  select * into derniere from vis.panel where subject_id = p_subject order by version desc limit 1;
  if derniere.id is not null and array(select unnest(derniere.questions) order by 1) = ids then
    return derniere.version;  -- double appel : la même version
  end if;
  version_ := coalesce(derniere.version, 0) + 1;
  insert into vis.panel (client_id, subject_id, version, questions, par) values (cid, p_subject, version_, ids, uid);
  insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par)
  select q.id, q.version, cid, p_subject, case when q.id = any (ids) then 'valide' else 'rejete' end, uid
  from vis_ui.proposition_courante q
  where q.subject_id = p_subject and q.nature = 'question' and q.etat = 'propose';
  perform vis_ui.journaliser('vis_valider_panel', cid, p_subject, jsonb_build_object('p_ids', to_jsonb(ids)), jsonb_build_object('version', version_), uid);
  return version_;
end $$;

-- GO commun : reconnaissance (p_debut nul) ou étude. Rend {demande, window_id}.
create or replace function vis_ui.go(p_subject text, p_nature text, p_debut date, p_cout_vu_usd numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  w record;
  natures text[] := case when p_nature = 'reconnaissance' then array['reconnaissance'] else array['reference','remesure'] end;
  type_ text := case when p_nature = 'reconnaissance' then 'RECON' else 'WINDOW_RUN' end;
  fonction_ text := case when p_nature = 'reconnaissance' then 'vis_go_reconnaissance' else 'vis_go_fenetre' end;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
  pl numeric;
  plg numeric;
  dej numeric;
  dejg numeric;
  did uuid;
  charge_ jsonb;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  -- Un GO à la fois pour tous les clients : le plafond global voit les GO précédents.
  perform pg_advisory_xact_lock(hashtext('vis.go'));
  -- Double appel : même coût vu (et même début), demande encore en file ou en cours.
  select d.id, d.charge ->> 'window_id' as wid into w from vis_ui.demande_courante d
  join vis.fenetre_go g on g.window_id = d.charge ->> 'window_id'
  where d.subject_id = p_subject and d.type = type_ and d.statut in ('QUEUED','RUNNING')
    and g.cout_vu_usd = round(p_cout_vu_usd, 2) and g.debut is not distinct from p_debut
  order by d.demande_le desc limit 1;
  if w.id is not null then return jsonb_build_object('demande', w.id, 'window_id', w.wid); end if;
  if not exists (select 1 from vis.panel where subject_id = p_subject) then
    raise exception 'GO refusé : panel non validé' using errcode = '55000';
  end if;
  if p_nature <> 'reconnaissance' then
    if not exists (select 1 from vis_ui.fenetre_courante r where r.subject_id = p_subject and r.nature = 'reconnaissance' and r.statut = 'close') then
      raise exception 'GO refusé : reconnaissance pas encore close' using errcode = '55000';
    end if;
    if exists (select 1 from vis_ui.proposition_courante c where c.subject_id = p_subject and c.nature = 'concurrent' and c.etat = 'propose') then
      raise exception 'GO refusé : concurrents à valider' using errcode = '55000';
    end if;
    if exists (select 1 from vis_ui.fenetre_courante a where a.subject_id = p_subject and a.nature in ('reference','remesure') and a.statut in ('go_donne','en_cours')) then
      raise exception 'GO refusé : une étude est déjà lancée' using errcode = '55000';
    end if;
  end if;
  select * into w from vis_ui.fenetre_courante f where f.subject_id = p_subject and f.nature = any (natures) and f.statut = 'proposee'
  order by f.cree_le desc limit 1;
  if w.window_id is null or w.cout_estime_usd is null then
    raise exception 'GO refusé : aucun coût estimé par le moteur pour %', case when p_nature = 'reconnaissance' then 'la reconnaissance' else 'une étude' end using errcode = '55000';
  end if;
  if w.nature = 'remesure' and not exists (select 1 from vis_ui.fenetre_courante r where r.window_id = w.compare_avec and r.statut = 'close') then
    raise exception 'GO refusé : la fenêtre de référence % n''est pas close', w.compare_avec using errcode = '55000';
  end if;
  if p_cout_vu_usd is null or round(p_cout_vu_usd, 2) <> round(w.cout_estime_usd, 2) then
    raise exception 'estimation changée, recharger (estimation courante : % $)', to_char(w.cout_estime_usd, 'FM999990.00') using errcode = '22023';
  end if;
  if p_nature <> 'reconnaissance' and (p_debut is null or p_debut < (now() at time zone 'UTC')::date + 1) then
    raise exception 'début refusé : au plus tôt demain' using errcode = '22023';
  end if;
  pl := vis_ui.plafond(cid);
  plg := vis_ui.plafond(null);
  if pl is null then raise exception 'GO refusé : plafond du client non fixé' using errcode = '22023'; end if;
  if plg is null then raise exception 'GO refusé : plafond global non fixé' using errcode = '22023'; end if;
  dej := vis_ui.reel(cid, mois) + vis_ui.engage(cid, mois);
  if dej + round(p_cout_vu_usd, 2) > pl then
    raise exception 'GO refusé : plafond du client dépassé (% $ dépensés ou engagés ce mois + % $ > % $)', to_char(dej, 'FM999990.00'), to_char(p_cout_vu_usd, 'FM999990.00'), to_char(pl, 'FM999990.00') using errcode = '22023';
  end if;
  dejg := vis_ui.reel(null, mois) + vis_ui.engage(null, mois);
  if dejg + round(p_cout_vu_usd, 2) > plg then
    raise exception 'GO refusé : plafond global dépassé (% $ + % $ > % $)', to_char(dejg, 'FM999990.00'), to_char(p_cout_vu_usd, 'FM999990.00'), to_char(plg, 'FM999990.00') using errcode = '22023';
  end if;
  insert into vis.fenetre_go (window_id, client_id, estimation_id, cout_vu_usd, debut, mois, par)
    values (w.window_id, cid, w.estimation_id, round(p_cout_vu_usd, 2), p_debut, mois, uid);
  insert into vis.fenetre_statut (window_id, client_id, statut, debut, par) values (w.window_id, cid, 'go_donne', p_debut, uid);
  charge_ := jsonb_build_object('window_id', w.window_id, 'cout_vu_usd', round(p_cout_vu_usd, 2));
  if p_nature <> 'reconnaissance' then charge_ := charge_ || jsonb_build_object('debut', p_debut, 'gel', 'freeze-' || w.window_id); end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par) values (cid, p_subject, type_, charge_, uid) returning id into did;
  perform vis_ui.journaliser(fonction_, cid, p_subject, jsonb_build_object('p_subject', p_subject, 'p_debut', p_debut, 'p_cout_vu_usd', p_cout_vu_usd),
    jsonb_build_object('demande', did, 'window_id', w.window_id), uid);
  return jsonb_build_object('demande', did, 'window_id', w.window_id);
end $$;
revoke all on function vis_ui.go(text, text, date, numeric) from public, anon, authenticated;

create or replace function public.vis_go_reconnaissance(p_subject text, p_cout_vu_usd numeric)
returns uuid language sql security definer set search_path = '' as $$
  select (vis_ui.go(p_subject, 'reconnaissance', null, p_cout_vu_usd) ->> 'demande')::uuid
$$;

create or replace function public.vis_go_fenetre(p_subject text, p_debut date, p_cout_vu_usd numeric)
returns text language sql security definer set search_path = '' as $$
  select vis_ui.go(p_subject, 'etude', p_debut, p_cout_vu_usd) ->> 'window_id'
$$;

create or replace function public.vis_valider_concurrents(p_subject text, p_ids text[], p_homonymes text[] default '{}')
returns int language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  v text[] := array(select distinct unnest(coalesce(p_ids, '{}')));
  h text[] := array(select distinct unnest(coalesce(p_homonymes, '{}')));
  x text;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  perform pg_advisory_xact_lock(hashtext('vis.decision:' || p_subject));
  if not exists (select 1 from vis_ui.fenetre_courante r where r.subject_id = p_subject and r.nature = 'reconnaissance' and r.statut = 'close') then
    raise exception 'concurrents refusés : la reconnaissance n''est pas close' using errcode = '55000';
  end if;
  foreach x in array v loop
    if not exists (select 1 from vis_ui.proposition_courante where id = x and subject_id = p_subject and nature = 'concurrent') then
      raise exception 'concurrent « % » absent des propositions du sujet', x using errcode = 'P0002';
    end if;
  end loop;
  foreach x in array h loop
    if not exists (select 1 from vis_ui.proposition_courante where id = x and subject_id = p_subject and nature = 'homonyme') then
      raise exception 'homonyme « % » absent des propositions du sujet', x using errcode = 'P0002';
    end if;
  end loop;
  if not exists (select 1 from vis_ui.proposition_courante where subject_id = p_subject and nature in ('concurrent','homonyme') and etat = 'propose') then
    -- Liste déjà figée : un double appel identique ne change rien ; une autre liste est refusée.
    if array(select id from vis_ui.proposition_courante where subject_id = p_subject and nature = 'concurrent' and etat = 'valide' order by 1) = array(select unnest(v) order by 1)
       and array(select id from vis_ui.proposition_courante where subject_id = p_subject and nature = 'homonyme' and etat = 'valide' order by 1) = array(select unnest(h) order by 1) then
      return cardinality(v);
    end if;
    raise exception 'liste des concurrents déjà figée' using errcode = '55000';
  end if;
  insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par)
  select q.id, q.version, cid, p_subject, case when q.id = any (v) or q.id = any (h) then 'valide' else 'rejete' end, uid
  from vis_ui.proposition_courante q
  where q.subject_id = p_subject and q.nature in ('concurrent','homonyme') and q.etat = 'propose';
  perform vis_ui.journaliser('vis_valider_concurrents', cid, p_subject, jsonb_build_object('p_ids', to_jsonb(v), 'p_homonymes', to_jsonb(h)), jsonb_build_object('concurrents', cardinality(v)), uid);
  return cardinality(v);
end $$;

create or replace function public.vis_annuler_fenetre(p_window text, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w record;
  uid text;
begin
  select * into w from vis_ui.fenetre_courante where window_id = p_window;
  if w.window_id is null then raise exception 'fenêtre introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(w.client_id);
  if char_length(btrim(coalesce(p_motif, ''))) < 3 then raise exception 'motif obligatoire' using errcode = '22023'; end if;
  if w.statut not in ('go_donne','en_cours') then raise exception 'fenêtre au statut %, rien à arrêter', w.statut using errcode = '55000'; end if;
  insert into vis.fenetre_statut (window_id, client_id, statut, motif, par) values (p_window, w.client_id, 'annulee', btrim(p_motif), uid);
  insert into vis.demande_etat (demande_id, client_id, statut, par)
  select d.id, d.client_id, 'CANCELLED', uid from vis_ui.demande_courante d where d.charge ->> 'window_id' = p_window and d.statut = 'QUEUED';
  update vis.window set status = 'aborted' where id = p_window and status in ('planned','running');
  perform vis_ui.journaliser('vis_annuler_fenetre', w.client_id, w.subject_id, jsonb_build_object('p_window', p_window, 'p_motif', p_motif), null, uid);
end $$;

create or replace function public.vis_valider_rapport(p_page uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pg_ vis.page;
  uid text;
begin
  select * into pg_ from vis.page where id = p_page;
  if pg_.id is null then raise exception 'page introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(pg_.client_id);
  if exists (select 1 from vis.page_validation where page_id = p_page) then raise exception 'page déjà validée' using errcode = '55000'; end if;
  insert into vis.page_validation (page_id, client_id, par) values (p_page, pg_.client_id, uid);
  perform vis_ui.journaliser('vis_valider_rapport', pg_.client_id, pg_.subject_id, jsonb_build_object('p_page', p_page), null, uid);
end $$;

create or replace function public.vis_declarer_execution(p_recommandation text, p_preuve text, p_date date, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  rc vis.recommendation;
  uid text;
  dec text;
  kind_ text;
  xid bigint;
begin
  select * into rc from vis.recommendation where id = p_recommandation;
  if rc.id is null then raise exception 'recommandation introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(rc.client_id);
  select status into dec from vis.decision where recommendation_id = rc.id order by decided_at desc, id desc limit 1;
  if coalesce(dec, 'pending') <> 'accepted' then
    raise exception 'recommandation non acceptée (%)', coalesce(dec, 'pending') using errcode = '55000';
  end if;
  if exists (select 1 from vis.execution where recommendation_id = rc.id and kind <> 'rollback') then
    raise exception 'exécution déjà déclarée' using errcode = '55000';
  end if;
  if p_date is null or p_date > (now() at time zone 'UTC')::date then raise exception 'date refusée : absente ou future' using errcode = '22023'; end if;
  kind_ := case when p_preuve ~ '^[0-9a-f]{7,40}$' then 'commit' when p_preuve ~ '^https://\S+$' then 'url' end;
  if kind_ is null then raise exception 'preuve refusée : adresse https ou empreinte de commit' using errcode = '22023'; end if;
  insert into vis.execution (recommendation_id, client_id, kind, ref, happened_at, payload)
    values (rc.id, rc.client_id, kind_, p_preuve, p_date::timestamp at time zone 'UTC', jsonb_build_object('declaredBy', uid, 'note', p_note))
    returning id into xid;
  perform vis_ui.journaliser('vis_declarer_execution', rc.client_id, rc.subject_id,
    jsonb_build_object('p_recommandation', p_recommandation, 'p_preuve', p_preuve, 'p_date', p_date, 'p_note', p_note), jsonb_build_object('execution', xid), uid);
  return xid;
end $$;

-- p_client null : plafond global d'OIA. Owner du client technique `oia` seulement.
create or replace function public.vis_fixer_plafond(p_client text, p_plafond_usd numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid text := vis_ui.exiger_humain('oia', array['owner']);
  plg numeric;
begin
  if p_plafond_usd is null or p_plafond_usd < 0 or p_plafond_usd > 1000000 then raise exception 'plafond refusé' using errcode = '22023'; end if;
  if p_client is not null then
    if not exists (select 1 from vis.client where id = p_client) then raise exception 'client introuvable' using errcode = 'P0002'; end if;
    plg := vis_ui.plafond(null);
    if plg is null then raise exception 'plafond global non fixé : le fixer d''abord (p_client nul)' using errcode = '55000'; end if;
    if p_plafond_usd > plg then raise exception 'plafond refusé : % $ > plafond global de % $', p_plafond_usd, plg using errcode = '22023'; end if;
  end if;
  insert into vis.plafond (client_id, plafond_usd, par) values (p_client, round(p_plafond_usd, 2), uid);
  perform vis_ui.journaliser('vis_fixer_plafond', p_client, null, jsonb_build_object('p_client', p_client, 'p_plafond_usd', p_plafond_usd), null, uid);
end $$;

create or replace function public.vis_relancer_demande(p_demande uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d record;
  uid text;
  nid uuid;
begin
  select * into d from vis_ui.demande_courante where id = p_demande;
  if d.id is null then raise exception 'demande introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(d.client_id);
  perform pg_advisory_xact_lock(hashtext('vis.relance:' || p_demande::text));
  select id into nid from vis.demande where relance_de = p_demande order by demande_le desc limit 1;
  if nid is not null then return nid; end if;  -- double appel : la même relance
  if d.statut <> 'FAILED' then raise exception 'seule une demande FAILED se relance (statut %)', d.statut using errcode = '55000'; end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par, relance_de) values (d.client_id, d.subject_id, d.type, d.charge, uid, d.id) returning id into nid;
  perform vis_ui.journaliser('vis_relancer_demande', d.client_id, d.subject_id, jsonb_build_object('p_demande', p_demande), jsonb_build_object('demande', nid), uid);
  return nid;
end $$;

create or replace function public.vis_acquitter_alerte(p_alerte uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a vis.alerte;
  uid text;
begin
  select * into a from vis.alerte where id = p_alerte;
  if a.id is null then raise exception 'alerte introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(a.client_id);
  if exists (select 1 from vis.alerte_acquit where alerte_id = p_alerte) then return; end if;
  insert into vis.alerte_acquit (alerte_id, client_id, par) values (p_alerte, a.client_id, uid);
  perform vis_ui.journaliser('vis_acquitter_alerte', a.client_id, a.subject_id, jsonb_build_object('p_alerte', p_alerte), null, uid);
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'public.vis_demander_site(text, text, text[], text[], text, text)', 'public.vis_modifier_proposition(text, jsonb)',
    'public.vis_ajouter_proposition(text, text, jsonb)', 'public.vis_valider_faits(text, text[], text[])',
    'public.vis_valider_panel(text, text[])', 'public.vis_go_reconnaissance(text, numeric)',
    'public.vis_valider_concurrents(text, text[], text[])', 'public.vis_go_fenetre(text, date, numeric)',
    'public.vis_annuler_fenetre(text, text)', 'public.vis_valider_rapport(uuid)',
    'public.vis_declarer_execution(text, text, date, text)', 'public.vis_fixer_plafond(text, numeric)',
    'public.vis_relancer_demande(uuid)', 'public.vis_acquitter_alerte(uuid)'
  ]) loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 4. Fonctions du moteur
-- ------------------------------------------------------------------

-- Prochaine demande QUEUED, passée RUNNING. D'abord, toute demande RUNNING depuis plus de
-- 30 minutes repasse en file (reprise). Une ligne verrouillée par un autre moteur est
-- sautée ; le statut est relu sous le verrou ; l'index unique « une prise » tient en dernier.
create or replace function public.vis_moteur_prendre(p_hote text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  qui text := vis_ui.exiger_moteur();
  v_id uuid;
begin
  if p_hote is null or p_hote !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$' then raise exception 'hôte refusé' using errcode = '22023'; end if;
  for v_id in
    select d.id from vis.demande d
    where vis_ui.statut_demande(d.id) = 'RUNNING'
      and (select e.le from vis.demande_etat e where e.demande_id = d.id order by e.id desc limit 1) < now() - interval '30 minutes'
    for update of d skip locked
  loop
    if vis_ui.statut_demande(v_id) = 'RUNNING'
       and (select e.le from vis.demande_etat e where e.demande_id = v_id order by e.id desc limit 1) < now() - interval '30 minutes' then
      if (select count(*) from vis.demande_etat e where e.demande_id = v_id and e.statut = 'RUNNING') >= 3 then
        -- Trois prises abandonnées : la demande échoue, une alerte le dit ; elle se relance à la main.
        insert into vis.demande_etat (demande_id, client_id, statut, hote, erreur, par)
        select v_id, d.client_id, 'FAILED', p_hote, 'abandonnée après 3 tentatives (moteur arrêté en cours de traitement)', qui from vis.demande d where d.id = v_id;
        insert into vis.alerte (client_id, subject_id, gravite, type, message)
        select d.client_id, d.subject_id, 'bloquant', 'ECHEC_DEMANDE', 'Demande ' || d.type || ' abandonnée après 3 tentatives' from vis.demande d where d.id = v_id;
      else
        insert into vis.demande_etat (demande_id, client_id, statut, hote, resultat, par)
        select v_id, d.client_id, 'QUEUED', p_hote, '{"reprise": "RUNNING depuis plus de 30 minutes"}'::jsonb, qui from vis.demande d where d.id = v_id;
      end if;
    end if;
  end loop;
  loop
    select d.id into v_id from vis.demande d
    where vis_ui.statut_demande(d.id) = 'QUEUED'
    order by d.demande_le, d.id limit 1
    for update of d skip locked;
    exit when not found;
    continue when vis_ui.statut_demande(v_id) <> 'QUEUED';
    begin
      insert into vis.demande_etat (demande_id, client_id, statut, tentative, hote, par)
      select v_id, d.client_id, 'RUNNING', 1 + (select count(*) from vis.demande_etat e where e.demande_id = v_id and e.statut = 'RUNNING'), p_hote, qui
      from vis.demande d where d.id = v_id;
    exception when unique_violation then
      continue;
    end;
    return (select to_jsonb(x) from public.vis_demandes_v2 x where x.id = v_id);
  end loop;
  return null;
end $$;

create or replace function public.vis_moteur_terminer(p_demande uuid, p_resultat jsonb, p_erreur text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  qui text := vis_ui.exiger_moteur();
  cid text;
  st text;
begin
  select client_id into cid from vis.demande where id = p_demande for update;
  if cid is null then raise exception 'demande introuvable' using errcode = 'P0002'; end if;
  st := vis_ui.statut_demande(p_demande);
  if st <> 'RUNNING' then raise exception 'demande au statut %, pas RUNNING', st using errcode = '55000'; end if;
  insert into vis.demande_etat (demande_id, client_id, statut, resultat, erreur, par)
    values (p_demande, cid, case when p_erreur is null then 'DONE' else 'FAILED' end, p_resultat, p_erreur, qui);
end $$;

create or replace function public.vis_moteur_signe(p_hote text, p_version text, p_prochain timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform vis_ui.exiger_moteur();
  insert into vis.moteur_signe (hote, version, prochain) values (p_hote, p_version, p_prochain);
end $$;

create or replace function public.vis_moteur_sujet(p_subject text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s vis.subject;
begin
  perform vis_ui.exiger_moteur();
  select * into s from vis.subject where id = p_subject;
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'subject_id', s.id,
    'client_id', s.client_id,
    'client_nom', (select display_name from vis.client where id = s.client_id),
    'site_url', (select st.primary_url from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = s.id order by st.id limit 1),
    'nom', coalesce(s.extra ->> 'displayName', s.id),
    'langues', coalesce(s.extra -> 'langues', '[]'::jsonb),
    'marches', coalesce(s.extra -> 'marches', '[]'::jsonb),
    'propositions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nature', p.nature, 'version', p.version, 'contenu', p.contenu, 'source', p.source,
                                'propose_par', p.propose_par, 'etat', p.etat, 'decide_par', p.decide_par, 'decide_le', p.decide_le) order by p.id)
                              from vis_ui.proposition_courante p where p.subject_id = s.id), '[]'::jsonb),
    'panel_version', (select max(version) from vis.panel where subject_id = s.id),
    'fenetres', coalesce((select jsonb_agg(jsonb_build_object('window_id', f.window_id, 'nature', f.nature, 'libelle', f.libelle, 'statut', f.statut, 'debut', f.debut,
                            'jours_prevus', f.jours_prevus, 'compare_avec', f.compare_avec, 'heure_utc', f.heure_utc) order by f.cree_le, f.window_id)
                          from vis_ui.fenetre_courante f where f.subject_id = s.id), '[]'::jsonb),
    'executions', coalesce((select jsonb_agg(jsonb_build_object('recommandation', x.recommendation_id, 'date', (x.happened_at at time zone 'UTC')::date, 'fenetre', x.payload ->> 'measuredBy') order by x.id)
                            from vis.execution x join vis.recommendation r on r.id = x.recommendation_id where r.subject_id = s.id and x.kind <> 'rollback'), '[]'::jsonb),
    'plafond_usd', vis_ui.plafond(s.client_id),
    'plafond_global_usd', vis_ui.plafond(null));
end $$;

create or replace function public.vis_moteur_go(p_subject text, p_window text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  f record;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  perform vis_ui.exiger_moteur();
  select * into f from vis_ui.fenetre_courante where window_id = p_window and subject_id = p_subject;
  if f.window_id is null then return null; end if;
  return jsonb_build_object('window_id', f.window_id, 'statut', f.statut, 'debut', f.debut, 'go_par', f.go_par, 'go_le', f.go_le,
    'cout_vu_au_go_usd', f.cout_vu_usd, 'cout_estime_usd', f.cout_estime_usd, 'plafond_usd', vis_ui.plafond(f.client_id),
    'reel_usd', vis_ui.reel(f.client_id, mois), 'engage_usd', vis_ui.engage(f.client_id, mois), 'plafond_global_usd', vis_ui.plafond(null),
    'heure_utc', f.heure_utc);
end $$;

-- Nouvelle version seulement si l'élément est encore `propose` et que son contenu change.
create or replace function public.vis_moteur_proposer(p_subject text, p_id text, p_nature text, p_contenu jsonb, p_source text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  p record;
begin
  perform vis_ui.exiger_moteur();
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  perform vis_ui.contenu_valide(p_nature, p_contenu);
  if p_id is null or split_part(p_id, ':', 1) <> p_subject or split_part(p_id, ':', 2) <> p_nature then
    raise exception 'identifiant refusé : <sujet>:<nature>:<local> attendu' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('vis.proposition:' || p_id));
  select * into p from vis_ui.proposition_courante where id = p_id;
  if p.id is not null and (p.etat <> 'propose' or p.contenu = p_contenu) then return p.version; end if;
  insert into vis.proposition (element_id, client_id, subject_id, nature, version, contenu, source, propose_par)
    values (p_id, cid, p_subject, p_nature, coalesce(p.version, 0) + 1, p_contenu, p_source, 'moteur');
  return coalesce(p.version, 0) + 1;
end $$;

create or replace function public.vis_moteur_estimer(p_subject text, p_window text, p_nature text, p_libelle text, p_compare_avec text, p_jours int,
                                                     p_questions int, p_moteurs text[], p_cout_usd numeric, p_detail jsonb, p_heure_utc text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  qui text := vis_ui.exiger_moteur();
  cid text;
  f record;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  if p_cout_usd is null or p_cout_usd < 0 then raise exception 'coût estimé illisible' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('vis.fenetre:' || coalesce(p_window, '')));
  select * into f from vis_ui.fenetre_courante where window_id = p_window;
  if f.window_id is null then
    insert into vis.fenetre (window_id, client_id, subject_id, nature, libelle, compare_avec, jours_prevus)
      values (p_window, cid, p_subject, p_nature, p_libelle, p_compare_avec, p_jours);
    insert into vis.fenetre_statut (window_id, client_id, statut, par) values (p_window, cid, 'proposee', qui);
    -- Aussi dans vis.window (planned) : les preuves s'y rattachent (vis.evidence.window_id).
    if exists (select 1 from vis.window w where w.id = p_window and w.subject_id <> p_subject) then
      raise exception 'fenêtre % d''un autre sujet', p_window using errcode = '22023';
    end if;
    insert into vis.window (id, subject_id, client_id, kind, panel_version, status)
      values (p_window, p_subject, cid, case p_nature when 'reference' then 'baseline' when 'remesure' then 'follow-up' else 'reconnaissance' end,
              coalesce((select max(version) from vis.panel where subject_id = p_subject), 1), 'planned')
    on conflict (id) do nothing;
  elsif f.subject_id <> p_subject then
    raise exception 'fenêtre % d''un autre sujet', p_window using errcode = '22023';
  elsif f.statut <> 'proposee' then
    raise exception 'fenêtre au statut % : estimation figée', f.statut using errcode = '55000';
  end if;
  insert into vis.fenetre_estimation (window_id, client_id, cout_estime_usd, detail, questions, moteurs, heure_utc, par)
    values (p_window, cid, p_cout_usd, coalesce(p_detail, '{}'::jsonb), coalesce(p_questions, 0), coalesce(p_moteurs, '{}'), p_heure_utc, qui);
end $$;

-- Statut d'une fenêtre : go_donne → en_cours → close ; annulee depuis proposee, go_donne ou
-- en_cours. Le GO lui-même est un geste humain. Tient vis.window à jour pour les preuves.
create or replace function public.vis_moteur_fenetre(p_subject text, p_window text, p_statut text, p_debut date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  qui text := vis_ui.exiger_moteur();
  f record;
  debut_ date;
  panel_ int;
begin
  select * into f from vis_ui.fenetre_courante where window_id = p_window and subject_id = p_subject;
  if f.window_id is null then raise exception 'fenêtre introuvable' using errcode = 'P0002'; end if;
  if p_statut = f.statut then return; end if;
  if not ((f.statut = 'go_donne' and p_statut = 'en_cours') or (f.statut = 'en_cours' and p_statut = 'close')
          or (f.statut in ('proposee','go_donne','en_cours') and p_statut = 'annulee')) then
    raise exception 'passage % → % refusé', f.statut, p_statut using errcode = '55000';
  end if;
  debut_ := coalesce(p_debut, f.debut);
  insert into vis.fenetre_statut (window_id, client_id, statut, debut, par) values (p_window, f.client_id, p_statut, p_debut, qui);
  if p_statut = 'en_cours' then
    if debut_ is null then raise exception 'début inconnu' using errcode = '22023'; end if;
    select max(version) into panel_ from vis.panel where subject_id = p_subject;
    insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on)
      values (p_window, p_subject, f.client_id, case f.nature when 'reference' then 'baseline' when 'remesure' then 'follow-up' else 'reconnaissance' end,
              coalesce(panel_, 1), 'running', debut_, debut_ + f.jours_prevus - 1)
    on conflict (id) do update set status = 'running', panel_version = excluded.panel_version, starts_on = excluded.starts_on, ends_on = excluded.ends_on;
  elsif p_statut = 'close' then
    update vis.window set status = 'done' where id = p_window;
  else
    update vis.window set status = 'aborted' where id = p_window and status in ('planned','running');
  end if;
end $$;

create or replace function public.vis_moteur_jour(p_subject text, p_window text, p_jour int, p_date date, p_etat text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f vis.fenetre;
begin
  perform vis_ui.exiger_moteur();
  select * into f from vis.fenetre where window_id = p_window and subject_id = p_subject;
  if f.window_id is null then raise exception 'fenêtre introuvable' using errcode = 'P0002'; end if;
  if p_jour is null or p_jour < 1 or p_jour > f.jours_prevus then raise exception 'jour hors de la fenêtre' using errcode = '22023'; end if;
  insert into vis.fenetre_jour (window_id, client_id, jour, date, etat, detail) values (p_window, f.client_id, p_jour, p_date, p_etat, coalesce(p_detail, '{}'::jsonb))
  on conflict (window_id, jour) do nothing;
end $$;

-- Chemin de recherche : le trigger d'empreinte de vis.evidence (0001) appelle digest() sans
-- schéma ; pgcrypto est dans `extensions` sur Supabase, dans `public` sur un Postgres nu.
create or replace function public.vis_moteur_preuves(p_preuves jsonb)
returns int language plpgsql security definer set search_path = extensions, public, pg_temp as $$
declare
  n int;
begin
  perform vis_ui.exiger_moteur();
  if jsonb_typeof(p_preuves) <> 'array' then raise exception 'tableau de preuves attendu' using errcode = '22023'; end if;
  -- Comme l'import d'Elmo : une preuve déjà en base ne change ni de texte ni de fenêtre.
  if exists (
    select 1 from jsonb_to_recordset(p_preuves) as x(id uuid, window_id text, raw_text text)
    join vis.evidence e on e.id = x.id
    where e.raw_sha256 <> digest(coalesce(x.raw_text, ''), 'sha256') or e.window_id <> x.window_id
  ) then
    raise exception 'preuves déjà en base avec un autre texte ou une autre fenêtre : rien n''est écrit' using errcode = '23514';
  end if;
  with r as (
    select * from jsonb_to_recordset(p_preuves) as x(id uuid, client_id text, site_id text, subject_id text, window_id text, prompt_id text,
      prompt_version int, prompt_language text, engine text, engine_version text, collector_name text, collector_run_id text,
      received_at timestamptz, raw_text text, structured jsonb, citations jsonb, cost_usd numeric)
  ), ins as (
    insert into vis.evidence (id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, engine_version,
                              collector_name, collector_run_id, received_at, raw_text, raw_sha256, structured, citations, cost_usd)
    select id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, engine_version,
           collector_name, collector_run_id, received_at, raw_text, '\x00'::bytea, coalesce(structured, '{}'::jsonb), coalesce(citations, '[]'::jsonb), coalesce(cost_usd, 0)
    from r
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

create or replace function public.vis_moteur_page(p_subject text, p_window text, p_nature text, p_langue text, p_html text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  f vis.fenetre;
  pid uuid;
begin
  perform vis_ui.exiger_moteur();
  select * into f from vis.fenetre where window_id = p_window and subject_id = p_subject;
  if f.window_id is null then raise exception 'fenêtre introuvable' using errcode = 'P0002'; end if;
  if p_html ~* '<script|javascript:' then raise exception 'page refusée : script interdit' using errcode = '22023'; end if;
  insert into vis.page (client_id, subject_id, window_id, nature, langue, html) values (f.client_id, p_subject, p_window, p_nature, p_langue, p_html) returning id into pid;
  return pid;
end $$;

-- Recommandation générée (format de src/recommendation.ts), en attente ; jamais réécrite.
create or replace function public.vis_moteur_recommandation(p_subject text, p_window text, p_recommandation jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  n int;
  r jsonb := p_recommandation;
begin
  perform vis_ui.exiger_moteur();
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  if p_window is not null and not exists (select 1 from vis.window where id = p_window and subject_id = p_subject) then
    raise exception 'fenêtre introuvable' using errcode = 'P0002';
  end if;
  insert into vis.recommendation (id, client_id, subject_id, window_id, type, title, statement, impact_level, effort_level, risk, confidence,
                                  fix_kind, fix_generator, created_by, payload)
  values (r ->> 'id', cid, p_subject, p_window, r ->> 'type', r ->> 'title', r ->> 'statement', r #>> '{impact,level}', r #>> '{effort,level}',
          r ->> 'risk', r ->> 'confidence', r #>> '{fix,kind}', r #>> '{fix,generator}', coalesce(r ->> 'createdBy', 'moteur'), r)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.vis_moteur_alerter(p_client text, p_subject text, p_gravite text, p_type text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  aid uuid;
begin
  perform vis_ui.exiger_moteur();
  if not exists (select 1 from vis.client where id = p_client) then raise exception 'client introuvable' using errcode = 'P0002'; end if;
  insert into vis.alerte (client_id, subject_id, gravite, type, message) values (p_client, p_subject, p_gravite, p_type, p_message) returning id into aid;
  return aid;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'public.vis_moteur_prendre(text)', 'public.vis_moteur_terminer(uuid, jsonb, text)', 'public.vis_moteur_signe(text, text, timestamptz)',
    'public.vis_moteur_sujet(text)', 'public.vis_moteur_go(text, text)', 'public.vis_moteur_proposer(text, text, text, jsonb, text)',
    'public.vis_moteur_estimer(text, text, text, text, text, int, int, text[], numeric, jsonb, text)', 'public.vis_moteur_fenetre(text, text, text, date)',
    'public.vis_moteur_jour(text, text, int, date, text, jsonb)', 'public.vis_moteur_preuves(jsonb)',
    'public.vis_moteur_page(text, text, text, text, text)', 'public.vis_moteur_recommandation(text, text, jsonb)',
    'public.vis_moteur_alerter(text, text, text, text, text)'
  ]) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

commit;

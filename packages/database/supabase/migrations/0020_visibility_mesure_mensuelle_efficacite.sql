-- 0020 · Visibility : mesure mensuelle (même panel chaque mois) et suivi de l'efficacité.
--
-- 1. Mesure mensuelle (GO permanent de Mickaël le 2026-11-18, « 2 $ par site ») : une fois par
--    mois et par site, un audit IA express de 20 questions sur les moteurs par défaut (ChatGPT,
--    Gemini, Perplexity, Mistral gratuit). Les questions sont celles de la mesure précédente du site
--    (questions_fixes) : les mois sont comparables. Planifiée seulement si l'estimation tient sous le
--    plafond du site ET le plafond global du mois ; sinon rien n'est lancé.
-- 2. Suivi de l'efficacité : une ligne par site et par jour d'hygiène (score, écarts, pages indexées,
--    impressions et clics Google et Bing sur 28 jours) et une ligne par mesure mensuelle (score IA,
--    citations sans le nom, coût réel). Les constats résolus disent ce qui a été corrigé, et quand.
--
-- Retour arrière : drop view public.vis_efficacite_v3, public.vis_efficacite_mesures_v3 ;
--   drop function public.vis_moteur_planifier_mesure_mensuelle().

create or replace function public.vis_moteur_planifier_mesure_mensuelle()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  s record;
  est jsonb;
  maxu numeric;
  pl numeric;
  plg numeric;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
  dej numeric;
  dejg numeric;
  aid uuid;
  prec record;
  fixes jsonb;
begin
  perform vis_ui.exiger_moteur();
  plg := vis_ui.plafond(null);
  if plg is null then return 0; end if;
  for s in
    select su.id, su.client_id, coalesce(su.extra ->> 'displayName', su.id) as nom,
           (select st.primary_url from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = su.id order by st.id limit 1) as url
    from vis.subject su
  loop
    continue when s.url is null;
    -- Une mesure par mois : rien si une mesure est en file, en cours, faite depuis 27 jours, ou
    -- tentée depuis 24 h (un échec ne boucle pas).
    continue when exists (select 1 from vis_ui.demande_courante d where d.subject_id = s.id and d.type = 'AUDIT_IA'
                          and (d.statut in ('QUEUED','RUNNING') or (d.statut = 'DONE' and d.terminee_le > now() - interval '27 days') or d.demande_le > now() - interval '24 hours'));
    est := vis_ui.estimation_audit(s.id, 20);
    maxu := (est ->> 'cout_max_usd')::numeric;
    continue when maxu is null or jsonb_array_length(coalesce(est -> 'moteurs', '[]'::jsonb)) = 0;
    pl := vis_ui.plafond(s.client_id);
    continue when pl is null;
    dej := vis_ui.reel(s.client_id, mois) + vis_ui.engage(s.client_id, mois)
         + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where a.client_id = s.client_id and d.statut in ('QUEUED','RUNNING')), 0);
    continue when dej + maxu > pl;
    dejg := vis_ui.reel(null, mois) + vis_ui.engage(null, mois)
          + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where d.statut in ('QUEUED','RUNNING')), 0);
    continue when dejg + maxu > plg;
    -- Questions de la dernière mesure réussie du site (même panel d'un mois à l'autre).
    select ae.id, ae.matrice into prec from vis.audit_externe ae
     where ae.subject_id = s.id and ae.outil = 'OIA · Audit IA express' and jsonb_array_length(ae.matrice) >= 5
     order by ae.realise_le desc, ae.importe_le desc limit 1;
    fixes := case when prec.id is null then null else
      (select jsonb_agg(jsonb_build_object('id', q ->> 'id', 'sujet', q ->> 'sujet', 'question', q ->> 'question', 'marquee', q -> 'marquee', 'langue', q ->> 'langue')) from jsonb_array_elements(prec.matrice) q) end;
    insert into vis.audit_ia (client_id, subject_id, questions, moteurs, langues, cout_max_usd, cout_habituel_usd, cout_vu_usd, mois, par)
      values (s.client_id, s.id, 20, array(select jsonb_array_elements(est -> 'moteurs') ->> 'moteur'), array(select jsonb_array_elements_text(est -> 'langues')),
              maxu, (est ->> 'cout_habituel_usd')::numeric, maxu, mois, 'mesure mensuelle (GO permanent de Mickaël, 2026-11-18)')
      returning id into aid;
    insert into vis.demande (client_id, subject_id, type, charge, demande_par)
      values (s.client_id, s.id, 'AUDIT_IA', jsonb_build_object('audit_id', aid, 'url', s.url, 'nom', s.nom, 'questions', 20,
              'cibles', (select jsonb_agg(x -> 'cible') from jsonb_array_elements(est -> 'moteurs') x), 'langues', est -> 'langues', 'cout_max_usd', maxu,
              'mensuelle', true, 'questions_de', prec.id, 'questions_fixes', fixes), 'moteur (mesure mensuelle)');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.vis_moteur_planifier_mesure_mensuelle() from public, anon, authenticated;
grant execute on function public.vis_moteur_planifier_mesure_mensuelle() to service_role;

-- Date de résolution d'un constat : première analyse terminée du même type après sa dernière occurrence.
create or replace function public.vis_constat_resolu_le(p_subject text, p_cle text)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  with dernier as (
    select c.cree_le, dm.type from vis.constat c join vis.demande dm on dm.id = c.demande_id
    where c.subject_id = p_subject and c.cle = p_cle order by c.cree_le desc limit 1
  )
  select min(e.le) from dernier x
  join vis.demande d on d.subject_id = p_subject and d.type = x.type
  join vis.demande_etat e on e.demande_id = d.id and e.statut = 'DONE' and e.le > x.cree_le + interval '1 minute'
$$;

-- Suivi quotidien : une ligne par site et par hygiène.
create or replace view public.vis_efficacite_v3 with (security_invoker = true) as
select a.client_id, a.subject_id, a.recu_le::date as jour, a.recu_le,
       round((a.scores ->> 'indexation')::numeric * 100) as score_indexation,
       (a.metriques ->> 'ecarts')::int as ecarts,
       (a.metriques ->> 'google_pages_indexees')::int as google_pages_indexees,
       (a.metriques ->> 'google_pages_inspectees')::int as google_pages_inspectees,
       (a.metriques ->> 'google_impressions_28j')::numeric as google_impressions_28j,
       (a.metriques ->> 'google_clics_28j')::numeric as google_clics_28j,
       (a.metriques ->> 'google_position')::numeric as google_position,
       (a.metriques ->> 'bing_impressions_28j')::numeric as bing_impressions_28j,
       (a.metriques ->> 'bing_clics_28j')::numeric as bing_clics_28j,
       coalesce((a.metriques ->> 'bing_pages_indexees')::numeric, (a.resultat #>> '{bing,exploration,InIndex}')::numeric) as bing_pages_indexees,
       (select count(*) from vis.constat c join vis.demande dm on dm.id = c.demande_id
         where c.subject_id = a.subject_id and c.cree_le::date <= a.recu_le::date
           and public.vis_constat_resolu_le(c.subject_id, c.cle) <= a.recu_le)::int as constats_resolus_cumules
from vis.analyse a
where a.nature = 'indexation' and a.statut = 'fait';

-- Suivi mensuel de la visibilité dans les IA : une ligne par mesure (audit IA express).
create or replace view public.vis_efficacite_mesures_v3 with (security_invoker = true) as
select ae.client_id, ae.subject_id, ae.id as audit_id, ae.realise_le, ae.score, ae.moteurs,
       jsonb_array_length(ae.matrice) as questions,
       (select count(*) from jsonb_array_elements(ae.matrice) q, jsonb_each(q -> 'scores') sc
         where coalesce((q ->> 'marquee')::boolean, false) = false and jsonb_typeof(sc.value) = 'number' and (sc.value)::text::numeric >= 2)::int as citations_sans_nom,
       (select count(*) from jsonb_array_elements(ae.matrice) q, jsonb_each(q -> 'scores') sc
         where coalesce((q ->> 'marquee')::boolean, false) = false and jsonb_typeof(sc.value) = 'number')::int as reponses_sans_nom,
       (d.resultat ->> 'cout_reel_usd')::numeric as cout_reel_usd,
       coalesce((d.charge ->> 'mensuelle')::boolean, false) as mensuelle,
       (d.charge ->> 'questions_de')::uuid as memes_questions_que
from vis.audit_externe ae
left join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.resultat ->> 'audit_externe_id')::uuid = ae.id
where ae.outil = 'OIA · Audit IA express';

revoke all on public.vis_efficacite_v3, public.vis_efficacite_mesures_v3 from public, anon, authenticated;
grant select on public.vis_efficacite_v3, public.vis_efficacite_mesures_v3 to authenticated;
revoke all on function public.vis_constat_resolu_le(text, text) from public, anon;
grant execute on function public.vis_constat_resolu_le(text, text) to authenticated, service_role;

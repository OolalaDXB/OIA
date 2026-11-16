-- 0015 · Visibility : audit IA express (premium, payant), coût affiché avant le lancement.
--
-- Parcours : le cockpit lit l'estimation (vis_audit_ia_estimation_v3), puis appelle
-- vis_lancer_audit_ia avec le coût affiché ; la base vérifie le coût vu et les plafonds (client et
-- global), enregistre le GO et met une demande AUDIT_IA en file. Le moteur : questions tirées du
-- site (Mistral), une passe par question sur chaque moteur (API, jamais d'interface grand
-- public), concurrents et domaines cités, score par moteur, plan d'action ; réponses dans
-- vis.evidence (fenêtre « audit », ajout seul) ; résultat dans vis.audit_externe (outil
-- « OIA · Audit IA express ») et recommandations en attente.
--
-- Coût : chaque moteur a un majorant (au plus) et un coût habituel par appel (vis.tarif_moteur,
-- le plus récent fait foi). Le GO engage le majorant ; le moteur s'arrête s'il l'atteint.
--
-- Retour arrière : drop view public.vis_audits_ia_v3, public.vis_audit_ia_estimation_v3;
--   drop function public.vis_lancer_audit_ia(text, numeric, int), public.vis_moteur_audit_debut(uuid),
--     public.vis_moteur_audit_resultat(uuid, jsonb), vis_ui.estimation_audit(text, int);
--   drop table vis.audit_ia, vis.tarif_moteur ; contrainte demande_type_check sans AUDIT_IA.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA'));

create table if not exists vis.tarif_moteur (
  id            bigserial primary key,
  moteur        text not null check (moteur ~ '^[a-z][a-z0-9_-]{1,30}$'),
  cible         text not null,
  langues       text[],                       -- null : toutes ; sinon moteur réservé à ces langues
  majorant_usd  numeric(10,4) not null check (majorant_usd >= 0),
  habituel_usd  numeric(10,4) not null check (habituel_usd >= 0),
  source        text not null,
  actif         boolean not null default true,
  le            timestamptz not null default now()
);
create table if not exists vis.audit_ia (
  id               uuid primary key default gen_random_uuid(),
  client_id        text not null references vis.client(id) on delete restrict,
  subject_id       text not null references vis.subject(id) on delete restrict,
  demande_id       uuid references vis.demande(id) on delete restrict,
  questions        int not null check (questions between 5 and 40),
  moteurs          text[] not null,
  langues          text[] not null,
  cout_max_usd     numeric(10,2) not null check (cout_max_usd >= 0),
  cout_habituel_usd numeric(10,2) not null check (cout_habituel_usd >= 0),
  cout_vu_usd      numeric(10,2) not null,
  mois             date not null,
  par              text not null,
  le               timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists audit_ia_sujet_idx on vis.audit_ia (subject_id, le desc);

do $$
declare t text;
begin
  for t in select unnest(array['tarif_moteur','audit_ia']) loop
    execute format('create trigger %I before update or delete on vis.%I for each row execute function vis.pilotage_ajout_seul()', t || '_ajout_seul', t);
    execute format('create trigger %I before truncate on vis.%I for each statement execute function vis.pilotage_ajout_seul()', t || '_ajout_seul_truncate', t);
    execute format('alter table vis.%I enable row level security', t);
    execute format('alter table vis.%I owner to vis_admin', t);
    execute format('revoke all on vis.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on vis.%I to authenticated', t);
  end loop;
end $$;
create policy tarif_lisible on vis.tarif_moteur for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text));
create policy tenant_isolation_auth on vis.audit_ia for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis.audit_ia.client_id));

-- Tarifs initiaux : majorant = grille de prix d'OIA au pire cas (src/cost-grid.ts, 20 000 / 8 000
-- jetons et recherches au plafond) ; habituel = coût moyen par réponse observé à J0 (Grok : pas
-- encore mesuré, prix provisoire). « analyse » = questions et synthèse par Mistral (2 appels).
insert into vis.tarif_moteur (moteur, cible, langues, majorant_usd, habituel_usd, source) values
  ('chatgpt',    'chatgpt:openai-api:gpt-6-luna:online', null, 0.0260, 0.0260, 'grille 2026-11-07 ; J0 : 1,30 $ / 50 réponses'),
  ('claude',     'claude:anthropic-api:claude-sonnet-5-5:online', null, 0.2800, 0.0480, 'grille 2026-11-07 (2 appels au pire) ; J0 : 2,38 $ / 50'),
  ('gemini',     'gemini:openrouter:google/gemini-3-flash-preview:online', null, 0.1460, 0.0620, 'grille 2026-11-07 ; J0 : 3,12 $ / 50'),
  ('perplexity', 'perplexity:openrouter:perplexity/sonar:online', null, 0.0330, 0.0150, 'grille 2026-11-07 ; J0 : 0,76 $ / 50'),
  ('grok',       'grok:openrouter:x-ai/grok-4.7:online', null, 0.1880, 0.0400, 'grille provisoire 2026-11-16 (annuaires tiers) ; pas encore mesuré'),
  ('mistral',    'mistral:mistral-api:mistral-large-4:online', array['fr'], 1.2308, 0.3100, 'grille 2026-11-07 (40 recherches au pire) ; J0 : 15,36 $ / 50'),
  ('analyse',    'mistral-api:mistral-large-4', null, 0.1000, 0.0300, 'questions et synthèse : 2 appels sans recherche');

-- Estimation pour un sujet : moteurs actifs pour ses langues, nombre de questions.
create or replace function vis_ui.estimation_audit(p_subject text, p_questions int)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (
    select su.id, su.client_id,
           coalesce(nullif(array(select jsonb_array_elements_text(case when jsonb_typeof(su.extra -> 'langues') = 'array' then su.extra -> 'langues' else '[]'::jsonb end)), '{}'), array['en']) as langues
    from vis.subject su where su.id = p_subject
  ), t as (
    select distinct on (moteur) * from vis.tarif_moteur order by moteur, id desc
  ), m as (
    select t.* from t, s where t.actif and t.moteur <> 'analyse' and (t.langues is null or t.langues && s.langues)
  ), a as (select * from t where moteur = 'analyse')
  select jsonb_build_object(
    'subject_id', s.id, 'client_id', s.client_id, 'langues', to_jsonb(s.langues), 'questions', p_questions,
    'moteurs', (select jsonb_agg(jsonb_build_object('moteur', m.moteur, 'cible', m.cible, 'appels', p_questions,
                  'max_usd', round(m.majorant_usd * p_questions, 2), 'habituel_usd', round(m.habituel_usd * p_questions, 2)) order by m.moteur) from m),
    'appels', (select count(*) * p_questions from m),
    'cout_max_usd', round(coalesce((select sum(m.majorant_usd) * p_questions from m), 0) + coalesce((select majorant_usd from a), 0), 2),
    'cout_habituel_usd', round(coalesce((select sum(m.habituel_usd) * p_questions from m), 0) + coalesce((select habituel_usd from a), 0), 2))
  from s
$$;
revoke all on function vis_ui.estimation_audit(text, int) from public, anon;
grant execute on function vis_ui.estimation_audit(text, int) to authenticated, service_role;

-- Estimation affichée avant le lancement (20 questions), avec le budget du mois.
create or replace view public.vis_audit_ia_estimation_v3 with (security_invoker = true) as
select su.id as subject_id, su.client_id, e.est -> 'langues' as langues, (e.est ->> 'questions')::int as questions,
       e.est -> 'moteurs' as moteurs, (e.est ->> 'appels')::int as appels,
       (e.est ->> 'cout_max_usd')::numeric as cout_max_usd, (e.est ->> 'cout_habituel_usd')::numeric as cout_habituel_usd,
       b.plafond_usd, b.reel_usd, b.engage_usd, b.plafond_global_usd,
       case when b.plafond_usd is null then 'plafond_client_non_fixe'
            when b.plafond_global_usd is null then 'plafond_global_non_fixe'
            when b.reel_usd + b.engage_usd + (e.est ->> 'cout_max_usd')::numeric > b.plafond_usd then 'plafond_depasse'
            else 'ok' end as etat
from vis.subject su
cross join lateral (select vis_ui.estimation_audit(su.id, 20) as est) e
left join public.vis_budget_v2 b on b.client_id = su.client_id and b.mois = date_trunc('month', vis_ui.maintenant() at time zone 'UTC')::date;

create or replace view public.vis_audits_ia_v3 with (security_invoker = true) as
select a.id, a.client_id, a.subject_id, d.id as demande_id, a.questions, a.moteurs, a.langues, a.cout_max_usd, a.cout_habituel_usd,
       a.cout_vu_usd, a.par, a.le,
       d.statut, d.erreur, d.terminee_le, (d.resultat ->> 'audit_externe_id')::uuid as resultat_id,
       (d.resultat ->> 'cout_reel_usd')::numeric as cout_reel_usd, (d.resultat ->> 'score')::numeric as score
from vis.audit_ia a
left join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id;

revoke all on public.vis_audit_ia_estimation_v3, public.vis_audits_ia_v3 from public, anon, authenticated;
grant select on public.vis_audit_ia_estimation_v3, public.vis_audits_ia_v3 to authenticated;

-- Geste : lancer l'audit (coût vu = majorant estimé, sous les plafonds).
create or replace function public.vis_lancer_audit_ia(p_subject text, p_cout_vu_usd numeric, p_questions int default 20)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  est jsonb;
  maxu numeric;
  pl numeric;
  plg numeric;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
  dej numeric;
  dejg numeric;
  did uuid;
  aid uuid;
  url_ text;
  nom_ text;
begin
  select client_id, coalesce(extra ->> 'displayName', id) into cid, nom_ from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_questions is null or p_questions < 5 or p_questions > 40 then raise exception 'nombre de questions refusé (5 à 40)' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('vis.go'));
  -- Double clic : l'audit déjà en file ou en cours.
  select a.id into aid from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id
  where a.subject_id = p_subject and d.statut in ('QUEUED','RUNNING') order by a.le desc limit 1;
  if aid is not null then return aid; end if;
  est := vis_ui.estimation_audit(p_subject, p_questions);
  maxu := (est ->> 'cout_max_usd')::numeric;
  if p_cout_vu_usd is null or round(p_cout_vu_usd, 2) <> round(maxu, 2) then
    raise exception 'estimation changée, recharger (au plus % $)', to_char(maxu, 'FM999990.00') using errcode = '22023';
  end if;
  pl := vis_ui.plafond(cid);
  plg := vis_ui.plafond(null);
  if plg is null then raise exception 'audit refusé : plafond global non fixé' using errcode = '22023'; end if;
  if pl is null then raise exception 'audit refusé : plafond du client non fixé' using errcode = '22023'; end if;
  dej := vis_ui.reel(cid, mois) + vis_ui.engage(cid, mois)
       + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where a.client_id = cid and d.statut in ('QUEUED','RUNNING')), 0);
  if dej + maxu > pl then
    raise exception 'audit refusé : plafond du client dépassé (% $ + % $ > % $)', to_char(dej, 'FM999990.00'), to_char(maxu, 'FM999990.00'), to_char(pl, 'FM999990.00') using errcode = '22023';
  end if;
  dejg := vis_ui.reel(null, mois) + vis_ui.engage(null, mois)
        + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where d.statut in ('QUEUED','RUNNING')), 0);
  if dejg + maxu > plg then
    raise exception 'audit refusé : plafond global dépassé (% $ + % $ > % $)', to_char(dejg, 'FM999990.00'), to_char(maxu, 'FM999990.00'), to_char(plg, 'FM999990.00') using errcode = '22023';
  end if;
  select st.primary_url into url_ from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = p_subject order by st.id limit 1;
  if url_ is null then raise exception 'aucune adresse de site pour ce sujet' using errcode = '55000'; end if;
  insert into vis.audit_ia (client_id, subject_id, questions, moteurs, langues, cout_max_usd, cout_habituel_usd, cout_vu_usd, mois, par)
    values (cid, p_subject, p_questions,
            array(select jsonb_array_elements(est -> 'moteurs') ->> 'moteur'),
            array(select jsonb_array_elements_text(est -> 'langues')),
            maxu, (est ->> 'cout_habituel_usd')::numeric, round(p_cout_vu_usd, 2), mois, uid)
    returning id into aid;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, p_subject, 'AUDIT_IA', jsonb_build_object('audit_id', aid, 'url', url_, 'nom', nom_, 'questions', p_questions,
            'cibles', (select jsonb_agg(x -> 'cible') from jsonb_array_elements(est -> 'moteurs') x), 'langues', est -> 'langues', 'cout_max_usd', maxu), uid)
    returning id into did;
  -- Ajout seul : la demande porte audit_id (charge) ; les vues relient par elle.
  perform vis_ui.journaliser('vis_lancer_audit_ia', cid, p_subject, jsonb_build_object('p_cout_vu_usd', p_cout_vu_usd, 'p_questions', p_questions),
    jsonb_build_object('audit', aid, 'demande', did), uid);
  return aid;
end $$;
revoke all on function public.vis_lancer_audit_ia(text, numeric, int) from public, anon;
grant execute on function public.vis_lancer_audit_ia(text, numeric, int) to authenticated;

-- Moteur : ouvrir la fenêtre de l'audit (les réponses s'y rattachent), rendre le résultat.
create or replace function public.vis_moteur_audit_debut(p_demande uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  wid text;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'AUDIT_IA' then raise exception 'demande d''audit introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  if not exists (select 1 from vis.audit_ia a where a.id = (d.charge ->> 'audit_id')::uuid and a.subject_id = d.subject_id) then
    raise exception 'audit refusé : aucun GO enregistré' using errcode = '42501';
  end if;
  wid := left(d.subject_id || '-audit-' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'), 63);
  insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on, note)
    values (wid, d.subject_id, d.client_id, 'reconnaissance', 1, 'running', (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date,
            'Audit IA express (une passe par question), demande ' || p_demande::text)
    on conflict (id) do nothing;
  return wid;
end $$;

create or replace function public.vis_moteur_audit_resultat(p_demande uuid, p_resultat jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  aid uuid;
  r jsonb := p_resultat;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'AUDIT_IA' then raise exception 'demande d''audit introuvable' using errcode = 'P0002'; end if;
  insert into vis.audit_externe (client_id, subject_id, outil, realise_le, methode, moteurs, score, resume, rapport_md, matrice, importe_par)
  values (d.client_id, d.subject_id, 'OIA · Audit IA express', (now() at time zone 'UTC')::date, r ->> 'methode',
          array(select jsonb_array_elements_text(r -> 'moteurs')), nullif(r ->> 'score', '')::numeric, r ->> 'resume', r ->> 'rapport_md',
          coalesce(r -> 'matrice', '[]'::jsonb), 'moteur')
  returning id into aid;
  if r ->> 'window_id' is not null then
    update vis.window set status = 'done' where id = r ->> 'window_id' and subject_id = d.subject_id;
  end if;
  return aid;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array['public.vis_moteur_audit_debut(uuid)', 'public.vis_moteur_audit_resultat(uuid, jsonb)']) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

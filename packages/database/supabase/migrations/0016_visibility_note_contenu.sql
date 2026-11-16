-- 0016 · Visibility : note du contenu (technique, fonctionnel, commercial), dépôt GitHub lié.
--
-- Parcours :
--   1. Le cockpit lie (facultatif) le dépôt du site : vis_lier_depot(p_subject, 'proprietaire/nom').
--      Lecture seule par l'API GitHub ; dépôt public sans jeton, privé avec le secret
--      OIA_DEPOTS_TOKEN (Contents: read) côté moteur. Le contenu des fichiers secrets n'est jamais lu.
--   2. Il lit l'estimation (vis_note_contenu_estimation_v3) puis appelle vis_lancer_note_contenu avec
--      le coût affiché : la base vérifie le coût vu et les plafonds, enregistre le GO, met une demande
--      NOTE_CONTENU en file.
--   3. Le moteur : pages servies + dépôt → critères déterministes (technique, fonctionnel) ; grille
--      commerciale notée par Mistral avec citation obligatoire (citation absente du site = critère
--      non vérifiable) ; une analyse « contenu » (scores technique/fonctionnel/commercial, 0 à 1) et
--      un constat par critère manqué (source « contenu »).
--
-- Comme l'audit IA express, la note n'entre pas dans le score de visibilité IA.
--
-- Retour arrière : drop view public.vis_notes_contenu_v3, public.vis_note_contenu_estimation_v3,
--   public.vis_depots_v3 ; drop function public.vis_lier_depot(text, text, text),
--   public.vis_lancer_note_contenu(text, numeric), public.vis_moteur_note_debut(uuid) ;
--   drop table vis.note_contenu, vis.depot ; contraintes et fonctions moteur de la 0012/0015 rétablies.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA','NOTE_CONTENU'));

alter table vis.analyse drop constraint if exists analyse_nature_check;
alter table vis.analyse add constraint analyse_nature_check check (nature in ('lighthouse','crawl','indexation','contenu'));
alter table vis.constat drop constraint if exists constat_source_check;
alter table vis.constat add constraint constat_source_check check (source in ('lighthouse','crawl','indexation','contenu'));
alter table vis.constat drop constraint if exists constat_categorie_check;
alter table vis.constat add constraint constat_categorie_check
  check (categorie in ('performance','seo','accessibilite','bonnes_pratiques','contenu','technique','visibilite_ia','fonctionnel','commercial'));

create table if not exists vis.depot (
  id          bigserial primary key,
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  fournisseur text not null default 'github' check (fournisseur = 'github'),
  -- null : dépôt délié.
  depot       text check (depot is null or depot ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$'),
  branche     text check (branche is null or (branche ~ '^[A-Za-z0-9._/-]{1,200}$' and branche !~ '\.\.')),
  par         text not null,
  le          timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists depot_sujet_idx on vis.depot (subject_id, id desc);

create table if not exists vis.note_contenu (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null references vis.client(id) on delete restrict,
  subject_id        text not null references vis.subject(id) on delete restrict,
  depot             text,
  cout_max_usd      numeric(10,2) not null check (cout_max_usd >= 0),
  cout_habituel_usd numeric(10,2) not null check (cout_habituel_usd >= 0),
  cout_vu_usd       numeric(10,2) not null,
  mois              date not null,
  par               text not null,
  le                timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists note_contenu_sujet_idx on vis.note_contenu (subject_id, le desc);

do $$
declare t text;
begin
  for t in select unnest(array['depot','note_contenu']) loop
    execute format('create trigger %I before update or delete on vis.%I for each row execute function vis.pilotage_ajout_seul()', t || '_ajout_seul', t);
    execute format('create trigger %I before truncate on vis.%I for each statement execute function vis.pilotage_ajout_seul()', t || '_ajout_seul_truncate', t);
    execute format('alter table vis.%I enable row level security', t);
    execute format('alter table vis.%I owner to vis_admin', t);
    execute format('revoke all on vis.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on vis.%I to authenticated', t);
    execute format('create policy tenant_isolation_auth on vis.%I for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = %I.client_id))', t, t);
  end loop;
end $$;

-- Note du contenu : 1 appel Mistral (grille commerciale), sortie plafonnée à 32 000 jetons, une reprise au pire.
insert into vis.tarif_moteur (moteur, cible, langues, majorant_usd, habituel_usd, source) values
  ('note_contenu', 'mistral-api:mistral-large-4', null, 0.2000, 0.0300, '2026-11-16 : 1 appel (2 au pire), 30 000 jetons en entrée, 32 000 en sortie au plus');

-- Dépôt lié en vigueur (le plus récent ; depot null = délié).
create or replace view public.vis_depots_v3 with (security_invoker = true) as
select distinct on (d.subject_id) d.subject_id, d.client_id, d.fournisseur, d.depot, d.branche, d.par, d.le
from vis.depot d
order by d.subject_id, d.id desc;

create or replace view public.vis_note_contenu_estimation_v3 with (security_invoker = true) as
with t as (select * from vis.tarif_moteur where moteur = 'note_contenu' order by id desc limit 1)
select su.id as subject_id, su.client_id, dp.depot, dp.branche,
       t.majorant_usd::numeric(10,2) as cout_max_usd, greatest(t.habituel_usd, 0.01)::numeric(10,2) as cout_habituel_usd,
       b.plafond_usd, b.reel_usd, b.engage_usd, b.plafond_global_usd,
       case when b.plafond_usd is null then 'plafond_client_non_fixe'
            when b.plafond_global_usd is null then 'plafond_global_non_fixe'
            when b.reel_usd + b.engage_usd + t.majorant_usd > b.plafond_usd then 'plafond_depasse'
            else 'ok' end as etat
from vis.subject su
cross join t
left join public.vis_depots_v3 dp on dp.subject_id = su.id
left join public.vis_budget_v2 b on b.client_id = su.client_id and b.mois = date_trunc('month', vis_ui.maintenant() at time zone 'UTC')::date;

-- Historique des notes : GO, statut de la demande, notes de l'analyse « contenu ».
create or replace view public.vis_notes_contenu_v3 with (security_invoker = true) as
select n.id, n.client_id, n.subject_id, d.id as demande_id, n.depot, n.cout_max_usd, n.cout_habituel_usd, n.cout_vu_usd, n.par, n.le,
       d.statut, d.erreur, d.terminee_le,
       a.id as analyse_id,
       round((a.scores ->> 'technique')::numeric * 100) as note_technique,
       round((a.scores ->> 'fonctionnel')::numeric * 100) as note_fonctionnelle,
       round((a.scores ->> 'commercial')::numeric * 100) as note_commerciale,
       a.resultat -> 'criteres' as criteres,
       a.resultat ->> 'synthese' as synthese,
       a.resultat -> 'depot' as depot_lu,
       (d.resultat ->> 'cout_reel_usd')::numeric as cout_reel_usd,
       row_number() over (partition by n.subject_id order by n.le desc) = 1 as derniere
from vis.note_contenu n
left join vis_ui.demande_courante d on d.type = 'NOTE_CONTENU' and (d.charge ->> 'note_id')::uuid = n.id
left join lateral (select x.* from vis.analyse x where x.demande_id = d.id and x.nature = 'contenu' order by x.recu_le desc limit 1) a on true;

revoke all on public.vis_depots_v3, public.vis_note_contenu_estimation_v3, public.vis_notes_contenu_v3 from public, anon, authenticated;
grant select on public.vis_depots_v3, public.vis_note_contenu_estimation_v3, public.vis_notes_contenu_v3 to authenticated;

-- Constats : « ouvert » si la dernière demande terminée DU MÊME TYPE (analyse, note du contenu) l'a relevé.
create or replace view public.vis_constats_v3 with (security_invoker = true) as
with dernier as (
  select distinct on (c.subject_id, c.cle) c.*, dm.type as demande_type
  from vis.constat c join vis.demande dm on dm.id = c.demande_id
  order by c.subject_id, c.cle, c.cree_le desc, c.id desc
), derniere_demande as (
  select distinct on (d.subject_id, d.type) d.subject_id, d.type, d.id
  from vis.demande d join vis.demande_etat e on e.demande_id = d.id and e.statut = 'DONE'
  where d.type in ('ANALYSE', 'NOTE_CONTENU')
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

-- Geste : lier (ou délier, p_depot null) le dépôt GitHub du site.
create or replace function public.vis_lier_depot(p_subject text, p_depot text, p_branche text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  dep text := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_depot, ''), '^https://github\.com/', '', 'i'), '(\.git)?/?$', '')), '');
  br text := nullif(btrim(coalesce(p_branche, '')), '');
  nid bigint;
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if dep is not null and dep !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$' then
    raise exception 'dépôt refusé : proprietaire/nom attendu' using errcode = '22023';
  end if;
  if br is not null and (br !~ '^[A-Za-z0-9._/-]{1,200}$' or br ~ '\.\.') then raise exception 'branche refusée' using errcode = '22023'; end if;
  insert into vis.depot (client_id, subject_id, depot, branche, par) values (cid, p_subject, dep, br, uid) returning id into nid;
  perform vis_ui.journaliser('vis_lier_depot', cid, p_subject, jsonb_build_object('p_depot', dep, 'p_branche', br), jsonb_build_object('depot', nid), uid);
  return nid;
end $$;
revoke all on function public.vis_lier_depot(text, text, text) from public, anon;
grant execute on function public.vis_lier_depot(text, text, text) to authenticated;

-- Geste : lancer la note du contenu (coût vu = majorant affiché, sous les plafonds).
create or replace function public.vis_lancer_note_contenu(p_subject text, p_cout_vu_usd numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  nom_ text;
  url_ text;
  maxu numeric;
  habu numeric;
  pl numeric;
  plg numeric;
  mois date := date_trunc('month', now() at time zone 'UTC')::date;
  dej numeric;
  dejg numeric;
  nid uuid;
  did uuid;
  dep record;
begin
  select client_id, coalesce(extra ->> 'displayName', id) into cid, nom_ from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  perform pg_advisory_xact_lock(hashtext('vis.go'));
  -- Double clic : la note déjà en file ou en cours.
  select n.id into nid from vis.note_contenu n join vis_ui.demande_courante d on d.type = 'NOTE_CONTENU' and (d.charge ->> 'note_id')::uuid = n.id
  where n.subject_id = p_subject and d.statut in ('QUEUED','RUNNING') order by n.le desc limit 1;
  if nid is not null then return nid; end if;
  select majorant_usd, habituel_usd into maxu, habu from vis.tarif_moteur where moteur = 'note_contenu' order by id desc limit 1;
  if maxu is null then raise exception 'tarif de la note du contenu absent' using errcode = '55000'; end if;
  maxu := round(maxu, 2);
  if p_cout_vu_usd is null or round(p_cout_vu_usd, 2) <> maxu then
    raise exception 'estimation changée, recharger (au plus % $)', to_char(maxu, 'FM999990.00') using errcode = '22023';
  end if;
  pl := vis_ui.plafond(cid);
  plg := vis_ui.plafond(null);
  if plg is null then raise exception 'note refusée : plafond global non fixé' using errcode = '22023'; end if;
  if pl is null then raise exception 'note refusée : plafond du client non fixé' using errcode = '22023'; end if;
  dej := vis_ui.reel(cid, mois) + vis_ui.engage(cid, mois)
       + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where a.client_id = cid and d.statut in ('QUEUED','RUNNING')), 0);
  if dej + maxu > pl then
    raise exception 'note refusée : plafond du client dépassé (% $ + % $ > % $)', to_char(dej, 'FM999990.00'), to_char(maxu, 'FM999990.00'), to_char(pl, 'FM999990.00') using errcode = '22023';
  end if;
  dejg := vis_ui.reel(null, mois) + vis_ui.engage(null, mois)
        + coalesce((select sum(a.cout_max_usd) from vis.audit_ia a join vis_ui.demande_courante d on d.type = 'AUDIT_IA' and (d.charge ->> 'audit_id')::uuid = a.id where d.statut in ('QUEUED','RUNNING')), 0);
  if dejg + maxu > plg then
    raise exception 'note refusée : plafond global dépassé (% $ + % $ > % $)', to_char(dejg, 'FM999990.00'), to_char(maxu, 'FM999990.00'), to_char(plg, 'FM999990.00') using errcode = '22023';
  end if;
  select st.primary_url into url_ from vis.subject_site ss join vis.site st on st.id = ss.site_id where ss.subject_id = p_subject order by st.id limit 1;
  if url_ is null then raise exception 'aucune adresse de site pour ce sujet' using errcode = '55000'; end if;
  select depot, branche into dep from public.vis_depots_v3 where subject_id = p_subject;
  insert into vis.note_contenu (client_id, subject_id, depot, cout_max_usd, cout_habituel_usd, cout_vu_usd, mois, par)
    values (cid, p_subject, dep.depot, maxu, round(habu, 2), round(p_cout_vu_usd, 2), mois, uid)
    returning id into nid;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, p_subject, 'NOTE_CONTENU', jsonb_build_object('note_id', nid, 'url', url_, 'nom', nom_, 'depot', dep.depot, 'branche', dep.branche, 'cout_max_usd', maxu), uid)
    returning id into did;
  perform vis_ui.journaliser('vis_lancer_note_contenu', cid, p_subject, jsonb_build_object('p_cout_vu_usd', p_cout_vu_usd), jsonb_build_object('note', nid, 'demande', did), uid);
  return nid;
end $$;
revoke all on function public.vis_lancer_note_contenu(text, numeric) from public, anon;
grant execute on function public.vis_lancer_note_contenu(text, numeric) to authenticated;

-- Moteur : contrôle du GO (refus sans ligne vis.note_contenu pour cette demande).
create or replace function public.vis_moteur_note_debut(p_demande uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  n vis.note_contenu;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'NOTE_CONTENU' then raise exception 'demande de note introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  select * into n from vis.note_contenu where id = (d.charge ->> 'note_id')::uuid and subject_id = d.subject_id;
  if n.id is null then raise exception 'note refusée : aucun GO enregistré' using errcode = '42501'; end if;
  return jsonb_build_object('note_id', n.id, 'depot', n.depot, 'cout_max_usd', n.cout_max_usd);
end $$;
revoke all on function public.vis_moteur_note_debut(uuid) from public, anon, authenticated;
grant execute on function public.vis_moteur_note_debut(uuid) to service_role;

-- Analyses et constats : aussi pour la note du contenu (nature et source « contenu » réservées à elle).
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
  if d.type not in ('ANALYSE', 'NOTE_CONTENU') or d.subject_id is null then raise exception 'demande % : pas une analyse', p_demande using errcode = '22023'; end if;
  if (d.type = 'NOTE_CONTENU') <> (a ->> 'nature' = 'contenu') then raise exception 'nature « contenu » réservée à la note du contenu' using errcode = '22023'; end if;
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
  if d.id is null or d.type not in ('ANALYSE', 'NOTE_CONTENU') then raise exception 'demande d''analyse introuvable' using errcode = 'P0002'; end if;
  if (d.type = 'NOTE_CONTENU') <> (c ->> 'source' = 'contenu') then raise exception 'source « contenu » réservée à la note du contenu' using errcode = '22023'; end if;
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

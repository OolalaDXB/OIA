-- 0024 · Visibility : rapports sourcés et scellés.
--
-- Trois rapports, générés par le moteur sans modèle de langage (aucun coût, aucune invention) :
--   AUDIT_INITIAL : état de départ (indexation Google et Bing, Lighthouse, constats, note du contenu,
--                   mesure IA, rapports externes) et plan d'action consolidé ;
--   SUIVI_PLAN    : chaque action, son suivi (qui, quand, preuve) et sa vérification ;
--   RESULTATS     : évolution des indicateurs sur la période, comparée au point de départ.
--
-- Chaque rapport embarque ses sources (chaque relevé avec son identifiant, sa date et son empreinte
-- SHA-256 ; pour une réponse d'IA, l'empreinte de la réponse brute calculée par la base). Le moteur
-- calcule l'empreinte du rapport (JSON canonique) et la signe en Ed25519 ; la clé publique est
-- enregistrée ici. Rapports et clés : ajout seul. N'importe qui peut vérifier un rapport avec la
-- clé publique, sans accès à la base.
--
-- Retour arrière : drop view public.vis_rapports_v3 ; drop function public.vis_demander_rapport(text, text, date, date),
--   public.vis_moteur_rapport_entree(uuid), public.vis_moteur_rapport_scelle(uuid, jsonb), public.vis_moteur_cle(text, text) ;
--   drop table vis.rapport_scelle, vis.cle_signature ; contrainte demande_type_check sans RAPPORT.

alter table vis.demande drop constraint if exists demande_type_check;
alter table vis.demande add constraint demande_type_check
  check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE','ANALYSE','AUDIT_IA','NOTE_CONTENU','EXTRAIRE_PLAN','HYGIENE','CONSOLIDER_PLAN','RAPPORT'));

create table if not exists vis.cle_signature (
  id          text primary key check (id ~ '^[0-9a-f]{16}$'),
  algorithme  text not null check (algorithme = 'Ed25519'),
  publique    text not null check (publique ~ '^-----BEGIN PUBLIC KEY-----'),
  le          timestamptz not null default now()
);
create trigger cle_signature_ajout_seul before update or delete on vis.cle_signature for each row execute function vis.pilotage_ajout_seul();
create trigger cle_signature_ajout_seul_truncate before truncate on vis.cle_signature for each statement execute function vis.pilotage_ajout_seul();
alter table vis.cle_signature enable row level security;
alter table vis.cle_signature owner to vis_admin;
revoke all on vis.cle_signature from public, anon, authenticated, service_role;
grant select on vis.cle_signature to authenticated;
create policy lecture_auth on vis.cle_signature for select using (auth.uid() is not null);

create table if not exists vis.rapport_scelle (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  demande_id   uuid not null references vis.demande(id) on delete restrict,
  type         text not null check (type in ('AUDIT_INITIAL','SUIVI_PLAN','RESULTATS')),
  du           date,
  au           date not null,
  rapport      jsonb not null,
  markdown     text not null,
  empreinte    text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  signature    text not null,
  cle_id       text not null references vis.cle_signature(id) on delete restrict,
  sources      int not null,
  scelle_le    timestamptz not null default now(),
  unique (empreinte),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists rapport_scelle_idx on vis.rapport_scelle (subject_id, scelle_le desc);
create trigger rapport_scelle_ajout_seul before update or delete on vis.rapport_scelle for each row execute function vis.pilotage_ajout_seul();
create trigger rapport_scelle_ajout_seul_truncate before truncate on vis.rapport_scelle for each statement execute function vis.pilotage_ajout_seul();
alter table vis.rapport_scelle enable row level security;
alter table vis.rapport_scelle owner to vis_admin;
revoke all on vis.rapport_scelle from public, anon, authenticated, service_role;
grant select on vis.rapport_scelle to authenticated;
create policy tenant_isolation_auth on vis.rapport_scelle for select
  using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = rapport_scelle.client_id));

-- Geste : générer un rapport (gratuit). p_du/p_au : période ; par défaut le mois écoulé.
create or replace function public.vis_demander_rapport(p_subject text, p_type text, p_du date default null, p_au date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid text;
  uid text;
  did uuid;
  au_ date := coalesce(p_au, (now() at time zone 'UTC')::date);
  du_ date := coalesce(p_du, coalesce(p_au, (now() at time zone 'UTC')::date) - 30);
begin
  select client_id into cid from vis.subject where id = p_subject;
  if cid is null then raise exception 'sujet introuvable' using errcode = 'P0002'; end if;
  uid := vis_ui.exiger_humain(cid);
  if p_type not in ('AUDIT_INITIAL','SUIVI_PLAN','RESULTATS') then raise exception 'type de rapport refusé' using errcode = '22023'; end if;
  if du_ > au_ then raise exception 'période refusée' using errcode = '22023'; end if;
  insert into vis.demande (client_id, subject_id, type, charge, demande_par)
    values (cid, p_subject, 'RAPPORT', jsonb_build_object('rapport', p_type, 'du', du_, 'au', au_), uid) returning id into did;
  perform vis_ui.journaliser('vis_demander_rapport', cid, p_subject, jsonb_build_object('p_type', p_type, 'p_du', du_, 'p_au', au_), jsonb_build_object('demande', did), uid);
  return did;
end $$;
revoke all on function public.vis_demander_rapport(text, text, date, date) from public, anon;
grant execute on function public.vis_demander_rapport(text, text, date, date) to authenticated;

-- Moteur : enregistre une clé publique (ajout seul ; une clé existante n'est jamais remplacée).
create or replace function public.vis_moteur_cle(p_id text, p_publique text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform vis_ui.exiger_moteur();
  insert into vis.cle_signature (id, algorithme, publique) values (p_id, 'Ed25519', p_publique) on conflict (id) do nothing;
  if not exists (select 1 from vis.cle_signature c where c.id = p_id and c.publique = p_publique) then
    raise exception 'clé : identifiant déjà pris par une autre clé' using errcode = '23505';
  end if;
  return p_id;
end $$;
revoke all on function public.vis_moteur_cle(text, text) from public, anon, authenticated;
grant execute on function public.vis_moteur_cle(text, text) to service_role;

-- Moteur : les données sourcées du rapport. Chaque élément garde son identifiant et sa date.
create or replace function public.vis_moteur_rapport_entree(p_demande uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  typ text;
  du_ date;
  au_ date;
  sid text;
  fin timestamptz;
  ia uuid;
  r jsonb;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'RAPPORT' then raise exception 'demande de rapport introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  typ := d.charge ->> 'rapport';
  du_ := nullif(d.charge ->> 'du', '')::date;
  au_ := (d.charge ->> 'au')::date;
  sid := d.subject_id;
  fin := (au_ + 1)::timestamp at time zone 'UTC';

  r := jsonb_build_object(
    'type', typ, 'du', du_, 'au', au_,
    'sujet', (select jsonb_build_object('id', su.id, 'client_id', su.client_id, 'nom', coalesce(su.extra ->> 'displayName', su.id), 'url', st.primary_url, 'langues', su.extra -> 'langues')
              from vis.subject su left join vis.subject_site ss on ss.subject_id = su.id left join vis.site st on st.id = ss.site_id where su.id = sid order by st.id limit 1));

  if typ = 'AUDIT_INITIAL' then
    select a.id into ia from vis.audit_externe a where a.subject_id = sid and a.outil = 'OIA · Audit IA express' and a.importe_le < fin order by a.importe_le desc limit 1;
    r := r || jsonb_build_object(
      'indexation', (select to_jsonb(x) from (select a.id, a.recu_le, a.url, a.scores, a.metriques, a.resultat -> 'controles' as controles, a.resultat -> 'gsc' as gsc, a.resultat -> 'bing' as bing
                     from vis.analyse a where a.subject_id = sid and a.nature = 'indexation' and a.statut = 'fait' and a.recu_le < fin order by a.recu_le desc limit 1) x),
      'lighthouse', coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct on (a.strategie) a.id, a.recu_le, a.strategie, a.outil, a.scores, a.metriques
                     from vis.analyse a where a.subject_id = sid and a.nature = 'lighthouse' and a.statut = 'fait' and a.recu_le < fin order by a.strategie, a.recu_le desc) x), '[]'::jsonb),
      'contenu', (select to_jsonb(x) from (select a.id, a.recu_le, a.outil, a.scores, a.metriques from vis.analyse a
                     where a.subject_id = sid and a.nature = 'contenu' and a.statut = 'fait' and a.recu_le < fin order by a.recu_le desc limit 1) x),
      'constats', coalesce((select jsonb_agg(to_jsonb(x) order by x.ordre, x.cle) from (select c.id, c.cle, c.source, c.categorie, c.gravite, c.titre, c.explication, c.correction, c.effort, c.qui, c.premiere_fois, c.derniere_fois, c.ordre
                     from public.vis_constats_v3 c where c.subject_id = sid and c.etat <> 'resolu') x), '[]'::jsonb),
      'audit_ia', (select to_jsonb(x) from (select a.id, a.realise_le, a.importe_le, a.methode, a.moteurs, a.score, a.resume, a.matrice from vis.audit_externe a where a.id = ia) x),
      'preuves_ia', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'moteur', e.engine, 'question', e.structured #>> '{audit,question}', 'recu_le', e.received_at, 'empreinte', encode(e.raw_sha256, 'hex')) order by e.prompt_id, e.engine)
                     from vis.evidence e join vis.demande dm on dm.id::text = e.structured #>> '{audit,demande}'
                     join vis_ui.demande_courante dc on dc.id = dm.id and (dc.resultat ->> 'audit_externe_id')::uuid = ia
                     where e.subject_id = sid), '[]'::jsonb),
      'rapports_externes', coalesce((select jsonb_agg(to_jsonb(x) order by x.realise_le) from (select a.id, a.outil, a.realise_le, a.importe_le, a.methode, a.score, a.resume
                     from vis.audit_externe a where a.subject_id = sid and a.outil <> 'OIA · Audit IA express' and a.importe_le < fin) x), '[]'::jsonb),
      'plan', (select to_jsonb(x) from (select p.id, p.le, p.resume, p.groupes, p.sources, p.actions_lues, p.modele from vis.plan_consolide p
                     where p.subject_id = sid and p.le < fin order by p.le desc limit 1) x));
  elsif typ = 'SUIVI_PLAN' then
    r := r || jsonb_build_object(
      'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x.ordre, x.action_cle) from (select s.action_cle, s.nature, s.origine ->> 'libelle' as origine, s.priorite, s.ordre, s.titre, s.quoi_faire,
                     s.suivi, s.responsable, s.echeance, s.en_retard, s.fait_le, s.verification, s.verifie_le, s.effet, s.preuve
                     from public.vis_plan_suivi_v3 s where s.subject_id = sid) x), '[]'::jsonb),
      'gestes', coalesce((select jsonb_agg(to_jsonb(x) order by x.le) from (select g.id, g.action_cle, g.etat, g.responsable, g.echeance, g.note, g.preuve, g.le
                     from vis.action_suivi g where g.subject_id = sid and g.le < fin and (du_ is null or g.le >= du_::timestamp at time zone 'UTC')) x), '[]'::jsonb),
      'plan', (select to_jsonb(x) from (select p.id, p.le, p.resume, p.groupes from vis.plan_consolide p where p.subject_id = sid and p.le < fin order by p.le desc limit 1) x));
  elsif typ = 'RESULTATS' then
    r := r || jsonb_build_object(
      'depart', (select to_jsonb(x) from (select a.id, e.* from public.vis_efficacite_v3 e join vis.analyse a on a.subject_id = e.subject_id and a.recu_le = e.recu_le and a.nature = 'indexation'
                     where e.subject_id = sid order by e.recu_le asc limit 1) x),
      'serie', coalesce((select jsonb_agg(to_jsonb(x) order by x.recu_le) from (select a.id, e.* from public.vis_efficacite_v3 e join vis.analyse a on a.subject_id = e.subject_id and a.recu_le = e.recu_le and a.nature = 'indexation'
                     where e.subject_id = sid and e.recu_le < fin and (du_ is null or e.recu_le >= du_::timestamp at time zone 'UTC')) x), '[]'::jsonb),
      'mesures_ia', coalesce((select jsonb_agg(to_jsonb(x) order by x.realise_le) from (select m.audit_id as id, m.realise_le, m.score, m.moteurs, m.questions, m.citations_sans_nom, m.reponses_sans_nom, m.mensuelle, m.memes_questions_que
                     from public.vis_efficacite_mesures_v3 m where m.subject_id = sid and m.realise_le <= au_) x), '[]'::jsonb),
      'corrections_verifiees', coalesce((select jsonb_agg(to_jsonb(x) order by x.verifie_le) from (select s.action_cle, s.titre, s.priorite, s.fait_le, s.verifie_le
                     from public.vis_plan_suivi_v3 s where s.subject_id = sid and s.verification = 'corrige_verifie' and s.verifie_le < fin) x), '[]'::jsonb));
  else
    raise exception 'type de rapport inconnu' using errcode = '22023';
  end if;
  return r;
end $$;
revoke all on function public.vis_moteur_rapport_entree(uuid) from public, anon, authenticated;
grant execute on function public.vis_moteur_rapport_entree(uuid) to service_role;

-- Moteur : enregistre le rapport scellé. La base vérifie la forme ; la signature se vérifie avec la clé publique.
create or replace function public.vis_moteur_rapport_scelle(p_demande uuid, p_scelle jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  rid uuid;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  if d.id is null or d.type <> 'RAPPORT' then raise exception 'demande de rapport introuvable' using errcode = 'P0002'; end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  if (p_scelle #>> '{rapport,sujet,id}') is distinct from d.subject_id then raise exception 'rapport : sujet différent de la demande' using errcode = '22023'; end if;
  insert into vis.rapport_scelle (client_id, subject_id, demande_id, type, du, au, rapport, markdown, empreinte, signature, cle_id, sources)
    values (d.client_id, d.subject_id, d.id, p_scelle #>> '{rapport,type}', nullif(p_scelle #>> '{rapport,periode,du}', '')::date, (p_scelle #>> '{rapport,periode,au}')::date,
            p_scelle -> 'rapport', p_scelle ->> 'markdown', p_scelle #>> '{sceau,empreinte}', p_scelle #>> '{sceau,signature}', p_scelle #>> '{sceau,cle_id}',
            jsonb_array_length(coalesce(p_scelle #> '{rapport,sources}', '[]'::jsonb)))
    returning id into rid;
  return rid;
end $$;
revoke all on function public.vis_moteur_rapport_scelle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.vis_moteur_rapport_scelle(uuid, jsonb) to service_role;

-- Les rapports d'un site, avec le sceau et la clé publique pour la vérification.
create or replace view public.vis_rapports_v3 with (security_invoker = true) as
select r.id, r.client_id, r.subject_id, r.demande_id, r.type, r.du, r.au, r.sources, r.scelle_le, r.empreinte, r.signature, r.cle_id, k.publique as cle_publique, r.rapport, r.markdown
from vis.rapport_scelle r join vis.cle_signature k on k.id = r.cle_id;
revoke all on public.vis_rapports_v3 from public, anon, authenticated;
grant select on public.vis_rapports_v3 to authenticated;

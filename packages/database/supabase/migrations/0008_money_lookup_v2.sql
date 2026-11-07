-- 0008 · Money Lookup, contrat version 2.
-- D'après docs/interface/ecarts-money-lookup-lovable.md (branche
-- lovable/oia-visibility-prototype, commit 1e3040c), sections 5 bis et 7.
-- Contrat : docs/interface/contrat-donnees-money-lookup.md (version 2).
--
-- Fichier seulement : Mickaël l'applique, après 0007, dans une transaction.
--
-- 1. Reprise du navigateur (A4) corrigée :
--    * une sauvegarde valide de l'ancienne console écrit `null` pour chaque clé
--      jamais initialisée : l'import l'accepte désormais (tableau ou objet vide) ;
--    * le bilan compte les éléments déjà présents et liste les conflits
--      (même identifiant d'origine, contenu différent : rien n'est écrasé) ;
--    * chaque élément importé garde son empreinte ; `oia_apercu_annulation`
--      montre ce qu'une annulation supprimerait et ce qui a été modifié depuis ;
--      `oia_annuler_import` refuse (code 55000) tant que ces modifications ne
--      sont pas confirmées ;
--    * l'auteur d'origine d'une vue enregistrée est conservé quand il existe.
-- 2. Décisions par défaut, à valider par Mickaël, servies par des vues `_v2`
--    (les vues `_v1` restent servies sans changement, règle du contrat) :
--    * un COMMENT ne change pas la dernière décision (`ml_decision_v2`) ;
--    * REGULATORY est exclu de « Toutes » et des montants (il reste dans Signals) ;
--    * EN_ATTENTE_DE_TRI exclut les échéances dépassées (`ml_aujourdhui_v2`).
--    `ml_toutes_v2` ajoute les colonnes de liste (publication, confiance,
--    verdict de l'analyste, route stratégique, type d'avis) ; `ml_fiche_v2`
--    donne les identifiants, la date de fin des tâches, le gate de chaque
--    décision et l'auteur d'origine.
-- 3. Lectures nouvelles (`_v1`), membres de l'espace seulement : projets du
--    registre (table oia_projet, copiée par le chargeur), contacts, notes,
--    tâches, vues enregistrées, demandes, brouillons de projet, contrôle des
--    liens, imports, rattachement aux projets, indicateurs (comptes, montants
--    sans mélange, répartitions), journal global des avis.
-- 4. Écritures nouvelles : `oia_supprimer` (note, tâche, contact, vue) et
--    `oia_proposer_projet` (brouillon puis recherche).
--
-- Rejouable. Retour arrière : voir la fin du fichier.

begin;

-- ══ 1. Reprise du navigateur (A4) ══════════════════════════════════════════

-- Valeur JSON d'une clé de sauvegarde : absente ou `null` → vide ; sinon du bon type.
create or replace function public.oia_json_tableau(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return '[]'::jsonb; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'oia: sauvegarde illisible : une liste était attendue, reçu %', jsonb_typeof(p) using errcode = '22023';
  end if;
  return p;
end $$;

create or replace function public.oia_json_objet(p jsonb) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'oia: sauvegarde illisible : un objet était attendu, reçu %', jsonb_typeof(p) using errcode = '22023';
  end if;
  return p;
end $$;

-- Empreinte d'un contenu, pour savoir si un élément importé a été modifié depuis.
create or replace function public.oia_empreinte(variadic p text[]) returns text
language sql immutable set search_path = public, pg_temp as $$
  select md5(array_to_string(p, '|', '∅'))
$$;

create table if not exists public.oia_import_element (
  import_id uuid not null references public.oia_import (id) on delete cascade,
  table_nom text not null check (table_nom in ('reviews', 'notes', 'tasks', 'contacts', 'saved_views', 'project_tags')),
  cle       text not null,
  empreinte text not null,
  primary key (import_id, table_nom, cle)
);
alter table public.oia_import_element enable row level security;
drop policy if exists membres_lisent on public.oia_import_element;
create policy membres_lisent on public.oia_import_element for select to authenticated
  using (exists (select 1 from public.oia_import i where i.id = import_id and public.oia_est_membre(i.espace_id)));
revoke all on public.oia_import_element from public, anon, authenticated;
grant select on public.oia_import_element to authenticated;

create or replace function public.oia_importer_sauvegarde(p_espace uuid, p_sauvegarde jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_import uuid := gen_random_uuid();
  v_data jsonb;
  t_dec jsonb; t_not jsonb; t_tac jsonb; t_con jsonb; t_vue jsonb; t_eti jsonb;
  n_dec int := 0; n_not int := 0; n_tac int := 0; n_con int := 0; n_vue int := 0; n_eti int := 0;
  v_deja jsonb := '{}'::jsonb;
  v_conflits jsonb := '{}'::jsonb;
  v_identiques int; v_differents jsonb;
  v_bilan jsonb;
begin
  if p_sauvegarde ->> 'kind' is distinct from 'oia.workspace.backup' or (p_sauvegarde ->> 'version')::int is distinct from 1 then
    raise exception 'oia: fichier de sauvegarde non reconnu (kind oia.workspace.backup, version 1 attendus)' using errcode = '22023';
  end if;
  v_data := public.oia_json_objet(p_sauvegarde -> 'data');
  -- Une clé jamais initialisée dans la console est exportée en `null` : elle vaut « vide ».
  select coalesce(jsonb_agg(e), '[]') into t_dec from jsonb_array_elements(public.oia_json_tableau(v_data -> 'oia.audit.v1')) e
    where jsonb_typeof(e) = 'object' and e ->> 'action' in ('APPROVE', 'REJECT', 'NEEDS_VERIFICATION', 'COMMENT');
  select coalesce(jsonb_agg(e), '[]') into t_not from jsonb_array_elements(public.oia_json_tableau(v_data -> 'oia.notes.v1')) e where jsonb_typeof(e) = 'object';
  select coalesce(jsonb_agg(e), '[]') into t_tac from jsonb_array_elements(public.oia_json_tableau(v_data -> 'oia.tasks.v1')) e where jsonb_typeof(e) = 'object';
  select coalesce(jsonb_agg(e), '[]') into t_con from jsonb_array_elements(public.oia_json_tableau(v_data -> 'oia.contacts.v1')) e where jsonb_typeof(e) = 'object';
  select coalesce(jsonb_agg(e), '[]') into t_vue from jsonb_array_elements(public.oia_json_tableau(v_data -> 'oia.views.v1')) e where jsonb_typeof(e) = 'object';
  t_eti := public.oia_json_objet(v_data -> 'oia.tags.v1');

  insert into public.oia_import (id, espace_id, user_id, exporte_le) values (v_import, p_espace, v_uid, (p_sauvegarde ->> 'exportedAt')::timestamptz);

  -- Conflits : même identifiant d'origine déjà en base. Rien n'est écrasé ; le bilan le dit.
  select count(*) filter (where public.oia_empreinte(r.action, r.comment, r.record_id) = public.oia_empreinte(e ->> 'action', coalesce(e ->> 'comment', ''), e ->> 'recordId')),
         coalesce(jsonb_agg(e ->> 'id') filter (where public.oia_empreinte(r.action, r.comment, r.record_id) <> public.oia_empreinte(e ->> 'action', coalesce(e ->> 'comment', ''), e ->> 'recordId')), '[]')
    into v_identiques, v_differents
    from jsonb_array_elements(t_dec) e join public.reviews r on r.espace_id = p_espace and r.id_origine = e ->> 'id';
  v_deja := v_deja || jsonb_build_object('decisions', v_identiques); v_conflits := v_conflits || jsonb_build_object('decisions', v_differents);
  select count(*) filter (where public.oia_empreinte(n.text, n.record_id, n.project_slug) = public.oia_empreinte(e ->> 'text', e ->> 'recordId', e ->> 'projectSlug')),
         coalesce(jsonb_agg(e ->> 'id') filter (where public.oia_empreinte(n.text, n.record_id, n.project_slug) <> public.oia_empreinte(e ->> 'text', e ->> 'recordId', e ->> 'projectSlug')), '[]')
    into v_identiques, v_differents
    from jsonb_array_elements(t_not) e join public.notes n on n.espace_id = p_espace and n.id_origine = e ->> 'id';
  v_deja := v_deja || jsonb_build_object('notes', v_identiques); v_conflits := v_conflits || jsonb_build_object('notes', v_differents);
  select count(*) filter (where public.oia_empreinte(k.title, k.status, k.due::text, k.record_id, k.project_slug) = public.oia_empreinte(e ->> 'title', coalesce(e ->> 'status', 'OPEN'), e ->> 'due', e ->> 'recordId', e ->> 'projectSlug')),
         coalesce(jsonb_agg(e ->> 'id') filter (where public.oia_empreinte(k.title, k.status, k.due::text, k.record_id, k.project_slug) <> public.oia_empreinte(e ->> 'title', coalesce(e ->> 'status', 'OPEN'), e ->> 'due', e ->> 'recordId', e ->> 'projectSlug')), '[]')
    into v_identiques, v_differents
    from jsonb_array_elements(t_tac) e join public.tasks k on k.espace_id = p_espace and k.id_origine = e ->> 'id';
  v_deja := v_deja || jsonb_build_object('taches', v_identiques); v_conflits := v_conflits || jsonb_build_object('taches', v_differents);
  select count(*) filter (where public.oia_empreinte(c.name, c.organisation, c.role, c.email, c.phone, c.note) = public.oia_empreinte(e ->> 'name', e ->> 'organisation', e ->> 'role', e ->> 'email', e ->> 'phone', e ->> 'note')),
         coalesce(jsonb_agg(e ->> 'id') filter (where public.oia_empreinte(c.name, c.organisation, c.role, c.email, c.phone, c.note) <> public.oia_empreinte(e ->> 'name', e ->> 'organisation', e ->> 'role', e ->> 'email', e ->> 'phone', e ->> 'note')), '[]')
    into v_identiques, v_differents
    from jsonb_array_elements(t_con) e join public.contacts c on c.espace_id = p_espace and c.id_origine = e ->> 'id';
  v_deja := v_deja || jsonb_build_object('contacts', v_identiques); v_conflits := v_conflits || jsonb_build_object('contacts', v_differents);
  select count(*) filter (where public.oia_empreinte(s.name, s.filters::text) = public.oia_empreinte(e ->> 'name', coalesce(e -> 'filters', '{}'::jsonb)::text)),
         coalesce(jsonb_agg(e ->> 'id') filter (where public.oia_empreinte(s.name, s.filters::text) <> public.oia_empreinte(e ->> 'name', coalesce(e -> 'filters', '{}'::jsonb)::text)), '[]')
    into v_identiques, v_differents
    from jsonb_array_elements(t_vue) e join public.saved_views s on s.espace_id = p_espace and s.id_origine = e ->> 'id';
  v_deja := v_deja || jsonb_build_object('vues', v_identiques); v_conflits := v_conflits || jsonb_build_object('vues', v_differents);
  select count(*) filter (where t.project_slug = x.v #>> '{}'), coalesce(jsonb_agg(x.k) filter (where t.project_slug <> x.v #>> '{}'), '[]')
    into v_identiques, v_differents
    from jsonb_each(t_eti) as x(k, v) join public.project_tags t on t.espace_id = p_espace and t.record_id = x.k
    where coalesce(x.v #>> '{}', '') <> '';
  v_deja := v_deja || jsonb_build_object('etiquettes', v_identiques); v_conflits := v_conflits || jsonb_build_object('etiquettes', v_differents);

  -- Insertions, avec l'empreinte de chaque élément importé.
  with ins as (
    insert into public.reviews (record_id, action, comment, at, actor, gate_pursue_eligible_at_decision, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'recordId', e ->> 'action', coalesce(e ->> 'comment', ''), (e ->> 'at')::timestamptz, v_uid::text,
           coalesce((e ->> 'gatePursueEligibleAtDecision')::boolean, false), p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(t_dec) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning id, action, comment, record_id),
  el as (insert into public.oia_import_element select v_import, 'reviews', id::text, public.oia_empreinte(action, comment, record_id) from ins returning 1)
  select count(*) into n_dec from el;

  with ins as (
    insert into public.notes (text, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'text', e ->> 'recordId', e ->> 'projectSlug', (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(t_not) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning id, text, record_id, project_slug),
  el as (insert into public.oia_import_element select v_import, 'notes', id::text, public.oia_empreinte(text, record_id, project_slug) from ins returning 1)
  select count(*) into n_not from el;

  with ins as (
    insert into public.tasks (title, due, status, completed_at, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'title', (e ->> 'due')::date, coalesce(e ->> 'status', 'OPEN'), (e ->> 'completedAt')::timestamptz, e ->> 'recordId', e ->> 'projectSlug',
           (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(t_tac) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning id, title, due, status, completed_at, record_id, project_slug),
  el as (insert into public.oia_import_element
         select v_import, 'tasks', id::text, public.oia_empreinte(title, due::text, status, completed_at::text, record_id, project_slug) from ins returning 1)
  select count(*) into n_tac from el;

  with ins as (
    insert into public.contacts (name, organisation, role, email, phone, note, record_id, project_slug, at, actor, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'name', e ->> 'organisation', e ->> 'role', e ->> 'email', e ->> 'phone', e ->> 'note', e ->> 'recordId', e ->> 'projectSlug',
           (e ->> 'at')::timestamptz, v_uid::text, p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(t_con) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning id, name, organisation, role, email, phone, note, record_id, project_slug),
  el as (insert into public.oia_import_element
         select v_import, 'contacts', id::text, public.oia_empreinte(name, organisation, role, email, phone, note, record_id, project_slug) from ins returning 1)
  select count(*) into n_con from el;

  with ins as (
    insert into public.saved_views (name, kind, filters, sort_field, sort_direction, created_at, espace_id, id_origine, auteur_origine, import_id)
    select e ->> 'name', coalesce(e ->> 'kind', 'OPPORTUNITY'), coalesce(e -> 'filters', '{}'::jsonb), coalesce(e ->> 'sortField', 'pubDate'),
           coalesce(e ->> 'sortDirection', 'desc'), coalesce((e ->> 'createdAt')::timestamptz, now()), p_espace, e ->> 'id', e ->> 'actor', v_import
    from jsonb_array_elements(t_vue) e
    on conflict (espace_id, id_origine) where id_origine is not null do nothing
    returning id, name, kind, filters, sort_field, sort_direction),
  el as (insert into public.oia_import_element
         select v_import, 'saved_views', id::text, public.oia_empreinte(name, kind, filters::text, sort_field, sort_direction) from ins returning 1)
  select count(*) into n_vue from el;

  -- Étiquettes : une existante n'est jamais écrasée par un import.
  with ins as (
    insert into public.project_tags (espace_id, record_id, project_slug, actor, import_id)
    select p_espace, k, v #>> '{}', v_uid::text, v_import
    from jsonb_each(t_eti) as x(k, v)
    where coalesce(v #>> '{}', '') <> ''
    on conflict (espace_id, record_id) do nothing
    returning record_id, project_slug),
  el as (insert into public.oia_import_element select v_import, 'project_tags', record_id, public.oia_empreinte(project_slug) from ins returning 1)
  select count(*) into n_eti from el;

  v_bilan := jsonb_build_object('import_id', v_import, 'decisions', n_dec, 'notes', n_not, 'taches', n_tac, 'contacts', n_con, 'vues', n_vue,
                                'etiquettes', n_eti, 'deja_presents', v_deja, 'conflits', v_conflits);
  update public.oia_import set bilan = v_bilan where id = v_import;
  perform public.oia_journaliser(p_espace, 'importer', 'oia_import', v_import::text, v_bilan);
  return v_bilan;
end $$;

-- Ce qu'une annulation supprimerait, et ce qui a été modifié depuis l'import.
create or replace function public.oia_apercu_annulation(p_import uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_annule timestamptz;
  v_lignes jsonb;
  v_modifies jsonb;
  v_non_verifiables int;
begin
  select espace_id, annule_le into v_espace, v_annule from public.oia_import where id = p_import;
  if v_espace is null or not public.oia_est_membre(v_espace) then
    raise exception 'oia: import introuvable' using errcode = 'P0002';
  end if;
  with actuel as (
    select 'reviews'::text as t, r.id::text as cle, r.id_origine, public.oia_empreinte(r.action, r.comment, r.record_id) as e from public.reviews r where r.import_id = p_import
    union all select 'notes', n.id::text, n.id_origine, public.oia_empreinte(n.text, n.record_id, n.project_slug) from public.notes n where n.import_id = p_import
    union all select 'tasks', k.id::text, k.id_origine, public.oia_empreinte(k.title, k.due::text, k.status, k.completed_at::text, k.record_id, k.project_slug) from public.tasks k where k.import_id = p_import
    union all select 'contacts', c.id::text, c.id_origine, public.oia_empreinte(c.name, c.organisation, c.role, c.email, c.phone, c.note, c.record_id, c.project_slug) from public.contacts c where c.import_id = p_import
    union all select 'saved_views', s.id::text, s.id_origine, public.oia_empreinte(s.name, s.kind, s.filters::text, s.sort_field, s.sort_direction) from public.saved_views s where s.import_id = p_import
    union all select 'project_tags', g.record_id, null, public.oia_empreinte(g.project_slug) from public.project_tags g where g.import_id = p_import
  ), compare as (
    select a.*, el.empreinte as origine from actuel a
    left join public.oia_import_element el on el.import_id = p_import and el.table_nom = a.t and el.cle = a.cle
  )
  select coalesce((select jsonb_object_agg(t, n) from (select t, count(*) as n from compare group by t) x), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('table', t, 'id', cle, 'id_origine', id_origine) order by t, cle) from compare where origine is not null and origine <> e), '[]'),
         (select count(*) from compare where origine is null)
    into v_lignes, v_modifies, v_non_verifiables;
  return jsonb_build_object('import_id', p_import, 'annule_le', v_annule, 'a_supprimer', v_lignes, 'modifies_depuis_import', v_modifies,
                            'non_verifiables', v_non_verifiables);
end $$;

-- Annulation : retire ce que l'import a ajouté. Refuse (55000) si des éléments ont été
-- modifiés depuis, ou ne peuvent pas être vérifiés (import antérieur à 0008), sans confirmation.
drop function if exists public.oia_annuler_import(uuid);
create or replace function public.oia_annuler_import(p_import uuid, p_confirmer_modifications boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_espace uuid;
  v_auteur uuid;
  v_uid uuid;
  v_apercu jsonb;
  v_bilan jsonb;
  n int;
begin
  select espace_id, user_id into v_espace, v_auteur from public.oia_import where id = p_import and annule_le is null;
  if v_espace is null then raise exception 'oia: import introuvable ou déjà annulé' using errcode = 'P0002'; end if;
  v_uid := public.oia_exiger_editeur(v_espace);
  if v_uid <> v_auteur and public.oia_role(v_espace) <> 'proprietaire' then
    raise exception 'oia: seul l''auteur de l''import ou le propriétaire peut l''annuler' using errcode = '42501';
  end if;
  v_apercu := public.oia_apercu_annulation(p_import);
  if not p_confirmer_modifications
     and (jsonb_array_length(v_apercu -> 'modifies_depuis_import') > 0 or (v_apercu ->> 'non_verifiables')::int > 0) then
    raise exception 'oia: % élément(s) importé(s) modifié(s) depuis l''import et % non vérifiable(s) seraient supprimés : relire oia_apercu_annulation, puis confirmer',
      jsonb_array_length(v_apercu -> 'modifies_depuis_import'), (v_apercu ->> 'non_verifiables')::int using errcode = '55000';
  end if;
  v_bilan := '{}'::jsonb;
  delete from public.reviews where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('decisions', n);
  delete from public.notes where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('notes', n);
  delete from public.tasks where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('taches', n);
  delete from public.contacts where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('contacts', n);
  delete from public.saved_views where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('vues', n);
  delete from public.project_tags where import_id = p_import; get diagnostics n = row_count; v_bilan := v_bilan || jsonb_build_object('etiquettes', n);
  v_bilan := v_bilan || jsonb_build_object('modifies_confirmes', v_apercu -> 'modifies_depuis_import');
  update public.oia_import set annule_le = now() where id = p_import;
  perform public.oia_journaliser(v_espace, 'annuler_import', 'oia_import', p_import::text, v_bilan);
  return v_bilan;
end $$;

-- ══ 2. Décisions par défaut (vues `_v2`) ═══════════════════════════════════

-- Dernière décision hors COMMENT : un commentaire ne change ni « Ton avis », ni la vérification, ni le tri.
create or replace view public.ml_decision_v2 with (security_invoker = true) as
select distinct on (r.espace_id, r.record_id)
  r.espace_id, r.record_id, r.action as decision, r.at as decide_le, r.actor as decide_par, r.auteur_origine,
  r.gate_pursue_eligible_at_decision as gate_ok_au_moment
from public.reviews r
where r.action <> 'COMMENT'
order by r.espace_id, r.record_id, r.at desc, r.id;

-- « Toutes », strictement monétaire : REGULATORY reste dans Signals seulement.
create or replace view public.ml_toutes_v2 with (security_invoker = true) as
select
  o.id, o.espace_id, o.record_id,
  o.title                                   as titre,
  o.issuer                                  as emetteur,
  public.ml_nature(o.opportunity_kind)      as nature,
  public.ml_categorie_de(public.ml_nature(o.opportunity_kind)) as categorie,
  public.ml_sens_de(public.ml_nature(o.opportunity_kind))      as sens,
  m.valeur                                  as montant,
  m.devise,
  m.confiance                               as confiance_montant,
  (m.valeur is not null)                    as montant_connu,
  o.deadline_at                             as echeance,
  o.recommendation                          as recommandation,
  o.verification_status                     as statut_verification,
  coalesce(o.verification_status = 'VERIFIED' and d.decision = 'APPROVE', false) as verifie_par_humain,
  o.gate_pursue_eligible                    as gate_ok,
  o.gate_failed_reasons                     as raisons_gate,
  coalesce(d.decision, 'PENDING')           as decision_humaine,
  d.decide_le,
  t.project_slug                            as projet_etiquete,
  o.discovered_for                          as projets_decouverte,
  o.official_url                            as url_officielle,
  o.first_seen_at                           as vu_la_premiere_fois,
  o.last_seen_at                            as vu_la_derniere_fois,
  o.disappeared_at                          as disparu_le,
  -- Colonnes de liste, lues dans la source (filtres et tris de l'ancienne console).
  (select case when f ->> 'normalizedValue' ~ '^\d{4}-\d{2}-\d{2}' then left(f ->> 'normalizedValue', 10)::date end
     from jsonb_array_elements(case when jsonb_typeof(o.payload -> 'facts') = 'array' then o.payload -> 'facts' else '[]'::jsonb end) f
    where f ->> 'field' = 'publication-date' limit 1) as publie_le,
  case when jsonb_typeof(o.payload #> '{scores,infoConfidence}') = 'number' then (o.payload #>> '{scores,infoConfidence}')::numeric end as confiance_information,
  o.payload #>> '{assessment,verdict}'      as verdict_analyste,
  o.payload ->> 'strategicRoute'            as route_strategique,
  (select f ->> 'normalizedValue'
     from jsonb_array_elements(case when jsonb_typeof(o.payload -> 'facts') = 'array' then o.payload -> 'facts' else '[]'::jsonb end) f
    where f ->> 'field' = 'notice-type' limit 1) as type_avis,
  d.decide_par,
  d.auteur_origine                          as decide_par_origine
from public.watch_opportunities o
left join public.ml_montant m on m.opportunity_id = o.id
left join public.ml_decision_v2 d on d.espace_id = o.espace_id and d.record_id = o.record_id
left join public.project_tags t on t.espace_id = o.espace_id and t.record_id = o.record_id
where public.ml_nature(o.opportunity_kind) <> 'REGULATORY';

create or replace view public.ml_financements_v2 with (security_invoker = true) as
  select * from public.ml_toutes_v2 where nature in ('GRANT', 'PRIZE', 'TAX_INCENTIVE', 'DEBT_GUARANTEE');
create or replace view public.ml_appels_offres_v2 with (security_invoker = true) as
  select * from public.ml_toutes_v2 where nature in ('TENDER', 'PRE_SOLICITATION', 'MARKETPLACE_PROJECT', 'CONSORTIUM_CALL');
create or replace view public.ml_investisseurs_v2 with (security_invoker = true) as
  select * from public.ml_toutes_v2 where nature in ('EQUITY', 'ACQUISITION');

-- Montants sur le périmètre monétaire (sans REGULATORY), jamais de total global.
create or replace view public.ml_montants_v2 with (security_invoker = true) as
select espace_id, categorie, sens, devise, verifie_par_humain,
       count(*) as opportunites, count(montant) as avec_montant, sum(montant) as somme_connue,
       count(*) filter (where confiance_montant = 'BASSE') as montants_peu_surs
from public.ml_toutes_v2 where montant is not null
group by espace_id, categorie, sens, devise, verifie_par_humain
union all
select espace_id, categorie, sens, null, verifie_par_humain, count(*), 0, null, 0
from public.ml_toutes_v2 where montant is null
group by espace_id, categorie, sens, verifie_par_humain;

-- « Aujourd'hui » : EN_ATTENTE_DE_TRI exclut les échéances dépassées, comme l'ancienne console.
create or replace view public.ml_aujourdhui_v2 with (security_invoker = true) as
select t.espace_id, case when t.due < current_date then 'TACHE_EN_RETARD' else 'TACHE_A_FAIRE' end as raison,
       t.title as titre, t.record_id, t.project_slug as projet, t.due::timestamptz as echeance, t.id::text as reference
from public.tasks t where t.status = 'OPEN' and t.due is not null and t.due <= current_date + 7
union all
select a.espace_id, 'ALERTE', a.headline, null, a.project_slug, null, a.id::text
from public.alerts a where a.acknowledged_at is null
union all
select v.espace_id, 'BIENTOT_CLOS', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v2 v where v.echeance between now() and now() + interval '14 days' and v.decision_humaine <> 'REJECT'
union all
select v.espace_id, 'APPROUVE_MAIS_BLOQUE', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v2 v where v.decision_humaine = 'APPROVE' and not v.gate_ok
union all
select v.espace_id, 'EN_ATTENTE_DE_TRI', v.titre, v.record_id, v.projet_etiquete, v.echeance, v.id::text
from public.ml_toutes_v2 v where v.decision_humaine = 'PENDING' and v.disparu_le is null and (v.echeance is null or v.echeance >= now());

-- Fiche : identifiants, date de fin des tâches, gate de chaque décision, auteur d'origine.
create or replace view public.ml_fiche_v2 with (security_invoker = true) as
select v.*,
       o.payload as source,
       (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'action', r.action, 'commentaire', r.comment, 'le', r.at, 'par', r.actor,
                                                     'auteur_origine', r.auteur_origine, 'gate_ok_au_moment', r.gate_pursue_eligible_at_decision) order by r.at desc, r.id), '[]'::jsonb)
          from public.reviews r where r.espace_id = v.espace_id and r.record_id = v.record_id) as decisions,
       (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'texte', n.text, 'le', n.at, 'par', n.actor, 'auteur_origine', n.auteur_origine) order by n.at desc, n.id), '[]'::jsonb)
          from public.notes n where n.espace_id = v.espace_id and n.record_id = v.record_id) as notes,
       (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'titre', k.title, 'echeance', k.due, 'statut', k.status, 'faite_le', k.completed_at,
                                                     'le', k.at, 'par', k.actor, 'auteur_origine', k.auteur_origine) order by k.due nulls last, k.id), '[]'::jsonb)
          from public.tasks k where k.espace_id = v.espace_id and k.record_id = v.record_id) as taches
from public.ml_toutes_v2 v
join public.watch_opportunities o on o.id = v.id;

-- ══ 3. Lectures nouvelles ══════════════════════════════════════════════════

-- Projets du registre (registry/projects/*.yaml), copiés par le chargeur, jamais par le navigateur.
create table if not exists public.oia_projet (
  espace_id          uuid not null default '00000000-0000-4000-8000-000000000001' references public.oia_espace (id),
  slug               text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  nom                text not null check (char_length(nom) between 1 and 200),
  type               text not null,
  statut             text not null,
  actif              boolean not null,
  une_ligne          text not null default '',
  url                text,
  secteurs           text[] not null default '{}',
  geographies        text[] not null default '{}',
  types_financement  text[] not null default '{}',
  natures_suivies    text[] not null default '{}',
  decouverte_active  boolean not null default false,
  mots_cles          text[] not null default '{}',
  exclusions         text[] not null default '{}',
  revue_profil       text not null check (revue_profil in ('DRAFT', 'CONFIRMED_BY_OWNER')),
  profil             jsonb not null default '{}'::jsonb,
  sources            jsonb not null default '[]'::jsonb,
  empreinte          text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  charge_le          timestamptz not null default now(),
  retire_du_registre_le timestamptz,
  primary key (espace_id, slug)
);
alter table public.oia_projet enable row level security;
drop policy if exists membres_lisent on public.oia_projet;
create policy membres_lisent on public.oia_projet for select to authenticated using (public.oia_est_membre(espace_id));
revoke all on public.oia_projet from public, anon, authenticated;
grant select on public.oia_projet to authenticated;

create or replace view public.ml_projets_v1 with (security_invoker = true) as
select p.espace_id, p.slug, p.nom, p.type, p.statut, p.actif, p.une_ligne, p.url,
       p.secteurs, p.geographies, p.types_financement, p.natures_suivies, p.decouverte_active, p.revue_profil,
       p.mots_cles, p.exclusions, p.profil, p.sources,
       'registry/projects/' || p.slug || '.yaml' as chemin_registre,
       (select count(*) from public.project_tags t where t.espace_id = p.espace_id and t.project_slug = p.slug) as opportunites_etiquetees,
       (select count(*) from public.tasks k where k.espace_id = p.espace_id and k.project_slug = p.slug and k.status = 'OPEN') as taches_ouvertes,
       (select count(*) from public.notes n where n.espace_id = p.espace_id and n.project_slug = p.slug) as notes,
       p.charge_le, p.retire_du_registre_le
from public.oia_projet p;

create or replace view public.ml_contacts_v1 with (security_invoker = true) as
select c.id, c.espace_id, c.name as nom, c.organisation, c.role, c.email, c.phone as telephone, c.note,
       c.record_id, c.project_slug as projet, c.at as cree_le, c.actor as auteur, c.auteur_origine, c.import_id
from public.contacts c;

create or replace view public.ml_notes_v1 with (security_invoker = true) as
select n.id, n.espace_id, n.text as texte, n.record_id, n.project_slug as projet, n.at as cree_le, n.actor as auteur, n.auteur_origine, n.import_id
from public.notes n;

create or replace view public.ml_taches_v1 with (security_invoker = true) as
select k.id, k.espace_id, k.title as titre, k.due as echeance, k.status as statut, k.completed_at as faite_le,
       (k.status = 'OPEN' and k.due is not null and k.due < current_date) as en_retard,
       k.record_id, k.project_slug as projet, k.at as cree_le, k.actor as auteur, k.auteur_origine, k.import_id
from public.tasks k;

create or replace view public.ml_vues_enregistrees_v1 with (security_invoker = true) as
select v.id, v.espace_id, v.name as nom, v.kind as type, v.filters as filtres, v.sort_field as tri, v.sort_direction as sens, v.created_at as cree_le,
       v.auteur_origine, v.import_id
from public.saved_views v;

create or replace view public.ml_demandes_v1 with (security_invoker = true) as
select r.id, r.espace_id, r.kind::text as type, r.payload as charge, r.status::text as statut, r.requested_at as demande_le,
       r.requested_by as demande_par, r.started_at as commencee_le, r.finished_at as terminee_le, r.result as resultat, r.error as erreur
from public.requests r;

create or replace view public.ml_brouillons_projet_v1 with (security_invoker = true) as
select d.slug, d.espace_id, d.entry as contenu, d.status as statut, d.created_at as cree_le, d.created_by as cree_par,
       d.applied_at as applique_le, d.applied_commit as commit_applique, d.error as erreur
from public.project_drafts d;

-- Contrôle des liens : une adresse sans ligne n'a jamais été vérifiée (« non vérifié », pas « valide »).
create or replace view public.ml_liens_v1 with (security_invoker = true) as
select l.url, l.espace_id, l.status as statut, l.http_code as code_http, l.final_url as url_finale, l.checked_at as verifie_le,
       l.note, l.where_found as trouve_dans
from public.link_checks l;

create or replace view public.ml_imports_v1 with (security_invoker = true) as
select i.id, i.espace_id, i.user_id as importe_par, i.exporte_le, i.importe_le, i.bilan, i.annule_le, (i.annule_le is null) as actif
from public.oia_import i;

-- Rattachement aux projets, règle de la console (page « money ») : l'étiquette ; sinon chaque
-- projet du registre dont la découverte a trouvé l'opportunité ; sinon aucun (« non triée »).
create or replace view public.ml_rattachement_v1 with (security_invoker = true) as
select v.id, v.espace_id, r.projet, r.rattachement
from public.ml_toutes_v2 v
cross join lateral (
  select v.projet_etiquete as projet, 'etiquette'::text as rattachement where v.projet_etiquete is not null
  union all
  select d.slug, 'decouverte' from unnest(v.projets_decouverte) as d(slug)
  where v.projet_etiquete is null and exists (select 1 from public.oia_projet p where p.espace_id = v.espace_id and p.slug = d.slug)
  union all
  select null, 'aucun' where v.projet_etiquete is null
    and not exists (select 1 from unnest(v.projets_decouverte) as d(slug) join public.oia_projet p on p.espace_id = v.espace_id and p.slug = d.slug)
) r;

-- Indicateurs 1/3 : comptes, au même périmètre pour la couverture. `portee` :
-- `espace` (chaque opportunité une fois), `projet`, `non_triee`. « Prête » : entrante,
-- gate franchi, échéance non passée ; « bloquée » : entrante et pas prête.
create or replace view public.ml_indicateurs_v1 with (security_invoker = true) as
with base as (
  select v.*,
         (v.sens = 'entrant' and v.gate_ok and (v.echeance is null or v.echeance >= now())) as prete,
         (v.sens = 'entrant' and not (v.gate_ok and (v.echeance is null or v.echeance >= now()))) as bloquee
  from public.ml_toutes_v2 v
), lignes as (
  select b.*, 'espace'::text as portee, null::text as projet, false as par_etiquette from base b
  union all
  select b.*, case when r.projet is null then 'non_triee' else 'projet' end, r.projet, r.rattachement = 'etiquette'
  from base b join public.ml_rattachement_v1 r on r.id = b.id
)
select espace_id, portee, projet,
       count(*)                                                        as opportunites,
       count(*) filter (where par_etiquette)                           as etiquetees,
       count(*) filter (where disparu_le is null)                      as actives,
       count(*) filter (where decision_humaine = 'PENDING' and disparu_le is null and (echeance is null or echeance >= now())) as a_trier,
       count(*) filter (where decision_humaine = 'APPROVE')            as approuvees,
       count(*) filter (where decision_humaine = 'REJECT')             as rejetees,
       count(*) filter (where decision_humaine = 'NEEDS_VERIFICATION') as a_verifier,
       count(*) filter (where decision_humaine = 'APPROVE' and not gate_ok) as approuvees_bloquees,
       count(*) filter (where prete)                                   as pretes,
       count(*) filter (where bloquee)                                 as bloquees,
       count(*) filter (where verifie_par_humain)                      as verifiees,
       count(*) filter (where montant_connu)                           as avec_montant,
       count(*) filter (where not montant_connu)                       as sans_montant,
       count(*) filter (where confiance_montant = 'BASSE')             as montants_peu_surs,
       count(*) filter (where sens = 'sortant')                        as sortantes,
       count(*) filter (where echeance between now() and now() + interval '14 days') as closes_sous_14_jours,
       count(*) filter (where echeance < now())                        as expirees,
       count(*) filter (where echeance is null)                        as sans_echeance,
       max(vu_la_derniere_fois)                                        as derniere_veille
from lignes
group by espace_id, portee, projet;

-- Indicateurs 2/3 : montants, jamais mélangés (une ligne par périmètre, catégorie, sens,
-- devise et vérification) ; montants inconnus en lignes à part (devise et sommes null).
create or replace view public.ml_indicateurs_montants_v1 with (security_invoker = true) as
with base as (
  select v.*, (v.gate_ok and (v.echeance is null or v.echeance >= now())) as prete
  from public.ml_toutes_v2 v
), lignes as (
  select b.*, 'espace'::text as portee, null::text as projet from base b
  union all
  select b.*, case when r.projet is null then 'non_triee' else 'projet' end, r.projet
  from base b join public.ml_rattachement_v1 r on r.id = b.id
)
select espace_id, portee, projet, categorie, sens, devise, verifie_par_humain,
       count(*)                                        as opportunites,
       count(*) filter (where prete)                   as pretes,
       count(*) filter (where not prete)               as bloquees,
       count(*) filter (where echeance between now() and now() + interval '14 days') as closes_sous_14_jours,
       sum(montant)                                    as somme_connue,
       sum(montant) filter (where prete)               as somme_pretes,
       sum(montant) filter (where not prete)           as somme_bloquees,
       count(*) filter (where confiance_montant = 'BASSE') as montants_peu_surs
from lignes where montant is not null
group by espace_id, portee, projet, categorie, sens, devise, verifie_par_humain
union all
select espace_id, portee, projet, categorie, sens, null, verifie_par_humain,
       count(*), count(*) filter (where prete), count(*) filter (where not prete),
       count(*) filter (where echeance between now() and now() + interval '14 days'), null, null, null, 0
from lignes where montant is null
group by espace_id, portee, projet, categorie, sens, verifie_par_humain;

-- Indicateurs 3/3 : répartitions par axe (nature, recommandation, vérification, décision,
-- raison de blocage), pour l'espace entier et par projet.
create or replace view public.ml_indicateurs_repartition_v1 with (security_invoker = true) as
with axes as (
  select v.id, v.espace_id, x.axe, x.valeur
  from public.ml_toutes_v2 v
  cross join lateral (
    select 'nature'::text as axe, v.nature as valeur
    union all select 'recommandation', v.recommandation
    union all select 'verification', v.statut_verification
    union all select 'decision', v.decision_humaine
    union all select 'blocage', b from unnest(coalesce(v.raisons_gate, '{}')) as b
  ) x
)
select a.espace_id, 'espace'::text as portee, null::text as projet, a.axe, a.valeur, count(*) as opportunites
from axes a group by a.espace_id, a.axe, a.valeur
union all
select a.espace_id, case when r.projet is null then 'non_triee' else 'projet' end, r.projet, a.axe, a.valeur, count(*)
from axes a join public.ml_rattachement_v1 r on r.id = a.id
group by a.espace_id, case when r.projet is null then 'non_triee' else 'projet' end, r.projet, a.axe, a.valeur;

-- Journal global des avis humains (export de l'audit), avec l'auteur d'origine et le gate.
create or replace view public.ml_avis_v1 with (security_invoker = true) as
select r.id, r.espace_id, r.record_id, r.action, r.comment as commentaire, r.at as le, r.actor as auteur,
       r.auteur_origine, r.gate_pursue_eligible_at_decision as gate_ok_au_moment, r.id_origine, r.import_id
from public.reviews r;

-- ══ 4. Écritures nouvelles ═════════════════════════════════════════════════

-- Supprimer une note, une tâche, un contact ou une vue enregistrée. Éditeur ou propriétaire ; journalisé.
create or replace function public.oia_supprimer(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_table text;
  v_espace uuid;
begin
  v_table := case p_type when 'note' then 'notes' when 'tache' then 'tasks' when 'contact' then 'contacts' when 'vue' then 'saved_views' end;
  if v_table is null then raise exception 'oia: type à supprimer inconnu (note, tache, contact, vue)' using errcode = '22023'; end if;
  execute format('select espace_id from public.%I where id = $1', v_table) into v_espace using p_id;
  if v_espace is null then raise exception 'oia: élément introuvable' using errcode = 'P0002'; end if;
  perform public.oia_exiger_editeur(v_espace);
  execute format('delete from public.%I where id = $1', v_table) using p_id;
  perform public.oia_journaliser(v_espace, 'supprimer', v_table, p_id::text);
end $$;

-- Proposer un projet : brouillon PENDING au format du registre, puis, par défaut, une recherche.
-- Le registre reste la référence : le worker écrit le fichier YAML.
create or replace function public.oia_proposer_projet(p_espace uuid, p_slug text, p_contenu jsonb, p_lancer_recherche boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.oia_exiger_editeur(p_espace);
  v_statut text;
  v_demande uuid;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'oia: identifiant de projet invalide (minuscules, chiffres, tirets)' using errcode = '22023';
  end if;
  if p_contenu is null or jsonb_typeof(p_contenu) <> 'object' or coalesce(p_contenu ->> 'name', '') = '' then
    raise exception 'oia: contenu de projet invalide (objet avec name)' using errcode = '22023';
  end if;
  if exists (select 1 from public.oia_projet where espace_id = p_espace and slug = p_slug and retire_du_registre_le is null) then
    raise exception 'oia: ce projet existe déjà dans le registre' using errcode = '22023';
  end if;
  select status into v_statut from public.project_drafts where slug = p_slug;
  if v_statut is not null and v_statut <> 'PENDING' then
    raise exception 'oia: un brouillon de ce projet a déjà été traité (%)', v_statut using errcode = '22023';
  end if;
  insert into public.project_drafts (slug, entry, status, created_by, espace_id)
  values (p_slug, p_contenu || jsonb_build_object('slug', p_slug), 'PENDING', v_uid::text, p_espace)
  on conflict (slug) do update set entry = excluded.entry, created_by = excluded.created_by
  where public.project_drafts.status = 'PENDING' and public.project_drafts.espace_id = p_espace;
  if not found then raise exception 'oia: brouillon d''un autre espace' using errcode = '42501'; end if;
  if p_lancer_recherche then
    insert into public.requests (kind, payload, requested_by, espace_id)
    values ('DISCOVERY', jsonb_build_object('projects', jsonb_build_array(p_slug)), v_uid::text, p_espace) returning id into v_demande;
  end if;
  perform public.oia_journaliser(p_espace, 'proposer_projet', 'project_drafts', p_slug, jsonb_build_object('demande', v_demande));
  return jsonb_build_object('slug', p_slug, 'statut', 'PENDING', 'demande_id', v_demande);
end $$;

-- ══ 5. Droits ══════════════════════════════════════════════════════════════

do $$
declare
  v text;
  f text;
begin
  -- Supabase accorde par défaut tous les droits sur une vue nouvelle : on les retire tous,
  -- y compris à authenticated, puis on ne rend que la lecture. Aucune écriture par une vue.
  foreach v in array array[
    'ml_decision_v2', 'ml_toutes_v2', 'ml_financements_v2', 'ml_appels_offres_v2', 'ml_investisseurs_v2', 'ml_montants_v2',
    'ml_aujourdhui_v2', 'ml_fiche_v2',
    'ml_projets_v1', 'ml_contacts_v1', 'ml_notes_v1', 'ml_taches_v1', 'ml_vues_enregistrees_v1', 'ml_demandes_v1',
    'ml_brouillons_projet_v1', 'ml_liens_v1', 'ml_imports_v1', 'ml_rattachement_v1', 'ml_indicateurs_v1',
    'ml_indicateurs_montants_v1', 'ml_indicateurs_repartition_v1', 'ml_avis_v1'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
    execute format('comment on view public.%I is %L', v, 'Contrat de données Money Lookup, version 2 (docs/interface/contrat-donnees-money-lookup.md). security_invoker : droits de l''appelant.');
  end loop;
  foreach f in array array[
    'oia_importer_sauvegarde(uuid, jsonb)', 'oia_apercu_annulation(uuid)', 'oia_annuler_import(uuid, boolean)',
    'oia_supprimer(text, uuid)', 'oia_proposer_projet(uuid, text, jsonb, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['oia_json_tableau(jsonb)', 'oia_json_objet(jsonb)', 'oia_empreinte(text[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;

-- ══ Retour arrière ════════════════════════════════════════════════════════
-- begin;
--   drop view if exists public.ml_avis_v1, public.ml_indicateurs_repartition_v1, public.ml_indicateurs_montants_v1,
--     public.ml_indicateurs_v1, public.ml_rattachement_v1, public.ml_imports_v1, public.ml_liens_v1,
--     public.ml_brouillons_projet_v1, public.ml_demandes_v1, public.ml_vues_enregistrees_v1, public.ml_taches_v1,
--     public.ml_notes_v1, public.ml_contacts_v1, public.ml_projets_v1, public.ml_fiche_v2, public.ml_aujourdhui_v2,
--     public.ml_montants_v2, public.ml_investisseurs_v2, public.ml_appels_offres_v2, public.ml_financements_v2,
--     public.ml_toutes_v2, public.ml_decision_v2;
--   drop function if exists public.oia_proposer_projet(uuid, text, jsonb, boolean), public.oia_supprimer(text, uuid),
--     public.oia_apercu_annulation(uuid), public.oia_annuler_import(uuid, boolean);
--   drop table if exists public.oia_projet, public.oia_import_element;
--   -- puis rejouer les définitions de oia_importer_sauvegarde et oia_annuler_import(uuid) de 0005.
--   delete from supabase_migrations.schema_migrations where version = '<version inscrite>';
-- commit;

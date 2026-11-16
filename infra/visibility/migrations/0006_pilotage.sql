-- vis 0006 · Pilotage depuis le cockpit : tables (mandat v16, bloc A). PROPOSÉE, NON APPLIQUÉE.
-- Contrat : docs/interface/contrat-donnees-visibility-v2.md.
--
-- Données du pilotage, dans le schéma `vis`. Vues et fonctions (gestes du cockpit et
-- moteur) : packages/database/supabase/migrations/0011_visibility_pilotage.sql. Aucune
-- écriture directe n'est accordée à personne : ni à `authenticated`, ni à `service_role`.
-- Seules les fonctions de 0011 écrivent, avec le contrôle du rôle de l'appelant.
--
-- Principes, ceux de 0001 à 0004 :
--  * ajout seul partout : un trigger refuse UPDATE, DELETE et TRUNCATE, propriétaire
--    compris. Un état (demande, fenêtre, proposition) est la dernière ligne de son
--    journal, jamais une valeur réécrite ;
--  * RLS : lecture par les membres du client (auth.uid() et vis.client_member, 0004) ;
--  * une demande n'est prise qu'une fois par tentative (index unique), une seule fin.
--
-- Changements de tables existantes :
--  * vis.window accepte le type « reconnaissance » (preuves de la journée de
--    reconnaissance, rattachées à leur fenêtre) ;
--  * vis.execution accepte une preuve « url » ou « other ».
--
-- Prérequis : vis 0001 à 0005, 0006 (vues v1) et 0010 appliquées.
--
-- Retour arrière. Il SUPPRIME tout ce que ces tables contiennent : l'exporter d'abord.
-- Défaire 0011 avant. Il échoue s'il existe une fenêtre « reconnaissance » ou une
-- exécution « url » ou « other », ce qui est voulu :
--   begin;
--   drop table if exists vis.geste, vis.demande_etat, vis.demande, vis.proposition_decision, vis.proposition,
--     vis.panel, vis.fenetre_jour, vis.fenetre_go, vis.fenetre_statut, vis.fenetre_estimation, vis.fenetre,
--     vis.plafond, vis.alerte_acquit, vis.alerte, vis.moteur_signe, vis.page_validation, vis.page;
--   drop function if exists vis.pilotage_ajout_seul();
--   alter table vis.window drop constraint if exists window_kind_check;
--   alter table vis.window add constraint window_kind_check check (kind in ('baseline','follow-up'));
--   alter table vis.execution drop constraint if exists execution_kind_check;
--   alter table vis.execution add constraint execution_kind_check check (kind in ('pr-opened','pr-merged','commit','rollback'));
--   commit;

begin;

create or replace function vis.pilotage_ajout_seul() returns trigger
language plpgsql as $$
begin
  raise exception '%.% est en ajout seul : % refusée', tg_table_schema, tg_table_name, tg_op
    using errcode = 'read_only_sql_transaction';
end $$;

-- ------------------------------------------------------------------
-- 1. Journal des gestes humains
-- ------------------------------------------------------------------
create table if not exists vis.geste (
  id          bigserial primary key,
  client_id   text references vis.client(id) on delete restrict,   -- null : plafond global
  subject_id  text references vis.subject(id) on delete restrict,
  fonction    text not null check (fonction ~ '^vis_[a-z_]+$'),
  parametres  jsonb not null default '{}'::jsonb,
  resultat    jsonb,
  par         text not null check (char_length(par) >= 2),
  le          timestamptz not null default now()
);
create index if not exists geste_client_idx on vis.geste (client_id, le desc);

-- ------------------------------------------------------------------
-- 2. Demandes au moteur et leur état
-- ------------------------------------------------------------------
create table if not exists vis.demande (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text references vis.subject(id) on delete restrict,
  type        text not null check (type in ('SITE_ADD','RECON','WINDOW_RUN','REPORT','REMEASURE_PROPOSE')),
  charge      jsonb not null default '{}'::jsonb check (jsonb_typeof(charge) = 'object'),
  demande_par text not null check (char_length(demande_par) >= 2),
  demande_le  timestamptz not null default now(),
  relance_de  uuid references vis.demande(id) on delete restrict,
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists demande_file_idx on vis.demande (demande_le, id);
create index if not exists demande_sujet_idx on vis.demande (subject_id, demande_le desc);

-- Sans ligne : QUEUED. RUNNING (prise, avec sa tentative et l'hôte), QUEUED (reprise d'une
-- prise abandonnée), puis DONE, FAILED ou CANCELLED, une seule fois.
create table if not exists vis.demande_etat (
  id          bigserial primary key,
  demande_id  uuid not null references vis.demande(id) on delete restrict,
  client_id   text not null references vis.client(id) on delete restrict,
  statut      text not null check (statut in ('QUEUED','RUNNING','DONE','FAILED','CANCELLED')),
  tentative   int check (tentative >= 1),
  hote        text,
  resultat    jsonb check (resultat is null or jsonb_typeof(resultat) = 'object'),
  erreur      text,
  par         text not null,
  le          timestamptz not null default now(),
  check ((statut = 'RUNNING') = (tentative is not null)),
  check (statut <> 'FAILED' or char_length(btrim(coalesce(erreur, ''))) >= 3)
);
create unique index if not exists demande_etat_une_prise on vis.demande_etat (demande_id, tentative) where statut = 'RUNNING';
create unique index if not exists demande_etat_une_fin on vis.demande_etat (demande_id) where statut in ('DONE','FAILED','CANCELLED');
create index if not exists demande_etat_demande_idx on vis.demande_etat (demande_id, id desc);

-- ------------------------------------------------------------------
-- 3. Propositions versionnées, décisions, panel figé
-- ------------------------------------------------------------------
-- element_id : identifiant stable, unique dans toute la base : <sujet>:<nature>:<local>.
create table if not exists vis.proposition (
  id           bigserial primary key,
  element_id   text not null check (element_id ~ '^[a-z0-9][a-z0-9-]*:(fait|question|concurrent|homonyme|audit):[a-z0-9][a-z0-9._-]*$'),
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  nature       text not null check (nature in ('fait','question','concurrent','homonyme','audit')),
  version      int  not null check (version >= 1),
  contenu      jsonb not null check (jsonb_typeof(contenu) = 'object'),
  source       text,
  propose_par  text not null check (char_length(propose_par) >= 2),
  propose_le   timestamptz not null default now(),
  unique (element_id, version),
  check (split_part(element_id, ':', 1) = subject_id and split_part(element_id, ':', 2) = nature),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);
create index if not exists proposition_sujet_idx on vis.proposition (subject_id, nature);

create table if not exists vis.proposition_decision (
  id          bigserial primary key,
  element_id  text not null,
  version     int  not null,
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  etat        text not null check (etat in ('valide','rejete')),
  par         text not null check (char_length(par) >= 2),
  le          timestamptz not null default now(),
  foreign key (element_id, version) references vis.proposition(element_id, version)
);
create index if not exists proposition_decision_idx on vis.proposition_decision (element_id, id desc);

-- Panel figé par vis_valider_panel : une version, ses questions (element_id).
create table if not exists vis.panel (
  id          bigserial primary key,
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text not null references vis.subject(id) on delete restrict,
  version     int  not null check (version >= 1),
  questions   text[] not null check (cardinality(questions) >= 1),
  par         text not null check (char_length(par) >= 2),
  le          timestamptz not null default now(),
  unique (subject_id, version),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);

-- ------------------------------------------------------------------
-- 4. Fenêtres : estimation, statut, GO, jours
-- ------------------------------------------------------------------
create table if not exists vis.fenetre (
  window_id    text primary key check (window_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  client_id    text not null references vis.client(id) on delete restrict,
  subject_id   text not null references vis.subject(id) on delete restrict,
  nature       text not null check (nature in ('reconnaissance','reference','remesure')),
  libelle      text not null check (char_length(libelle) >= 2),
  compare_avec text references vis.fenetre(window_id) on delete restrict,
  jours_prevus int  not null check (jours_prevus between 1 and 31),
  cree_le      timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);

create table if not exists vis.fenetre_estimation (
  id              bigserial primary key,
  window_id       text not null references vis.fenetre(window_id) on delete restrict,
  client_id       text not null references vis.client(id) on delete restrict,
  cout_estime_usd numeric(10,4) not null check (cout_estime_usd >= 0),
  detail          jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  questions       int  not null check (questions >= 0),
  moteurs         text[] not null default '{}',
  -- Heure UTC du passage quotidien (HH:MM), celle de runTimeUtc ; null : heure du moteur.
  heure_utc       text check (heure_utc ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  par             text not null,
  le              timestamptz not null default now()
);
create index if not exists fenetre_estimation_idx on vis.fenetre_estimation (window_id, id desc);

create table if not exists vis.fenetre_statut (
  id         bigserial primary key,
  window_id  text not null references vis.fenetre(window_id) on delete restrict,
  client_id  text not null references vis.client(id) on delete restrict,
  statut     text not null check (statut in ('proposee','go_donne','en_cours','close','annulee')),
  debut      date,
  motif      text,
  par        text not null,
  le         timestamptz not null default now()
);
create index if not exists fenetre_statut_idx on vis.fenetre_statut (window_id, id desc);

-- Un GO par fenêtre : le coût vu à l'écran (égal à l'estimation courante), le début, le mois.
create table if not exists vis.fenetre_go (
  id            bigserial primary key,
  window_id     text not null unique references vis.fenetre(window_id) on delete restrict,
  client_id     text not null references vis.client(id) on delete restrict,
  estimation_id bigint not null references vis.fenetre_estimation(id) on delete restrict,
  cout_vu_usd   numeric(10,2) not null check (cout_vu_usd >= 0),
  debut         date,
  mois          date not null check (mois = date_trunc('month', mois)::date),
  par           text not null check (char_length(par) >= 2),
  le            timestamptz not null default now()
);

create table if not exists vis.fenetre_jour (
  id         bigserial primary key,
  window_id  text not null references vis.fenetre(window_id) on delete restrict,
  client_id  text not null references vis.client(id) on delete restrict,
  jour       int  not null check (jour >= 1),
  date       date not null,
  etat       text not null check (etat in ('complet','partiel','manquant')),
  detail     jsonb not null default '{}'::jsonb,
  le         timestamptz not null default now(),
  unique (window_id, jour)
);

-- ------------------------------------------------------------------
-- 5. Budget, alertes, signe de vie du moteur, pages
-- ------------------------------------------------------------------
-- Plafond mensuel d'un client ; client_id null : plafond global d'OIA. Le plus récent fait foi.
create table if not exists vis.plafond (
  id           bigserial primary key,
  client_id    text references vis.client(id) on delete restrict,
  plafond_usd  numeric(10,2) not null check (plafond_usd >= 0),
  par          text not null check (char_length(par) >= 2),
  le           timestamptz not null default now()
);
create index if not exists plafond_client_idx on vis.plafond (client_id, id desc);

create table if not exists vis.alerte (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references vis.client(id) on delete restrict,
  subject_id  text references vis.subject(id) on delete restrict,
  gravite     text not null check (gravite in ('info','alerte','bloquant')),
  type        text not null check (type in ('RAPPORT_PRET','JOUR_PARTIEL','JOUR_MANQUANT','ECHEC_DEMANDE','PLAFOND','MOTEUR_MUET','COUT_ILLISIBLE')),
  message     text not null check (char_length(message) >= 3),
  cree_le     timestamptz not null default now()
);

create table if not exists vis.alerte_acquit (
  id         bigserial primary key,
  alerte_id  uuid not null unique references vis.alerte(id) on delete restrict,
  client_id  text not null references vis.client(id) on delete restrict,
  par        text not null check (char_length(par) >= 2),
  le         timestamptz not null default now()
);

create table if not exists vis.moteur_signe (
  id        bigserial primary key,
  hote      text not null check (hote ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$'),
  version   text not null check (char_length(version) between 1 and 64),
  prochain  timestamptz,
  le        timestamptz not null default now()
);
create index if not exists moteur_signe_idx on vis.moteur_signe (le desc, id desc);

create table if not exists vis.page (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null references vis.client(id) on delete restrict,
  subject_id text not null references vis.subject(id) on delete restrict,
  window_id  text not null references vis.fenetre(window_id) on delete restrict,
  nature     text not null check (nature in ('rapport','page_client')),
  langue     text not null check (langue ~ '^[a-z]{2}$'),
  html       text not null check (char_length(html) >= 1 and html !~* '<script|javascript:'),
  genere_le  timestamptz not null default now(),
  foreign key (subject_id, client_id) references vis.subject(id, client_id)
);

create table if not exists vis.page_validation (
  id         bigserial primary key,
  page_id    uuid not null unique references vis.page(id) on delete restrict,
  client_id  text not null references vis.client(id) on delete restrict,
  par        text not null check (char_length(par) >= 2),
  le         timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 6. Ajout seul, RLS, droits
-- ------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['geste','demande','demande_etat','proposition','proposition_decision','panel','fenetre',
                               'fenetre_estimation','fenetre_statut','fenetre_go','fenetre_jour','plafond','alerte',
                               'alerte_acquit','moteur_signe','page','page_validation'])
  loop
    execute format('drop trigger if exists %I on vis.%I', t || '_ajout_seul', t);
    execute format('create trigger %I before update or delete on vis.%I for each row execute function vis.pilotage_ajout_seul()', t || '_ajout_seul', t);
    execute format('drop trigger if exists %I on vis.%I', t || '_ajout_seul_truncate', t);
    execute format('create trigger %I before truncate on vis.%I for each statement execute function vis.pilotage_ajout_seul()', t || '_ajout_seul_truncate', t);
    execute format('alter table vis.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_auth on vis.%I', t);
    if t = 'moteur_signe' then
      -- Pas de client : lisible par tout membre d'au moins un client.
      execute 'create policy tenant_isolation_auth on vis.moteur_signe for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text))';
    elsif t in ('plafond','geste') then
      -- Plafond global (client_id null) : lisible par tout membre d'au moins un client.
      execute format('create policy tenant_isolation_auth on vis.%I for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and (m.client_id = vis.%I.client_id or vis.%I.client_id is null)))', t, t, t);
    else
      execute format('create policy tenant_isolation_auth on vis.%I for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text and m.client_id = vis.%I.client_id))', t, t);
    end if;
    execute format('alter table vis.%I owner to vis_admin', t);
    execute format('revoke all on vis.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on vis.%I from authenticated', t);
      execute format('grant select on vis.%I to authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('revoke all on vis.%I from service_role', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 7. Tables existantes
-- ------------------------------------------------------------------
alter table vis.window drop constraint if exists window_kind_check;
alter table vis.window add constraint window_kind_check check (kind in ('baseline','follow-up','reconnaissance'));

alter table vis.execution drop constraint if exists execution_kind_check;
alter table vis.execution add constraint execution_kind_check
  check (kind in ('pr-opened','pr-merged','commit','rollback','url','other'));

comment on table vis.demande is 'Demandes au moteur (contrat Visibility v2). Ajout seul ; état dans vis.demande_etat.';
comment on table vis.geste is 'Journal des gestes du cockpit : fonction, paramètres, auteur (auth.uid()), date. Ajout seul.';

commit;

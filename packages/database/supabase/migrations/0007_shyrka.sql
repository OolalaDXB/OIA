-- 0007 · Shyrka en base, et compteur de dépense IA commun (mandat v9, blocs G et D).
-- ADR docs/shyrka/adr/0003-shyrka-autonome.md (flux de données) ; cadre docs/shyrka/CADRE.md.
--
--  * Shyrka : conversations, messages, éléments de contexte, oublis (empreintes
--    seulement), brouillons, journal des actions. Chaque ligne appartient à un
--    compte (`user_id = auth.uid()`), et seul un PROPRIÉTAIRE du studio
--    (`oia_proprietaire`, c'est-à-dire un compte de Mickaël) lit ou écrit.
--    Aucune écriture directe : tout passe par les fonctions `shy_*`.
--  * Brouillons : aucun envoi, aucune publication. Le seul statut est
--    « brouillon » (paliers de CADRE.md fermés au-delà du palier 1).
--  * Dépense IA (Shyrka et recherche assistée réunies) : plafond mensuel,
--    réservation ATOMIQUE avant chaque appel (verrou sur la ligne du mois),
--    régularisation après la réponse, refus avant d'atteindre le modèle.
--    Journal des appels sans aucun texte de conversation ni de demande.
--
-- Retour arrière : drop function des fonctions shy_* et oia_ia_*, puis
-- drop table shy_journal, shy_brouillon, shy_oubli, shy_contexte, shy_message,
-- shy_conversation, oia_ia_appel, oia_ia_budget cascade.

begin;

-- 1. Garde commune --------------------------------------------------------------
create or replace function public.shy_exiger_mickael() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'shyrka: identité requise' using errcode = '42501'; end if;
  if not public.oia_proprietaire('00000000-0000-4000-8000-000000000001') then
    raise exception 'shyrka: réservée aux comptes de Mickaël' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- 2. Tables de Shyrka ---------------------------------------------------------------
create table if not exists public.shy_conversation (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  titre    text not null default '' check (char_length(titre) <= 200),
  cree_le  timestamptz not null default now(),
  maj_le   timestamptz not null default now()
);
create index if not exists shy_conversation_user_idx on public.shy_conversation (user_id, maj_le desc);

create table if not exists public.shy_message (
  id              bigserial primary key,
  conversation_id uuid not null references public.shy_conversation (id) on delete cascade,
  user_id         uuid not null,
  role            text not null check (role in ('mickael', 'shyrka')),
  contenu         text not null check (char_length(contenu) between 1 and 20000),
  sources         jsonb not null default '[]'::jsonb,
  le              timestamptz not null default now()
);
create index if not exists shy_message_conv_idx on public.shy_message (conversation_id, id);

create table if not exists public.shy_contexte (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  type     text not null check (type ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  contenu  text not null check (char_length(contenu) between 1 and 20000),
  source   text not null,
  statut   text not null default 'a_valider' check (statut in ('a_valider', 'valide', 'retire')),
  cree_le  timestamptz not null default now()
);
create index if not exists shy_contexte_user_idx on public.shy_contexte (user_id, cree_le desc);

-- Oublis : empreintes seulement, jamais le contenu (ADR 0003, « L'oubli »).
create table if not exists public.shy_oubli (
  id        bigserial primary key,
  user_id   uuid not null,
  quoi      text not null check (quoi in ('conversation', 'contexte')),
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  le        timestamptz not null default now()
);

create table if not exists public.shy_brouillon (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  conversation_id uuid references public.shy_conversation (id) on delete set null,
  type            text not null check (type in ('message', 'resume', 'plan_action', 'brouillon')),
  titre           text not null check (char_length(titre) between 1 and 200),
  contenu         text not null check (char_length(contenu) between 1 and 20000),
  statut          text not null default 'brouillon' check (statut = 'brouillon'),
  cree_le         timestamptz not null default now()
);
create index if not exists shy_brouillon_user_idx on public.shy_brouillon (user_id, cree_le desc);

-- Journal des actions : qui, quoi, résultat. Jamais le texte d'une conversation.
create table if not exists public.shy_journal (
  id       bigserial primary key,
  user_id  uuid not null,
  le       timestamptz not null default now(),
  acteur   text not null check (acteur in ('Mickaël', 'Shyrka')),
  quoi     text not null check (quoi ~ '^[a-z_.:-]{3,60}$'),
  cible    text,
  resultat text not null check (resultat in ('autorise', 'refuse', 'info'))
);
create index if not exists shy_journal_user_idx on public.shy_journal (user_id, le desc);

-- 3. Dépense IA commune -------------------------------------------------------------
create table if not exists public.oia_ia_budget (
  mois        date primary key check (extract(day from mois) = 1),
  plafond_usd numeric(10,4) not null default 5 check (plafond_usd >= 0),
  alerte_usd  numeric(10,4) not null default 4 check (alerte_usd >= 0),
  depense_usd numeric(12,6) not null default 0 check (depense_usd >= 0),
  reserve_usd numeric(12,6) not null default 0 check (reserve_usd >= 0)
);

create table if not exists public.oia_ia_appel (
  id            bigserial primary key,
  le            timestamptz not null default now(),
  mois          date not null,
  service       text not null check (service in ('shyrka', 'money-match')),
  user_id       uuid,
  statut        text not null check (statut in ('reserve', 'fait', 'echoue', 'refuse')),
  motif         text,
  cout_max_usd  numeric(12,6) not null default 0,
  cout_usd      numeric(12,6),
  jetons_entree int,
  jetons_sortie int,
  outils        text[] not null default '{}',
  nb_candidats  int,
  modele        text,
  regle_le      timestamptz
);
create index if not exists oia_ia_appel_jour_idx on public.oia_ia_appel (service, user_id, le);

-- 4. Accès : lecture de ses propres lignes, par un compte de Mickaël ; aucune écriture directe.
do $$
declare t text;
begin
  foreach t in array array['shy_conversation', 'shy_message', 'shy_contexte', 'shy_oubli', 'shy_brouillon', 'shy_journal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists mickael_ses_lignes on public.%I', t);
    execute format('create policy mickael_ses_lignes on public.%I for select to authenticated '
                   'using (user_id = auth.uid() and public.oia_proprietaire(''00000000-0000-4000-8000-000000000001''))', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.oia_ia_budget enable row level security;
alter table public.oia_ia_appel enable row level security;
drop policy if exists membres_lisent on public.oia_ia_budget;
create policy membres_lisent on public.oia_ia_budget for select to authenticated
  using (public.oia_est_membre('00000000-0000-4000-8000-000000000001'));
drop policy if exists membres_lisent on public.oia_ia_appel;
create policy membres_lisent on public.oia_ia_appel for select to authenticated
  using (public.oia_est_membre('00000000-0000-4000-8000-000000000001'));
revoke all on public.oia_ia_budget, public.oia_ia_appel from public, anon;
revoke insert, update, delete, truncate on public.oia_ia_budget, public.oia_ia_appel from authenticated;
grant select on public.oia_ia_budget, public.oia_ia_appel to authenticated;

-- 5. Fonctions de Shyrka ----------------------------------------------------------------
create or replace function public.shy_journaliser(p_acteur text, p_quoi text, p_cible text, p_resultat text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.shy_exiger_mickael();
begin
  insert into public.shy_journal (user_id, acteur, quoi, cible, resultat) values (v_uid, p_acteur, p_quoi, left(p_cible, 200), p_resultat);
end $$;

-- Un échange (message de Mickaël et réponse de Shyrka). Crée la conversation au besoin.
create or replace function public.shy_enregistrer_echange(p_conversation uuid, p_message text, p_reponse text, p_sources jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.shy_exiger_mickael();
  v_conv uuid := p_conversation;
begin
  if v_conv is null then
    insert into public.shy_conversation (user_id, titre) values (v_uid, left(regexp_replace(p_message, '\s+', ' ', 'g'), 80)) returning id into v_conv;
  elsif not exists (select 1 from public.shy_conversation where id = v_conv and user_id = v_uid) then
    raise exception 'shyrka: conversation introuvable' using errcode = 'P0002';
  end if;
  insert into public.shy_message (conversation_id, user_id, role, contenu) values (v_conv, v_uid, 'mickael', p_message);
  insert into public.shy_message (conversation_id, user_id, role, contenu, sources) values (v_conv, v_uid, 'shyrka', p_reponse, coalesce(p_sources, '[]'::jsonb));
  update public.shy_conversation set maj_le = now() where id = v_conv;
  return v_conv;
end $$;

create or replace function public.shy_creer_brouillon(p_conversation uuid, p_type text, p_titre text, p_contenu text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.shy_exiger_mickael();
  v_id uuid;
begin
  if p_conversation is not null and not exists (select 1 from public.shy_conversation where id = p_conversation and user_id = v_uid) then
    raise exception 'shyrka: conversation introuvable' using errcode = 'P0002';
  end if;
  insert into public.shy_brouillon (user_id, conversation_id, type, titre, contenu) values (v_uid, p_conversation, p_type, p_titre, p_contenu) returning id into v_id;
  insert into public.shy_journal (user_id, acteur, quoi, cible, resultat) values (v_uid, 'Shyrka', 'brouillon.cree', v_id::text, 'autorise');
  return v_id;
end $$;

create or replace function public.shy_ajouter_contexte(p_type text, p_contenu text, p_source text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.shy_exiger_mickael();
  v_id uuid;
begin
  if exists (select 1 from public.shy_oubli where user_id = v_uid and quoi = 'contexte'
             and empreinte = encode(sha256(convert_to(p_type || E'\n' || p_contenu, 'UTF8')), 'hex')) then
    raise exception 'shyrka: cet élément a été oublié' using errcode = '22023';
  end if;
  insert into public.shy_contexte (user_id, type, contenu, source) values (v_uid, p_type, p_contenu, p_source) returning id into v_id;
  insert into public.shy_journal (user_id, acteur, quoi, cible, resultat) values (v_uid, 'Mickaël', 'contexte.ajoute', v_id::text, 'info');
  return v_id;
end $$;

create or replace function public.shy_statuer_contexte(p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public.shy_exiger_mickael();
begin
  if p_statut not in ('valide', 'retire') then raise exception 'shyrka: statut inconnu' using errcode = '22023'; end if;
  update public.shy_contexte set statut = p_statut where id = p_id and user_id = v_uid;
  if not found then raise exception 'shyrka: élément introuvable' using errcode = 'P0002'; end if;
  insert into public.shy_journal (user_id, acteur, quoi, cible, resultat) values (v_uid, 'Mickaël', 'contexte.' || p_statut, p_id::text, 'info');
end $$;

-- Oubli : supprime, garde l'empreinte, et remplace l'identifiant dans le journal.
create or replace function public.shy_oublier(p_quoi text, p_id uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.shy_exiger_mickael();
  v_emp text := encode(sha256(convert_to(p_id::text, 'UTF8')), 'hex');
  n int := 0;
begin
  if p_quoi = 'conversation' then
    delete from public.shy_conversation where id = p_id and user_id = v_uid; get diagnostics n = row_count; -- messages en cascade
  elsif p_quoi = 'contexte' then
    insert into public.shy_oubli (user_id, quoi, empreinte)
      select v_uid, 'contexte', encode(sha256(convert_to(type || E'\n' || contenu, 'UTF8')), 'hex') from public.shy_contexte where id = p_id and user_id = v_uid;
    delete from public.shy_contexte where id = p_id and user_id = v_uid; get diagnostics n = row_count;
  else
    raise exception 'shyrka: oubli inconnu' using errcode = '22023';
  end if;
  if n = 0 then raise exception 'shyrka: introuvable' using errcode = 'P0002'; end if;
  insert into public.shy_oubli (user_id, quoi, empreinte) values (v_uid, p_quoi, v_emp);
  update public.shy_journal set cible = 'oublie:' || left(v_emp, 12) where user_id = v_uid and cible = p_id::text;
  insert into public.shy_journal (user_id, acteur, quoi, cible, resultat) values (v_uid, 'Mickaël', p_quoi || '.oublie', 'oublie:' || left(v_emp, 12), 'info');
  return n;
end $$;

-- 6. Dépense IA : réservation atomique et régularisation ------------------------------
-- Rend l'identifiant de l'appel réservé, ou lève une erreur (rien ne part vers le modèle).
create or replace function public.oia_ia_reserver(p_service text, p_cout_max numeric, p_jetons_entree int)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_mois date := date_trunc('month', now() at time zone 'utc')::date;
  v_b public.oia_ia_budget;
  v_jour int;
  v_max_jour int;
  v_max_jetons int;
  v_id bigint;
begin
  if v_uid is null then raise exception 'oia_ia: identité requise' using errcode = '42501'; end if;
  if p_service = 'shyrka' then
    perform public.shy_exiger_mickael(); v_max_jour := 100; v_max_jetons := 4000;
  elsif p_service = 'money-match' then
    if not public.oia_est_membre('00000000-0000-4000-8000-000000000001') then
      raise exception 'oia_ia: réservée aux membres' using errcode = '42501';
    end if;
    v_max_jour := 30; v_max_jetons := 2000;
  else
    raise exception 'oia_ia: service inconnu' using errcode = '22023';
  end if;
  if p_cout_max is null or p_cout_max <= 0 then raise exception 'oia_ia: coût maximal requis' using errcode = '22023'; end if;
  if p_jetons_entree is null or p_jetons_entree > v_max_jetons then
    raise exception 'oia_ia: demande trop longue (% jetons au plus)', v_max_jetons using errcode = '22023';
  end if;

  insert into public.oia_ia_budget (mois) values (v_mois) on conflict (mois) do nothing;
  -- Verrou : deux réservations simultanées passent l'une après l'autre.
  select * into v_b from public.oia_ia_budget where mois = v_mois for update;

  select count(*) into v_jour from public.oia_ia_appel
   where service = p_service and user_id = v_uid and statut in ('reserve', 'fait', 'echoue')
     and le >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_jour >= v_max_jour then
    insert into public.oia_ia_appel (mois, service, user_id, statut, motif, cout_max_usd) values (v_mois, p_service, v_uid, 'refuse', 'limite_quotidienne', p_cout_max);
    return -1;
  end if;
  if v_b.depense_usd + v_b.reserve_usd + p_cout_max > v_b.plafond_usd then
    insert into public.oia_ia_appel (mois, service, user_id, statut, motif, cout_max_usd) values (v_mois, p_service, v_uid, 'refuse', 'plafond_mensuel', p_cout_max);
    return -2;
  end if;
  update public.oia_ia_budget set reserve_usd = reserve_usd + p_cout_max where mois = v_mois;
  insert into public.oia_ia_appel (mois, service, user_id, statut, cout_max_usd, jetons_entree)
  values (v_mois, p_service, v_uid, 'reserve', p_cout_max, p_jetons_entree) returning id into v_id;
  return v_id;
end $$;

-- Après la réponse (ou l'échec) : le coût réel remplace la réservation.
create or replace function public.oia_ia_regler(p_appel bigint, p_ok boolean, p_cout numeric, p_jetons_entree int, p_jetons_sortie int,
  p_outils text[] default '{}', p_nb_candidats int default null, p_modele text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a public.oia_ia_appel;
  v_cout numeric := greatest(coalesce(p_cout, 0), 0);
  v_b public.oia_ia_budget;
begin
  select * into v_a from public.oia_ia_appel where id = p_appel and user_id = auth.uid() and statut = 'reserve' for update;
  if not found then raise exception 'oia_ia: réservation introuvable' using errcode = 'P0002'; end if;
  -- Jamais moins que le coût déclaré ; jamais plus que la réservation sans le dire.
  update public.oia_ia_budget
     set reserve_usd = greatest(reserve_usd - v_a.cout_max_usd, 0), depense_usd = depense_usd + v_cout
   where mois = v_a.mois returning * into v_b;
  update public.oia_ia_appel
     set statut = case when p_ok then 'fait' else 'echoue' end, cout_usd = v_cout, jetons_entree = p_jetons_entree,
         jetons_sortie = p_jetons_sortie, outils = coalesce(p_outils, '{}'), nb_candidats = p_nb_candidats, modele = p_modele,
         motif = case when v_cout > v_a.cout_max_usd then 'cout_superieur_a_la_reservation' end, regle_le = now()
   where id = p_appel;
  return jsonb_build_object('depense_usd', v_b.depense_usd, 'plafond_usd', v_b.plafond_usd, 'alerte', v_b.depense_usd >= v_b.alerte_usd);
end $$;

create or replace view public.oia_ia_budget_v1 with (security_invoker = true) as
select mois, plafond_usd, alerte_usd, depense_usd, reserve_usd,
       greatest(plafond_usd - depense_usd - reserve_usd, 0) as reste_usd,
       depense_usd >= alerte_usd as alerte,
       (select count(*) from public.oia_ia_appel a where a.mois = b.mois and a.service = 'shyrka' and a.statut = 'fait') as appels_shyrka,
       (select count(*) from public.oia_ia_appel a where a.mois = b.mois and a.service = 'money-match' and a.statut = 'fait') as appels_money_match,
       (select count(*) from public.oia_ia_appel a where a.mois = b.mois and a.statut = 'refuse') as refus
from public.oia_ia_budget b;
revoke all on public.oia_ia_budget_v1 from public, anon;
grant select on public.oia_ia_budget_v1 to authenticated;

-- 7. Droits d'exécution ----------------------------------------------------------------
revoke execute on function public.shy_exiger_mickael(), public.shy_journaliser(text, text, text, text),
  public.shy_enregistrer_echange(uuid, text, text, jsonb), public.shy_creer_brouillon(uuid, text, text, text),
  public.shy_ajouter_contexte(text, text, text), public.shy_statuer_contexte(uuid, text), public.shy_oublier(text, uuid),
  public.oia_ia_reserver(text, numeric, int), public.oia_ia_regler(bigint, boolean, numeric, int, int, text[], int, text)
  from public, anon;
grant execute on function public.shy_journaliser(text, text, text, text),
  public.shy_enregistrer_echange(uuid, text, text, jsonb), public.shy_creer_brouillon(uuid, text, text, text),
  public.shy_ajouter_contexte(text, text, text), public.shy_statuer_contexte(uuid, text), public.shy_oublier(text, uuid),
  public.oia_ia_reserver(text, numeric, int), public.oia_ia_regler(bigint, boolean, numeric, int, int, text[], int, text)
  to authenticated;

commit;

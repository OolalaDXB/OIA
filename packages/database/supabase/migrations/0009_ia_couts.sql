-- 0009 · Dépenses d'IA d'OIA, vue unique (contrat proposé par Lovable :
-- prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md, commit 91cecd5).
--
-- Trois montants distincts, jamais confondus :
--   * coût ESTIMÉ : grille de prix d'OIA (infra/visibility/src/cost-grid.ts)
--     appliquée aux runs d'Elmo, ou aux jetons publiés par la veille ;
--   * coût RETENU : journal du garde-fou (cost-guard.sh) pour Visibility,
--     compteur de budget en base (oia_ia_appel, oia_ia_budget, 0007) pour
--     money-match et shyrka ;
--   * coût FACTURÉ : relevé à la main par un propriétaire de l'espace
--     (oia_ia_relever_facture). Une facture non relevée reste NULL, jamais 0.
--
-- 1. oia_ia_cout : lignes alimentées chaque jour depuis le Mac
--    (infra/visibility/scripts/couts-sync.sh, branché sur la tâche de J0) :
--    Elmo par assistant et modèle, ligne agrégée du garde-fou, Jev, veille de
--    Money Lookup. money-match et shyrka n'y sont jamais écrits : la vue les
--    lit directement dans le compteur de budget (pas de copie, pas de double
--    comptage).
-- 2. oia_ia_facture : relevés manuels, un par espace, fournisseur et mois.
-- 3. oia_ia_couts_v1 : la vue du contrat, membres de l'espace seulement.
--    Une facture n'est portée sur une ligne que si cette ligne est la seule
--    du fournisseur pour ce mois dans l'espace ; sinon elle reste non
--    attribuée (NULL), jamais répartie au prorata.
--
-- Valeurs de voie_acces : api_directe, openrouter, extracteur, plus
-- `toutes` (ligne agrégée sans ventilation) et `aucune` (traitement local,
-- sans modèle). Les lignes agrégées gardent assistant et modèle NULL.
--
-- Rejouable. Retour arrière : voir la fin du fichier.

begin;

-- ══ 1. Lignes alimentées depuis le Mac ═════════════════════════════════════
create table if not exists public.oia_ia_cout (
  espace_id                   uuid not null references public.oia_espace (id),
  module                      text not null check (module in ('visibility', 'money_lookup', 'shyrka')),
  -- money-match et shyrka sont lus dans le compteur de budget, jamais copiés ici.
  service                     text not null check (service ~ '^[a-z0-9][a-z0-9-]*$' and service not in ('money-match', 'shyrka')),
  marque_id                   text,
  mois                        date not null check (extract(day from mois) = 1),
  assistant                   text,
  fournisseur                 text check (fournisseur in ('openai', 'anthropic', 'mistral', 'openrouter', 'typesafe')),
  modele                      text,
  version                     text not null default 'non renseignée',
  voie_acces                  text not null check (voie_acces in ('api_directe', 'openrouter', 'extracteur', 'toutes', 'aucune')),
  suivi                       boolean not null,
  nb_questions                integer check (nb_questions >= 0),
  frequence                   text,
  nb_reponses_prevues         integer check (nb_reponses_prevues >= 0),
  nb_reponses                 integer check (nb_reponses >= 0),
  nb_appels                   integer check (nb_appels >= 0),
  unite_volume                text not null check (unite_volume in ('reponse', 'appel')),
  cout_estime_par_reponse_usd numeric(12,6) check (cout_estime_par_reponse_usd >= 0),
  cout_estime_mois_usd        numeric(12,6) check (cout_estime_mois_usd >= 0),
  cout_retenu_mois_usd        numeric(12,6) check (cout_retenu_mois_usd >= 0),
  plafond_mois_usd            numeric(10,4) check (plafond_mois_usd >= 0),
  plafond_perimetre           text not null,
  depense_budget_mois_usd     numeric(12,6) check (depense_budget_mois_usd >= 0),
  reserve_budget_mois_usd     numeric(12,6) check (reserve_budget_mois_usd >= 0),
  seuil_alerte_usd            numeric(10,4) check (seuil_alerte_usd >= 0),
  alerte_budget               boolean,
  statut_comptage             text not null check (statut_comptage in ('compte', 'partiel', 'non_compte')),
  source_cout                 text not null check (char_length(source_cout) between 3 and 500),
  mis_a_jour_le               timestamptz not null default now(),
  constraint oia_ia_cout_grain unique nulls not distinct (espace_id, module, service, marque_id, mois, assistant, modele, voie_acces)
);
create index if not exists oia_ia_cout_mois_idx on public.oia_ia_cout (espace_id, mois);

alter table public.oia_ia_cout enable row level security;
drop policy if exists membres_lisent on public.oia_ia_cout;
create policy membres_lisent on public.oia_ia_cout for select to authenticated
  using (public.oia_est_membre(espace_id));
revoke all on public.oia_ia_cout from public, anon, authenticated;
grant select on public.oia_ia_cout to authenticated;

-- ══ 2. Factures relevées ═══════════════════════════════════════════════════
create table if not exists public.oia_ia_facture (
  espace_id   uuid not null references public.oia_espace (id),
  fournisseur text not null check (fournisseur in ('openai', 'anthropic', 'mistral', 'openrouter', 'typesafe')),
  mois        date not null check (extract(day from mois) = 1),
  montant_usd numeric(12,4) not null check (montant_usd >= 0),
  releve_le   timestamptz not null default now(),
  releve_par  uuid,
  note        text check (note is null or char_length(note) <= 500),
  primary key (espace_id, fournisseur, mois)
);

alter table public.oia_ia_facture enable row level security;
drop policy if exists membres_lisent on public.oia_ia_facture;
create policy membres_lisent on public.oia_ia_facture for select to authenticated
  using (public.oia_est_membre(espace_id));
revoke all on public.oia_ia_facture from public, anon, authenticated;
grant select on public.oia_ia_facture to authenticated;

-- Relever une facture (fournisseur, mois, montant en USD). Propriétaire de l'espace
-- seulement ; un nouveau relevé du même mois remplace le précédent, journalisé.
create or replace function public.oia_ia_relever_facture(p_espace uuid, p_fournisseur text, p_mois date, p_montant numeric, p_note text default null)
returns public.oia_ia_facture
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mois date := date_trunc('month', p_mois)::date;
  v_avant numeric;
  v_ligne public.oia_ia_facture;
begin
  if auth.uid() is null or public.oia_role(p_espace) is distinct from 'proprietaire' then
    raise exception 'oia_ia: relevé réservé aux propriétaires de l''espace' using errcode = '42501';
  end if;
  if p_montant is null then
    raise exception 'oia_ia: un relevé a un montant (une facture non relevée reste sans ligne ; pour annuler : oia_ia_retirer_facture)' using errcode = '22023';
  end if;
  if p_montant < 0 then raise exception 'oia_ia: montant négatif' using errcode = '22023'; end if;
  if p_mois is null or v_mois > date_trunc('month', now() at time zone 'utc')::date then
    raise exception 'oia_ia: mois manquant ou futur' using errcode = '22023';
  end if;
  if p_fournisseur is null or p_fournisseur not in ('openai', 'anthropic', 'mistral', 'openrouter', 'typesafe') then
    raise exception 'oia_ia: fournisseur inconnu' using errcode = '22023';
  end if;
  select montant_usd into v_avant from public.oia_ia_facture where espace_id = p_espace and fournisseur = p_fournisseur and mois = v_mois;
  insert into public.oia_ia_facture (espace_id, fournisseur, mois, montant_usd, releve_le, releve_par, note)
  values (p_espace, p_fournisseur, v_mois, round(p_montant, 4), now(), auth.uid(), p_note)
  on conflict (espace_id, fournisseur, mois) do update
    set montant_usd = excluded.montant_usd, releve_le = excluded.releve_le, releve_par = excluded.releve_par, note = excluded.note
  returning * into v_ligne;
  insert into public.oia_journal (espace_id, user_id, action, cible, cible_id, detail)
  values (p_espace, auth.uid(), 'relever_facture', 'oia_ia_facture', p_fournisseur || ':' || v_mois,
          jsonb_build_object('montant_usd', v_ligne.montant_usd, 'avant_usd', v_avant));
  return v_ligne;
end $$;

-- Retirer un relevé saisi par erreur : la facture redevient « non relevée » (NULL).
create or replace function public.oia_ia_retirer_facture(p_espace uuid, p_fournisseur text, p_mois date)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mois date := date_trunc('month', p_mois)::date;
  v_avant numeric;
begin
  if auth.uid() is null or public.oia_role(p_espace) is distinct from 'proprietaire' then
    raise exception 'oia_ia: relevé réservé aux propriétaires de l''espace' using errcode = '42501';
  end if;
  delete from public.oia_ia_facture where espace_id = p_espace and fournisseur = p_fournisseur and mois = v_mois
  returning montant_usd into v_avant;
  if not found then return false; end if;
  insert into public.oia_journal (espace_id, user_id, action, cible, cible_id, detail)
  values (p_espace, auth.uid(), 'retirer_facture', 'oia_ia_facture', p_fournisseur || ':' || v_mois, jsonb_build_object('avant_usd', v_avant));
  return true;
end $$;

-- ══ 3. Vue unique des dépenses ═════════════════════════════════════════════
-- security_invoker : chaque ligne passe par les politiques de ses tables (membres
-- de l'espace). Les lignes money-match et shyrka viennent du budget commun du
-- studio (0007) : une ligne par mois de budget, service et modèle ; dépense,
-- réserve, plafond, seuil et alerte du budget répétés à l'identique, jamais sommés.
create or replace view public.oia_ia_couts_v1 with (security_invoker = true) as
with appels as (
  select b.mois, s.service, a.modele,
         count(a.id) filter (where a.statut = 'fait') as nb,
         sum(a.cout_usd) filter (where a.statut in ('fait', 'echoue')) as cout,
         max(coalesce(a.regle_le, a.le)) as maj
  from public.oia_ia_budget b
  cross join (values ('money-match'), ('shyrka')) as s (service)
  left join public.oia_ia_appel a on a.mois = b.mois and a.service = s.service and a.statut in ('fait', 'echoue')
  group by b.mois, s.service, a.modele
),
budget as (
  select '00000000-0000-4000-8000-000000000001'::uuid as espace_id,
         case a.service when 'money-match' then 'money_lookup' else 'shyrka' end as module,
         a.service, null::text as marque_id, a.mois,
         case when a.modele ilike 'mistral%' then 'mistral' when a.modele ilike 'claude%' then 'claude' end as assistant,
         case when a.modele ilike 'mistral%' then 'mistral' when a.modele ilike 'claude%' then 'anthropic' end as fournisseur,
         a.modele, 'non renseignée'::text as version,
         case when a.modele ilike 'mistral%' or a.modele ilike 'claude%' then 'api_directe' when a.modele = 'aucun' then 'aucune' else 'toutes' end as voie_acces,
         true as suivi, null::integer as nb_questions, null::text as frequence, null::integer as nb_reponses_prevues, null::integer as nb_reponses,
         a.nb::integer as nb_appels, 'appel'::text as unite_volume,
         null::numeric as cout_estime_par_reponse_usd, null::numeric as cout_estime_mois_usd,
         coalesce(a.cout, 0)::numeric as cout_retenu_mois_usd,
         b.plafond_usd::numeric as plafond_mois_usd, 'oia_ia_budget (money-match et shyrka)'::text as plafond_perimetre,
         b.depense_usd::numeric as depense_budget_mois_usd, b.reserve_usd::numeric as reserve_budget_mois_usd,
         b.alerte_usd::numeric as seuil_alerte_usd, b.depense_usd >= b.alerte_usd as alerte_budget,
         'compte'::text as statut_comptage, 'oia_ia_appel et oia_ia_budget (compteur de budget en base, 0007)'::text as source_cout,
         a.maj as mis_a_jour_le
  from appels a join public.oia_ia_budget b on b.mois = a.mois
),
lignes as (
  select espace_id, module, service, marque_id, mois, assistant, fournisseur, modele, version, voie_acces, suivi,
         nb_questions, frequence, nb_reponses_prevues, nb_reponses, nb_appels, unite_volume,
         cout_estime_par_reponse_usd::numeric, cout_estime_mois_usd::numeric, cout_retenu_mois_usd::numeric,
         plafond_mois_usd::numeric, plafond_perimetre, depense_budget_mois_usd::numeric, reserve_budget_mois_usd::numeric,
         seuil_alerte_usd::numeric, alerte_budget, statut_comptage, source_cout, mis_a_jour_le
  from public.oia_ia_cout
  union all
  select * from budget
),
attribuables as (
  select l.*, case when l.fournisseur is not null then count(*) over (partition by l.espace_id, l.fournisseur, l.mois) end as lignes_du_fournisseur
  from lignes l
)
select l.espace_id, l.module, l.service, l.marque_id, l.mois, l.assistant, l.fournisseur, l.modele, l.version, l.voie_acces, l.suivi,
       l.nb_questions, l.frequence, l.nb_reponses_prevues, l.nb_reponses, l.nb_appels, l.unite_volume,
       l.cout_estime_par_reponse_usd, l.cout_estime_mois_usd, l.cout_retenu_mois_usd,
       case when l.lignes_du_fournisseur = 1 then f.montant_usd end as cout_facture_mois_usd,
       case when l.lignes_du_fournisseur = 1 then f.releve_le end as facture_relevee_le,
       l.plafond_mois_usd, l.plafond_perimetre, l.depense_budget_mois_usd, l.reserve_budget_mois_usd, l.seuil_alerte_usd, l.alerte_budget,
       l.statut_comptage, l.source_cout, l.mis_a_jour_le
from attribuables l
left join public.oia_ia_facture f on f.espace_id = l.espace_id and f.fournisseur = l.fournisseur and f.mois = l.mois;

-- Factures relevées, attribuées ou non à une ligne (une facture globale du fournisseur
-- reste lisible ici sans être répartie sur les cartes).
create or replace view public.oia_ia_factures_v1 with (security_invoker = true) as
select f.espace_id, f.fournisseur, f.mois, f.montant_usd, f.releve_le, f.note,
       (select count(*) from public.oia_ia_couts_v1 c where c.espace_id = f.espace_id and c.fournisseur = f.fournisseur and c.mois = f.mois) = 1 as attribuee
from public.oia_ia_facture f;

-- ══ 4. Droits ══════════════════════════════════════════════════════════════
do $$
declare v text;
begin
  foreach v in array array['oia_ia_couts_v1', 'oia_ia_factures_v1'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
    execute format('comment on view public.%I is %L', v, 'Dépenses d''IA d''OIA (prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md). security_invoker : droits de l''appelant.');
  end loop;
end $$;
revoke all on function public.oia_ia_relever_facture(uuid, text, date, numeric, text), public.oia_ia_retirer_facture(uuid, text, date) from public, anon;
grant execute on function public.oia_ia_relever_facture(uuid, text, date, numeric, text), public.oia_ia_retirer_facture(uuid, text, date) to authenticated;

commit;

-- ══ Retour arrière ════════════════════════════════════════════════════════
-- begin;
--   drop view if exists public.oia_ia_factures_v1, public.oia_ia_couts_v1;
--   drop function if exists public.oia_ia_relever_facture(uuid, text, date, numeric, text), public.oia_ia_retirer_facture(uuid, text, date);
--   drop table if exists public.oia_ia_facture, public.oia_ia_cout;
--   delete from supabase_migrations.schema_migrations where version = '<version inscrite>';
-- commit;
-- (Les entrées « relever_facture » et « retirer_facture » d'oia_journal restent : journal en ajout seul.)

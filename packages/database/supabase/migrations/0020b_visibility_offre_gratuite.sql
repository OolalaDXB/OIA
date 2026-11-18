-- 0020b · Visibility : moteurs sur offre gratuite (appliquée le 2026-11-18).
--
-- Les réponses gardent le coût estimé à la collecte (vis.evidence, ajout seul), mais la dépense
-- réelle du mois (vis_ui.reel, donc les plafonds) ne compte pas un moteur déclaré gratuit, à partir
-- de la date de son offre. Mistral : clé d'OIA sur l'offre gratuite de La Plateforme depuis sa
-- création (aucune facture) ; ses 18,49 $ estimés de novembre ne sont plus comptés.
-- Retour arrière : vis_ui.reel de la 0011 ; drop table vis.offre_gratuite.

create table if not exists vis.offre_gratuite (
  id      bigserial primary key,
  moteur  text not null check (moteur ~ '^[a-z][a-z0-9_-]{1,30}$'),
  depuis  date not null,
  source  text not null,
  par     text not null,
  le      timestamptz not null default now()
);
create trigger offre_gratuite_ajout_seul before update or delete on vis.offre_gratuite for each row execute function vis.pilotage_ajout_seul();
create trigger offre_gratuite_ajout_seul_truncate before truncate on vis.offre_gratuite for each statement execute function vis.pilotage_ajout_seul();
alter table vis.offre_gratuite enable row level security;
alter table vis.offre_gratuite owner to vis_admin;
revoke all on vis.offre_gratuite from public, anon, authenticated, service_role;
grant select on vis.offre_gratuite to authenticated;
create policy lisible on vis.offre_gratuite for select using (exists (select 1 from vis.client_member m where m.user_id = auth.uid()::text));

insert into vis.offre_gratuite (moteur, depuis, source, par) values
  ('mistral', '2026-01-01', 'clé Mistral d''OIA sur l''offre gratuite de La Plateforme (Experiment) depuis sa création ; aucune facture Mistral', 'Mickaël (conversation, 18 novembre 2026)');

create or replace function vis_ui.reel(p_client text, p_mois date)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(e.cost_usd), 0)::numeric from vis.evidence e
  where (p_client is null or e.client_id = p_client)
    and e.received_at >= p_mois::timestamp at time zone 'UTC' and e.received_at < (p_mois + interval '1 month')::timestamp at time zone 'UTC'
    and not exists (select 1 from vis.offre_gratuite g where g.moteur = e.engine and e.received_at >= g.depuis::timestamp at time zone 'UTC')
$$;

-- BAWABA project seed + EU Funding & Tenders source (Milestone 1).
-- Idempotent: safe to re-run.
--
-- ⚠️  The `profile` below is a DRAFT (OD-3). Sectors/keywords/exclusions must be
-- confirmed by the owner before the shortlist can be trusted. Geographies and
-- fundingTypes reflect the entity doctrine (Oolala France SAS → EU/FR grants).

insert into projects (slug, name, is_active, profile)
values (
  'bawaba',
  'BAWABA',
  true,
  jsonb_build_object(
    'slug', 'bawaba',
    'name', 'BAWABA',
    'legalEntities', jsonb_build_array(
      jsonb_build_object('name', 'Oolala France SAS', 'jurisdiction', 'FR', 'role', 'applicant')
    ),
    'sectors', jsonb_build_array('creative industries', 'culture', 'digital', 'AI'),  -- DRAFT
    'geographies', jsonb_build_array('EU', 'FR'),
    'stage', 'growth',
    'fundingTypes', jsonb_build_array('grant'),
    'amountRange', jsonb_build_object('min', 50000, 'max', 2000000, 'currency', 'EUR'),  -- DRAFT
    'keywords', jsonb_build_array('creative', 'cultural', 'digital', 'AI'),  -- DRAFT
    'exclusions', jsonb_build_array('defence', 'military')  -- DRAFT
  )
)
on conflict (slug) do update set
  name = excluded.name,
  profile = excluded.profile,
  is_active = excluded.is_active,
  updated_at = now();

insert into sources (connector_key, kind, name, base_url, is_enabled, config)
select
  'eu-funding-tenders',
  'official_programme',
  'EU Funding & Tenders Portal (SEDIA)',
  'https://api.tech.ec.europa.eu/search-api/prod/rest/search',
  true,
  '{}'::jsonb
where not exists (
  select 1 from sources where connector_key = 'eu-funding-tenders'
);

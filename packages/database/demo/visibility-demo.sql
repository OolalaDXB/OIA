-- Jeu de démonstration Visibility (mandat v8, bloc B3). ENTIÈREMENT FICTIF.
-- Client, marque, domaines (.example, réservés), questions, réponses et
-- recommandations sont inventés. Aucune donnée réelle de client.
--
-- Usage : sur un Postgres jetable, après vis 0001 à 0004 et 0006. Jamais sur
-- la base de production. Le résultat des vues, lu par le membre fictif, est
-- figé dans docs/interface/demo/visibility-demo.json (test
-- packages/database/test/visibility.test.ts).
--
-- Membre fictif : 00000000-0000-4000-8000-00000000de00, propriétaire.

insert into vis.client (id, display_name, ownership, status, default_repo_action_mode)
values ('demo-fictif', 'Exemple fictif', 'external', 'active', 'lecture');

insert into vis.client_member (user_id, client_id, role, added_at)
values ('00000000-0000-4000-8000-00000000de00', 'demo-fictif', 'owner', '2026-09-28T09:00:00Z');

insert into vis.site (id, client_id, primary_url, additional_urls, status)
values ('demo-site', 'demo-fictif', 'https://www.exemple-fictif.example', '["https://boutique.exemple-fictif.example"]', 'active');

insert into vis.subject (id, client_id, status) values ('demo-sujet', 'demo-fictif', 'active');
insert into vis.subject_site (subject_id, site_id, client_id) values ('demo-sujet', 'demo-site', 'demo-fictif');

-- Deux fenêtres de 5 jours : J0 terminée, remesure en cours (jour 2 sur 5).
insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on)
values ('demo-j0', 'demo-sujet', 'demo-fictif', 'baseline', 1, 'done', '2026-10-01', '2026-10-05'),
       ('demo-remesure', 'demo-sujet', 'demo-fictif', 'follow-up', 1, 'running', '2026-11-02', '2026-11-06');

-- Panel : dix questions fictives, trois marquées (elles nomment la marque).
insert into vis_ui.question (client_id, subject_id, question_id, version, langue, texte, marquee, etiquettes)
select 'demo-fictif', 'demo-sujet', format('q%s', lpad(n::text, 2, '0')), 1, 'fr', t.texte, n <= 3, t.etiquettes
from (values
  (1, 'Que vaut Exemple fictif pour un premier achat ?', array['marque']),
  (2, 'Exemple fictif livre-t-il hors de France ?', array['marque', 'livraison']),
  (3, 'Quels sont les horaires du service client d''Exemple fictif ?', array['marque', 'service']),
  (4, 'Quelle boutique en ligne choisir pour du matériel fictif ?', array['achat']),
  (5, 'Où acheter du matériel fictif durable ?', array['achat']),
  (6, 'Quelles marques de matériel fictif sont fiables ?', array['comparaison']),
  (7, 'Quel matériel fictif offrir à un débutant ?', array['conseil']),
  (8, 'Comment entretenir du matériel fictif ?', array['conseil']),
  (9, 'Quel est le meilleur rapport qualité prix en matériel fictif ?', array['comparaison']),
  (10, 'Quelles boutiques de matériel fictif ont un atelier de réparation ?', array['service'])
) as t(n, texte, etiquettes);

-- Réponses. Trois moteurs : deux avec recherche web, un sans (sa citation de
-- marque est donc « non mesurable »). Le moteur « chatgpt » change de
-- version le jour 4 de J0. Les réponses de « mistral » à q10 ne sont pas
-- jugées (brandMentioned null).
with fenetres(window_id, debut, jours) as (
  values ('demo-j0', date '2026-10-01', 5), ('demo-remesure', date '2026-11-02', 2)
), moteurs(e, engine, web) as (
  values (1, 'chatgpt', true), (2, 'claude', true), (3, 'mistral', false)
), grille as (
  select f.window_id, f.debut + (d - 1) as jour, d, q, m.e, m.engine, m.web,
         case when m.engine = 'chatgpt' and f.window_id = 'demo-j0' and d >= 4 then 'gpt-fictif-2'
              when m.engine = 'chatgpt' then case when f.window_id = 'demo-j0' then 'gpt-fictif-1' else 'gpt-fictif-2' end
              when m.engine = 'claude' then 'claude-fictif-1' else 'mistral-fictif-1' end as version,
         case when m.engine = 'mistral' and q = 10 then null
              else q <= 3 or (q * 7 + d * 3 + m.e * 5 + case when f.window_id = 'demo-remesure' then 2 else 0 end) % 10 < 4 end as mentionnee,
         (q * 3 + d + m.e) % 4 as rang
  from fenetres f, generate_series(1, f.jours) d, generate_series(1, 10) q, moteurs m
)
insert into vis.evidence (id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language,
                          engine, engine_version, collector_name, collector_run_id, received_at, raw_text, raw_sha256,
                          structured, citations, cost_usd)
select md5(format('demo|%s|%s|%s|%s', g.window_id, g.d, g.q, g.engine))::uuid,
       'demo-fictif', 'demo-site', 'demo-sujet', g.window_id, format('q%s', lpad(g.q::text, 2, '0')), 1, 'fr',
       g.engine, g.version, 'manual', format('demo-%s-%s-%s-%s', g.window_id, g.d, g.q, g.engine),
       (g.jour::timestamp + make_interval(hours => 8 + g.e, mins => g.q)) at time zone 'UTC',
       format('Réponse fictive de %s à la question q%s, jour %s. %s', g.engine, lpad(g.q::text, 2, '0'), g.d,
              case when g.mentionnee then 'Exemple fictif est cité parmi les boutiques possibles.'
                   else 'Plusieurs boutiques fictives sont citées.' end),
       '\x00'::bytea,
       jsonb_build_object(
         'provider', g.engine || '-api',
         'webSearch', g.web,
         'brandMentioned', to_jsonb(g.mentionnee),
         'competitorsMentioned', case when g.mentionnee is null then '[]'::jsonb
           else to_jsonb((array['Concurrent Alpha', 'Concurrent Bêta', 'Concurrent Gamma'])[1:g.rang]) end,
         'fictif', true),
       case when not g.web then '[]'::jsonb else jsonb_build_array() ||
         case when g.mentionnee then jsonb_build_array(jsonb_build_object('url', format('https://www.exemple-fictif.example/guide/q%s', g.q))) else '[]'::jsonb end ||
         case when g.q % 3 = 0 then jsonb_build_array(jsonb_build_object('url', 'https://www.linkedin.com/company/exemple-fictif')) else '[]'::jsonb end ||
         case when g.q % 4 = 0 then jsonb_build_array(jsonb_build_object('url', 'https://www.youtube.com/watch?v=demo-fictif')) else '[]'::jsonb end ||
         jsonb_build_array(jsonb_build_object('url', format('https://annuaire-fictif.example/fiche/%s', g.q % 5)))
       end,
       0.0012
from grille g;

-- Recommandations : une en attente, une acceptée (avec exécution), une rejetée.
insert into vis.recommendation (id, client_id, site_id, subject_id, window_id, type, title, statement, impact_level, effort_level,
                                risk, confidence, created_by, created_at, payload)
values
  ('rec-demo-fait-01', 'demo-fictif', 'demo-site', 'demo-sujet', 'demo-j0', 'FIX_FACT',
   'Corriger les horaires du service client', 'Deux moteurs donnent des horaires fictifs périmés pour le service client.',
   'high', 'S', 'low', 'medium', 'seo-command-aeo', '2026-10-06T10:00:00Z',
   '{"evidence": [{"kind": "evidence-row", "ref": "demo-j0/q03"}], "fictif": true}'),
  ('rec-demo-contenu-01', 'demo-fictif', 'demo-site', 'demo-sujet', 'demo-j0', 'CONTENT_GAP',
   'Ajouter une page sur la réparation', 'Aucune page du site fictif ne répond à la question q10.',
   'medium', 'M', 'low', 'medium', 'seo-command-contenu', '2026-10-06T10:05:00Z',
   '{"evidence": [{"kind": "panel-prompt", "ref": "q10@v1"}], "fictif": true}'),
  ('rec-demo-veille-01', 'demo-fictif', 'demo-site', 'demo-sujet', 'demo-j0', 'WATCH',
   'Suivre la page LinkedIn fictive', 'Cette page fictive est citée par deux moteurs.',
   'low', 'XS', 'low', 'low', 'seo-command-aeo', '2026-10-06T10:10:00Z',
   '{"evidence": [{"kind": "evidence-row", "ref": "demo-j0/q06"}], "fictif": true}');

insert into vis.decision (recommendation_id, status, decided_by, decided_at, reason, client_id)
values ('rec-demo-contenu-01', 'accepted', '00000000-0000-4000-8000-00000000de00', '2026-10-07T09:00:00Z', 'Utile, à faire ce mois-ci.', 'demo-fictif'),
       ('rec-demo-veille-01', 'rejected', '00000000-0000-4000-8000-00000000de00', '2026-10-07T09:05:00Z', 'Hors du périmètre.', 'demo-fictif');

insert into vis.execution (recommendation_id, client_id, kind, ref, happened_at)
values ('rec-demo-contenu-01', 'demo-fictif', 'pr-opened', 'https://depot-fictif.example/pr/1', '2026-10-09T15:00:00Z');

insert into vis.action_log (at, who, what, client_id, subject_id, mission_id, cost_usd, details)
values ('2026-10-06T09:50:00Z', 'seo-command-orchestrator', 'mission.ouverte', 'demo-fictif', 'demo-sujet', 'mission-demo-01', 0, '{"type": "analyse", "fictif": true}'),
       ('2026-10-06T10:10:00Z', 'seo-command-aeo', 'recommandations.proposees', 'demo-fictif', 'demo-sujet', 'mission-demo-01', 0.0450, '{"nombre": 3, "fictif": true}'),
       ('2026-10-07T09:05:00Z', '00000000-0000-4000-8000-00000000de00', 'mission.revue', 'demo-fictif', 'demo-sujet', 'mission-demo-01', 0, '{"acceptees": 1, "rejetees": 1, "fictif": true}');

insert into vis_ui.rapport (id, client_id, subject_id, window_id, type, genere_le, version_panel, statut, fichier, empreinte, chiffres)
values ('00000000-0000-4000-8000-00000000de01', 'demo-fictif', 'demo-sujet', 'demo-j0', 'j0', '2026-10-06T08:00:00Z', 1, 'a_valider', null,
        repeat('0', 64), '{"fictif": true}');

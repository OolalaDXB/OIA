-- Jeu de démonstration Visibility v2, pilotage (mandat v16, bloc A). ENTIÈREMENT FICTIF.
-- Clients, sites (.example, réservés), propositions, réponses et montants sont inventés.
--
-- Usage : sur un Postgres jetable, après vis 0001 à 0005, 0006, 0010, vis 0006_pilotage
-- et 0011. Jamais sur la base de production. Le résultat des vues du pilotage, lu par le
-- membre fictif à l'heure figée 2026-11-18T10:00:00Z (vis.maintenant), est figé dans
-- docs/interface/demo/visibility-v2-demo.json (test packages/database/test/visibility-pilotage.test.ts).
--
-- Un site à chaque étape : demandé, à valider, reconnaissance, prêt pour GO, mesure en
-- cours (jour 3), rapport à valider, actions en cours, remesure proposée, bloqué par
-- plafond. Le moteur est actif ; deux alertes.
--
-- Membre fictif : 00000000-0000-4000-8000-00000000de00, owner des deux clients fictifs.

insert into vis.client (id, display_name, ownership, status, default_repo_action_mode)
values ('demo-pilotage', 'Exemple fictif', 'external', 'active', 'lecture'),
       ('demo-plafond', 'Exemple fictif au plafond', 'external', 'active', 'lecture')
on conflict (id) do nothing;
insert into vis.client_member (user_id, client_id, role, added_at)
values ('00000000-0000-4000-8000-00000000de00', 'demo-pilotage', 'owner', '2026-11-01T09:00:00Z'),
       ('00000000-0000-4000-8000-00000000de00', 'demo-plafond', 'owner', '2026-11-01T09:00:00Z');

-- Sites et sujets.
insert into vis.site (id, client_id, primary_url, status)
select s.id, s.client, 'https://' || replace(s.id, '-example', '.example'), 'active'
from (values ('demande-fictif-example', 'demo-pilotage'), ('revue-fictif-example', 'demo-pilotage'), ('reco-fictif-example', 'demo-pilotage'),
             ('go-fictif-example', 'demo-pilotage'), ('mesure-fictif-example', 'demo-pilotage'), ('rapport-fictif-example', 'demo-pilotage'),
             ('actions-fictif-example', 'demo-pilotage'), ('remesure-fictif-example', 'demo-pilotage'), ('plafond-fictif-example', 'demo-plafond')) as s(id, client);
insert into vis.subject (id, client_id, status, extra)
select id, client_id, 'draft', jsonb_build_object('displayName', initcap(split_part(id, '-', 1)) || ' fictif', 'langues', '["fr"]'::jsonb, 'marches', '["FR"]'::jsonb)
from vis.site where id like '%-fictif-example';
insert into vis.subject_site (subject_id, site_id, client_id) select id, id, client_id from vis.site where id like '%-fictif-example';

-- Budget : plafond global, plafonds des clients.
insert into vis.plafond (client_id, plafond_usd, par, le) values
  (null, 100, '00000000-0000-4000-8000-00000000de00', '2026-11-01T09:00:00Z'),
  ('demo-pilotage', 30, '00000000-0000-4000-8000-00000000de00', '2026-11-01T09:01:00Z'),
  ('demo-plafond', 5, '00000000-0000-4000-8000-00000000de00', '2026-11-01T09:02:00Z');

-- Demandes d'ajout : en file pour le premier site, faites pour les autres.
insert into vis.demande (id, client_id, subject_id, type, charge, demande_par, demande_le)
select ('00000000-0000-4000-8000-0000000d0' || lpad(row_number() over (order by s.id)::text, 3, '0'))::uuid, s.client_id, s.id, 'SITE_ADD',
       jsonb_build_object('url', st.primary_url, 'nom', s.extra ->> 'displayName', 'langues', s.extra -> 'langues', 'marches', s.extra -> 'marches'),
       '00000000-0000-4000-8000-00000000de00', '2026-11-02T08:00:00Z'::timestamptz + (row_number() over (order by s.id)) * interval '1 minute'
from vis.subject s join vis.site st on st.id = s.id where s.id like '%-fictif-example';
insert into vis.demande_etat (demande_id, client_id, statut, tentative, hote, par, le)
select d.id, d.client_id, 'RUNNING', 1, 'mac-demo', 'moteur', d.demande_le + interval '2 minutes' from vis.demande d where d.subject_id <> 'demande-fictif-example';
insert into vis.demande_etat (demande_id, client_id, statut, resultat, par, le)
select d.id, d.client_id, 'DONE', '{"propositions": 6}', 'moteur', d.demande_le + interval '9 minutes' from vis.demande d where d.subject_id <> 'demande-fictif-example';

-- Propositions : deux faits, trois questions (dont une marquée), un audit, pour chaque site traité.
insert into vis.proposition (element_id, client_id, subject_id, nature, version, contenu, source, propose_par, propose_le)
select s.id || ':' || p.nature || ':' || p.local, s.client_id, s.id, p.nature, 1, p.contenu, 'https://' || replace(s.id, '-example', '.example') || '/', 'moteur', '2026-11-02T08:30:00Z'
from vis.subject s
cross join (values
  ('fait', 'prix', '{"enonce": "Atelier fictif à partir de 40 €", "categorie": "prix"}'::jsonb),
  ('fait', 'lieu', '{"enonce": "Atelier fictif situé à Lyon", "categorie": "lieu"}'::jsonb),
  ('question', 'fr-01', '{"texte": "Quel atelier fictif choisir à Lyon ?", "langue": "fr", "marquee": false, "famille": "unbranded", "moteurs": ["chatgpt", "claude"]}'::jsonb),
  ('question', 'fr-02', '{"texte": "Où trouver un atelier fictif fiable ?", "langue": "fr", "marquee": false, "famille": "unbranded", "moteurs": ["chatgpt", "claude"]}'::jsonb),
  ('question', 'fr-03', '{"texte": "Que vaut cet atelier fictif pour un premier cours ?", "langue": "fr", "marquee": true, "famille": "branded", "moteurs": ["chatgpt", "claude"]}'::jsonb),
  ('audit', 'prix-sans-js', '{"controle": "prix-sans-js", "etat": "alerte", "detail": "prix invisibles sans JavaScript"}'::jsonb)
) as p(nature, local, contenu)
where s.id like '%-fictif-example' and s.id <> 'demande-fictif-example';

-- Panel validé et faits tranchés, sauf pour le site à valider.
insert into vis.panel (client_id, subject_id, version, questions, par, le)
select s.client_id, s.id, 1, array[s.id || ':question:fr-01', s.id || ':question:fr-02', s.id || ':question:fr-03'], '00000000-0000-4000-8000-00000000de00', '2026-11-03T09:00:00Z'
from vis.subject s where s.id like '%-fictif-example' and s.id not in ('demande-fictif-example', 'revue-fictif-example');
insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par, le)
select p.element_id, 1, p.client_id, p.subject_id, case when p.element_id like '%:fait:lieu' then 'rejete' else 'valide' end, '00000000-0000-4000-8000-00000000de00', '2026-11-03T09:00:00Z'
from vis.proposition p where p.nature in ('fait', 'question') and p.subject_id in (select subject_id from vis.panel);

-- Fenêtres de reconnaissance : chiffrées pour tous ; GO et en cours pour « reco » ; closes ensuite.
insert into vis.fenetre (window_id, client_id, subject_id, nature, libelle, jours_prevus, cree_le)
select s.id || '-r', s.client_id, s.id, 'reconnaissance', 'Reconnaissance', 1, '2026-11-02T08:40:00Z'
from vis.subject s where s.id like '%-fictif-example' and s.id <> 'demande-fictif-example';
insert into vis.fenetre_estimation (window_id, client_id, cout_estime_usd, detail, questions, moteurs, par, le)
select f.window_id, f.client_id, 1.20, '{"appels": 6, "par_moteur": {"chatgpt": 0.5, "claude": 0.6}, "juge": 0.1}', 2, array['chatgpt', 'claude'], 'moteur', '2026-11-02T08:40:00Z'
from vis.fenetre f where f.nature = 'reconnaissance';
insert into vis.fenetre_statut (window_id, client_id, statut, par, le)
select window_id, client_id, 'proposee', 'moteur', '2026-11-02T08:40:00Z' from vis.fenetre where nature = 'reconnaissance';
insert into vis.fenetre_go (window_id, client_id, estimation_id, cout_vu_usd, mois, par, le)
select f.window_id, f.client_id, e.id, 1.20, '2026-11-01', '00000000-0000-4000-8000-00000000de00', '2026-11-04T09:00:00Z'
from vis.fenetre f join vis.fenetre_estimation e on e.window_id = f.window_id where f.nature = 'reconnaissance' and f.subject_id <> 'revue-fictif-example';
insert into vis.fenetre_statut (window_id, client_id, statut, debut, par, le)
select window_id, client_id, 'go_donne', null, '00000000-0000-4000-8000-00000000de00', '2026-11-04T09:00:00Z' from vis.fenetre_go;
insert into vis.fenetre_statut (window_id, client_id, statut, debut, par, le)
select window_id, client_id, 'en_cours', '2026-11-05', 'moteur', '2026-11-05T06:00:00Z' from vis.fenetre_go;
insert into vis.fenetre_statut (window_id, client_id, statut, par, le)
select window_id, client_id, 'close', 'moteur', '2026-11-06T06:00:00Z' from vis.fenetre_go where window_id <> 'reco-fictif-example-r';
insert into vis.fenetre_jour (window_id, client_id, jour, date, etat, detail, le)
select window_id, client_id, 1, '2026-11-05', 'complet', '{"reponses": 6}', '2026-11-05T20:00:00Z' from vis.fenetre_go;

-- Concurrents et homonyme proposés par la reconnaissance, tranchés sauf pour « reco ».
insert into vis.proposition (element_id, client_id, subject_id, nature, version, contenu, source, propose_par, propose_le)
select s.id || ':' || p.nature || ':' || p.local, s.client_id, s.id, p.nature, 1, p.contenu, 'reponses:6', 'moteur', '2026-11-06T06:00:00Z'
from vis.subject s
cross join (values
  ('concurrent', 'rival-un', '{"nom": "Rival un", "type": "structure", "domaines": ["rival-un.example"], "citations": 4}'::jsonb),
  ('concurrent', 'plateforme-x', '{"nom": "Plateforme X", "type": "plateforme", "domaines": ["plateforme-x.example"], "citations": 2}'::jsonb),
  ('homonyme', 'atelier-bois', '{"nom": "Atelier fictif bois", "exemple": "une menuiserie d''une autre ville", "citations": 1}'::jsonb)
) as p(nature, local, contenu)
where s.id like '%-fictif-example' and s.id not in ('demande-fictif-example', 'revue-fictif-example', 'reco-fictif-example');
insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par, le)
select p.element_id, 1, p.client_id, p.subject_id, case when p.element_id like '%:plateforme-x' then 'rejete' else 'valide' end, '00000000-0000-4000-8000-00000000de00', '2026-11-06T10:00:00Z'
from vis.proposition p where p.nature in ('concurrent', 'homonyme');

-- J0 : chiffré (« go ») ; en cours depuis le 16 (« mesure », jour 3 le 18) ; clos pour les suivants.
insert into vis.fenetre (window_id, client_id, subject_id, nature, libelle, jours_prevus, cree_le)
select s.id || '-j0', s.client_id, s.id, 'reference', 'J0', 5, '2026-11-06T10:05:00Z'
from vis.subject s where s.id in ('go-fictif-example', 'mesure-fictif-example', 'rapport-fictif-example', 'actions-fictif-example', 'remesure-fictif-example', 'plafond-fictif-example');
insert into vis.fenetre_estimation (window_id, client_id, cout_estime_usd, detail, questions, moteurs, par, le)
select window_id, client_id, 7.50, '{"appels": 30, "par_moteur": {"chatgpt": 3.2, "claude": 3.8}, "juge": 0.5}', 3, array['chatgpt', 'claude'], 'moteur', '2026-11-06T10:05:00Z'
from vis.fenetre where nature = 'reference';
insert into vis.fenetre_statut (window_id, client_id, statut, par, le)
select window_id, client_id, 'proposee', 'moteur', '2026-11-06T10:05:00Z' from vis.fenetre where nature = 'reference';
insert into vis.fenetre_go (window_id, client_id, estimation_id, cout_vu_usd, debut, mois, par, le)
select f.window_id, f.client_id, e.id, 7.50, case when f.subject_id = 'mesure-fictif-example' then date '2026-11-16' else date '2026-10-06' end,
       case when f.subject_id = 'mesure-fictif-example' then date '2026-11-01' else date '2026-10-01' end, '00000000-0000-4000-8000-00000000de00',
       case when f.subject_id = 'mesure-fictif-example' then timestamptz '2026-11-15T09:00:00Z' else timestamptz '2026-10-05T09:00:00Z' end
from vis.fenetre f join vis.fenetre_estimation e on e.window_id = f.window_id where f.nature = 'reference' and f.subject_id <> 'go-fictif-example';
insert into vis.fenetre_statut (window_id, client_id, statut, debut, par, le)
select window_id, client_id, 'go_donne', debut, par, le from vis.fenetre_go where window_id like '%-j0';
insert into vis.fenetre_statut (window_id, client_id, statut, debut, par, le)
select window_id, client_id, 'en_cours', debut, 'moteur', debut::timestamp at time zone 'UTC' + interval '6 hours' from vis.fenetre_go where window_id like '%-j0';
insert into vis.fenetre_statut (window_id, client_id, statut, par, le)
select window_id, client_id, 'close', 'moteur', '2026-10-11T06:00:00Z' from vis.fenetre_go where window_id like '%-j0' and window_id <> 'mesure-fictif-example-j0';
insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on)
select g.window_id, f.subject_id, g.client_id, 'baseline', 1, case when g.window_id = 'mesure-fictif-example-j0' then 'running' else 'done' end, g.debut, g.debut + 4
from vis.fenetre_go g join vis.fenetre f on f.window_id = g.window_id where g.window_id like '%-j0';
insert into vis.fenetre_jour (window_id, client_id, jour, date, etat, detail, le)
values ('mesure-fictif-example-j0', 'demo-pilotage', 1, '2026-11-16', 'complet', '{"reponses": 6}', '2026-11-16T20:00:00Z'),
       ('mesure-fictif-example-j0', 'demo-pilotage', 2, '2026-11-17', 'partiel', '{"reponses": 4, "attendues": 6}', '2026-11-17T20:00:00Z');

-- Réponses : J0 d'octobre de « remesure » (présence non marquée : 1 sur 4) ; J0 de
-- « plafond », coûts de novembre égaux au plafond du client (5 $).
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, engine_version, collector_name, received_at, raw_text, raw_sha256, structured, cost_usd)
select 'demo-pilotage', 'remesure-fictif-example', 'remesure-fictif-example-j0', q, 1, 'fr', 'chatgpt', 'gpt-fictif-1', 'oia-direct',
       timestamptz '2026-10-06T07:00:00Z' + n * interval '1 day', 'Réponse fictive ' || q || ' jour ' || n, '\x00', jsonb_build_object('brandMentioned', n = 1 and q = 'fr-01'), 0.25
from (values ('fr-01'), ('fr-02')) as v(q), generate_series(1, 2) n;
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, engine_version, collector_name, received_at, raw_text, raw_sha256, structured, cost_usd)
values ('demo-plafond', 'plafond-fictif-example', 'plafond-fictif-example-j0', 'fr-01', 1, 'fr', 'claude', 'claude-fictif-1', 'oia-direct', '2026-11-10T07:00:00Z', 'Réponse fictive coûteuse', '\x00', '{"brandMentioned": false}', 5);

-- Pages et recommandations.
insert into vis.page (id, client_id, subject_id, window_id, nature, langue, html, genere_le)
values ('00000000-0000-4000-8000-0000000e0001', 'demo-pilotage', 'rapport-fictif-example', 'rapport-fictif-example-j0', 'rapport', 'fr', '<h1>Rapport fictif</h1><p>Présence de la marque : 2 sur 10.</p>', '2026-10-11T08:00:00Z'),
       ('00000000-0000-4000-8000-0000000e0002', 'demo-pilotage', 'actions-fictif-example', 'actions-fictif-example-j0', 'rapport', 'fr', '<h1>Rapport fictif</h1>', '2026-10-11T08:00:00Z'),
       ('00000000-0000-4000-8000-0000000e0003', 'demo-pilotage', 'remesure-fictif-example', 'remesure-fictif-example-j0', 'page_client', 'fr', '<h1>Page client fictive</h1>', '2026-10-11T08:00:00Z');
insert into vis.page_validation (page_id, client_id, par, le)
values ('00000000-0000-4000-8000-0000000e0002', 'demo-pilotage', '00000000-0000-4000-8000-00000000de00', '2026-10-12T09:00:00Z'),
       ('00000000-0000-4000-8000-0000000e0003', 'demo-pilotage', '00000000-0000-4000-8000-00000000de00', '2026-10-12T09:00:00Z');
insert into vis.recommendation (id, client_id, subject_id, window_id, type, title, statement, impact_level, effort_level, risk, confidence, created_by, created_at, payload)
select 'rec-demo-' || split_part(s, '-', 1), 'demo-pilotage', s, s || '-j0', 'SOURCE_TARGET', 'Être cité par un annuaire fictif', 'L''annuaire fictif est cité par les IA, la marque en est absente.',
       'medium', 'S', 'low', 'medium', 'moteur', '2026-10-11T08:00:00Z', '{"owner": "client"}'
from unnest(array['rapport-fictif-example', 'actions-fictif-example', 'remesure-fictif-example']) s;
insert into vis.decision (recommendation_id, status, decided_by, decided_at, client_id)
values ('rec-demo-actions', 'accepted', '00000000-0000-4000-8000-00000000de00', '2026-10-12T09:00:00Z', 'demo-pilotage'),
       ('rec-demo-remesure', 'accepted', '00000000-0000-4000-8000-00000000de00', '2026-10-12T09:00:00Z', 'demo-pilotage');
insert into vis.execution (recommendation_id, client_id, kind, ref, happened_at, payload)
values ('rec-demo-remesure', 'demo-pilotage', 'commit', 'abc1234', '2026-11-01T00:00:00Z', '{"declaredBy": "00000000-0000-4000-8000-00000000de00"}');

-- Remesure proposée et chiffrée.
insert into vis.fenetre (window_id, client_id, subject_id, nature, libelle, compare_avec, jours_prevus, cree_le)
values ('remesure-fictif-example-j1', 'demo-pilotage', 'remesure-fictif-example', 'remesure', 'J1', 'remesure-fictif-example-j0', 5, '2026-11-02T06:00:00Z');
insert into vis.fenetre_estimation (window_id, client_id, cout_estime_usd, detail, questions, moteurs, par, le)
values ('remesure-fictif-example-j1', 'demo-pilotage', 7.50, '{"appels": 30, "par_moteur": {"chatgpt": 3.2, "claude": 3.8}, "juge": 0.5}', 3, array['chatgpt', 'claude'], 'moteur', '2026-11-02T06:00:00Z');
insert into vis.fenetre_statut (window_id, client_id, statut, par, le)
values ('remesure-fictif-example-j1', 'demo-pilotage', 'proposee', 'moteur', '2026-11-02T06:00:00Z');

-- Alertes et moteur.
insert into vis.alerte (id, client_id, subject_id, gravite, type, message, cree_le)
values ('00000000-0000-4000-8000-0000000a0001', 'demo-pilotage', 'rapport-fictif-example', 'info', 'RAPPORT_PRET', 'Rapport J0 prêt à valider', '2026-10-11T08:00:00Z'),
       ('00000000-0000-4000-8000-0000000a0002', 'demo-plafond', 'plafond-fictif-example', 'bloquant', 'PLAFOND', 'Plafond du mois atteint : collecte arrêtée pour ce client', '2026-11-10T07:05:00Z');
insert into vis.moteur_signe (hote, version, prochain, le)
values ('mac-studio', 'abc1234', '2026-11-18T10:00:00Z', '2026-11-18T09:55:00Z');

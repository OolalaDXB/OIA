#!/usr/bin/env bash
# Teste la migration vis.evidence (A5) contre une instance Postgres JETABLE.
# Démarre un conteneur `oia-vis-test-pg`, applique 0001_evidence.sql, pose
# deux clients et vérifie :
#  1. INSERT valide → ligne présente, raw_sha256 calculé serveur.
#  2. raw_sha256 ne peut pas être forcé à une mauvaise valeur côté client.
#  3. UPDATE sur vis.evidence → refusé.
#  4. DELETE sur vis.evidence → refusé.
#  5. Deux clients isolés par RLS : un SELECT scope=A ne voit pas les lignes du client B.
# Enfin : supprime le conteneur et son volume.
#
# Pré-requis : Docker démarré. Le port 55432 est libre.
set -euo pipefail

CONTAINER="${OIA_VIS_TEST_PG_CONTAINER:-oia-vis-test-pg}"
PORT="${OIA_VIS_TEST_PG_PORT:-55432}"
PASS="$(openssl rand -hex 16)"
VIS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$VIS_ROOT/migrations/0001_evidence.sql"
MIG_E3="$VIS_ROOT/migrations/0002_decision_journal.sql"
MIG_C1="$VIS_ROOT/migrations/0003_client_action_log.sql"
MIG_S="$VIS_ROOT/migrations/0004_auth_identity.sql"
[ -f "$MIG" ] || { echo "migration introuvable : $MIG" >&2; exit 2; }
[ -f "$MIG_E3" ] || { echo "migration introuvable : $MIG_E3" >&2; exit 2; }
[ -f "$MIG_C1" ] || { echo "migration introuvable : $MIG_C1" >&2; exit 2; }
[ -f "$MIG_S" ] || { echo "migration introuvable : $MIG_S" >&2; exit 2; }

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Démarrage
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --rm \
  --name "$CONTAINER" \
  -p "127.0.0.1:$PORT:5432" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_USER=visadmin \
  -e POSTGRES_DB=visdb \
  postgres:16-alpine >/dev/null

# Attente du ready
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U visadmin -d visdb >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PSQL="docker exec -i -e PGPASSWORD=$PASS $CONTAINER psql -U visadmin -d visdb -v ON_ERROR_STOP=1 -qt"
PSQLL="docker exec -i -e PGPASSWORD=$PASS $CONTAINER psql -U visadmin -d visdb -v ON_ERROR_STOP=1"

echo "## applying migration 0001"
$PSQLL < "$MIG" >/dev/null
echo "## applying migration 0002"
$PSQLL < "$MIG_E3" >/dev/null
echo "## applying migration 0003"
$PSQLL < "$MIG_C1" >/dev/null
echo "## applying migration 0004 (S1-S4)"
$PSQLL < "$MIG_S" >/dev/null

# Rôle app : simule un service qui ne doit jamais contourner la RLS.
$PSQLL <<'SQL' >/dev/null
create role oia_vis_app login password 'app-pass' nobypassrls;
grant usage on schema vis to oia_vis_app;
grant select, insert on all tables in schema vis to oia_vis_app;
grant usage on all sequences in schema vis to oia_vis_app;
SQL
# Repasse les grants sur les tables de 0002 (créées après le grant générique).
$PSQLL <<'SQL' >/dev/null
grant select, insert on all tables in schema vis to oia_vis_app;
grant usage on all sequences in schema vis to oia_vis_app;
SQL

seed_data() {
$PSQLL <<SQL >/dev/null
insert into vis.client (id, display_name, ownership, status, default_repo_action_mode, monthly_budget_usd)
  values ('fictive-a', 'Fictive A', 'external', 'active', 'proposition', 30),
         ('fictive-b', 'Fictive B', 'internal', 'active', 'direct', 10);
insert into vis.site (id, client_id, primary_url, status) values
  ('a-site-1','fictive-a','https://a1.example.test/','active'),
  ('b-site-1','fictive-b','https://b1.example.test/','active');
insert into vis.subject (id, client_id, status) values
  ('a-subj','fictive-a','active'),
  ('b-subj','fictive-b','active');
insert into vis.subject_site (subject_id, site_id, client_id) values
  ('a-subj','a-site-1','fictive-a'),
  ('b-subj','b-site-1','fictive-b');
insert into vis.window (id, subject_id, client_id, kind, panel_version, status) values
  ('a-win-j0','a-subj','fictive-a','baseline',1,'planned'),
  ('b-win-j0','b-subj','fictive-b','baseline',1,'planned');
-- S1-S2 seed : identités owner + identité de service pour les tests adverses
insert into vis.client_member (user_id, client_id, role) values
  ('u-a-owner','fictive-a','owner'),
  ('u-b-owner','fictive-b','owner')
on conflict do nothing;
insert into vis.service_identity (user_id, name) values
  ('agent-seo','SEO Command agent')
on conflict do nothing;
SQL
}
seed_data

insert_evidence() {
  local scope="$1" cid="$2" sid="$3" wid="$4" pid="$6" prompt="$5"
  pid="${pid:-p01}"
  local uid
  case "$scope" in
    fictive-a) uid='u-a-owner' ;;
    fictive-b) uid='u-b-owner' ;;
    *) uid="$scope" ;;
  esac
  docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
    psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<SQL >/dev/null
begin;
set local vis.test_user_id = '$uid';
insert into vis.evidence (client_id, site_id, subject_id, window_id,
                          prompt_id, prompt_version, prompt_language,
                          engine, collector_name, raw_text)
  values ('$cid', null, '$sid', '$wid',
          '$pid', 1, 'fr',
          'chatgpt', 'oia-direct',
          \$\$${prompt}\$\$);
commit;
SQL
}

echo "## test 1 — INSERT valide + SHA-256 côté serveur"
insert_evidence 'fictive-a' 'fictive-a' 'a-subj' 'a-win-j0' '[donnée fictive] réponse A' 'p01'
got_sha="$($PSQL -c "select encode(raw_sha256,'hex') from vis.evidence where client_id='fictive-a'" | tr -d '[:space:]')"
# SHA-256 of '[donnée fictive] réponse A' (UTF-8)
want_sha="$(printf '%s' '[donnée fictive] réponse A' | shasum -a 256 | awk '{print $1}')"
[ "$got_sha" = "$want_sha" ] || { echo "FAIL: raw_sha256 différent. got=$got_sha want=$want_sha"; exit 1; }
echo "  OK raw_sha256=$got_sha"

echo "## test 2 — raw_sha256 fourni par le client est ignoré"
docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local vis.test_user_id = 'u-a-owner';
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language,
                          engine, collector_name, raw_text, raw_sha256)
  values ('fictive-a','a-subj','a-win-j0','p02',1,'fr','claude','oia-direct',
          'texte-2', E'\\x00000000000000000000000000000000'::bytea);
commit;
SQL
got2="$($PSQL -c "select encode(raw_sha256,'hex') from vis.evidence where prompt_id='p02'" | tr -d '[:space:]')"
want2="$(printf '%s' 'texte-2' | shasum -a 256 | awk '{print $1}')"
[ "$got2" = "$want2" ] || { echo "FAIL: trigger n'a pas écrasé raw_sha256."; exit 1; }
echo "  OK trigger écrase raw_sha256 côté serveur"

echo "## test 3 — UPDATE refusée"
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
update vis.evidence set raw_text = 'corrompu' where prompt_id = 'p01';
commit;
SQL
then
  echo "FAIL: UPDATE sur vis.evidence a réussi"; exit 1
fi
echo "  OK UPDATE rejetée"

echo "## test 4 — DELETE refusée"
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
delete from vis.evidence where prompt_id = 'p01';
commit;
SQL
then
  echo "FAIL: DELETE sur vis.evidence a réussi"; exit 1
fi
echo "  OK DELETE rejetée"

echo "## test 5 — RLS : B ne voit pas A, et ne peut pas insérer pour A"
insert_evidence 'fictive-b' 'fictive-b' 'b-subj' 'b-win-j0' '[donnée fictive] réponse B' 'p01'
visible_b="$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q <<'SQL' | awk 'NF' | tail -1
begin;
set local vis.test_user_id = 'u-b-owner';
select count(*) from vis.evidence;
commit;
SQL
)"
[ "$visible_b" = "1" ] || { echo "FAIL: client B voit $visible_b lignes au lieu de 1"; exit 1; }
echo "  OK client B voit seulement ses lignes ($visible_b)"

if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-b-owner';
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language,
                          engine, collector_name, raw_text)
  values ('fictive-a','a-subj','a-win-j0','p-cross',1,'fr','chatgpt','oia-direct','intrusion');
commit;
SQL
then
  echo "FAIL: client B a pu insérer une ligne pour le client A"; exit 1
fi
echo "  OK client B ne peut pas poser une ligne pour A"

echo "## test 6 — vis.recommendation est append-only"
docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local vis.test_user_id = 'u-a-owner';
insert into vis.recommendation (id, client_id, subject_id, type, title, statement,
  impact_level, effort_level, risk, confidence, created_by, payload)
  values ('rec-fictive-1','fictive-a','a-subj','TECH_FIX','robots','manquante',
          'medium','XS','low','high','seo-command-technique','{"fictive":true}'::jsonb);
commit;
SQL
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
update vis.recommendation set title = 'edited' where id = 'rec-fictive-1';
commit;
SQL
then
  echo "FAIL: UPDATE sur vis.recommendation a réussi"; exit 1
fi
echo "  OK UPDATE rejetée sur vis.recommendation"

echo "## test 7 — vis.decision et vis.execution sont append-only, RLS tenue"
docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local vis.test_user_id = 'u-a-owner';
insert into vis.decision (recommendation_id, status, decided_by, client_id)
  values ('rec-fictive-1','accepted','mt','fictive-a');
insert into vis.execution (recommendation_id, client_id, kind, ref)
  values ('rec-fictive-1','fictive-a','pr-opened','https://github.test/fictive/html/pull/1');
commit;
SQL
# Client B ne voit ni la recommandation ni la décision de A.
seen=$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q <<'SQL' | awk 'NF' | tail -1
begin;
set local vis.test_user_id = 'u-b-owner';
select (select count(*) from vis.recommendation) + (select count(*) from vis.decision);
commit;
SQL
)
[ "$seen" = "0" ] || { echo "FAIL: client B voit $seen lignes de recommendation+decision"; exit 1; }
echo "  OK client B isolé sur recommendation + decision + execution"

echo "## test 8 — vis.action_log append-only et scope par client"
docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
set local vis.test_user_id = 'u-a-owner';
insert into vis.action_log (who, what, client_id, mission_id, details)
  values ('seo-command-orchestrator','mission.start','fictive-a','msn-fictive-1','{}');
commit;
SQL
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
update vis.action_log set what = 'edited';
commit;
SQL
then
  echo "FAIL: UPDATE sur vis.action_log a réussi"; exit 1
fi
echo "  OK action_log append-only + RLS"

echo "## test 9 — vis.client_summary (security definer) ne fuit pas entre clients"
# Autorise app à appeler la fonction (sinon elle ne peut pas).
$PSQLL -c "grant execute on function vis.client_summary(text) to oia_vis_app" >/dev/null
# Client A appelle avec son id : OK
out_a=$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q <<'SQL' | awk 'NF' | tail -1
begin;
set local vis.test_user_id = 'u-a-owner';
select (vis.client_summary('fictive-a'))->>'evidence_count';
commit;
SQL
)
[ "$out_a" = "1" ] || [ "$out_a" = "2" ] || { echo "FAIL: client A ne lit pas son résumé (got '$out_a')"; exit 1; }
echo "  OK client A lit son résumé ($out_a preuves)"
# Client A appelle avec un target différent : REFUSÉ par la fonction.
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
select vis.client_summary('fictive-b');
commit;
SQL
then
  echo "FAIL: vis.client_summary a répondu pour un autre client"; exit 1
fi
echo "  OK client A ne peut PAS lire le résumé de B via la fonction security definer"

echo "## test 10 — S1 : user de A qui force vis.client_id=B n'obtient RIEN (auth.uid())"
# Les anciennes policies lisaient `vis.current_client_id()`. Les nouvelles
# (0004) lisent `auth.uid()` + vis.client_member. Même si un utilisateur
# positionne vis.client_id à autre chose, la lecture est vide.
$PSQLL <<'SQL' >/dev/null
-- Memberships already seeded in seed_data; no-op here but keeps the test readable.
insert into vis.client_member (user_id, client_id, role) values
  ('u-a-owner','fictive-a','owner'),
  ('u-b-owner','fictive-b','owner')
on conflict do nothing;
SQL
cross_read=$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q -c "begin; set local vis.test_user_id = 'u-a-owner'; set local vis.client_id = 'fictive-b'; select count(*) from vis.evidence where client_id = 'fictive-b'; commit;" | awk 'NF' | tail -1)
[ "$cross_read" = "0" ] || { echo "FAIL S1: u-a-owner lit $cross_read ligne(s) du client B en forçant vis.client_id"; exit 1; }
echo "  OK S1 : forcer vis.client_id ne contourne plus la RLS (auth.uid())"

echo "## test 11 — S2 : identité de service NE peut PAS valider"
# On enregistre `agent-seo` comme identité de service. On pose une
# recommandation pour A (en tant que propriétaire u-a-owner), puis on
# tente de la valider sous l'identité agent-seo : refus.
$PSQLL <<'SQL' >/dev/null
insert into vis.service_identity (user_id, name) values ('agent-seo','SEO Command agent')
on conflict do nothing;
SQL
# Permet à l'app d'appeler les fonctions security definer (déjà grant en 0004)
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'agent-seo';
select vis.validate_recommendation('rec-fictive-1', 'tentative agent');
commit;
SQL
then
  echo "FAIL S2: l'identité de service a pu valider une recommandation"; exit 1
fi
echo "  OK S2 : identité de service refusée par validate_recommendation"

echo "## test 12 — S2 : humanId forgé par l'appelant ne passe pas"
# Un client qui essaie de passer son humanId directement dans la table
# vis.decision est refusé par la nouvelle RLS (fallait être membre du
# client ET rôle owner/approver ; l'app est connectée via oia_vis_app
# sans auth.uid() posé → refusée).
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
-- auth.uid() non posé, donc aucune ligne de vis.client_member matche.
insert into vis.decision (recommendation_id, status, decided_by, client_id)
  values ('rec-fictive-1','accepted','u-forgé','fictive-a');
commit;
SQL
then
  echo "FAIL S2 : insert direct dans vis.decision avec humanId forgé a réussi"; exit 1
fi
echo "  OK S2 : insert direct avec humanId forgé refusé par la RLS"

echo "## test 13 — S3 : TRUNCATE refusé au rôle applicatif"
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -c "truncate table vis.evidence" >/dev/null 2>&1
then
  echo "FAIL S3: oia_vis_app a pu TRUNCATE vis.evidence"; exit 1
fi
echo "  OK S3 : TRUNCATE refusé"

echo "## test 13bis — S3 : ALTER TABLE refusé"
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -c "alter table vis.evidence add column fictive text" >/dev/null 2>&1
then
  echo "FAIL S3: oia_vis_app a pu ALTER TABLE"; exit 1
fi
echo "  OK S3 : ALTER TABLE refusé"

echo "## test 13ter — S3 : DISABLE TRIGGER refusé"
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -c "alter table vis.evidence disable trigger evidence_block_update" >/dev/null 2>&1
then
  echo "FAIL S3: oia_vis_app a pu DISABLE TRIGGER"; exit 1
fi
echo "  OK S3 : DISABLE TRIGGER refusé"

echo "## test 14 — S3 : lecture de vis.client limitée aux clients du membre"
# u-a-owner voit fictive-a seulement ; u-b-owner voit fictive-b seulement.
visible_a=$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q <<'SQL' | awk 'NF' | tail -1
begin;
set local vis.test_user_id = 'u-a-owner';
select count(*) from vis.client;
commit;
SQL
)
[ "$visible_a" = "1" ] || { echo "FAIL S3: u-a-owner voit $visible_a client(s) dans vis.client, attendu 1"; exit 1; }
visible_u_anon=$(docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
  psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 -tA -q <<'SQL' | awk 'NF' | tail -1
begin;
-- Pas de vis.test_user_id posé : auth.uid() renvoie NULL → aucune ligne.
select count(*) from vis.client;
commit;
SQL
)
[ "$visible_u_anon" = "0" ] || { echo "FAIL S3: sans auth.uid(), vis.client renvoie $visible_u_anon lignes, attendu 0"; exit 1; }
echo "  OK S3 : vis.client sous RLS, 1 ligne pour u-a-owner et 0 sans auth.uid()"

echo "## test 15 — S4 : FK composite refuse une référence croisée de client"
# Insert evidence pointant vers un subject qui appartient à un AUTRE client
# (subject_id de A, client_id = B). Doit échouer sur
# evidence_subject_belongs_to_client.
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-b-owner';
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language,
                          engine, collector_name, raw_text)
  values ('fictive-b','a-subj','b-win-j0','p-cross-fk',1,'fr','chatgpt','oia-direct','intrusion');
commit;
SQL
then
  echo "FAIL S4: la FK composite n'a pas refusé la référence croisée"; exit 1
fi
echo "  OK S4 : FK composite (evidence_subject_belongs_to_client) refuse la référence croisée"

echo "## test 15bis — S4 : subject_site refuse site/subject de clients différents"
# Tente d'attacher un subject du client A à un site du client B : refusé.
if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.test_user_id = 'u-a-owner';
-- subject_site.client_id doit matcher subject.client_id ET site.client_id.
insert into vis.subject_site (subject_id, site_id, client_id) values ('a-subj','b-site-1','fictive-a');
commit;
SQL
then
  echo "FAIL S4: subject_site a laissé croiser site d'un autre client"; exit 1
fi
echo "  OK S4 : subject_site refuse site d'un autre client"

echo "## tous les tests passent"

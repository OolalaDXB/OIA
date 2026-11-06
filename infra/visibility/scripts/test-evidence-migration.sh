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
MIG="$(cd "$(dirname "$0")/.." && pwd)/migrations/0001_evidence.sql"
[ -f "$MIG" ] || { echo "migration introuvable : $MIG" >&2; exit 2; }

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

echo "## applying migration"
$PSQLL < "$MIG" >/dev/null

# Rôle app : simule un service qui ne doit jamais contourner la RLS.
$PSQLL <<'SQL' >/dev/null
create role oia_vis_app login password 'app-pass' nobypassrls;
grant usage on schema vis to oia_vis_app;
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
insert into vis.subject_site values ('a-subj','a-site-1'),('b-subj','b-site-1');
insert into vis.window (id, subject_id, kind, panel_version, status) values
  ('a-win-j0','a-subj','baseline',1,'planned'),
  ('b-win-j0','b-subj','baseline',1,'planned');
SQL
}
seed_data

insert_evidence() {
  local scope="$1" cid="$2" sid="$3" wid="$4" pid="$6" prompt="$5"
  pid="${pid:-p01}"
  docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
    psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<SQL >/dev/null
begin;
set local vis.client_id = '$scope';
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
set local vis.client_id = 'fictive-a';
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
set local vis.client_id = 'fictive-a';
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
set local vis.client_id = 'fictive-a';
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
set local vis.client_id = 'fictive-b';
select count(*) from vis.evidence;
commit;
SQL
)"
[ "$visible_b" = "1" ] || { echo "FAIL: client B voit $visible_b lignes au lieu de 1"; exit 1; }
echo "  OK client B voit seulement ses lignes ($visible_b)"

if docker exec -i -e PGPASSWORD=app-pass "$CONTAINER" \
     psql -U oia_vis_app -d visdb -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
begin;
set local vis.client_id = 'fictive-b';
insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language,
                          engine, collector_name, raw_text)
  values ('fictive-a','a-subj','a-win-j0','p-cross',1,'fr','chatgpt','oia-direct','intrusion');
commit;
SQL
then
  echo "FAIL: client B a pu insérer une ligne pour le client A"; exit 1
fi
echo "  OK client B ne peut pas poser une ligne pour A"

echo "## tous les tests passent"

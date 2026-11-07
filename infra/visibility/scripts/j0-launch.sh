#!/usr/bin/env bash
# Lancement d'une fenêtre de mesure (J0) dans Elmo, en une commande, APRÈS que
# Mickaël a créé son compte dans l'interface d'Elmo (http://localhost:1515).
#
#   ./scripts/j0-launch.sh <subjectId> --dry-run   contrôles seuls (GO / NO-GO), rien n'est écrit
#   ./scripts/j0-launch.sh <subjectId>             contrôles, puis lancement
#
# Étapes du lancement :
#   1. contrôles (clés posées, cibles = moteurs du sujet et grille de prix,
#      un seul compte et une seule organisation dans Elmo, marque absente,
#      worker arrêté) ; au premier NO-GO, arrêt sans rien écrire ;
#   2. clé admin temporaire (ADMIN_API_KEYS) ajoutée à elmo/.env, web relancé ;
#   3. SCRAPE_TARGETS posé dans elmo/.env (s'il ne l'est pas déjà : l'interface
#      d'Elmo l'exige pour afficher l'inscription ; une valeur déjà posée doit
#      être identique aux cibles du lancement) ;
#   4. marque, concurrents et questions actives créés par POST /api/v1/brands
#      dans l'organisation du compte (aucun appel LLM côté Elmo) ;
#   5. clé admin retirée de elmo/.env, web relancé ;
#   6. worker démarré, Mac maintenu éveillé (caffeinate), cost-guard.sh --watch
#      en arrière-plan, début de fenêtre noté dans measurement.yaml.
#
# N'affiche ni ne journalise aucune valeur de elmo/.env. La clé admin ne passe
# jamais en argument de commande (curl la lit sur stdin).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

subject="${1:-}"; mode="${2:-}"
[ -n "$subject" ] || { echo "usage: j0-launch.sh <subjectId> [--dry-run]" >&2; exit 2; }
window="${OIA_VIS_WINDOW:-j0}"
targets="${OIA_VIS_J0_TARGETS:-chatgpt:openai-api:gpt-6-luna:online,claude:anthropic-api:claude-sonnet-5-5:online,mistral:mistral-api:mistral-large-4:online,gemini:openrouter:google/gemini-3-flash-preview:online,perplexity:openrouter:perplexity/sonar:online}"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data/$window"
port=1515
base="http://127.0.0.1:$port"

nogo() { echo "NO-GO : $*" >&2; exit 1; }
ok() { echo "ok    $*"; }
# Vrai si la variable est présente et non vide ; n'imprime jamais la valeur.
filled() { awk -F= -v k="$1" '$1==k{f=1; v=substr($0,length(k)+2); r=(length(v)>0)} END{exit (f && r) ? 0 : 1}' "$ELMO_ENV_FILE"; }
present() { awk -F= -v k="$1" '$1==k{f=1} END{exit f ? 0 : 1}' "$ELMO_ENV_FILE"; }
sql() { elmo_dc exec -T postgres psql -U elmo -d elmo -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
# Remplace (ou retire, si $2 est vide et $3 = remove) une ligne KEY= de .env, sans l'afficher.
set_env_line() { # key value|"" [remove]
  local tmp; tmp="$(mktemp "$ELMO_ENV_FILE.XXXXXX")"
  awk -F= -v k="$1" -v v="$2" -v rm="${3:-}" '
    $1==k { if (rm!="remove") print k "=" v; done=1; next } { print }
    END { if (!done && rm!="remove") print k "=" v }' "$ELMO_ENV_FILE" > "$tmp"
  chmod 600 "$tmp"; mv "$tmp" "$ELMO_ENV_FILE"
}
wait_web() {
  local i
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$base/api/v1/openapi.json")" = 200 ] && return 0
    sleep 2
  done
  return 1
}

echo "# Lancement $window · $subject · $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- 1. Contrôles ------------------------------------------------------------
require_env "$ELMO_ENV_FILE"
for k in OPENAI_API_KEY ANTHROPIC_API_KEY MISTRAL_API_KEY OPENROUTER_API_KEY TYPESAFE_API_KEY \
         ELMO_POSTGRES_PASSWORD ELMO_ENCRYPTION_KEY BETTER_AUTH_SECRET; do
  filled "$k" || nogo "$k vide ou absente dans elmo/.env"
done
ok "clés posées dans elmo/.env (valeurs non lues)"
present ADMIN_API_KEYS && nogo "ADMIN_API_KEYS déjà présente dans elmo/.env : la retirer à la main avant de relancer"
"$tsx" "$VIS_ROOT/src/elmo-load.ts" check-targets "$subject" "$targets" || nogo "cibles incompatibles avec le sujet ou la grille de prix"
ok "cibles = moteurs du sujet, toutes dans la grille de prix, recherche web partout"
# L'interface d'Elmo refuse de s'afficher sans SCRAPE_TARGETS (« Missing environment
# configuration »), y compris la page d'inscription : il peut donc être déjà posé.
# Accepté seulement s'il est identique aux cibles du lancement.
targets_preset=""
if filled SCRAPE_TARGETS; then
  current="$(awk -F= '$1=="SCRAPE_TARGETS"{print substr($0,16); exit}' "$ELMO_ENV_FILE")"
  [ "$current" = "$targets" ] || nogo "SCRAPE_TARGETS déjà posé dans elmo/.env, mais différent des cibles du lancement : le corriger avant de relancer"
  targets_preset=1
  ok "SCRAPE_TARGETS déjà posé, identique aux cibles du lancement"
fi

[ "$(elmo_dc ps --status running -q postgres 2>/dev/null | wc -l | tr -d ' ')" = 1 ] || nogo "Postgres d'Elmo arrêté : docker compose ... up -d postgres db-migrate web"
[ "$(elmo_dc ps --status running -q web 2>/dev/null | wc -l | tr -d ' ')" = 1 ] || nogo "web d'Elmo arrêté : docker compose ... up -d postgres db-migrate web"
[ "$(elmo_dc ps --status running -q worker 2>/dev/null | wc -l | tr -d ' ')" = 0 ] || nogo "le worker tourne déjà"
wait_web || nogo "l'API d'Elmo ne répond pas sur $base"
ok "Postgres et web d'Elmo en marche, worker arrêté"

users="$(sql 'select count(*) from "user"')"; orgs="$(sql 'select count(*) from organization')"
[ "$users" = 0 ] && nogo "aucun compte dans Elmo : créer le compte sur $base/auth/register (voir reports/a-faire-au-retour.md)"
[ "$users" = 1 ] || nogo "$users comptes dans Elmo : un seul attendu"
[ "$orgs" = 1 ] || nogo "$orgs organisations dans Elmo : une seule attendue (celle du compte)"
org_id="$(sql 'select id from organization limit 1')"
[ -n "$org_id" ] || nogo "organisation illisible"
brand_id="$("$tsx" "$VIS_ROOT/src/elmo-load.ts" body "$subject" "$org_id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id))')"
[ "$(sql "select count(*) from brands where id = '$brand_id'")" = 0 ] || nogo "la marque $brand_id existe déjà dans Elmo"
ok "un compte, une organisation, marque $brand_id absente"

if [ "$mode" = "--dry-run" ]; then
  echo "GO (à blanc : rien n'a été écrit)"
  exit 0
fi

# ---- 2. Clé admin temporaire ----------------------------------------------------
cleanup_key() {
  if present ADMIN_API_KEYS; then
    set_env_line ADMIN_API_KEYS "" remove
    elmo_dc up -d --no-deps --force-recreate web >/dev/null 2>&1 || true
    echo "clé admin temporaire retirée de elmo/.env" >&2
  fi
}
trap cleanup_key EXIT
key="$(openssl rand -hex 32)"
set_env_line ADMIN_API_KEYS "$key"
# ---- 3. Cibles -------------------------------------------------------------------
[ -n "$targets_preset" ] || set_env_line SCRAPE_TARGETS "$targets"
elmo_dc up -d --no-deps --force-recreate web >/dev/null 2>&1
wait_web || nogo "web d'Elmo ne repart pas après l'ajout de la clé admin"
ok "SCRAPE_TARGETS posé, clé admin temporaire active"

# ---- 4. Marque, concurrents, questions -------------------------------------------
body="$data/$window/elmo-brand-body.json"
"$tsx" "$VIS_ROOT/src/elmo-load.ts" body "$subject" "$org_id" > "$body"
resp="$data/$window/elmo-brand-response.json"
code="$(printf 'Authorization: Bearer %s\n' "$key" | curl -sS -o "$resp" -w '%{http_code}' -H @- \
  -H 'Content-Type: application/json' --data @"$body" "$base/api/v1/brands")"
unset key
[ "$code" = 201 ] || nogo "POST /api/v1/brands a répondu $code (réponse : $resp) ; worker non démarré"
ok "marque créée (réponse : $resp)"

# ---- 5. Retrait de la clé admin ---------------------------------------------------
cleanup_key; trap - EXIT
wait_web || nogo "web d'Elmo ne repart pas après le retrait de la clé admin"

comp="$(sql "select count(*) from competitors where brand_id = '$brand_id'")"
prom="$(sql "select count(*) from prompts where brand_id = '$brand_id' and enabled")"
ok "dans Elmo : $comp concurrents, $prom questions actives"
[ "$prom" -gt 0 ] || nogo "aucune question active chargée : worker non démarré"

# ---- 6. Démarrage --------------------------------------------------------------------
elmo_dc up -d worker >/dev/null 2>&1
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "$started" > "$data/$window/started-at.txt"
ok "worker démarré à $started"
"$tsx" "$VIS_ROOT/src/elmo-load.ts" start-window "$subject" "$window"
if command -v caffeinate >/dev/null; then
  nohup caffeinate -ims >/dev/null 2>&1 &
  echo $! > "$data/$window/caffeinate.pid"
  ok "Mac maintenu éveillé (caffeinate, pid $(cat "$data/$window/caffeinate.pid"))"
fi
nohup "$VIS_ROOT/scripts/cost-guard.sh" --watch 60 >> "$data/$window/cost-guard.log" 2>&1 &
echo $! > "$data/$window/cost-guard.pid"
ok "cost-guard.sh --watch 60 actif (pid $(cat "$data/$window/cost-guard.pid"), journal $data/$window/cost-guard.log)"
echo
echo "J0 lancé. Dans 10 à 15 minutes : ./scripts/j0-first-run.sh $subject"

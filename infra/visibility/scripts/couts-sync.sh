#!/usr/bin/env bash
# Dépenses d'IA vers la base OIA (migration 0009), appelée chaque jour par
# j0-watch-day.sh après le garde-fou. Elmo en LECTURE SEULE (session
# default_transaction_read_only=on) ; journal du garde-fou lu sur le disque ;
# rapports de la veille de Money Lookup lus dans l'historique d'origin/main.
# Script SQL de src/couts-sync.ts, appliqué en une transaction. Aucun appel à
# un fournisseur d'IA.
#   ./scripts/couts-sync.sh
# Mot de passe : ~/.oia/supabase.env (OIA_DB_PASSWORD), jamais affiché.
# Tests : OIA_COUTS_SQL=<commande> remplace psql ; OIA_COUTS_ELMO=<fichier json>
# remplace la lecture d'Elmo ; OIA_COUTS_SANS_FETCH=1 saute git fetch.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"
tsx="$VIS_ROOT/node_modules/.bin/tsx"
dir="$data/couts"; mkdir -p "$dir"; chmod 700 "$dir"
racine="$(cd "$VIS_ROOT/../.." && pwd)"

# 1. Elmo : marques, moteurs activés, questions actives, runs du mois et du précédent.
elmo="$dir/elmo.json"
if [ -n "${OIA_COUTS_ELMO:-}" ]; then cp "$OIA_COUTS_ELMO" "$elmo"
else
  elmo_dc exec -T -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
    psql -U elmo -d elmo -tAq -v ON_ERROR_STOP=1 > "$elmo" <<'SQL'
select json_build_object(
  'brands', coalesce((select json_agg(json_build_object('id', b.id, 'enabledModels', coalesce(to_json(b.enabled_models), '[]'::json),
      'promptsEnabled', (select count(*) from prompts p where p.brand_id = b.id and p.enabled))) from brands b), '[]'::json),
  'runs', coalesce((select json_agg(json_build_object('brand', brand_id, 'model', model, 'provider', provider, 'version', version,
      'webSearch', web_search_enabled, 'usage', raw_output->'usage',
      'searchItems', (select count(*) from json_array_elements(case
          when json_typeof(raw_output->'output')='array' then raw_output->'output'
          when json_typeof(raw_output->'outputs')='array' then raw_output->'outputs'
          else '[]'::json end) e
        where e->>'type'='web_search_call' or (e->>'type'='tool.execution' and e->>'name'='web_search')),
      'month', to_char(date_trunc('month', created_at at time zone 'utc'), 'YYYY-MM-DD')))
    from prompt_runs
    where created_at >= (date_trunc('month', now() at time zone 'utc') - interval '1 month') at time zone 'utc'), '[]'::json));
SQL
fi

# 2. Veille de Money Lookup : un rapport par commit de discovery.yml, du mois et du précédent.
[ -n "${OIA_COUTS_SANS_FETCH:-}" ] || git -C "$racine" fetch -q origin main || echo "git fetch impossible : historique local utilisé" >&2
depuis="$(node -e 'const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);process.stdout.write(d.toISOString().slice(0,10))')"
veille="$dir/veille.jsonl"; : > "$veille"
git -C "$racine" log origin/main --since="$depuis" --format='%H %cI' -- outputs/scout/report.md outputs/analyst/report.md | while read -r sha date; do
  for f in outputs/scout/report.md outputs/analyst/report.md; do
    git -C "$racine" show "$sha:$f" 2>/dev/null | "$tsx" "$VIS_ROOT/src/couts-sync.ts" --rapport "$date" >> "$veille" || true
  done
done

# 3. Entrées, script SQL, application.
node -e '
  const fs = require("fs");
  const [elmo, journal, veille, out] = process.argv.slice(1);
  // Deux rapports par commit (scout, analyste) : sommés sous la date du commit.
  const parDate = new Map();
  for (const l of fs.readFileSync(veille, "utf8").split("\n").filter(Boolean)) {
    const v = JSON.parse(l), a = parDate.get(v.date) ?? { date: v.date, appels: 0, jetonsEntree: 0, jetonsSortie: 0 };
    a.appels += v.appels; a.jetonsEntree += v.jetonsEntree; a.jetonsSortie += v.jetonsSortie; parDate.set(v.date, a);
  }
  fs.writeFileSync(out, JSON.stringify({ now: new Date().toISOString(), journal: fs.existsSync(journal) ? fs.readFileSync(journal, "utf8") : "", elmo: JSON.parse(fs.readFileSync(elmo, "utf8")), veille: [...parDate.values()] }));
' "$elmo" "$data/cost-journal.csv" "$veille" "$dir/entrees.json"
"$tsx" "$VIS_ROOT/src/couts-sync.ts" "$dir/entrees.json" > "$dir/couts.sql"

appliquer() {
  if [ -n "${OIA_COUTS_SQL:-}" ]; then $OIA_COUTS_SQL; return; fi
  local mdp
  mdp="$(sed -n 's/^OIA_DB_PASSWORD=//p' "$HOME/.oia/supabase.env" | sed -e "s/^['\"]//" -e "s/['\"]$//")"
  [ -n "$mdp" ] || { echo "mot de passe de la base OIA absent" >&2; return 1; }
  PGPASSWORD="$mdp" PGSSLMODE=require psql -X -q -At -v ON_ERROR_STOP=1 \
    -h "${OIA_DB_HOST:-aws-0-eu-central-1.pooler.supabase.com}" -p 5432 -U "postgres.iywmvyebuikxyvnrcnoy" -d postgres
}
{ echo 'set client_min_messages = warning;'; cat "$dir/couts.sql"; } | appliquer
echo "dépenses d'IA : $(head -1 "$dir/couts.sql" | sed 's/^-- //')"

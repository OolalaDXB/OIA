#!/usr/bin/env bash
# Vérifie la configuration à zéro coût d'Elmo, par UN appel par fournisseur.
# À lancer sur le Mac, après avoir saisi les clés gratuites dans elmo/.env, AVANT
# de démarrer le worker. N'affiche ni ne journalise aucune clé.
#
#   ./scripts/zero-cost-check.sh                    contrôles + 1 appel Gemini (avec recherche) + 1 appel Mistral (sans recherche)
#   ./scripts/zero-cost-check.sh --mistral-search   + 1 appel Mistral AVEC recherche web (pour savoir si l'offre gratuite l'accepte)
#
# Sans carte bancaire ni crédit, aucun appel ne peut être facturé : un refus
# (401, 402, 403, 429) est un résultat, pas un incident.
# Résultat : $OIA_VIS_DATA/zero-cost-check-<UTC>.txt (défaut ~/oia-visibility-data).
set -uo pipefail
source "$(dirname "$0")/lib.sh"
require_env "$ELMO_ENV_FILE"
envval() { awk -F= -v k="$1" '$1==k{sub(/^[^=]*=/,""); print; exit}' "$ELMO_ENV_FILE"; }
data="${OIA_VIS_DATA:-$HOME/oia-visibility-data}"; mkdir -p "$data"
out="$data/zero-cost-check-$(date -u +%Y%m%dT%H%M%SZ).txt"
GEMINI_MODEL="${GEMINI_TEST_MODEL:-google/gemini-2.5-flash}"
MISTRAL_MODEL="${MISTRAL_TEST_MODEL:-mistral-medium-latest}"
QUESTION="In one sentence, which city is the Eiffel Tower in? Cite one source URL."
fail=0

# JSON helper: node reads stdin and evaluates a small expression on `j` (parsed body).
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch{j=null};try{const v=('"$1"');process.stdout.write(v===undefined||v===null?"—":String(v))}catch{process.stdout.write("—")}})'; }

# POST/GET with the key read from stdin (never on the command line). Prints "<http code>\n<body>".
call() { # key method url [json-body]
  local key="$1" method="$2" url="$3" body="${4:-}"
  if [ -n "$body" ]; then
    printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$key" |
      curl -sS -m 90 -X "$method" -H @- -d "$body" -w '\n%{http_code}' "$url" 2>/dev/null
  else
    printf 'Authorization: Bearer %s\n' "$key" | curl -sS -m 30 -H @- -w '\n%{http_code}' "$url" 2>/dev/null
  fi
}
split() {
  body="$(printf '%s' "$1" | sed '$d')"; code="$(printf '%s' "$1" | tail -n1)"
  [ "$code" = 000 ] && code="000 (connexion impossible : réseau ou DNS)"
  return 0
}

exec > >(tee "$out") 2>&1
echo "# Vérification zéro coût — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "## 1. Garde-fous de configuration"
jev="$(envval TYPESAFE_API_KEY)"
if [ "$jev" = "stub" ]; then echo "OK   Jev en mode stub (aucun appel réseau)"
elif [ -n "$jev" ]; then echo "INFO TYPESAFE_API_KEY réelle : Jev complet (vérifier que le compte n'a pas de carte)"
else echo "ÉCHEC TYPESAFE_API_KEY vide : avec OPENROUTER_API_KEY, Jev passerait par OpenRouter (payant)"; fail=1; fi
for k in BRIGHTDATA_API_TOKEN OXYLABS_USERNAME CLORO_API_KEY SEARCHAPI_API_KEY OLOSTEP_API_KEY DATAFORSEO_LOGIN; do
  [ -z "$(envval $k)" ] || { echo "ÉCHEC $k renseignée : prestataire de scraping interdit"; fail=1; }
done
for k in OPENAI_API_KEY ANTHROPIC_API_KEY; do
  [ -z "$(envval $k)" ] && echo "OK   $k vide (pas d'appel API, saisie manuelle)" || echo "ATTENTION $k renseignée : appels payants possibles"
done
targets="$(envval SCRAPE_TARGETS)"
echo "INFO SCRAPE_TARGETS ${targets:-<vide : le worker ne démarrera pas>}"
for t in ${targets//,/ }; do
  case "$t" in
    *:openai-api:*|*:anthropic-api:*|perplexity:*) echo "ATTENTION cible payante dans SCRAPE_TARGETS : $t" ;;
    mistral:*:online) echo "ATTENTION Mistral avec recherche web (payante a priori) : $t" ;;
  esac
done

echo "## 2. OpenRouter (Gemini en BYOK)"
ork="$(envval OPENROUTER_API_KEY)"
if [ -z "$ork" ]; then echo "SAUTÉ OPENROUTER_API_KEY vide"; else
  split "$(call "$ork" GET https://openrouter.ai/api/v1/key)"
  echo "GET /key : HTTP $code · niveau gratuit $(printf '%s' "$body" | jget 'j.data.is_free_tier') · limite $(printf '%s' "$body" | jget 'j.data.limit') · consommé $(printf '%s' "$body" | jget 'j.data.usage')"
  req="$(node -e 'console.log(JSON.stringify({model:process.argv[1]+":online",max_tokens:200,usage:{include:true},messages:[{role:"user",content:process.argv[2]}]}))' "$GEMINI_MODEL" "$QUESTION")"
  split "$(call "$ork" POST https://openrouter.ai/api/v1/chat/completions "$req")"
  echo "Gemini avec recherche ($GEMINI_MODEL:online) : HTTP $code · fournisseur $(printf '%s' "$body" | jget 'j.provider') · URL citées $(printf '%s' "$body" | jget '(j.choices[0].message.annotations||[]).filter(a=>a.type==="url_citation").length') · coût OpenRouter $(printf '%s' "$body" | jget 'j.usage.cost') · BYOK $(printf '%s' "$body" | jget 'j.usage.is_byok')"
  [ "$code" = 200 ] || echo "  détail : $(printf '%s' "$body" | jget 'j.error.message' | cut -c1-200)"
  if [ "$code" != 200 ]; then
    req="$(node -e 'console.log(JSON.stringify({model:process.argv[1],max_tokens:100,usage:{include:true},messages:[{role:"user",content:process.argv[2]}]}))' "$GEMINI_MODEL" "$QUESTION")"
    split "$(call "$ork" POST https://openrouter.ai/api/v1/chat/completions "$req")"
    echo "Gemini sans recherche ($GEMINI_MODEL) : HTTP $code · coût OpenRouter $(printf '%s' "$body" | jget 'j.usage.cost') · BYOK $(printf '%s' "$body" | jget 'j.usage.is_byok')"
    [ "$code" = 200 ] || echo "  détail : $(printf '%s' "$body" | jget 'j.error.message' | cut -c1-200)"
  fi
fi

echo "## 3. Mistral (offre gratuite)"
mk="$(envval MISTRAL_API_KEY)"
if [ -z "$mk" ]; then echo "SAUTÉ MISTRAL_API_KEY vide"; else
  req="$(node -e 'console.log(JSON.stringify({model:process.argv[1],max_tokens:100,messages:[{role:"user",content:process.argv[2]}]}))' "$MISTRAL_MODEL" "$QUESTION")"
  split "$(call "$mk" POST https://api.mistral.ai/v1/chat/completions "$req")"
  echo "Mistral sans recherche ($MISTRAL_MODEL) : HTTP $code · modèle servi $(printf '%s' "$body" | jget 'j.model') · tokens $(printf '%s' "$body" | jget 'j.usage.total_tokens')"
  [ "$code" = 200 ] || echo "  détail : $(printf '%s' "$body" | cut -c1-200)"
  if [ "${1:-}" = "--mistral-search" ]; then
    req="$(node -e 'console.log(JSON.stringify({model:process.argv[1],inputs:process.argv[2],tools:[{type:"web_search"}],completion_args:{max_tokens:200}}))' "$MISTRAL_MODEL" "$QUESTION")"
    split "$(call "$mk" POST https://api.mistral.ai/v1/conversations "$req")"
    echo "Mistral AVEC recherche (Conversations + web_search) : HTTP $code · sources $(printf '%s' "$body" | jget '(j.outputs||[]).flatMap(o=>Array.isArray(o.content)?o.content:[]).filter(c=>c.type==="tool_reference").length')"
    [ "$code" = 200 ] || echo "  détail : $(printf '%s' "$body" | cut -c1-200)"
    echo "  -> si HTTP 200 : vérifier dans la console Mistral (Usage) que l'appel de recherche n'est pas facturé."
  else
    echo "INFO recherche web Mistral non testée (option --mistral-search)"
  fi
fi

echo "## 4. Jev"
echo "INFO aucun appel : en mode stub, Jev ne sort pas du Mac."
[ $fail = 0 ] && echo "## Résultat : garde-fous OK" || echo "## Résultat : ÉCHEC d'au moins un garde-fou"
echo "-> $out"
exit $fail

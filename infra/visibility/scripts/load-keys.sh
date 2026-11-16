# Chargement du fichier de clés d'OIA Visibility (mandat v14), sourcé par collect-day.sh.
#   load_keys_file <fichier>
# Le fichier n'est chargé que s'il existe ; il doit être en droits 600 et ne contenir que des
# lignes NOM=valeur (lignes vides admises), avec un nom de la liste VIS_KEY_NAMES. Tout autre
# contenu est refusé, sans rien exporter. La valeur est prise telle quelle (une paire de
# guillemets englobante est retirée) ; le fichier n'est jamais exécuté (pas de `source`), et
# aucune valeur n'est jamais affichée : un message d'erreur ne cite que le numéro de ligne.
# Les valeurs sont exportées au seul processus qui source ce fichier (et à ses enfants).
VIS_KEY_NAMES="OPENAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY MISTRAL_API_KEY TYPESAFE_API_KEY XAI_API_KEY GEMINI_API_KEY PERPLEXITY_API_KEY OIA_VIS_MONTHLY_CAP_USD OIA_VIS_MONTHLY_ALERT_USD"

load_keys_file() {
  local file="$1" mode n=0 line name value names=() values=()
  [ -e "$file" ] || return 0
  [ -f "$file" ] || { echo "fichier de clés $file : pas un fichier ordinaire, refusé" >&2; return 1; }
  mode="$(stat -f %Lp "$file" 2>/dev/null || stat -c %a "$file")"
  [ "$mode" = 600 ] || { echo "fichier de clés $file : droits $mode, 600 exigés (chmod 600), refusé" >&2; return 1; }
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    [ -z "$line" ] && continue
    if [[ ! "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
      echo "fichier de clés $file, ligne $n : NOM=valeur attendu, refusé" >&2; return 1
    fi
    name="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    case " $VIS_KEY_NAMES " in *" $name "*) ;; *) echo "fichier de clés $file, ligne $n : nom $name inconnu, refusé" >&2; return 1;; esac
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    names+=("$name"); values+=("$value")
  done < "$file"
  # Tout le fichier est valide : alors seulement, on exporte.
  local i=0
  while [ "$i" -lt "${#names[@]}" ]; do export "${names[$i]}=${values[$i]}"; i=$((i + 1)); done
  return 0
}

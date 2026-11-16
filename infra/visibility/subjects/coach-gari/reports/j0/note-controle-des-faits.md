# Note sur le rapport J0 · limite du contrôle des faits

Note du 2026-11-16, à lire avec `rapport-j0.md`. Le rapport J0 n'est pas réécrit (ses chiffres et son empreinte restent ceux vérifiés par `vis:j0-verify`).

La première passe déterministe compte un fait « cité » dès qu'un de ses mots-clés apparaît dans une réponse (`src/fact-check.ts`, mots-clés de `fact-keywords.yaml`), sans vérifier que la phrase parle bien de Coach Gari.

- Le fait « Coach Gari est coach sportif et préparateur physique » a pour mots-clés `personal trainer`, `fitness coach`, `strength coach` et `coach`. Le mot `coach` figure dans presque toute réponse du panel : d'où « cité » 47/47.
- Les 47 réponses contrôlées sont celles qui contiennent un alias de la marque, y compris des réponses sur un homonyme (Gari Harvey, Gari McIntyre chez ChatGPT, voir les réponses citées dans `~/oia-visibility-data/j0/constats/`). Un fait « cité » peut donc l'être à propos d'une autre personne.
- Même limite, à un degré moindre, pour `Dubai` et `padel`, mots fréquents dans les réponses quel que soit le coach décrit.

Lecture à retenir : la colonne « Cité » du rapport J0 est un plafond, pas une mesure de l'exactitude. Seuls les faits à mot-clé discriminant (adresses des profils officiels) se lisent tels quels : Instagram 1/47, TikTok 0/47, myOolala 0/47.

Correction envisagée pour les fenêtres suivantes, à décider par Mickaël : mots-clés discriminants seulement (retirer `coach` seul), contrôle limité à la phrase qui nomme la marque, et seconde passe par un modèle (payante, désactivée).

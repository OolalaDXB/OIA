# Visibility, qualité du contenu et dépôt GitHub

## Écrans

- **Agir › Qualité du contenu** (`/visibility/contenu`) : trois jauges Technique, Fonctionnel et Commercial, date, dépôt, commit court et nombre de fichiers lus. Une note `null` reste « Non mesuré ».
- Grille des critères par axe avec valeur, source page/dépôt/IA, état conforme, à corriger, non mesuré ou non vérifiable. Chaque dépli expose les pages, fichiers ou la citation exacte disponible. Une IA sans citation est « non vérifiable ».
- Synthèse, constats `source = contenu` ouverts triés par gravité et lien vers **À corriger**. Les catégories `fonctionnel` et `commercial` ont un libellé et une couleur distincts, également dans À corriger.
- Alerte rouge si `depot_lu.sensibles > 0`, sans afficher le contenu des fichiers sensibles.
- **Lancer la note du contenu** : estimation, budget restant, double confirmation, erreurs de la base verbatim et suivi QUEUED/RUNNING toutes les 30 secondes.
- **Réglages › Site › Dépôt GitHub** : liaison `proprietaire/nom` ou adresse GitHub, branche facultative et déliaison. Le texte de lecture seule et de protection des secrets est visible.

## Contrat utilisé

Lectures avec la session utilisateur, ajoutées à la source Visibility v3 :

- `vis_depots_v3`
- `vis_note_contenu_estimation_v3`
- `vis_notes_contenu_v3`
- `vis_constats_v3`, déjà lue, filtrée sur `source = contenu`

Gestes exclusifs, sans écriture directe :

- `vis_lancer_note_contenu({ p_subject, p_cout_vu_usd })`, avec exactement le `cout_max_usd` affiché.
- `vis_lier_depot({ p_subject, p_depot, p_branche? })`. La déliaison transmet `p_depot: null`, conformément au contrat, sans modifier les types Supabase générés.

Après confirmation de la base, les vues sont rechargées. Aucun état optimiste, aucune clé de service et aucune modification Supabase.

## Vérifications

- Tests unitaires et composants : trois jauges nulles, commit à sept caractères, critère IA non vérifiable, citation entre guillemets, alerte secrets sans contenu, tri par gravité, blocage sans plafond, coût exact après double confirmation, suivi à 30 secondes, liaison et déliaison avec `null`.
- Parcours navigateur simulé avec session : affichage 82/68/non mesuré, preuves, coût 0,03/0,20 $, appel RPC exact, suivi RUNNING, liaison d’une adresse GitHub avec branche, relecture puis déliaison, ordinateur et mobile sans débordement ni erreur JavaScript.
- Le cas d’un site sans fenêtre et sans recommandations a été corrigé dans l’adaptateur Visibility : la liste vide ne provoque plus d’erreur de rendu.

## Limites de vérification

- Les lectures et les fonctions n’ont pas été exécutées sur la production avec une session réelle. Le parcours navigateur utilise des réponses contractuelles simulées.
- La structure interne libre de `criteres[].preuve` est lue sans HTML : pages, fichiers, citation et texte sont pris en charge lorsque ces clés sont fournies. Une preuve absente reste explicitement non fournie ou non vérifiable.
- Aucune publication et aucun transfert vers le dépôt OIA.

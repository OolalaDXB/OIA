# Application en production du contrat Visibility v2 · 16 novembre 2026

Décision de Mickaël : écritures Supabase faites directement par la session cloud
(connecteur Supabase), sans validation commande par commande.

## Appliqué (projet `iywmvyebuikxyvnrcnoy`)

| Migration (nom en base) | Fichier | Contenu |
| --- | --- | --- |
| `oia_0010_visibility_vues_v2` | `packages/database/supabase/migrations/0010_visibility_vues_v2.sql` | comparaisons, `vis_mesure_v2`, `vis_comparaisons_v2`, `vis_comparaison_moteurs_v2`, `vis_recommandations_v2` |
| `vis_0006_pilotage` | `infra/visibility/migrations/0006_pilotage.sql` | 17 tables du pilotage en ajout seul, RLS ; `window.kind` + `reconnaissance`, `execution.kind` + `url`, `other` |
| `oia_0011_visibility_pilotage_1_aides` à `_4_moteur` | `packages/database/supabase/migrations/0011_visibility_pilotage.sql`, en quatre parties (aides, vues, gestes, moteur) | 12 vues `_v2`, 14 fonctions de geste, 13 fonctions du moteur |

Chaque partie dans sa propre transaction, texte identique au fichier (en-têtes de
commentaires et `begin`/`commit` retirés). Versions en base : horodatage de
l'application (pas celles prévues dans le README).

## Données reprises

- Fenêtre de pilotage `coach-gari-j0` (`reference`, close), ses 5 jours `complet`
  (figures.json : jours 1 à 5, aucun échec).
- `vis.page` : rapport J0 (fr) et page client J0 (en), empreintes SHA-256 identiques aux
  fichiers `subjects/coach-gari/reports/j0/rapport-j0.html` et `page-client.html`.
- `vis_ui.rapport` : rapport J0, statut `a_valider`, chiffres de `figures.json`
  (contrôle : 348 nombres, somme 7909,3378, 76 chaînes identiques).

## Vérifié sous le compte de Mickaël (transaction annulée)

Portefeuille, budget, moteur (« muet », aucun signe de vie), alerte MOTEUR_MUET,
jugements de Jev sur J0 (189 jugées, 26 mentions), sources de 280 réponses, coût
estimé de J0 (22,92 $), `vis_mesure_v2` (2), `vis_recommandations_v2` (3).

## Reste à faire

- **Plafonds** : aucun fixé. Le GO est refusé tant que Mickaël n'a pas fixé le plafond
  global, puis celui du client, dans le cockpit (`vis_fixer_plafond`). Coût réel de
  novembre pour Coach Gari, d'après les preuves : 25,00 $.
- **Étape de Coach Gari** : le portefeuille affiche « à valider » (0 question), car le
  sujet a été mesuré avant le pilotage : pas de panel dans `vis.panel`, pas de
  reconnaissance. À traiter par la session du Mac : reprise du panel v2 validé le
  5 novembre, ou cas « sujet antérieur au pilotage » dans `vis_portefeuille_v2`.
- **Moteur** : à installer sur le Mac (mandat v16, bloc B) ; tant qu'il ne signe pas, le
  cockpit affiche « moteur muet ».
- **Cockpit** : partie 2 du brief Lovable (`docs/interface/brief-lovable-visibility-v2.md`).

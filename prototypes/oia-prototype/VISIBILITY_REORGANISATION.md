# Visibility : réorganisation (accueil des sites, 4 entrées, plan d'action unique)

Aucune modification Supabase. Lectures avec la session, gestes par RPC uniquement.

## Écrans
- `/visibility` sans `?site=` : « Sites analysés », une carte par site (`vis_portefeuille_v2`, `vis_score_v3`, `vis_plan_action_v3`) ; « Ajouter un site » (`vis_demander_site`). `/visibility/sites` redirige ici.
- Site : Vue d'ensemble (`/visibility?site=`), Plan d'action (`/visibility/plan`), Résultats (9 sous-onglets), Études (Audits, Rapports, Activité du moteur). Réglages et SEO Command derrière l'icône en haut à droite. Fil d'Ariane « Visibility › Sites › <site> ».
- Anciennes adresses `opportunites` et `recommandations` : affichent le plan d'action.
- Plan d'action : groupes par horizon, cartes, badges d'origine, filtres `FiltreSelect`, fusion Lighthouse « mobile et ordinateur », compteur.
- Études › Audits : « Ajouter un rapport externe » (.md, .txt, .pdf via `pdfjs-dist` 4.10.38 dans le navigateur, ou texte collé ; 200 à 400 000 caractères) → `vis_importer_rapport_externe` ; carte « Tirer le plan d'action » → `vis_extraire_plan(p_audit_externe, 0.25)`, suivi `vis_demandes_v2` type `EXTRAIRE_PLAN` toutes les 30 s, aussi sur chaque audit externe.
- Activité du moteur : types en clair, `remplacee_par` remplace « Relancer » par « relancée » (lien vers la demande), erreur tronquée à 160 caractères avec dépli.

## Écarts à confirmer
- Valider/Refuser d'une recommandation du plan appelle `vis_valider_recommandation` / `vis_rejeter_recommandation` avec `id` du plan : suppose que `id` = identifiant de la recommandation.
- Preuve d'un constat : recherchée dans `vis_constats_v3` par `origine_ref` puis `id`.
- Tarif `extraction_plan` : aucune vue d'estimation dans le contrat, montants affichés en dur (0,03 $ / 0,25 $).
- Suivi de l'extraction : relie la demande par l'identifiant rendu, ou par l'identifiant de l'audit présent dans `charge`.
- En-tête de groupe écrit « Cette semaine · 6 actions » (point médian au lieu du tiret cadratin, règle de l'interface).

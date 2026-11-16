# Visibility, audit IA express

## Écrans

- La carte « Audit IA express » est présente sur l'accueil Visibility et en tête de l'onglet Audits externes pour le site sélectionné.
- Elle affiche le texte contractuel, le badge Premium, le coût habituel, le coût maximal, le détail par moteur dans une info-bulle, le nombre d'appels et le budget client restant du mois.
- Le lancement exige une première action puis une confirmation portant le montant maximal affiché. Le bouton est désactivé sans session, sans estimation valide, sans plafond client ou global, au plafond dépassé et pendant un audit actif.
- Le lien « Réglages › Budget » conduit aux réglages du site. Les erreurs RPC sont reprises sans réécriture. Le message « estimation changée, recharger » provoque une relecture et demande une nouvelle confirmation.
- Les statuts QUEUED et RUNNING affichent une barre de suivi. La requête Visibility v3 est relue toutes les 30 secondes au premier plan uniquement pendant ces statuts.
- L'échec affiche le texte de la base. Le résultat affiche le coût réel, le score et un lien vers l'audit externe correspondant.
- Lorsque Perplexity Computer et OIA · Audit IA express existent pour le même site, leurs matrices sont présentées côte à côte par sujet, avec l'avertissement « méthodes différentes : comparer les tendances, pas les chiffres ».
- Les recommandations dont `cree_par` vaut `audit-ia-express:<date>` portent le badge « Audit IA express ».

## Lectures et geste

Lectures avec le client Supabase public et la session utilisateur :

- `vis_audit_ia_estimation_v3` ;
- `vis_audits_ia_v3` ;
- `vis_audits_externes_v3` et `vis_audit_externe_lignes_v3` pour le résultat et la comparaison ;
- `vis_recommandations_v2.cree_par` pour le badge de source.

Seul geste ajouté :

```text
vis_lancer_audit_ia({
  p_subject,
  p_cout_vu_usd: estimation.cout_max_usd,
  p_questions: estimation.questions ?? 20
})
```

Aucune écriture directe, aucune clé de service, aucune modification de Supabase et aucun état optimiste. Après le geste, les vues Visibility sont invalidées puis relues.

## Vérifications

- 160 tests réussis dans 29 fichiers.
- Tests ciblés : estimation 3,85 $ et 13,56 $, budget restant, refus sans plafond, double confirmation, paramètres RPC exacts, suivi QUEUED/RUNNING, arrêt du rechargement après DONE, erreur verbatim, sélection des audits à comparer et badge de recommandation.
- Parcours Playwright avec session et réponses contractuelles simulées : accueil, info-bulle au survol et au tactile, double confirmation, coût vu exact, rechargement RUNNING observé après 30 secondes, résultat DONE, coût réel, score et matrices Perplexity/OIA.
- Le lien du résultat ouvre le bon audit et son rapport Markdown. Le badge de recommandation, l'erreur verbatim, les trois blocages de plafond et le deuxième site ont été vérifiés.
- Le lien « Réglages › Budget » ouvre directement l'onglet Budget et conserve le site dans l'adresse.
- Ordinateur 1280 px et mobile 390 px, thèmes clair et sombre disponibles dans les styles : aucune erreur JavaScript ni débordement de page. Les matrices comparées sont compactées pour garder les pastilles visibles sur ordinateur.

## Limites

- Aucun écart fonctionnel connu au contrat 0015.
- La session de production externe n'est pas disponible dans cet environnement. Les lectures, permissions et le lancement réel restent à confirmer en production avec un compte autorisé.
- La démonstration non connectée utilise une estimation fictive signalée par le shell et ne permet aucun lancement.
- Aucune publication ni transfert vers le dépôt OIA.

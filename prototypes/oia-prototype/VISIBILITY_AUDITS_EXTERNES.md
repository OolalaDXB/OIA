# Visibility, audits externes

Date : 16 novembre 2026. Travail limité au dépôt Lovable habituel. Aucune modification Supabase, aucune publication et aucun transfert vers `OolalaDXB/OIA`.

## Écrans

- Nouvel onglet **Visibility > Audits externes**, avec sélecteur de site et états de chargement, vide, erreur avec « Réessayer » et vérification du rôle.
- Une carte par audit : outil, date, nombre de questions et de moteurs, résumé, jauge du score de l'outil et encadré « Méthode et limites ». La jauge externe est plus petite que celle d'OIA et porte explicitement la mention « score de l'outil, méthode différente ».
- Lorsque le score OIA du même site existe, les deux scores sont présentés côte à côte, sans agrégation, avec « méthodes différentes : ne pas comparer les chiffres, comparer les tendances ».
- Matrice question par moteur : étoile verte pour 3, point vert pour 2, demi-point orange pour 1 et croix grise pour 0. Le sujet est visible, la question complète est en info-bulle et chaque case ouvre les concurrents et domaines cités. Les libellés accessibles reprennent le bon score et sa signification.
- Classement des concurrents calculé dans le navigateur : nombre de réponses et nombre de moteurs. Domaines cités classés en barres, comme cibles de fiches.
- Rapport Markdown dans un panneau dépliable, sans HTML brut ni script, avec téléchargement du fichier `.md`.
- Import réservé à `owner` et `approver` : formulaire complet, lecture locale du CSV et du Markdown facultatif, moteurs déduits des colonnes `_score`, aperçu interactif obligatoire avant l'envoi et erreurs de la base reprises telles quelles.
- **Recommandations** : les éléments dont `cree_par` commence par `audit-externe:` affichent un badge avec l'outil et la date, notamment `audit-externe:perplexity-computer:2026-11-16`.

## Vues et fonction appelées

- `vis_audits_externes_v3` : cartes, scores, méthodes, résumés et rapports.
- `vis_audit_externe_lignes_v3` : matrice, concurrents et domaines.
- `vis_score_v3` : seulement pour la présentation côte à côte, jamais pour modifier ou recalculer un score.
- `vis_portefeuille_v2.mon_role` : autorisation de l'import.
- `vis_recommandations_v2.cree_par` : badge de provenance.
- `vis_importer_audit_externe` avec exactement `p_subject`, `p_outil`, `p_realise_le`, `p_methode`, `p_moteurs`, `p_score`, `p_resume`, `p_rapport_md` et `p_matrice`. Après la réponse, les vues Visibility sont invalidées et relues. Aucun état optimiste, aucune écriture directe et aucune clé de service.

## Tests et vérifications

- Suite complète : **149 tests réussis dans 27 fichiers**, typage TypeScript et compilation de la preview réussis.
- Huit tests spécifiques : CSV avec champs entre guillemets et virgules, `—` vide, refus d'un score hors barème, reconstruction de la matrice, K03 et K20 en premier choix Copilot, classement des concurrents, domaines, détail d'une case, Markdown sans script, paramètres RPC exacts et rôles autorisés.
- Parcours Playwright entièrement simulé : Coach Gari, score externe 4, score OIA 58, 20 questions × 3 moteurs, 60 lignes, K03 et K20 Copilot, téléchargement Markdown, aperçu CSV puis appel `vis_importer_audit_externe`, badge de recommandation et mobile 390 × 844 sans débordement de page ni erreur JavaScript.
- Vérification finale depuis la navigation : deux audits distincts pour Coach Gari, un troisième audit sur Atelier Rouge, un site vide, rôles owner, approver et viewer, dix recommandations badgées, erreur de lecture suivie de « Réessayer », erreur RPC reprise mot pour mot, captures de chaque carte sur ordinateur et mobile. Le thème clair est le seul thème de l'application.
- Aucune session Supabase externe de production n'est disponible ici. Les lectures et l'import réels n'ont donc pas été exécutés contre Coach Gari en production.

## Écarts avec le contrat

Aucun écart fonctionnel connu. Les données absentes restent vides ou non mesurables selon le cas. Les audits externes ne sont jamais intégrés au score OIA. La validation des permissions et l'idempotence d'un réimport restent à confirmer sur la base de production avec un compte autorisé.

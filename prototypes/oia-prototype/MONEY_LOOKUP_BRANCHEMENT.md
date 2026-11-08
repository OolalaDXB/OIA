# Branchement Money Lookup, 8 novembre 2026

## Périmètre livré

Le client public Supabase existant est réexporté par `src/lib/supabase.ts`, sans seconde instance ni clé de service. Connexion e-mail/mot de passe aux comptes existants, sans inscription, profil supplémentaire ni modification des paramètres hébergés. Déconnexion dans Réglages : annulation puis effacement du cache privé avant sortie.

Les lectures et mutations sont centralisées dans la couche `src/lib/donnees/money.ts`, qui expose l'adaptateur typé `money-reel.ts`. Elles utilisent la session du navigateur et l'espace du contrat. Aucun serveur Supabase, table, politique, migration ou paramètre d'authentification n'a été modifié.

| Écran | Lectures | Actions existantes |
| --- | --- | --- |
| Aujourd'hui | ml_aujourdhui_v2, ml_clos_depuis_visite_v1, ml_toutes_v2 | oia_marquer_visite une fois par entrée dans le module |
| Toutes et familles | ml_toutes_v2, ml_financements_v2, ml_appels_offres_v2, ml_investisseurs_v2, ml_vues_enregistrees_v1 | oia_enregistrer_vue, oia_supprimer ; exports locaux CSV et Markdown |
| Fiche | ml_fiche_v2, ml_decision_v2, ml_suggestions_v1, ml_rattachement_v1, ml_projets_v1 | oia_decider, oia_etiqueter, oia_noter, oia_modifier_note, oia_creer_tache, oia_basculer_tache, oia_supprimer |
| Signals | ml_signals_v1 | oia_acquitter_alerte |
| Montants | ml_montants_v2, ml_indicateurs_v1, ml_indicateurs_montants_v1, ml_indicateurs_repartition_v1 | Filtres locaux, sans addition de catégories, sens ou devises |
| Projets | ml_projets_v1, ml_suggestions_v1, ml_rattachement_v1, ml_brouillons_projet_v1 | oia_proposer_projet |
| CRM, y compris /crm | ml_contacts_v1 | oia_creer_contact, oia_supprimer |
| Notes et tâches | ml_notes_v1, ml_taches_v1 | oia_noter, oia_modifier_note, oia_creer_tache, oia_basculer_tache, oia_supprimer |
| Demandes et liens | ml_demandes_v1, ml_liens_v1 | oia_demander |
| Journal | ml_avis_v1 | Export CSV local, historique non modifiable |
| Reprise, Money et Réglages | ml_imports_v1 | oia_importer_sauvegarde, oia_apercu_annulation, oia_annuler_import |

`oia_role` est utilisé pour distinguer absence d'accès et espace vide. Les RPC restent l'autorité pour chaque permission d'écriture. Les lectures sont paginées par 500 lignes. Chaque écran masque le contenu pendant les lectures et montre les erreurs sans repli sur la démonstration.

Le format de sauvegarde a été vérifié en lecture seule dans l'ancienne console : `kind`, `version`, `data` et les six clés `oia.audit.v1`, `oia.tags.v1`, `oia.notes.v1`, `oia.tasks.v1`, `oia.contacts.v1`, `oia.views.v1`. Le fichier original est transmis uniquement à la RPC, sans effacement du stockage du navigateur. Le bilan et les conflits restent affichés dans leur intégralité ; annulation précédée d'un aperçu puis confirmation supplémentaire en cas de 55000.

## Écarts et vérifications encore nécessaires

- Les parcours authentifiés contre la production ne sont pas vérifiables dans cette session Lovable, Supabase externe non géré. Aucune connexion, inscription, configuration hébergée ou mutation de production n'a été testée. Le compte existant doit vérifier lecture, décision, relecture, étiquetage, note, tâche, import puis annulation avant retrait de l'ancienne console.
- Propositions de projet et paramètres des demandes sont pour l'instant saisis en JSON au format du contrat ; un formulaire guidé nécessite un schéma complet du registre et des charges de LINK_CHECK.
- Source et preuves complètes sont accessibles en détail JSON pour ne perdre aucun champ ; un rendu spécialisé des faits exige le schéma documenté du JSON `source`.
- Les filtres des vues nouvellement enregistrées sont relus par le cockpit. La parité de tous les filtres importés de l'ancienne console exige le schéma versionné de `filtres` : les clés inconnues ne doivent pas être silencieusement interprétées.
- Les contrôles d'auteur pour modifier une note ou basculer une tâche sont imposés par les RPC ; les boutons peuvent renvoyer 42501 pour un autre éditeur.
- Les démos originales restent isolées et non utilisées par les écrans réels ; leurs anciens champs ne sont jamais convertis en colonnes réelles.
- Visibility, Shyrka et Accueil restent en démonstration. Recherche assistée désactivée, « Bientôt disponible », aucun appel AI Gateway depuis Money réel. Analytique exclusivement locale.
- Aucune vue de coûts Visibility n'est branchée. Besoin conservé : dépenses estimées et observées par marque, mois, moteur et réponse.

## Avant retrait de l'ancienne console

- Sauvegarder son navigateur et conserver le JSON original hors dépôt.
- Vérifier les six comptes d'aperçu, importer, contrôler les conflits et relire les six collections.
- Tester répétition du même import, annulation normale et refus 55000 après modification, sans perdre le travail ultérieur.
- Comparer les listes, deux échéances, source, avis, pièces de travail et exports avec l'ancienne console.
- Vérifier la production Vercel après livraison ; une mise à jour dans Lovable ne prouve pas un déploiement Vercel réussi.
# Branchement Visibility sur le contrat v1

Date : 16 novembre 2026. Aucun déploiement et aucune modification Supabase.

## Source et règles

- Adaptateur : `src/lib/donnees/visibility-reel.ts`.
- Client : instance publique Supabase existante, avec la session de l'utilisateur.
- Lectures paginées par 500 lignes, filtrées par `subject_id` pour les données d'un sujet.
- Cache par compte et par sujet. Les vues ne sont pas relues au changement d'onglet, au focus ou à la reconnexion.
- Aucune clé de service, aucune écriture, aucun RPC et aucun repli fictif pour un compte connecté.
- Sans connexion, la démonstration existante reste disponible et porte « Exemple fictif ».
- Une absence ou un dénominateur nul produit « Non mesurable » avec une raison, jamais 0 % et jamais une valeur de démonstration.

## Vues lues

1. `vis_sujets_v1` : sujets, rôle, statut et domaines.
2. `vis_mesure_v1` : fenêtres, dates, état, jours, questions, réponses, moteurs, versions et coûts estimés.
3. `vis_apercu_v1` : présence, part de voix, numérateurs, dénominateurs et intervalles.
4. `vis_reponses_v1` : textes, questions, moteurs, modèles, dates, empreintes, jugement et coûts.
5. `vis_citations_v1` : domaines, catégories et citations par fenêtre et moteur.
6. `vis_reseaux_sociaux_v1` : profils cités, plateformes, citations et parts.
7. `vis_concurrents_v1` : marque, concurrents, apparitions, parts de voix et intervalles.
8. `vis_questions_v1` : panel, langues, étiquettes, réponses jugées et présence par question.
9. `vis_recommandations_v1` : recommandations, priorités, états, impacts et efforts.
10. `vis_rapports_v1` : rapports disponibles et leur statut.

## Écrans branchés

- Vue d'ensemble : sujet, assistant, famille, fenêtre, quatre indicateurs, paysage, assistants et ligne d'état.
- Visibilité : série temporelle, assistants et questions.
- Part de voix : classement global et assistants. Les questions restent non mesurables.
- Sentiment : état non mesurable motivé et extraits de réponses disponibles.
- Réponses : filtres, textes, modèles, empreintes et nombre de citations.
- Recherches des assistants : état non mesurable motivé, sans requêtes inventées.
- Citations : fenêtre, assistant, domaines, catégories et fréquences.
- Opportunités de contenu : état non mesurable motivé.
- Réseaux sociaux : profils, citations et parts réelles.
- Recommandations : lecture seule des recommandations réelles.
- Rapports : rapports disponibles et comparaison calculée seulement entre fenêtres réelles.
- Sites et fiche site : sujets, fenêtre active, présence, sources, concurrents, recommandations et historique.
- Réglages : marque, concurrents, questions, assistants et coûts issus des vues. Les ajouts personnels restent locaux et exclus du dénombrement réel.
- États communs : chargement, erreur avec message et réessai, accès non accordé et collections vides.

`SEO Command` n'est pas branché : sa vue existe dans le contrat, mais ne faisait pas partie des dix vues demandées. La création d'un compte reste indisponible pour un utilisateur connecté plutôt que d'afficher le scénario fictif.

## Écarts à reprendre dans un contrat v2

- Sentiment global, par assistant et par réponse.
- Exactitude des faits cités et position moyenne dans les réponses, absentes des lignes actuelles de `vis_apercu_v1`.
- Intervalles de présence par question et part de voix par question.
- URL des citations rattachées à chaque réponse.
- Termes de recherche et pages consultées par chaque assistant.
- Opportunités de contenu et leurs pistes.
- Contrôles de profils sociaux et identification des profils officiels de la marque.
- Alias de marque et liste des plateformes non suivies.
- État Google d'un site et fréquence planifiée des fenêtres.
- Création et configuration d'un nouveau sujet depuis le cockpit.
- Coûts estimés répartis par assistant et coût facturé consolidé. L'écran utilise seulement les estimations de fenêtres et les coûts de réponses du contrat v1.

## Vérifications

- 116 tests automatisés réussis.
- Compilation réussie.
- Parcours navigateur avec session et réponses réseau simulées : tous les onglets, fiche site, réglages, mobile et accès refusé.
- Dix vues lues une fois chacune pendant le parcours, sans nouvelle lecture au changement d'onglet.
- Aucun libellé « Exemple fictif » ni contenu Studio Ardoise dans les écrans réels testés.
- La session Supabase de production n'est pas disponible dans cet environnement externe : le compte réel et les droits `vis.client_member` restent à vérifier dans la preview connectée.

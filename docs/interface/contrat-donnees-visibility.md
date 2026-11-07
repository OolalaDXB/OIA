# Contrat de données · Visibility · version 1

2026-11-08 · mandat v8, blocs B1 à B3 · exigences 4, 7 et 8.
**Lovable possède l'interface ; Claude Code possède les données.** Ce contrat
est le seul lien entre les deux pour OIA Visibility.

Sources : la table des preuves (`vis.evidence`) et le journal de décision
(`vis.recommendation`, `vis.decision`, `vis.execution`, `vis.action_log`) de
Visibility, migrations `infra/visibility/migrations/0001` à `0004`, lues sans
être modifiées. Vues : `packages/database/supabase/migrations/0006_visibility_vues.sql`.
Démonstration : `packages/database/demo/visibility-demo.sql`, et le résultat
des vues figé dans `docs/interface/demo/visibility-demo.json`.

## Règles communes

- **Accès.** L'application lit ces vues avec la session de l'utilisateur
  connecté (client Supabase, clé publique). Les vues sont en
  `security_invoker = true` : elles appliquent les politiques RLS de `vis`.
  Seuls les membres d'un client (`vis.client_member`) voient ses lignes. Un
  compte connecté qui n'est membre de rien, ou `anon`, ne voit rien. Testé
  vue par vue (`packages/database/test/visibility.test.ts`).
- **Écriture.** Aucune écriture directe. Deux fonctions seulement :
  `vis_valider_recommandation` et `vis_rejeter_recommandation`.
- **Honnêteté.**
  - Un indicateur dont le dénominateur est nul est **non mesurable**
    (`etat = 'non_mesurable'`, `valeur = null`, avec sa raison). Il ne
    s'affiche jamais 0, ni par un tiret seul.
  - Un zéro mesuré (dénominateur positif, numérateur nul) reste 0.
  - Chaque pourcentage s'affiche avec son effectif : « 34 % (17 sur 50) ».
  - Aucun report de valeur : un jour sans réponse reste vide.
  - Aucune vue n'utilise l'heure courante : les chiffres ne dépendent que des
    données.
- **Fenêtre de mesure** : 5 jours. Tant qu'elle n'est pas finie, l'écran
  affiche « Mesure en cours, jour N sur 5 » (`vis_mesure_v1`) et masque les
  variations.
- **États à prévoir sur chaque écran :**
  - **chargement** : squelette, sans chiffres ;
  - **vide** : phrase qui dit pourquoi, par exemple « Aucune réponse sur cette
    fenêtre » ;
  - **mesure en cours** : bandeau « Mesure en cours, jour N sur 5 » ;
  - **non mesurable** : carte grise avec la raison ;
  - **erreur** : message et bouton « réessayer », jamais confondu avec le vide ;
    ne jamais afficher de données en cache comme si elles étaient à jour ;
  - **non membre** : la vue rend 0 ligne ; l'interface dit « Accès non accordé
    à ce client », et non « vide ».
- **Méthode affichée** en pied de page : collecteurs, moteurs et versions,
  langue, version du panel (`vis_mesure_v1`). Un changement de version de
  modèle dans la fenêtre (`changement_modele`) se signale en tête.
- **Couleur** : elle indique un statut (attendu, en cours, validé, alerte),
  jamais une note.
- **Versions.** Chaque vue porte son numéro (`_v1`). Un changement compatible
  (colonne ajoutée, nouvel indicateur dans `vis_apercu_v1`) garde le numéro. Un
  changement incompatible (colonne retirée, renommée ou de sens différent) crée
  `_v2`, et `_v1` reste servie au moins 30 jours. Le changement est consigné
  dans ce document.
- **Exemples fictifs** : toutes les valeurs de ce document et de la
  démonstration sont inventées (client « Exemple fictif », domaines en
  `.example`).

Erreurs des fonctions : `42501` (droit refusé), `22023` (valeur refusée),
`P0002` (introuvable). L'interface affiche le message tel quel.

## Indicateurs (exigence 7)

Quatre indicateurs, calculés par fenêtre et par moteur (`moteur = 'tous'` pour
l'ensemble), dans `vis_apercu_v1`. Une réponse est **jugée** quand la collecte
a dit si la marque y figure (`structured.brandMentioned` vrai ou faux).

| Indicateur | Formule | Dénominateur | Réponses manquantes | Intervalle | Non mesurable si |
| --- | --- | --- | --- | --- | --- |
| `presence` | réponses jugées qui citent la marque / réponses jugées | réponses jugées | une réponse non jugée sort du numérateur et du dénominateur ; elle est comptée à part (`reponses_non_jugees`) | Wilson 95 % si le dénominateur atteint 30 ; sinon plage observée jour par jour | aucune réponse jugée |
| `part_de_voix` | réponses jugées qui citent la marque / (les mêmes + mentions des concurrents) ; une réponse qui nomme trois concurrents compte trois | mentions de toutes les entités suivies | idem | toujours la plage observée : les mentions ne sont pas des tirages indépendants | aucune mention |
| `citation_marque` | réponses avec recherche web qui citent au moins une adresse d'un domaine de la marque / réponses avec recherche web | réponses avec recherche web | une réponse sans recherche web sort du calcul | Wilson 95 % dès 30 ; sinon plage observée | aucune réponse avec recherche web (`recherche_web_desactivee`) |
| `concurrent_a_la_place` | réponses jugées où la marque est absente et au moins un concurrent est nommé / réponses jugées | réponses jugées | idem `presence` | Wilson 95 % dès 30 ; sinon plage observée | aucune réponse jugée |

- **Wilson 95 %** : z = 1,96, bornes arrondies à 4 décimales
  (`vis_ui.wilson`). Exemple : 17 sur 50 donne [0,2244 ; 0,4785].
- **Plage observée** : minimum et maximum des valeurs journalières, sur les
  jours où le dénominateur du jour est positif. Libellé à afficher : « plage
  observée, petit échantillon ». Ce n'est pas un intervalle de confiance.
- **Domaines de la marque** : le site principal et les adresses
  additionnelles non rejetées des sites rattachés au sujet, sous-domaines
  compris, sans « www. ».
- **Réponses en échec** : la table des preuves ne garde que les réponses
  reçues. Les échecs de collecte n'y sont pas ; les jours manquants le sont
  (`vis.window_missing_day`, colonne `jours_manquants`). Afficher « échecs de
  collecte : non enregistrés dans cette version », jamais 0.
- **Version 2, après J0** (décision de Mickaël du 2026-11-08) : sentiment,
  position et échecs de collecte. La table des preuves ne les contient pas
  encore. Les ajouter sera un changement compatible (nouvelles lignes
  d'indicateur, nouvelles colonnes).
- **Hors version 1, sans date** : exactitude des faits.

## Vues, colonne par colonne

Les vues sont dans `public`. Les vues de base (`vis_ui.base_reponse`,
`vis_ui.base_citation`, `vis_ui.domaines_marque`) servent au calcul et ne
sont pas destinées aux écrans.

### `vis_sujets_v1`

Sélecteur de client et de sujet. Une ligne par sujet visible.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | `vis.client.id` |
| `client_nom` | text | `vis.client.display_name` |
| `subject_id` | text | `vis.subject.id` |
| `statut` | text | `draft`, `active`, `paused`, `archived` |
| `mon_role` | text | rôle de l'appelant : `owner`, `approver`, `viewer` |
| `domaines` | text[] | domaines de la marque |

### `vis_mesure_v1`

Bandeau de mesure et pied de méthode. Une ligne par fenêtre.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | fenêtre |
| `subject_id` | text | fenêtre |
| `window_id` | text | `vis.window.id` |
| `type_fenetre` | text | `baseline` (J0) ou `follow-up` (remesure) |
| `version_panel` | int | version du panel de questions |
| `statut_fenetre` | text | `planned`, `running`, `done`, `aborted` |
| `debut` | date | premier jour prévu |
| `fin` | date | dernier jour prévu |
| `jours_prevus` | int | `fin - debut + 1`, 5 par défaut |
| `jours_mesures` | bigint | jours distincts avec au moins une réponse jugée : le N de « jour N sur 5 » |
| `jours_manquants` | bigint | jours déclarés manquants, avec leur raison dans `vis.window_missing_day` |
| `reponses` | bigint | réponses reçues |
| `reponses_jugees` | bigint | réponses jugées |
| `reponses_non_jugees` | bigint | reçues moins jugées |
| `questions` | bigint | questions distinctes |
| `moteurs` | text[] | moteurs présents |
| `versions_modele` | text[] | `moteur:version` présents |
| `changement_modele` | boolean | vrai si un moteur a répondu avec plusieurs versions |
| `langues` | text[] | langues du panel |
| `collecteurs` | text[] | `elmo`, `oia-direct`, `manual` |
| `cout_estime_usd` | numeric | somme des coûts estimés ; `null` sans réponse |
| `etat` | text | `non_mesurable` (aucune réponse jugée), `mesure_en_cours`, `mesure_terminee`, `interrompue` |

### `vis_apercu_v1`

Onglet **Vue d'ensemble**. Une ligne par fenêtre, moteur et indicateur.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | preuves |
| `subject_id` | text | preuves |
| `window_id` | text | preuves |
| `moteur` | text | moteur, ou `tous` |
| `indicateur` | text | `presence`, `part_de_voix`, `citation_marque`, `concurrent_a_la_place` |
| `ordre` | int | ordre d'affichage, 1 à 4 |
| `numerateur` | bigint | voir « Indicateurs » |
| `denominateur` | bigint | voir « Indicateurs » |
| `valeur` | numeric | `numerateur / denominateur`, 4 décimales ; `null` si non mesurable |
| `methode_intervalle` | text | `wilson_95`, `plage_observee`, ou `null` si non mesurable |
| `borne_basse` | numeric | borne basse de l'intervalle ou de la plage |
| `borne_haute` | numeric | borne haute |
| `jours_mesures` | int | jours où le dénominateur du jour est positif |
| `jours_prevus` | int | de `vis_mesure_v1` |
| `etat` | text | `mesure`, `mesure_en_cours`, `non_mesurable` |
| `raison_non_mesurable` | text | `aucune_reponse_jugee`, `aucune_mention`, `recherche_web_desactivee`, ou `null` |

Exemple fictif : `{ "moteur": "mistral", "indicateur": "citation_marque",
"numerateur": 0, "denominateur": 0, "valeur": null, "etat": "non_mesurable",
"raison_non_mesurable": "recherche_web_desactivee" }`, affiché « Non
mesurable : ce moteur ne fait pas de recherche web ».

### `vis_reponses_v1`

Onglet **Réponses**. Une ligne par réponse reçue.

| Colonne | Type | Source |
| --- | --- | --- |
| `id` | uuid | `vis.evidence.id` |
| `client_id` | text | preuve |
| `subject_id` | text | preuve |
| `window_id` | text | preuve |
| `question_id` | text | identifiant de la question du panel |
| `version_question` | int | version de la question |
| `langue` | text | langue de la question |
| `moteur` | text | moteur interrogé |
| `version_modele` | text | version servie, ou `null` |
| `fournisseur` | text | fournisseur d'accès déclaré par la collecte |
| `collecteur` | text | `elmo`, `oia-direct`, `manual` |
| `recu_le` | timestamptz | réception |
| `jour` | date | jour UTC de réception |
| `texte` | text | texte brut, jamais modifié |
| `empreinte` | text | SHA-256 du texte, calculée par la base |
| `statut_jugement` | text | `jugee` ou `non_jugee` |
| `marque_citee` | boolean | `null` si non jugée |
| `concurrents` | text[] | concurrents nommés |
| `recherche_web` | boolean | recherche web activée |
| `nb_citations` | bigint | adresses citées |
| `cout_usd` | numeric | coût estimé |

### `vis_citations_v1`

Onglet **Citations**. Une ligne par fenêtre, moteur et adresse citée.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | preuves |
| `subject_id` | text | preuves |
| `window_id` | text | preuves |
| `moteur` | text | moteur |
| `url` | text | adresse citée |
| `domaine` | text | hôte, sans « www. » |
| `categorie` | text | `marque`, `reseau_social`, `autre` |
| `citations` | bigint | nombre de citations |
| `reponses` | bigint | réponses qui la citent |
| `questions` | bigint | questions concernées |
| `premier_jour` | date | première citation dans la fenêtre |
| `dernier_jour` | date | dernière citation dans la fenêtre |

La part de citations de la marque est l'indicateur `citation_marque` de
`vis_apercu_v1`. Aucune citation sur une fenêtre avec recherche web : « Aucune
source citée sur cette fenêtre ». Sans recherche web : non mesurable.

### `vis_reseaux_sociaux_v1`

Onglet **Réseaux sociaux**. Citations vers une plateforme sociale.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | preuves |
| `subject_id` | text | preuves |
| `window_id` | text | preuves |
| `plateforme` | text | `instagram`, `tiktok`, `facebook`, `youtube`, `x` (x.com et twitter.com), `linkedin`, `threads` : exactement la liste de Visibility, sous-domaines compris |
| `url` | text | adresse citée |
| `citations` | bigint | citations de cette adresse |
| `denominateur` | bigint | toutes les citations de la fenêtre |
| `part` | numeric | `citations / denominateur`, 4 décimales |
| `questions` | bigint | questions concernées |
| `moteurs` | text[] | moteurs qui la citent |

Vide : « Aucune source sociale citée sur cette fenêtre ».

### `vis_concurrents_v1`

Onglet **Concurrents**. La marque et chaque concurrent nommé, par fenêtre et
moteur (`tous` compris).

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | preuves |
| `subject_id` | text | preuves |
| `window_id` | text | preuves |
| `moteur` | text | moteur, ou `tous` |
| `entite` | text | nom du concurrent ; pour la marque, `subject_id` (afficher `client_nom`) |
| `est_marque` | boolean | vrai pour la marque |
| `mentions` | bigint | réponses jugées qui nomment l'entité |
| `denominateur_part` | bigint | mentions de toutes les entités |
| `part_de_voix` | numeric | `mentions / denominateur_part` |
| `reponses_jugees` | bigint | réponses jugées |
| `taux_apparition` | numeric | `mentions / reponses_jugees` |
| `methode_intervalle` | text | `wilson_95` dès 30 réponses jugées, sinon `effectif_insuffisant` |
| `borne_basse` | numeric | Wilson sur `taux_apparition`, sinon `null` |
| `borne_haute` | numeric | idem |
| `questions` | bigint | questions où l'entité apparaît |

Note à afficher : « La part de voix dépend du nombre de concurrents suivis. »
Sous 30 réponses : afficher « k sur n » sans intervalle.

### `vis_questions_v1`

Onglet **Questions**. Une ligne par fenêtre, question, version, moteur et jour.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | preuves |
| `subject_id` | text | preuves |
| `window_id` | text | preuves |
| `question_id` | text | panel |
| `version_question` | int | panel |
| `langue` | text | panel |
| `texte` | text | `vis_ui.question` ; `null` : « texte du panel non chargé » |
| `marquee` | boolean | la question nomme la marque ; `null` si non chargé |
| `etiquettes` | text[] | étiquettes du panel |
| `moteur` | text | moteur |
| `jour` | date | jour UTC |
| `reponses` | bigint | réponses reçues |
| `reponses_jugees` | bigint | réponses jugées |
| `avec_marque` | bigint | réponses jugées qui citent la marque |
| `etat` | text | `mesure` ou `non_mesurable` |

Les questions marquées et non marquées s'affichent en deux chiffres séparés,
jamais additionnés sans le dire.

### `vis_recommandations_v1`

Onglet **Recommandations**.

| Colonne | Type | Source |
| --- | --- | --- |
| `id` | text | `vis.recommendation.id` |
| `client_id` | text | recommandation |
| `subject_id` | text | recommandation |
| `site_id` | text | recommandation |
| `window_id` | text | fenêtre d'origine |
| `type` | text | `FIX_FACT`, `CONTENT_GAP`, `ENTITY_INCONSISTENCY`, `SOURCE_TARGET`, `TECH_FIX`, `WATCH` |
| `titre` | text | recommandation |
| `enonce` | text | recommandation |
| `impact` | text | `low`, `medium`, `high` |
| `effort` | text | `XS` à `XL` |
| `risque` | text | `low`, `medium`, `high` |
| `confiance` | text | `low`, `medium`, `high` |
| `cree_par` | text | agent ou personne |
| `cree_le` | timestamptz | création |
| `priorite` | int | 1 (`FIX_FACT`) à 6 (`WATCH`) : tri d'affichage |
| `etat` | text | dernière décision : `pending` par défaut, `accepted`, `rejected`, `obsolete` |
| `decide_par` | text | auteur de la dernière décision |
| `decide_le` | timestamptz | date de la dernière décision |
| `motif` | text | motif de la dernière décision |
| `derniere_execution` | text | `pr-opened`, `pr-merged`, `commit`, `rollback`, ou `null` |
| `reference_execution` | text | lien de la PR ou empreinte du commit |
| `execute_le` | timestamptz | date de la dernière exécution |
| `preuves` | jsonb | preuves de la recommandation (`kind`, `ref`) |

Actions, propriétaire ou approbateur du client seulement, avec double
confirmation :
- « Valider » : `vis_valider_recommandation(id, motif?)`, qui appelle
  `vis.validate_recommendation` ;
- « Rejeter » : `vis_rejeter_recommandation(id, motif)`, motif obligatoire.

Une identité de service ne décide jamais. Chaque décision s'ajoute au
journal ; aucune n'est modifiée. Vide : « Aucune recommandation en attente ».

### `vis_rapports_v1`

Onglet **Rapports**. Rapports de fenêtre (J0, remesure).

| Colonne | Type | Source |
| --- | --- | --- |
| `id` | uuid | `vis_ui.rapport` |
| `client_id` | text | rapport |
| `subject_id` | text | rapport |
| `window_id` | text | fenêtre |
| `type` | text | `j0` ou `remesure` |
| `genere_le` | timestamptz | génération |
| `version_panel` | int | panel |
| `statut` | text | `a_valider` ou `valide` |
| `fichier` | text | emplacement du fichier, ou `null` si pas encore produit |
| `empreinte` | text | SHA-256 du rapport |
| `chiffres` | jsonb | chiffres du rapport, avec leur provenance |

Écrit par le service seulement. Vide : « Aucun rapport pour ce sujet ».

### `vis_seo_command_v1`

Onglet **SEO Command** : journal des actions, en ajout seul.

| Colonne | Type | Source |
| --- | --- | --- |
| `id` | bigint | `vis.action_log.id` |
| `client_id` | text | journal |
| `subject_id` | text | journal |
| `le` | timestamptz | date |
| `qui` | text | agent ou personne |
| `quoi` | text | action |
| `mission_id` | text | mission |
| `cout_usd` | numeric | coût de l'action, ou `null` |
| `details` | jsonb | détails |

### `vis_planificateur_v1`

Onglet **SEO Command** : planificateur, affiché désactivé tant qu'il l'est.

| Colonne | Type | Source |
| --- | --- | --- |
| `client_id` | text | client |
| `actif` | boolean | faux par défaut |
| `bascule_par` | text | dernière bascule |
| `bascule_le` | timestamptz | date |
| `motif` | text | motif |

## Onglets et écrans

| Onglet | Vues | Particularités |
| --- | --- | --- |
| **Vue d'ensemble** | `vis_apercu_v1`, `vis_mesure_v1`, `vis_recommandations_v1` (3 premières en attente) | Quatre cartes, une par indicateur, avec valeur, effectif, intervalle ou plage ; bandeau « Mesure en cours, jour N sur 5 » ; « Non mesurable » par carte ; pied de méthode |
| **Réponses** | `vis_reponses_v1` | Filtres : moteur, question, jugement, recherche web, texte. Une réponse non jugée s'affiche « non jugée », jamais « marque absente » |
| **Citations** | `vis_citations_v1`, `vis_apercu_v1` (`citation_marque`) | Domaines, adresses, catégories, premier et dernier jour |
| **Concurrents** | `vis_concurrents_v1` | Classement par mentions, part de voix, taux d'apparition et intervalle |
| **Réseaux sociaux** | `vis_reseaux_sociaux_v1` | Plateformes de la liste de Visibility, part avec dénominateur |
| **Questions** | `vis_questions_v1` | Courbe jour par jour sans valeur inventée avant la première mesure |
| **Recommandations** | `vis_recommandations_v1` | Tri par `priorite`, actions valider et rejeter |
| **Rapports** | `vis_rapports_v1` | Statut « à valider » tant que Mickaël n'a pas validé |
| **SEO Command** | `vis_seo_command_v1`, `vis_planificateur_v1`, `vis_recommandations_v1` (`pending`) | Planificateur affiché désactivé |

## Correspondance avec les écrans de l'inventaire

L'inventaire de l'application de référence (`docs/interface/elmo-inventaire.md`)
décrit 14 écrans. Leur couverture par la version 1 :

| Écran de l'inventaire | Version 1 | Remarque |
| --- | --- | --- |
| Vue d'ensemble | `vis_apercu_v1`, `vis_mesure_v1` | En version 1, `citation_marque` et `concurrent_a_la_place` à la place du sentiment et de la position, qui viendront en version 2, après J0 |
| Questions | `vis_questions_v1` | |
| Détail d'une question | `vis_questions_v1`, `vis_reponses_v1`, `vis_citations_v1` filtrés par `question_id` | Faits attendus : hors version 1 |
| Concurrents | `vis_concurrents_v1` | |
| Sentiment | version 2, après J0 | Non collecté par la table des preuves |
| Réponses | `vis_reponses_v1` | Comparaison aux faits validés : hors version 1 |
| Recherches web | hors version 1 | Les requêtes des moteurs ne sont pas dans la table des preuves |
| Citations | `vis_citations_v1` | |
| Social | `vis_reseaux_sociaux_v1` | |
| Recommandations | `vis_recommandations_v1`, `vis_seo_command_v1`, `vis_planificateur_v1` | |
| Avant / après | `vis_apercu_v1` sur deux fenêtres | Comparer seulement si `version_panel` et `moteurs` sont identiques (`vis_mesure_v1`) ; sinon « Comparaison impossible » |
| Rapports | `vis_rapports_v1` | |
| Réglages (lecture) | `vis_sujets_v1`, `vis_mesure_v1` | Concurrents suivis et alias : hors version 1 |
| Équipe | hors version 1 | Un membre ne voit que ses propres appartenances ; la liste d'équipe demandera une fonction dédiée |

## B3 · Démonstration

`packages/database/demo/visibility-demo.sql` crée un client fictif
« Exemple fictif » : un site en `.example`, dix questions, trois moteurs (dont
un sans recherche web), une J0 terminée de 5 jours avec un changement de
version de modèle au jour 4, une remesure « en cours, jour 2 sur 5 », des
réponses non jugées, trois recommandations (en attente, acceptée avec
exécution, rejetée), trois actions SEO Command et un rapport à valider.

Le résultat de chaque vue, lu par le membre fictif
`00000000-0000-4000-8000-00000000de00`, est figé dans
`docs/interface/demo/visibility-demo.json`. Lovable peut s'en servir avant
l'arrivée des vraies données. Le test vérifie que ce fichier est à jour et que
chaque vue a exactement les colonnes de ce contrat, dans l'ordre. Pour le
régénérer : `pnpm --filter @oia/database demo:visibility`.

## Prérequis

- `infra/visibility/migrations/0001` à `0004` appliquées d'abord. `0004` a été
  corrigée pour Supabase par la session Visibility (commit `7093687`) : elle compare `auth.uid()::text` et cède les tables à
  `vis_admin` sous un rôle non superutilisateur. Les tests de 0006 tournent
  désormais avec un `auth.uid()` en uuid, comme sur Supabase.
- 0006 pose une politique RLS sur `vis.client_member`, limitée aux rôles de
  l'interface (`anon`, `authenticated`) : un compte ne voit que ses propres
  appartenances. Les autres rôles gardent leur accès. À relire avec la session
  Visibility.
- Rien n'est appliqué à la base Supabase OIA.

## Historique du contrat

| Version | Date | Changement |
| --- | --- | --- |
| 1 | 2026-11-08 | Création |
| 1 | 2026-11-08 | Révision avant mise en service (aucune vue servie) : liste des réseaux sociaux alignée sur celle de Visibility (décision de Mickaël), colonne `communaute` de `vis_reseaux_sociaux_v1` retirée ; sentiment, position et échecs de collecte prévus en version 2, après J0 |

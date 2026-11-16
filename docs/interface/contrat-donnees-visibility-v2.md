# Contrat de données · Visibility · version 2 : le cockpit pilote

16 novembre 2026 · amendement « cockpit d'abord » du mandat v15, mandat v16.
**Lovable possède l'interface ; Claude Code possède les données et le moteur.**

La version 1 (`contrat-donnees-visibility.md`) **reste servie et valable** : ses
vues `vis_*_v1` nourrissent les écrans de mesure (vue d'ensemble, réponses,
citations, concurrents, questions, réseaux, rapports). La version 2 ajoute :

- les vues de comparaison et de recommandations de la 0010 proposée
  (`vis_mesure_v2`, `vis_comparaisons_v2`, `vis_comparaison_moteurs_v2`,
  `vis_recommandations_v2`), reprises sans changement ;
- **le pilotage** : portefeuille, demandes au moteur, propositions à valider,
  fenêtres et leur coût, budget, alertes, état du moteur, pages client ;
- **les fonctions des gestes de Mickaël**. Chaque geste est un bouton du
  cockpit, jamais une commande.

Ce document fixe les **noms, colonnes, valeurs et erreurs**. Deux migrations
l'implémentent à l'identique : `infra/visibility/migrations/0006_pilotage.sql`
(tables, schéma `vis`) puis `packages/database/supabase/migrations/0011_visibility_pilotage.sql`
(vues, fonctions des gestes et du moteur), après la 0010. Un test vérifie que chaque
vue a exactement les colonnes de ce document, dans l'ordre (comme pour la v1) :
`packages/database/test/visibility-pilotage.test.ts`.

## Règles communes

Celles de la v1 s'appliquent toutes : `security_invoker = true`, RLS par
client, aucune écriture directe, honnêteté des chiffres, états d'écran,
exemples fictifs. En plus :

- **Rôles.** `owner` et `approver` d'un client peuvent appeler les fonctions
  de geste ; `viewer` lit seulement. `vis_demander_site` sans client existant
  et `vis_fixer_plafond` : `owner` d'OIA seulement (membre `owner` du client
  technique `oia`). Une identité de service ne fait jamais un geste humain.
- **Journal.** Chaque fonction de geste écrit, en ajout seul, son auteur
  (`auth.uid()`), sa date et ses paramètres, dans `vis.geste`. Rien n'est
  modifié ni supprimé.
- **Aucun appel payant sans GO enregistré.** Le moteur ne lance une collecte
  payante (reconnaissance ou fenêtre) que si une ligne de GO existe en base,
  avec un coût estimé, sous le plafond du client. Sinon il écrit une erreur.
- **Coût vu = coût engagé.** Toute fonction de GO reçoit le coût estimé que
  l'écran a affiché (`p_cout_vu_usd`). Elle refuse (`22023`, « estimation
  changée, recharger ») s'il diffère de l'estimation courante en base.
- **Idempotence.** Rappeler une fonction avec les mêmes paramètres pendant
  qu'une demande identique est en file ou en cours renvoie la même demande,
  sans doublon.
- **Erreurs** : `42501` (droit refusé), `22023` (valeur refusée, message en
  français lisible), `P0002` (introuvable), `55000` (étape incompatible, par
  exemple un GO avant la validation du panel). L'interface affiche le message
  tel quel.
- **Aucun secret, aucune clé de fournisseur** ne transite par ces vues.

## Le parcours d'une étude, vu par la base

| Étape (`etape`) | Signification | Prochain geste | Qui |
| --- | --- | --- | --- |
| `demande` | site demandé, en file | aucun | moteur |
| `audit_en_cours` | audit de lecture, faits, panel proposés | aucun | moteur |
| `a_valider` | faits, panel proposés ; reconnaissance chiffrée | valider les faits et le panel, GO reconnaissance | Mickaël |
| `reconnaissance_en_cours` | une journée de questions non marquées | aucun | moteur |
| `concurrents_a_valider` | concurrents et homonymes proposés | valider les concurrents | Mickaël |
| `pret_pour_go` | tout est validé, J0 chiffré | GO de l'étude | Mickaël |
| `mesure_en_cours` | fenêtre en cours, jour N sur 5 | aucun | moteur |
| `rapport_a_valider` | fenêtre close, rapport et recommandations prêts | valider le rapport, puis les recommandations | Mickaël |
| `actions_en_cours` | recommandations acceptées, pas toutes exécutées | déclarer les exécutions | Mickaël ou client |
| `remesure_proposee` | 21 jours après la dernière exécution, J1 chiffré | GO de la remesure | Mickaël |
| `bloque` | erreur, plafond atteint, moteur arrêté | lire l'alerte | Mickaël |

L'étape est **calculée** par la vue à partir des données, jamais saisie.

## Vues

### `vis_portefeuille_v2`

Écran **Portefeuille** et onglet **Sites**. Une ligne par sujet.

| Colonne | Type | Sens |
| --- | --- | --- |
| `client_id` | text | client |
| `client_nom` | text | nom du client |
| `subject_id` | text | sujet |
| `site_url` | text | adresse du site |
| `nom` | text | nom de la marque |
| `langues` | text[] | langues du panel |
| `marches` | text[] | marchés (codes pays) |
| `etape` | text | voir le tableau du parcours |
| `prochaine_action` | text | phrase courte, par exemple « Valider le panel (10 questions) » |
| `qui` | text | `mickael`, `client`, `moteur` |
| `depuis_le` | timestamptz | entrée dans l'étape |
| `fenetre_active` | text | fenêtre en cours ou à valider, ou `null` |
| `jour_courant` | int | jour N de la fenêtre en cours, ou `null` |
| `presence_non_marquee` | numeric | dernière valeur mesurée (`vis_apercu_v1`, `tous`), ou `null` |
| `presence_effectif` | text | « 0 sur 200 », pour l'affichage avec la valeur |
| `cout_mois_usd` | numeric | coût réel du mois en cours |
| `plafond_mois_usd` | numeric | plafond du client, ou `null` si non fixé (aucun GO possible) |
| `alertes_ouvertes` | int | alertes non acquittées |
| `mon_role` | text | rôle de l'appelant |

### `vis_demandes_v2`

Onglet **Activité du moteur**. Une ligne par demande (même forme que `ml_demandes_v1`).

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant |
| `client_id` | text | client |
| `subject_id` | text | sujet, ou `null` avant sa création |
| `type` | text | `SITE_ADD`, `RECON`, `WINDOW_RUN`, `REPORT`, `REMEASURE_PROPOSE` |
| `charge` | jsonb | paramètres du geste |
| `statut` | text | `QUEUED`, `RUNNING`, `DONE`, `FAILED`, `CANCELLED` |
| `demande_le` | timestamptz | date |
| `demande_par` | text | auteur |
| `commencee_le` | timestamptz | début |
| `terminee_le` | timestamptz | fin |
| `resultat` | jsonb | résumé du résultat |
| `erreur` | text | message lisible, ou `null` |
| `tentatives` | int | prises par le moteur (une reprise après 30 minutes en ajoute une ; après 3, `FAILED`) |

### `vis_propositions_v2`

Écran **Revue d'un site**. Une ligne par élément proposé, dans sa dernière version.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | text | identifiant stable de l'élément |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `nature` | text | `fait`, `question`, `concurrent`, `homonyme`, `audit` |
| `version` | int | version de l'élément (une modification crée une version) |
| `contenu` | jsonb | voir ci-dessous |
| `source` | text | URL de la page source, ou identifiant des réponses |
| `propose_par` | text | `moteur` ou auteur d'une modification |
| `etat` | text | `propose`, `valide`, `rejete` |
| `decide_par` | text | auteur de la décision |
| `decide_le` | timestamptz | date |

`contenu` selon `nature` :
- `fait` : `{ "enonce", "categorie" }` (prix, lieu, offre, identité…) ;
- `question` : `{ "texte", "langue", "marquee": bool, "famille", "moteurs": [..] }` ;
- `concurrent` : `{ "nom", "type": "personne|structure|plateforme", "domaines": [..], "citations": n }` ;
- `homonyme` : `{ "nom", "exemple", "citations": n }` ;
- `audit` : `{ "controle", "etat": "conforme|alerte|bloquant", "detail" }` (lecture seule, jamais validée).

### `vis_fenetres_v2`

Écran **GO** et bandeau de mesure. Une ligne par fenêtre, y compris la reconnaissance.

| Colonne | Type | Sens |
| --- | --- | --- |
| `window_id` | text | fenêtre |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `nature` | text | `reconnaissance`, `reference` (J0), `remesure` (J1, J2…) |
| `libelle` | text | `Reconnaissance`, `J0`, `J1`… |
| `compare_avec` | text | fenêtre de référence, ou `null` |
| `statut` | text | `proposee`, `go_donne`, `en_cours`, `close`, `annulee` |
| `debut` | date | premier jour |
| `jours_prevus` | int | 1 pour la reconnaissance, 5 sinon |
| `jours` | jsonb | `[{ "jour": 1, "date", "etat": "complet|partiel|manquant|a_venir" }]` |
| `questions` | int | questions actives |
| `moteurs` | text[] | moteurs |
| `cout_estime_usd` | numeric | estimation courante (moteur, à partir des coûts réels de la référence) |
| `detail_estimation` | jsonb | `{ "appels", "par_moteur": {..}, "juge" }` |
| `cout_reel_usd` | numeric | somme des coûts réels enregistrés |
| `go_par` | text | auteur du GO |
| `go_le` | timestamptz | date du GO |
| `cout_vu_au_go_usd` | numeric | coût affiché au moment du GO |
| `heure_utc` | text | heure UTC du passage quotidien (`HH:MM`), ou `null` (heure du moteur) |

### `vis_budget_v2`

Réglages et portefeuille. Une ligne par client et par mois.

| Colonne | Type | Sens |
| --- | --- | --- |
| `client_id` | text | client |
| `mois` | date | premier jour du mois |
| `plafond_usd` | numeric | plafond, ou `null` |
| `engage_usd` | numeric | estimations des GO du mois pas encore dépensées |
| `reel_usd` | numeric | coût réel du mois |
| `etat` | text | `ok`, `proche` (80 %), `atteint`, `non_fixe` |
| `plafond_global_usd` | numeric | plafond global d'OIA (rappel) |
| `mon_role` | text | rôle de l'appelant sur ce client (`owner`, `approver`, `viewer`) ; sur la ligne `oia`, il dit qui peut fixer les plafonds (ajouté le 2026-11-16, compatible) |

### `vis_alertes_v2`

Cloche du cockpit. Une ligne par alerte.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant |
| `client_id` | text | client, ou `oia` pour le moteur |
| `subject_id` | text | sujet, ou `null` |
| `gravite` | text | `info` (rapport prêt), `alerte` (jour partiel), `bloquant` (échec, plafond, moteur muet) |
| `type` | text | `RAPPORT_PRET`, `JOUR_PARTIEL`, `JOUR_MANQUANT`, `ECHEC_DEMANDE`, `PLAFOND`, `MOTEUR_MUET`, `COUT_ILLISIBLE` |
| `message` | text | phrase lisible |
| `cree_le` | timestamptz | date |
| `acquittee_par` | text | auteur de l'acquittement, ou `null` |
| `acquittee_le` | timestamptz | date |

### `vis_moteur_v2`

Bandeau **État du moteur** (Réglages et portefeuille). Une ligne.

| Colonne | Type | Sens |
| --- | --- | --- |
| `hote` | text | `mac-studio` ou nom du serveur (jamais d'adresse) |
| `version` | text | commit du moteur |
| `dernier_signe_le` | timestamptz | dernier passage |
| `prochain_passage_le` | timestamptz | prochain passage prévu |
| `etat` | text | `actif` (signe de vie de moins de 15 minutes), `en_retard`, `muet` (plus de 2 heures) |
| `demandes_en_file` | int | demandes `QUEUED` |

### `vis_pages_client_v2`

Onglet **Rapports** : page client et rapport, lisibles dans le cockpit.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre |
| `nature` | text | `rapport` (pour Mickaël) ou `page_client` |
| `langue` | text | langue de la page |
| `html` | text | page générée par le moteur à partir des chiffres, sans script |
| `genere_le` | timestamptz | date |
| `etat` | text | `a_valider`, `valide` |
| `valide_par` | text | auteur |
| `valide_le` | timestamptz | date |

Le cockpit affiche `html` dans une zone isolée (`iframe` avec `sandbox`, sans
`allow-scripts`), et propose « Télécharger ». Publier ou envoyer au client
reste un geste de Mickaël hors du cockpit en v2.

### `vis_jugements_v2`

Onglets **Réponses** et **Sentiment**. Une ligne par réponse : le jugement de Jev pour la
marque, toujours un **extrait (Jev 1.13)**, jamais un fait. Source : `structured.jev`
(réponses importées d'Elmo 0.7.7) ou `structured.mentions.judge` (collecteur OIA).

| Colonne | Type | Sens |
| --- | --- | --- |
| `reponse_id` | uuid | réponse (`vis_reponses_v1.id`) |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre |
| `moteur` | text | assistant |
| `question_id` | text | question |
| `langue` | text | langue de la question |
| `recu_le` | timestamptz | réception |
| `collecteur` | text | `elmo`, `elmo-0.7.7`, `oia-direct`, `manual` |
| `etat` | text | `extrait` ou `non_mesurable` |
| `source` | text | toujours `extrait (Jev 1.13)`, à afficher avec le chiffre |
| `marque_citee` | boolean | marque citée selon Jev ; `null` si non mesurable |
| `sentiment` | text | `positive`, `neutral`, `negative`, `mixed` ; `null` si la marque n'est pas citée ou si non mesurable |
| `position` | int | rang de la marque parmi les entreprises suivies, selon leur première mention (1 = la première) |
| `mentions` | int | nombre de mentions de la marque |
| `passage` | text | passage qui porte le sentiment, ou `null` |
| `raison_non_mesurable` | text | `réponse reçue sans texte`, `synchronisée avant l'import des jugements de Jev`, `échec du juge`, `aucun jugement de Jev pour cette réponse` ; `null` si mesurée |

Les réponses synchronisées avant l'import (collecteur `elmo`) n'ont pas de jugement : elles
sont « non mesurable », jamais 0.

### `vis_jugements_moteurs_v2`

Carte **Sentiment** et position moyenne. Une ligne par fenêtre et par assistant (`tous` pour
l'ensemble).

| Colonne | Type | Sens |
| --- | --- | --- |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre |
| `moteur` | text | assistant, ou `tous` |
| `reponses` | int | réponses |
| `jugees` | int | réponses jugées par Jev |
| `non_mesurables` | int | réponses sans jugement |
| `marque_citee` | int | réponses où la marque est citée |
| `sentiment_positif` | int | réponses au sentiment `positive` |
| `sentiment_neutre` | int | `neutral` |
| `sentiment_negatif` | int | `negative` |
| `sentiment_mixte` | int | `mixed` |
| `position_moyenne` | numeric | moyenne de `position`, sur les réponses où la marque est citée |
| `etat` | text | `mesure`, ou `non_mesurable` si aucune réponse n'est jugée |
| `raison` | text | `aucune réponse jugée par Jev`, `marque jamais citée : sentiment et position sans objet`, ou `null` |
| `source` | text | `extrait (Jev 1.13)` |

Chaque sentiment s'affiche avec son effectif sur `marque_citee`, par exemple « 3 positives sur 5 ».

### `vis_reponses_sources_v2`

Détail d'une réponse : adresses citées et recherches lancées par l'assistant.

| Colonne | Type | Sens |
| --- | --- | --- |
| `reponse_id` | uuid | réponse |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre |
| `moteur` | text | assistant |
| `question_id` | text | question |
| `recu_le` | timestamptz | réception |
| `citations` | jsonb | `[{ "ordre", "url", "titre", "domaine" }]`, dans l'ordre de la réponse |
| `nb_citations` | int | citations |
| `recherches` | jsonb | termes de recherche lancés, tels que l'assistant les donne ; `null` s'ils ne sont pas fournis |
| `etat_recherches` | text | `fourni`, `aucune` (l'assistant n'a rien cherché), `non_fourni` (le fournisseur ne les donne pas, par exemple OpenRouter : « unavailable ») |

« non_fourni » s'affiche « Non fourni par l'assistant », jamais « aucune recherche ».

### `vis_couts_moteurs_v2`

Coût par fenêtre et par assistant (`tous` pour l'ensemble).

| Colonne | Type | Sens |
| --- | --- | --- |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre |
| `moteur` | text | assistant, ou `tous` |
| `reponses` | int | réponses |
| `cout_estime_usd` | numeric | somme des coûts enregistrés avec les réponses (estimation d'Elmo, ou coût du collecteur OIA) |
| `reponses_cout_reel` | int | réponses du collecteur OIA, qui donne le coût réel |
| `cout_reel_usd` | numeric | coût réel (réponse et juge) des réponses du collecteur OIA ; `null` s'il n'y en a aucune |

Le coût facturé consolidé n'est pas dans Visibility : il est dans `oia_ia_couts_v1` (0009).

### Écarts du branchement (Lovable, partie 1)

Ce que le branchement de la partie 1 demandait, et ce que la base fournit :

| Demande | Réponse |
| --- | --- |
| Sentiment global, par assistant et par réponse | `vis_jugements_v2`, `vis_jugements_moteurs_v2` : extrait (Jev 1.13) |
| Position moyenne dans les réponses | `vis_jugements_moteurs_v2.position_moyenne` : extrait (Jev 1.13) |
| Exactitude des faits cités | **Non mesurable** : le contrôle des réponses par les faits validés n'est pas en base |
| Intervalles de présence et part de voix par question | **Non mesurable** : quelques réponses par question et par fenêtre, trop peu pour un intervalle utile ; la courbe par question reste `vis_questions_v1` |
| URL des citations de chaque réponse | `vis_reponses_sources_v2.citations` |
| Termes de recherche de chaque assistant | `vis_reponses_sources_v2.recherches` |
| Pages consultées par chaque assistant | **Non mesurable** : seules les pages citées sont gardées, pas les pages lues |
| Opportunités de contenu | **Non mesurable** : aucun générateur ne les produit encore |
| Contrôles des profils sociaux, profils officiels | **Non mesurable** : non collectés |
| Alias de marque, plateformes non suivies | **Non mesurable** : les alias ne sont pas en base ; les homonymes du pilotage sont dans `vis_propositions_v2` |
| État Google d'un site | `vis_propositions_v2`, nature `audit`, contrôle `index-google`, quand l'audit l'a fait ; sinon **non mesurable** |
| Fréquence planifiée des fenêtres | `vis_fenetres_v2` : `jours_prevus`, `heure_utc` |
| Création d'un sujet depuis le cockpit | `vis_demander_site` |
| Coûts estimés par assistant | `vis_couts_moteurs_v2` |
| Coût facturé consolidé | hors Visibility : `oia_ia_couts_v1` (0009) |

### Reprises de la 0010

Quatre vues de `0010_visibility_vues_v2.sql`, reprises sans changement.

### `vis_mesure_v2`

Bandeau de mesure, avec la comparaison. Une ligne par fenêtre. Les colonnes de
`vis_mesure_v1` (contrat v1), puis quatre de plus.

| Colonne | Type | Sens |
| --- | --- | --- |
| `client_id` | text | fenêtre |
| `subject_id` | text | fenêtre |
| `window_id` | text | `vis.window.id` |
| `type_fenetre` | text | `baseline` (J0), `follow-up` (remesure), `reconnaissance` |
| `version_panel` | int | version du panel |
| `statut_fenetre` | text | `planned`, `running`, `done`, `aborted` |
| `debut` | date | premier jour |
| `fin` | date | dernier jour |
| `jours_prevus` | int | jours prévus |
| `jours_mesures` | bigint | jours avec au moins une réponse jugée |
| `jours_manquants` | bigint | jours déclarés manquants |
| `reponses` | bigint | réponses reçues |
| `reponses_jugees` | bigint | réponses jugées |
| `reponses_non_jugees` | bigint | reçues moins jugées |
| `questions` | bigint | questions distinctes |
| `moteurs` | text[] | moteurs présents |
| `versions_modele` | text[] | `moteur:version` présents |
| `changement_modele` | boolean | un moteur a répondu avec plusieurs versions |
| `langues` | text[] | langues des réponses |
| `collecteurs` | text[] | collecteurs |
| `cout_estime_usd` | numeric | somme des coûts des réponses |
| `etat` | text | `non_mesurable`, `mesure_en_cours`, `mesure_terminee`, `interrompue` |
| `rang_fenetre` | int | rang de la fenêtre dans son sujet (1 = la première) |
| `fenetre_reference` | text | référence de la dernière comparaison, ou `null` |
| `comparaison_id` | uuid | dernière comparaison, ou `null` |
| `verdict_non_marque` | text | verdict de la dernière comparaison (questions non marquées) |

### `vis_comparaisons_v2`

Onglet **Rapports** › comparaison. Une ligne par comparaison d'une fenêtre à sa référence.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | dérivé de l'empreinte du fichier |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre comparée |
| `fenetre_reference` | text | fenêtre de référence |
| `format` | int | 1 |
| `verdict_non_marque` | text | `hausse`, `baisse`, `pas de changement démontrable`, `non comparable` |
| `verdict_marque` | text | même échelle, questions marquées |
| `preuves_reference` | int | réponses de la référence |
| `empreinte_reference` | text | empreinte des réponses de la référence |
| `preuves_courantes` | int | réponses de la fenêtre |
| `empreinte_courante` | text | empreinte des réponses de la fenêtre |
| `empreinte` | text | SHA-256 du fichier de comparaison |
| `recu_le` | timestamptz | réception |
| `derniere` | boolean | la plus récente, celle qui fait foi |
| `recommandations_executees` | jsonb | exécutions entre les deux fenêtres (contexte, jamais cause) |
| `donnees` | jsonb | document entier |

### `vis_comparaison_moteurs_v2`

Détail d'une comparaison, par famille de questions et par moteur (`tous` pour le total).
Rien n'est recalculé en SQL.

| Colonne | Type | Sens |
| --- | --- | --- |
| `comparaison_id` | uuid | comparaison |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `window_id` | text | fenêtre comparée |
| `fenetre_reference` | text | référence |
| `famille` | text | `non_marquee`, `marquee` |
| `ordre` | int | 1 (non marquée), 2 (marquée) |
| `moteur` | text | moteur, ou `tous` |
| `reference_moyenne` | numeric | taux moyen des jours, référence (0 à 100) |
| `reference_borne_basse` | numeric | intervalle à 95 %, référence |
| `reference_borne_haute` | numeric | intervalle à 95 %, référence |
| `reference_jours` | int | jours de la référence |
| `courante_moyenne` | numeric | taux moyen des jours, fenêtre (0 à 100) |
| `courante_borne_basse` | numeric | intervalle à 95 %, fenêtre |
| `courante_borne_haute` | numeric | intervalle à 95 %, fenêtre |
| `courante_jours` | int | jours de la fenêtre |
| `verdict` | text | même échelle que `vis_comparaisons_v2` |
| `fragile` | boolean | comparaison fragile (version de modèle changée, réponses non mesurées) |
| `raison_fragile` | text | pourquoi, ou `null` |
| `versions` | jsonb | versions servies, des deux fenêtres |
| `non_mesurees` | jsonb | réponses non mesurées, des deux fenêtres |

### `vis_recommandations_v2`

Onglet **Recommandations**. Les colonnes de `vis_recommandations_v1`, puis la
fenêtre qui mesure l'exécution.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | text | recommandation |
| `client_id` | text | client |
| `subject_id` | text | sujet |
| `site_id` | text | site |
| `window_id` | text | fenêtre d'origine |
| `type` | text | `FIX_FACT`, `CONTENT_GAP`, `ENTITY_INCONSISTENCY`, `SOURCE_TARGET`, `TECH_FIX`, `WATCH` |
| `titre` | text | titre |
| `enonce` | text | énoncé |
| `impact` | text | `low`, `medium`, `high` |
| `effort` | text | `XS` à `XL` |
| `risque` | text | `low`, `medium`, `high` |
| `confiance` | text | `low`, `medium`, `high` |
| `cree_par` | text | agent ou personne |
| `cree_le` | timestamptz | création |
| `priorite` | int | 1 (`FIX_FACT`) à 6 (`WATCH`) |
| `etat` | text | `pending`, `accepted`, `rejected`, `obsolete` |
| `decide_par` | text | auteur de la dernière décision |
| `decide_le` | timestamptz | date de la dernière décision |
| `motif` | text | motif de la dernière décision |
| `derniere_execution` | text | `commit`, `url`, `pr-opened`, `pr-merged`, `rollback`, `other`, ou `null` |
| `reference_execution` | text | adresse ou empreinte du commit |
| `execute_le` | timestamptz | date d'exécution |
| `preuves` | jsonb | preuves (`kind`, `ref`) |
| `mesuree_par_fenetre` | text | fenêtre qui mesure l'exécution, ou `null` |
| `mesure_declaree_le` | timestamptz | date de ce rattachement |

## Précisions de la migration

Points que le contrat laissait ouverts, fixés par la migration (mandat v16, bloc A) :

- **Identité de l'appelant.** Le rôle de la session est lu dans le réglage `role`, posé
  par `set role` et que `security definer` ne change pas. Sans `set role`, c'est
  l'utilisateur de connexion. Un geste humain exige `authenticated` (PostgREST, session
  de l'utilisateur) : `service_role` est refusé (`42501`), même avec une identité. Une
  fonction du moteur exige `service_role`. Le moteur se connecte en `postgres` par le
  pooler et pose `set role service_role`, sans identité (`auth.uid()` nul). Si une
  identité est posée, ce doit être une identité de service (`vis.service_identity`).
  `postgres` sans `set role` est refusé.
- **Identifiant d'un nouveau sujet**, comme `dryRunSiteInit` (`src/site-init.ts`) : le
  nom d'hôte sans `www.`, les points et les caractères hors `[a-z0-9-]` remplacés par
  `-`, les tirets finaux retirés. Exemple : `https://www.site-fictif.example` donne
  `site-fictif-example`. La charge de `SITE_ADD` porte aussi `client_nom`.
- **Reprise et tentatives.** `vis_moteur_prendre` remet en file une demande `RUNNING`
  depuis plus de 30 minutes. Après 3 prises abandonnées, la demande passe `FAILED` et
  une alerte `ECHEC_DEMANDE` (`bloquant`) est créée. Elle se relance à la main
  (`vis_relancer_demande`).
- **Moteur muet.** Le moteur arrêté ne peut pas lever d'alerte. Tant que
  `vis_moteur_v2.etat` vaut `muet`, `vis_alertes_v2` montre une ligne `MOTEUR_MUET`
  calculée (client `oia`, gravité `bloquant`, non acquittable), lisible par les membres
  de `oia`. Pas de tâche planifiée en base.
- **Fenêtres en base dès l'estimation.** `vis_moteur_estimer` crée aussi la fenêtre dans
  `vis.window` (`planned`), à laquelle les preuves se rattachent ; `vis_moteur_fenetre`
  la tient à jour (`running`, `done`, `aborted`).
- **Heure du passage quotidien** : `heure_utc` de la dernière estimation
  (`vis_moteur_estimer`, paramètre `p_heure_utc`), rendue par `vis_fenetres_v2`,
  `vis_moteur_go` et `vis_moteur_sujet`.
- **Preuves** : comme l'import d'Elmo, une preuve déjà en base ne change ni de texte ni de
  fenêtre (`23514`, rien n'est écrit).

- **Rôles des gestes.** Fonctions `security definer` (chemin de recherche vide), avec
  contrôle explicite : `auth.uid()` non nul, jamais une identité de service, membre
  `owner` ou `approver` du client. `vis_acquitter_alerte` suit cette règle commune : un
  `viewer` ne l'appelle pas. Un nouveau client (`vis_demander_site` sans
  `p_client_id`) fait de son créateur l'`owner` de ce client.
- **Plafond global.** `vis_fixer_plafond(null, montant)` fixe le plafond global d'OIA.
  Il doit l'être avant tout plafond de client ; un GO vérifie les deux.
- **Dépense retenue du mois** (GO et `vis_budget_v2`) : `reel_usd + engage_usd`, en mois
  UTC. `engage_usd` : pour chaque GO du mois dont la fenêtre n'est ni `close` ni
  `annulee`, le coût vu au GO moins ce qu'elle a déjà dépensé. `etat` : `non_fixe` sans
  plafond, `atteint` si la dépense retenue atteint le plafond, `proche` dès 80 %.
- **Coût vu = estimation** : comparaison au centime près, à la dernière estimation
  de la fenêtre à lancer. Un GO sans estimation : `55000`.
- **Idempotence.** Même appel, même résultat, sans doublon :
  `vis_demander_site` (mêmes paramètres, demande `QUEUED` ou `RUNNING`) ; les deux GO
  (même coût vu et même début, demande en file ou en cours) ;
  `vis_modifier_proposition` (même contenu) ; `vis_ajouter_proposition` (identifiant
  dérivé du contenu) ; `vis_valider_faits`, `vis_valider_panel` et
  `vis_valider_concurrents` (même décision) ; `vis_relancer_demande` (la même relance) ;
  `vis_acquitter_alerte`. Une décision contraire à une décision prise : `55000`.
- **Identifiants des propositions** : `<sujet>:<nature>:<local>`. Une proposition
  ajoutée dans le cockpit a pour partie locale `m-` suivie de 10 caractères
  hexadécimaux.
- **Questions non marquées** (`presence_non_marquee`) : réponses de la dernière fenêtre
  close (J0 ou remesure) aux questions non marquées, selon `vis_ui.question` ou, à
  défaut, la proposition `<sujet>:question:<prompt_id>`. `vis_apercu_v1` mêle les deux
  familles et ne sert donc pas à ce chiffre.
- **Heure courante.** Quelques colonnes dépendent du jour, ce que la v1 évitait :
  `jour_courant`, `cout_mois_usd`, `vis_budget_v2` (le mois en cours),
  `vis_moteur_v2.etat`. Elles lisent `vis_ui.maintenant()`, égale à `now()` sauf si la
  session pose `vis.maintenant`, ce que seuls la démonstration et les tests font ; les
  fonctions, elles, n'utilisent que `now()`.
- **Étape `bloque`** : dernière demande `FAILED`, alerte `bloquant` non acquittée,
  coût réel du mois au plafond, ou moteur `muet` alors qu'une demande attend ou qu'une
  fenêtre est en cours. `depuis_le` est la date du dernier événement qui a fait entrer
  le site dans son étape.
- **Types de fenêtre en base** : `reference` → `baseline`, `remesure` → `follow-up`,
  `reconnaissance` → `reconnaissance`, ce qui est une valeur nouvelle de
  `vis.window.kind`, donc de `vis_mesure_v1.type_fenetre`.
- **Charge des demandes** : `SITE_ADD` `{url, nom, langues, marches}` ; `RECON`
  `{window_id, cout_vu_usd}` ; `WINDOW_RUN` `{window_id, cout_vu_usd, debut, gel}`, où
  `gel` (`freeze-<fenêtre>`) est le gel que le moteur pose au démarrage.
- **Pages** : un `html` qui contient `<script` ou `javascript:` est refusé (`22023`).

## Fonctions des gestes

Toutes `security invoker` (ou `definer` avec contrôle explicite du rôle,
documenté), accordées à `authenticated` seulement, journalisées dans `vis.geste`.

| Fonction | Écran et bouton | Contrôles | Effet |
| --- | --- | --- | --- |
| `vis_demander_site(p_url text, p_nom text, p_langues text[], p_marches text[], p_client_id text default null, p_client_nom text default null)` → `uuid` | Portefeuille › « Ajouter un site » | adresse publique en `https`, langues dans `fr`, `en`… ; client existant (`owner`/`approver`) ou nouveau (`owner` OIA) | crée client, site et sujet `draft`, puis une demande `SITE_ADD` |
| `vis_modifier_proposition(p_id text, p_contenu jsonb)` → `int` | Revue › modifier une question, un fait, un concurrent | élément `propose`, contenu conforme à sa nature | nouvelle version, état `propose` |
| `vis_ajouter_proposition(p_subject text, p_nature text, p_contenu jsonb)` → `text` | Revue › « Ajouter » | nature `fait`, `question` ou `concurrent` | nouvel élément `propose`, `propose_par` = auteur |
| `vis_valider_faits(p_subject text, p_ids text[], p_rejetes text[] default '{}')` → `int` | Revue › Faits › « Valider la sélection » | éléments du sujet | `valide` ou `rejete` |
| `vis_valider_panel(p_subject text, p_ids text[])` → `int` | Revue › Panel › « Valider le panel » | au moins 1 question par langue, au moins 1 non marquée par langue | fige une version de panel ; les autres questions passent `rejete` ; renvoie la version |
| `vis_go_reconnaissance(p_subject text, p_cout_vu_usd numeric)` → `uuid` | Revue › « Lancer la reconnaissance » | panel validé ; coût vu = estimation ; sous le plafond | fenêtre `reconnaissance` `go_donne`, demande `RECON` |
| `vis_valider_concurrents(p_subject text, p_ids text[], p_homonymes text[] default '{}')` → `int` | Revue › Concurrents › « Valider » | après la reconnaissance | liste suivie et homonymes à exclure figés |
| `vis_go_fenetre(p_subject text, p_debut date, p_cout_vu_usd numeric)` → `text` | Étude › « Lancer l'étude » | étape `pret_pour_go` ou `remesure_proposee` ; début ≥ demain ; coût vu = estimation ; sous le plafond | fenêtre `go_donne` (J0 ou remesure, gel inclus), demande `WINDOW_RUN` ; renvoie `window_id` |
| `vis_annuler_fenetre(p_window text, p_motif text)` → `void` | Étude › « Arrêter » | fenêtre `go_donne` ou `en_cours`, motif obligatoire | `annulee` ; les preuves déjà reçues restent |
| `vis_valider_rapport(p_page uuid)` → `void` | Rapports › « Valider » | page `a_valider` | `valide` |
| `vis_valider_recommandation(id, motif?)`, `vis_rejeter_recommandation(id, motif)` | Recommandations | v1, inchangées | v1 |
| `vis_declarer_execution(p_recommandation text, p_preuve text, p_date date, p_note text default null)` → `bigint` | Recommandations › « Marquer comme fait » | recommandation `accepted` ; preuve = URL ou empreinte de commit ; date ≤ aujourd'hui | exécution ajoutée ; rattachée à la prochaine remesure |
| `vis_fixer_plafond(p_client text, p_plafond_usd numeric)` → `void` | Réglages › Budget | `owner` OIA ; 0 ≤ plafond ≤ plafond global | nouveau plafond, effet immédiat |
| `vis_relancer_demande(p_demande uuid)` → `uuid` | Activité › « Relancer » | demande `FAILED` | nouvelle demande identique |
| `vis_acquitter_alerte(p_alerte uuid)` → `void` | Cloche | membre du client | alerte acquittée |

## Fonctions du moteur (identité de service, jamais l'interface)

- `vis_moteur_prendre(p_hote text)` → prochaine demande `QUEUED`
  (`for update skip locked`), passée `RUNNING`.
- `vis_moteur_terminer(p_demande uuid, p_resultat jsonb, p_erreur text)`.
- `vis_moteur_signe(p_hote text, p_version text, p_prochain timestamptz)`.
- Écritures du moteur : propositions (`propose_par = 'moteur'`), estimations
  de fenêtre, jours consignés, preuves (`vis.evidence`, inchangé), pages,
  recommandations, alertes. Révoquées pour `anon` et `authenticated`.

Signatures, fixées avec le moteur (`infra/visibility/src/engine/db.ts`, `MOTEUR_SQL`).
Exécution accordée à `service_role` seulement, session `service_role` exigée (voir
« Identité de l'appelant ») ; si la session porte un `auth.uid()`, ce doit être une
identité de service, sinon `42501`. Aucune écriture directe dans une table n'est accordée
au moteur. Les paramètres facultatifs acceptent `null` : `p_resultat`, `p_erreur`,
`p_source`, `p_compare_avec`, `p_debut`, `p_heure_utc`, et `p_subject` de
`vis_moteur_alerter`.

| Fonction | Effet et refus |
| --- | --- |
| `vis_moteur_prendre(p_hote text)` → `jsonb` | D'abord, toute demande `RUNNING` depuis plus de 30 minutes repasse `QUEUED` (reprise, en base), ou `FAILED` avec une alerte `ECHEC_DEMANDE` après 3 tentatives. Puis la plus ancienne `QUEUED` passe `RUNNING`, avec sa tentative et l'hôte ; rend sa ligne de `vis_demandes_v2`, ou `null`. Deux moteurs ne prennent jamais la même : verrou `for update skip locked`, statut relu sous le verrou, index unique par tentative |
| `vis_moteur_terminer(p_demande uuid, p_resultat jsonb, p_erreur text)` → `void` | `DONE` si `p_erreur` est nul, sinon `FAILED`. Refus : demande inconnue (`P0002`), demande qui n'est pas `RUNNING` (`55000`) |
| `vis_moteur_signe(p_hote text, p_version text, p_prochain timestamptz)` → `void` | Signe de vie (`vis_moteur_v2`) |
| `vis_moteur_sujet(p_subject text)` → `jsonb` | `{subject_id, client_id, client_nom, site_url, nom, langues, marches, propositions[], panel_version, fenetres[], executions[], plafond_usd, plafond_global_usd}`, ou `null`. Propositions comme `vis_propositions_v2` ; fenêtres `{window_id, nature, libelle, statut, debut, jours_prevus, compare_avec, heure_utc}` ; exécutions `{recommandation, date, fenetre}` |
| `vis_moteur_go(p_subject text, p_window text)` → `jsonb` | `{window_id, statut, debut, go_par, go_le, cout_vu_au_go_usd, cout_estime_usd, plafond_usd, reel_usd, engage_usd, plafond_global_usd, heure_utc}`, ou `null` ; `reel_usd` et `engage_usd` du mois UTC en cours. Lu avant tout appel payant : aucun appel sans `go_par` |
| `vis_moteur_proposer(p_subject text, p_id text, p_nature text, p_contenu jsonb, p_source text)` → `int` | Nouvelle version seulement si l'élément est encore `propose` et que son contenu change ; rend la version courante. Refus : contenu non conforme à la nature, identifiant qui n'est pas `<sujet>:<nature>:<local>` (`22023`) |
| `vis_moteur_estimer(p_subject text, p_window text, p_nature text, p_libelle text, p_compare_avec text, p_jours int, p_questions int, p_moteurs text[], p_cout_usd numeric, p_detail jsonb, p_heure_utc text default null)` → `void` | Crée la fenêtre `proposee` si elle n'existe pas, dans le pilotage et dans `vis.window` (`planned`), et ajoute une estimation (la dernière fait foi : un GO à un autre coût vu est refusé). Refus : coût illisible (`22023`), fenêtre déjà lancée (`55000`) |
| `vis_moteur_fenetre(p_subject text, p_window text, p_statut text, p_debut date)` → `void` | `go_donne` → `en_cours` → `close` ; `annulee` depuis `proposee`, `go_donne` ou `en_cours`. Le même statut ne change rien. Tout autre passage : `55000` (le GO reste un geste humain) |
| `vis_moteur_jour(p_subject text, p_window text, p_jour int, p_date date, p_etat text, p_detail jsonb)` → `void` | Jour consigné `complet`, `partiel` ou `manquant`, une fois ; un rappel ne change rien. Jour hors de la fenêtre : `22023` |
| `vis_moteur_preuves(p_preuves jsonb)` → `int` | Tableau de lignes de `vis.evidence` (colonnes de `src/vis-sync.ts`), ajout seul, empreinte calculée par la base ; une preuve déjà en base au même texte et à la même fenêtre est ignorée, à un autre texte ou une autre fenêtre tout est refusé (`23514`) ; rend le nombre de preuves nouvelles |
| `vis_moteur_page(p_subject text, p_window text, p_nature text, p_langue text, p_html text)` → `uuid` | Page `rapport` ou `page_client`, `a_valider`. Script refusé (`22023`) |
| `vis_moteur_recommandation(p_subject text, p_window text, p_recommandation jsonb)` → `boolean` | Recommandation au format de `src/recommendation.ts`, en attente ; `false` si son identifiant existe déjà, jamais réécrite |
| `vis_moteur_alerter(p_client text, p_subject text, p_gravite text, p_type text, p_message text)` → `uuid` | Alerte de `vis_alertes_v2` |

## Démonstration

`packages/database/demo/visibility-v2-demo.sql` et
`docs/interface/demo/visibility-v2-demo.json` : un client fictif avec un site à
chaque étape du parcours (demandé, à valider, reconnaissance, prêt pour GO,
mesure en cours jour 3, rapport à valider, actions en cours, remesure proposée,
bloqué par plafond), le moteur actif, deux alertes. Lovable construit les
écrans dessus avant les vraies données.

Le fichier JSON est le résultat des huit vues du pilotage, lu par le membre fictif
`00000000-0000-4000-8000-00000000de00`, à l'heure figée `2026-11-18T10:00:00Z`
(`vis.maintenant`). Le test le vérifie ; pour le régénérer :
`OIA_ECRIRE_DEMO=1 pnpm --filter @oia/database exec vitest run test/visibility-pilotage.test.ts`.

## Historique

| Version | Date | Changement |
| --- | --- | --- |
| 2 | 2026-11-16 | Création : pilotage depuis le cockpit (amendement « cockpit d'abord ») |
| 2 | 2026-11-16 | Migration (vis 0006_pilotage, 0011) : colonnes des reprises de la 0010, signatures des écritures du moteur, « Précisions de la migration », démonstration |
| 2 | 2026-11-16 | Besoins du moteur : `tentatives` (`vis_demandes_v2`), `heure_utc` (`vis_fenetres_v2`), identité par le rôle de session, alerte `MOTEUR_MUET` calculée ; écarts de Lovable : `vis_jugements_v2`, `vis_jugements_moteurs_v2`, `vis_reponses_sources_v2`, `vis_couts_moteurs_v2`, et la liste de ce qui reste non mesurable |

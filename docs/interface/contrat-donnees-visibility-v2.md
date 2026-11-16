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

Ce document fixe les **noms, colonnes, valeurs et erreurs**. La migration
(`packages/database/supabase/migrations/0011_visibility_pilotage.sql`, numéro à
ajuster) l'implémente à l'identique, et un test vérifie que chaque vue a
exactement les colonnes de ce document, dans l'ordre (comme pour la v1).

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

### Reprises de la 0010

`vis_mesure_v2`, `vis_comparaisons_v2`, `vis_comparaison_moteurs_v2`,
`vis_recommandations_v2` : colonnes telles que dans
`0010_visibility_vues_v2.sql`. Elles sont à décrire ici, colonne par colonne,
par la session qui applique la migration, avant de livrer le brief à Lovable.

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

## Démonstration

`packages/database/demo/visibility-v2-demo.sql` et
`docs/interface/demo/visibility-v2-demo.json` : un client fictif avec un site à
chaque étape du parcours (demandé, à valider, reconnaissance, prêt pour GO,
mesure en cours jour 3, rapport à valider, actions en cours, remesure proposée,
bloqué par plafond), le moteur actif, deux alertes. Lovable construit les
écrans dessus avant les vraies données.

## Historique

| Version | Date | Changement |
| --- | --- | --- |
| 2 | 2026-11-16 | Création : pilotage depuis le cockpit (amendement « cockpit d'abord ») |

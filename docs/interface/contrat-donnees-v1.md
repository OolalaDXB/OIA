# Contrat de données · cockpit OIA · version 1 (figée)

8 novembre 2026 · mandat v9, bloc E · **version 1, figée**.

Ce document est le contrat entre le cockpit conçu dans Lovable et la base OIA
(`iywmvyebuikxyvnrcnoy`) pour **Money Lookup**, **Visibility**, la **recherche
assistée** et **Shyrka**. Lovable possède l'interface ; Claude Code possède les
données. Les colonnes et types ci-dessous sont lus dans la base de production
après application des migrations (test : `packages/database/test/contrat-v1.test.ts`).

Il reprend, sans les changer, les règles détaillées de
`contrat-donnees-money-lookup.md` (typologie, honnêteté, écrans) et de
`contrat-donnees-visibility.md` (indicateurs, formules, « non mesurable »),
qui en font partie.

## 1. Règles communes

- **Connexion.** Le cockpit utilise le client Supabase du projet OIA avec la
  **clé publique** (anon) et la session de l'utilisateur connecté. Aucune clé
  de service dans le navigateur, jamais.
- **Droits.** Les vues appliquent les droits de l'appelant (`security_invoker`).
  - Money Lookup et recherche assistée : membres du studio (`oia_membre`).
  - Visibility : membres du client (`vis.client_member`).
  - Shyrka : comptes de Mickaël seulement (propriétaires du studio), et chacun
    ne lit que ses propres lignes.
  - Sans connexion, rien n'est lisible (erreur 401). Connecté sans droit : la
    vue rend 0 ligne.
- **Écriture.** Aucune écriture directe dans une table : uniquement les
  fonctions du § 5 et les fonctions serveur du § 6.
- **États à prévoir sur chaque écran :**
  - **chargement** : squelette, sans chiffres ;
  - **vide** : une phrase qui dit pourquoi (« Aucune opportunité dans cet
    espace », « Mesure en cours, jour 1 sur 5 : pas encore d'indicateur stable ») ;
  - **erreur** : message et bouton « Réessayer » ; jamais de données en cache
    présentées comme à jour ;
  - **accès non accordé** : 0 ligne pour un compte connecté sans droit, à dire
    comme tel et non comme « vide ».
- **Honnêteté.** Un montant inconnu est `null` et s'affiche « inconnu ». Un
  indicateur sans dénominateur est « non mesurable », jamais 0. Rien n'est
  « vérifié » sans décision humaine.
- **Dates** : `timestamp with time zone` en UTC (ISO 8601) ; `date` sans heure.

## 2. Money Lookup

### `ml_toutes_v1`

Liste complète, base de tous les écrans de liste.

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `record_id` | text |
| `titre` | text |
| `emetteur` | text |
| `nature` | text |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `montant` | numeric |
| `devise` | text |
| `confiance_montant` | text |
| `montant_connu` | boolean |
| `echeance` | timestamp with time zone |
| `recommandation` | text |
| `statut_verification` | text |
| `verifie_par_humain` | boolean |
| `gate_ok` | boolean |
| `raisons_gate` | ARRAY |
| `decision_humaine` | text |
| `decide_le` | timestamp with time zone |
| `projet_etiquete` | text |
| `projets_decouverte` | ARRAY |
| `url_officielle` | text |
| `vu_la_premiere_fois` | timestamp with time zone |
| `vu_la_derniere_fois` | timestamp with time zone |
| `disparu_le` | timestamp with time zone |

### `ml_financements_v1`

Subventions, prix, aides fiscales, prêts (mêmes colonnes que `ml_toutes_v1`).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `record_id` | text |
| `titre` | text |
| `emetteur` | text |
| `nature` | text |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `montant` | numeric |
| `devise` | text |
| `confiance_montant` | text |
| `montant_connu` | boolean |
| `echeance` | timestamp with time zone |
| `recommandation` | text |
| `statut_verification` | text |
| `verifie_par_humain` | boolean |
| `gate_ok` | boolean |
| `raisons_gate` | ARRAY |
| `decision_humaine` | text |
| `decide_le` | timestamp with time zone |
| `projet_etiquete` | text |
| `projets_decouverte` | ARRAY |
| `url_officielle` | text |
| `vu_la_premiere_fois` | timestamp with time zone |
| `vu_la_derniere_fois` | timestamp with time zone |
| `disparu_le` | timestamp with time zone |

### `ml_appels_offres_v1`

Appels d'offres (mêmes colonnes).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `record_id` | text |
| `titre` | text |
| `emetteur` | text |
| `nature` | text |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `montant` | numeric |
| `devise` | text |
| `confiance_montant` | text |
| `montant_connu` | boolean |
| `echeance` | timestamp with time zone |
| `recommandation` | text |
| `statut_verification` | text |
| `verifie_par_humain` | boolean |
| `gate_ok` | boolean |
| `raisons_gate` | ARRAY |
| `decision_humaine` | text |
| `decide_le` | timestamp with time zone |
| `projet_etiquete` | text |
| `projets_decouverte` | ARRAY |
| `url_officielle` | text |
| `vu_la_premiere_fois` | timestamp with time zone |
| `vu_la_derniere_fois` | timestamp with time zone |
| `disparu_le` | timestamp with time zone |

### `ml_investisseurs_v1`

Investisseurs et capital (mêmes colonnes).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `record_id` | text |
| `titre` | text |
| `emetteur` | text |
| `nature` | text |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `montant` | numeric |
| `devise` | text |
| `confiance_montant` | text |
| `montant_connu` | boolean |
| `echeance` | timestamp with time zone |
| `recommandation` | text |
| `statut_verification` | text |
| `verifie_par_humain` | boolean |
| `gate_ok` | boolean |
| `raisons_gate` | ARRAY |
| `decision_humaine` | text |
| `decide_le` | timestamp with time zone |
| `projet_etiquete` | text |
| `projets_decouverte` | ARRAY |
| `url_officielle` | text |
| `vu_la_premiere_fois` | timestamp with time zone |
| `vu_la_derniere_fois` | timestamp with time zone |
| `disparu_le` | timestamp with time zone |

### `ml_signals_v1`

Signaux (nouveautés, changements, disparitions).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `type` | text |
| `nature_signal` | text |
| `titre` | text |
| `detail` | text |
| `action_suivante` | text |
| `gravite` | integer |
| `le` | timestamp with time zone |
| `acquitte_le` | timestamp with time zone |
| `record_id` | text |
| `projet` | text |

### `ml_aujourdhui_v1`

« Aujourd'hui » : ce qui demande une action.

| Colonne | Type |
| --- | --- |
| `espace_id` | uuid |
| `raison` | text |
| `titre` | text |
| `record_id` | text |
| `projet` | text |
| `echeance` | timestamp with time zone |
| `reference` | text |

### `ml_montants_v1`

Montants par catégorie, sens et devise ; jamais additionnés entre eux.

| Colonne | Type |
| --- | --- |
| `espace_id` | uuid |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `devise` | text |
| `verifie_par_humain` | boolean |
| `opportunites` | bigint |
| `avec_montant` | bigint |
| `somme_connue` | numeric |
| `montants_peu_surs` | bigint |

### `ml_fiche_v1`

Fiche d'une opportunité, avec décisions, notes et tâches.

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `espace_id` | uuid |
| `record_id` | text |
| `titre` | text |
| `emetteur` | text |
| `nature` | text |
| `categorie` | USER-DEFINED |
| `sens` | USER-DEFINED |
| `montant` | numeric |
| `devise` | text |
| `confiance_montant` | text |
| `montant_connu` | boolean |
| `echeance` | timestamp with time zone |
| `recommandation` | text |
| `statut_verification` | text |
| `verifie_par_humain` | boolean |
| `gate_ok` | boolean |
| `raisons_gate` | ARRAY |
| `decision_humaine` | text |
| `decide_le` | timestamp with time zone |
| `projet_etiquete` | text |
| `projets_decouverte` | ARRAY |
| `url_officielle` | text |
| `vu_la_premiere_fois` | timestamp with time zone |
| `vu_la_derniere_fois` | timestamp with time zone |
| `disparu_le` | timestamp with time zone |
| `source` | jsonb |
| `decisions` | jsonb |
| `notes` | jsonb |
| `taches` | jsonb |

### `ml_decision_v1`

Dernière décision humaine par opportunité.

| Colonne | Type |
| --- | --- |
| `espace_id` | uuid |
| `record_id` | text |
| `decision` | text |
| `decide_le` | timestamp with time zone |
| `decide_par` | text |

Exemple fictif (`ml_toutes_v1`) : `{ "titre": "Appel à projets fictif", "nature": "GRANT", "categorie": "subvention", "montant": null, "montant_connu": false, "echeance": null, "decision_humaine": "PENDING", "projets_decouverte": ["projet-fictif"] }`, affiché « montant inconnu, échéance inconnue, à décider ».

## 3. Visibility

### `vis_sujets_v1`

Sujets visibles et rôle de l'utilisateur.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `client_nom` | text |
| `subject_id` | text |
| `statut` | text |
| `mon_role` | text |
| `domaines` | ARRAY |

### `vis_mesure_v1`

État d'une fenêtre : « Mesure en cours, jour N sur 5 ».

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `type_fenetre` | text |
| `version_panel` | integer |
| `statut_fenetre` | text |
| `debut` | date |
| `fin` | date |
| `jours_prevus` | integer |
| `jours_mesures` | bigint |
| `jours_manquants` | bigint |
| `reponses` | bigint |
| `reponses_jugees` | bigint |
| `reponses_non_jugees` | bigint |
| `questions` | bigint |
| `moteurs` | ARRAY |
| `versions_modele` | ARRAY |
| `changement_modele` | boolean |
| `langues` | ARRAY |
| `collecteurs` | ARRAY |
| `cout_estime_usd` | numeric |
| `etat` | text |

### `vis_apercu_v1`

Vue d'ensemble : quatre indicateurs, numérateur, dénominateur, intervalle, état.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `moteur` | text |
| `indicateur` | text |
| `ordre` | integer |
| `numerateur` | bigint |
| `denominateur` | bigint |
| `valeur` | numeric |
| `methode_intervalle` | text |
| `borne_basse` | numeric |
| `borne_haute` | numeric |
| `jours_mesures` | integer |
| `jours_prevus` | integer |
| `etat` | text |
| `raison_non_mesurable` | text |

### `vis_reponses_v1`

Réponses des assistants, avec empreinte (preuve).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `question_id` | text |
| `version_question` | integer |
| `langue` | text |
| `moteur` | text |
| `version_modele` | text |
| `fournisseur` | text |
| `collecteur` | text |
| `recu_le` | timestamp with time zone |
| `jour` | date |
| `texte` | text |
| `empreinte` | text |
| `statut_jugement` | text |
| `marque_citee` | boolean |
| `concurrents` | ARRAY |
| `recherche_web` | boolean |
| `nb_citations` | bigint |
| `cout_usd` | numeric |

### `vis_citations_v1`

Citations par moteur et domaine.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `moteur` | text |
| `url` | text |
| `domaine` | text |
| `categorie` | text |
| `citations` | bigint |
| `reponses` | bigint |
| `questions` | bigint |
| `premier_jour` | date |
| `dernier_jour` | date |

### `vis_reseaux_sociaux_v1`

Réseaux sociaux cités.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `plateforme` | text |
| `url` | text |
| `citations` | bigint |
| `denominateur` | bigint |
| `part` | numeric |
| `questions` | bigint |
| `moteurs` | ARRAY |

### `vis_concurrents_v1`

Concurrents cités.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `moteur` | text |
| `entite` | text |
| `est_marque` | boolean |
| `mentions` | bigint |
| `denominateur_part` | bigint |
| `part_de_voix` | numeric |
| `reponses_jugees` | bigint |
| `taux_apparition` | numeric |
| `methode_intervalle` | text |
| `borne_basse` | numeric |
| `borne_haute` | numeric |
| `questions` | bigint |

### `vis_questions_v1`

Questions du panel et résultats par question.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `question_id` | text |
| `version_question` | integer |
| `langue` | text |
| `texte` | text |
| `marquee` | boolean |
| `etiquettes` | ARRAY |
| `moteur` | text |
| `jour` | date |
| `reponses` | bigint |
| `reponses_jugees` | bigint |
| `avec_marque` | bigint |
| `etat` | text |

### `vis_recommandations_v1`

Recommandations et correctifs, avec leur état (`pending`, `validated`, `rejected`).

| Colonne | Type |
| --- | --- |
| `id` | text |
| `client_id` | text |
| `subject_id` | text |
| `site_id` | text |
| `window_id` | text |
| `type` | text |
| `titre` | text |
| `enonce` | text |
| `impact` | text |
| `effort` | text |
| `risque` | text |
| `confiance` | text |
| `cree_par` | text |
| `cree_le` | timestamp with time zone |
| `priorite` | integer |
| `etat` | text |
| `decide_par` | text |
| `decide_le` | timestamp with time zone |
| `motif` | text |
| `derniere_execution` | text |
| `reference_execution` | text |
| `execute_le` | timestamp with time zone |
| `preuves` | jsonb |

### `vis_rapports_v1`

Rapports de fenêtre.

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `client_id` | text |
| `subject_id` | text |
| `window_id` | text |
| `type` | text |
| `genere_le` | timestamp with time zone |
| `version_panel` | integer |
| `statut` | text |
| `fichier` | text |
| `empreinte` | text |
| `chiffres` | jsonb |

### `vis_seo_command_v1`

Journal des missions de SEO Command.

| Colonne | Type |
| --- | --- |
| `id` | bigint |
| `client_id` | text |
| `subject_id` | text |
| `le` | timestamp with time zone |
| `qui` | text |
| `quoi` | text |
| `mission_id` | text |
| `cout_usd` | numeric |
| `details` | jsonb |

### `vis_planificateur_v1`

État du planificateur.

| Colonne | Type |
| --- | --- |
| `client_id` | text |
| `actif` | boolean |
| `bascule_par` | text |
| `bascule_le` | timestamp with time zone |
| `motif` | text |

Exemple fictif (`vis_mesure_v1`) : `{ "window_id": "sujet-fictif-j0", "statut_fenetre": "running", "etat": "mesure_en_cours", "jours_mesures": 1, "jours_prevus": 5, "reponses": 50 }`, affiché « Mesure en cours, jour 1 sur 5 ».

## 4. Shyrka (zone Contexte) et budget IA

### `shy_conversation`

Conversations de l'utilisateur (zone Contexte).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `titre` | text |
| `cree_le` | timestamp with time zone |
| `maj_le` | timestamp with time zone |

### `shy_message`

Messages d'une conversation (`role` : `mickael` ou `shyrka`, `sources` en JSON).

| Colonne | Type |
| --- | --- |
| `id` | bigint |
| `conversation_id` | uuid |
| `user_id` | uuid |
| `role` | text |
| `contenu` | text |
| `sources` | jsonb |
| `le` | timestamp with time zone |

### `shy_brouillon`

Brouillons préparés par Shyrka. `statut` vaut toujours `brouillon` : rien n'est envoyé.

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `conversation_id` | uuid |
| `type` | text |
| `titre` | text |
| `contenu` | text |
| `statut` | text |
| `cree_le` | timestamp with time zone |

### `shy_contexte`

Éléments de contexte (`a_valider`, `valide`, `retire`).

| Colonne | Type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `type` | text |
| `contenu` | text |
| `source` | text |
| `statut` | text |
| `cree_le` | timestamp with time zone |

### `shy_journal`

Journal des actions de Shyrka et de Mickaël, sans texte de conversation.

| Colonne | Type |
| --- | --- |
| `id` | bigint |
| `user_id` | uuid |
| `le` | timestamp with time zone |
| `acteur` | text |
| `quoi` | text |
| `cible` | text |
| `resultat` | text |

### `oia_ia_budget_v1`

Budget IA du mois (recherche assistée et Shyrka réunies) : plafond 5 $, alerte 4 $.

| Colonne | Type |
| --- | --- |
| `mois` | date |
| `plafond_usd` | numeric |
| `alerte_usd` | numeric |
| `depense_usd` | numeric |
| `reserve_usd` | numeric |
| `reste_usd` | numeric |
| `alerte` | boolean |
| `appels_shyrka` | bigint |
| `appels_money_match` | bigint |
| `refus` | bigint |

## 5. Fonctions d'écriture (`rpc`)

Money Lookup (rôle éditeur ou propriétaire du studio) : `oia_decider`,
`oia_etiqueter`, `oia_noter`, `oia_modifier_note`, `oia_creer_tache`,
`oia_basculer_tache`, `oia_creer_contact`, `oia_enregistrer_vue`,
`oia_acquitter_alerte`, `oia_demander`, `oia_importer_sauvegarde`,
`oia_annuler_import` (paramètres : `contrat-donnees-money-lookup.md`). L'espace
du studio est `00000000-0000-4000-8000-000000000001`.

Visibility (rôle `owner` ou `approver` du client) :
`vis_valider_recommandation(client_id, recommandation_id)`,
`vis_rejeter_recommandation(client_id, recommandation_id)`.

Shyrka (comptes de Mickaël) : `shy_ajouter_contexte(type, contenu, source)`,
`shy_statuer_contexte(id, 'valide' | 'retire')`,
`shy_oublier('conversation' | 'contexte', id)`. Les conversations et les
brouillons s'écrivent par `shyrka-chat`, jamais par le navigateur.

Erreurs : `42501` droit refusé, `22023` valeur refusée, `P0002` introuvable.
Le message s'affiche tel quel.

## 6. Fonctions serveur

Appel : `supabase.functions.invoke('<nom>', { body })`, avec la session de
l'utilisateur (le client ajoute l'en-tête `Authorization`).

### `money-match` · recherche assistée

- Entrée : `{ "texte": string (1 000 caractères au plus), "projet"?: string }`.
- Sortie : `{ "correspondances": [{ "id", "rang", "titre", "explication", "informations_manquantes": string[], "source": { "vue": "ml_toutes_v1", "id" } }], "candidats": number, "cout_usd": number, "alerte_budget": boolean, "message"?: string }`.
- Droits : membres du studio. Plafonds : 30 recherches par jour, budget IA
  commun de 5 $ par mois.
- Exemple fictif : `{ "id": "…", "rang": 1, "titre": "Appel fictif", "explication": "Cible la rénovation de petites centrales.", "informations_manquantes": ["montant", "échéance"] }`.

### `shyrka-chat` · conversation en texte

- Entrée : `{ "message": string, "conversation_id"?: uuid, "prive"?: boolean }`.
- Sortie : `{ "conversation_id": uuid | null, "reponse": string, "sources": [{ "vue", "id", "date" }], "brouillons": uuid[], "outils": string[], "cout_usd": number, "alerte_budget": boolean, "prive": boolean }`.
- Droits : comptes de Mickaël. Plafonds : 100 messages par jour, 4 000 jetons
  d'entrée par appel, budget IA commun. Mode privé : rien n'est conservé
  (`conversation_id` vaut `null`).
- Texte seulement : aucune commande vocale dans le cockpit.

### Erreurs des fonctions serveur

| Statut | `code` | À afficher |
| --- | --- | --- |
| 401 | `connexion_requise` | « Connecte-toi pour continuer. » |
| 403 | `acces_refuse` | « Accès non accordé. » |
| 400 | `vide`, `trop_long`, `22023` | le message reçu |
| 429 | `limite_quotidienne`, `plafond_mensuel` | le message reçu ; pas de nouvel essai automatique |
| 5xx | `configuration`, `interne`, `base` | « Service indisponible, réessaie plus tard. » |

## 7. Évolution du contrat

- **Version 1 figée le 8 novembre 2026.** Aucun changement silencieux.
- Ajouter une colonne à une vue : compatible, la vue garde `_v1`, et ce
  document le consigne.
- Retirer, renommer ou changer le sens d'une colonne : nouvelle vue `_v2`,
  `_v1` servie au moins 30 jours, et **contrat version 2**.
- Toute évolution passe par une migration du dossier canonique, testée, puis
  par ce document. Lovable ne crée ni ne modifie jamais de table, de
  migration, de politique ou de fonction dans Supabase.

## Historique

- v1 · 2026-11-08 · mandat v9 : première version figée, en production.
- Money Lookup, contrat version 2 · 2026-11-08 : quatorze vues ajoutées, sans rien changer à ce document ni aux vues ci-dessus (`contrat-donnees-money-lookup.md`, section « Version 2 » ; migration 0008, à appliquer).


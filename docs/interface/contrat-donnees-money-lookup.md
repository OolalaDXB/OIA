# Contrat de données · Money Lookup · version 2

2026-11-08 · mandat v8, blocs A1 et A4 · exigence 8. Version 2 le même jour : les vues qui manquent pour remplacer la console (section « Version 2 »).
**Lovable possède l'interface ; Claude Code possède les données.** Ce contrat
est le seul lien entre les deux.

## Règles communes

- **Accès.** L'application Lovable lit ces vues avec la session de
  l'utilisateur connecté (client Supabase, clé publique). Les vues sont en
  `security_invoker = true` : elles appliquent les droits de l'appelant.
  Seuls les membres d'un espace (`oia_membre`) voient ses lignes. Un compte
  qui n'est pas membre, ou `anon`, ne voit rien.
- **Écriture.** Aucune écriture directe dans une table. Toute action passe
  par une fonction `oia_*` (liste en fin de document). Chaque fonction vérifie
  l'identité et le rôle (éditeur ou propriétaire), impose l'auteur et
  journalise l'action.
- **Honnêteté.**
  - Un montant inconnu reste inconnu (`null`) : il s'affiche « inconnu »,
    jamais 0.
  - Rien n'est présenté comme vérifié sans décision humaine :
    `verifie_par_humain` n'est vrai que pour une source `VERIFIED` approuvée
    par un humain.
  - `decision_humaine` vaut `PENDING` tant que personne n'a tranché.
- **Typologie financière obligatoire** (`categorie`) : `subvention`,
  `chiffre_affaires_contractuel_potentiel`, `investissement_capital`, `pret`,
  `aide_fiscale`, `montant_inconnu`.
  - `sens` vaut `entrant`, ou `sortant` pour une acquisition.
  - Aucun écran n'additionne deux catégories, deux sens ou deux devises.
- **États à prévoir sur chaque écran :**
  - **chargement** : squelette, sans chiffres ;
  - **vide** : phrase qui dit pourquoi, par exemple « Aucune opportunité dans
    cet espace » ou « Rien d'urgent aujourd'hui » ;
  - **erreur** : message et bouton « réessayer » ; ne jamais afficher de
    données en cache comme si elles étaient à jour ;
  - **non membre** : la vue rend 0 ligne ; l'interface dit « Accès non
    accordé à cet espace », et non « vide ».
- **Versions.** Chaque vue porte son numéro (`_v1`). Un changement
  compatible (colonne ajoutée) garde le numéro. Un changement incompatible
  (colonne retirée, renommée ou de sens différent) crée `_v2`, et `_v1` reste
  servie au moins 30 jours. Le changement est consigné dans ce document.
- **Exemples fictifs** : les valeurs ci-dessous sont inventées.

Migrations : `packages/database/supabase/migrations/0003` à `0005`, appliquées en production le 8 novembre 2026 (mandat v9). Texte d'origine :
par Mickaël, non appliquées. Décision du 2026-11-08 : elles attendent
l'application Lovable ; d'ici là, `0002a` réserve les tables aux comptes de
Mickaël et la console garde son stockage local.

## Colonnes de `ml_toutes_v1` (base des écrans de liste)

| Colonne | Type | Source | Statut de vérification |
| --- | --- | --- | --- |
| `id` | uuid | `watch_opportunities.id` | identifiant stable |
| `espace_id` | uuid | espace de travail | |
| `record_id` | text | identifiant de la source (pipeline de découverte) | |
| `titre`, `emetteur` | text | source officielle, extraite | extrait, non vérifié |
| `nature` | text | taxonomie `opportunity-kinds` (valeurs historiques normalisées) | extrait |
| `categorie` | enum | dérivée de `nature` | règle fixe, documentée en 0004 |
| `sens` | enum | `entrant` ou `sortant` (acquisition) | règle fixe |
| `montant`, `devise` | numeric, text | montant lu par `amountOf` | `null` si illisible ; jamais 0 |
| `confiance_montant` | `HAUTE`, `BASSE` | lecture du montant | `BASSE` = plusieurs montants, ou texte bruité |
| `montant_connu` | boolean | `montant is not null` | |
| `echeance` | timestamptz | date la plus tardive citée par la source | extraite, à confirmer |
| `recommandation` | text | moteur de décision M0 | proposition, jamais certification |
| `statut_verification` | text | vérification de la source | `VERIFIED` seulement par un humain |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision `APPROVE` | |
| `gate_ok`, `raisons_gate` | boolean, text[] | gate déterministe | |
| `decision_humaine`, `decide_le` | text, timestamptz | dernière ligne de `reviews` | `PENDING` par défaut |
| `projet_etiquete` | text | `project_tags` | décision humaine |
| `projets_decouverte` | text[] | projets dont la requête a trouvé l'opportunité | provenance, pas un verdict |
| `url_officielle` | text | source | |
| `vu_la_premiere_fois`, `vu_la_derniere_fois`, `disparu_le` | timestamptz | registre de veille | |

Exemple fictif : `{ "titre": "Appel à projets fictif", "nature": "GRANT",
"categorie": "subvention", "sens": "entrant", "montant": null, "devise": null,
"montant_connu": false, "decision_humaine": "PENDING", "verifie_par_humain": false }`.

## Écran par écran

| Écran | Vue | Ce que l'écran montre | Droits | Particularités |
| --- | --- | --- | --- | --- |
| **Aujourd'hui** | `ml_aujourdhui_v1` | `raison`, `titre`, `record_id`, `projet`, `echeance`, `reference` | membre | Raisons : `TACHE_EN_RETARD`, `TACHE_A_FAIRE` (7 jours), `ALERTE` (non acquittée), `BIENTOT_CLOS` (14 jours), `APPROUVE_MAIS_BLOQUE`, `EN_ATTENTE_DE_TRI`. Grouper par raison, dans cet ordre. Vide : « Rien d'urgent aujourd'hui » |
| **Toutes** | `ml_toutes_v1` | toutes les colonnes ci-dessus | membre | Filtres par `nature`, `categorie`, `decision_humaine`, `projet_etiquete`, `echeance`. Montant inconnu : « inconnu » |
| **Financements** | `ml_financements_v1` | idem | membre | Natures `GRANT`, `PRIZE`, `TAX_INCENTIVE`, `DEBT_GUARANTEE` |
| **Appels d'offres** | `ml_appels_offres_v1` | idem | membre | Natures `TENDER`, `PRE_SOLICITATION`, `MARKETPLACE_PROJECT`, `CONSORTIUM_CALL` |
| **Investisseurs** | `ml_investisseurs_v1` | idem | membre | Natures `EQUITY`, `ACQUISITION` ; une acquisition a le sens `sortant` |
| **Signals** | `ml_signals_v1` | `type` (`alerte` ou `reglementaire`), `nature_signal`, `titre`, `detail`, `action_suivante`, `gravite`, `le`, `acquitte_le`, `record_id`, `projet` | membre | Action « acquitter » : `oia_acquitter_alerte(id)` |
| **Montants** | `ml_montants_v1` | `categorie`, `sens`, `devise`, `verifie_par_humain`, `opportunites`, `avec_montant`, `somme_connue`, `montants_peu_surs` | membre | **Aucun total global.** Une ligne par catégorie, sens, devise et vérification. Les montants inconnus forment des lignes à part (`devise` et `somme_connue` à `null`) : « N opportunités sans montant lisible ». Filtres par catégorie, devise et vérification |
| **Fiche d'une opportunité** | `ml_fiche_v1` (filtre `id = …`) | colonnes de `ml_toutes_v1`, plus `source` (jsonb complet de la source), `decisions`, `notes`, `taches` | membre | Actions : décider, étiqueter, noter, créer une tâche. Les faits extraits gardent leur statut (extrait, inféré, confirmé) et leur localisateur |

## Fonctions d'écriture

| Fonction | Rôle requis | Effet |
| --- | --- | --- |
| `oia_decider(espace, record_id, action, commentaire, gate_ok)` | éditeur | Ajoute une décision (`APPROVE`, `REJECT`, `NEEDS_VERIFICATION`, `COMMENT`). Auteur = appelant. Jamais modifiable |
| `oia_etiqueter(espace, record_id, projet)` | éditeur | Pose ou retire (projet vide) l'étiquette |
| `oia_noter(espace, texte, record_id?, projet?)` | éditeur | Crée une note |
| `oia_modifier_note(note, texte)` | auteur de la note | Modifie sa propre note |
| `oia_creer_tache(espace, titre, echeance?, record_id?, projet?)` | éditeur | Crée une tâche |
| `oia_basculer_tache(tache)` | auteur de la tâche | Ouverte ↔ faite |
| `oia_creer_contact(espace, nom, …)` | éditeur | Crée un contact |
| `oia_enregistrer_vue(espace, nom, filtres, tri, sens)` | éditeur | Vue sauvegardée |
| `oia_acquitter_alerte(alerte)` | éditeur | Acquitte une alerte |
| `oia_demander(espace, type, charge)` | éditeur | Met du travail en file pour le worker |
| `oia_importer_sauvegarde(espace, sauvegarde)` | éditeur | Reprise du navigateur (A4) |
| `oia_annuler_import(import_id)` | auteur de l'import ou propriétaire | Retour arrière exact d'un import |

Erreurs : code `42501` (droit refusé), `22023` (valeur refusée), `P0002`
(introuvable). L'interface affiche le message tel quel.

## A4 · Reprise du travail stocké dans le navigateur

**Pourquoi.** Les décisions, étiquettes, notes, tâches, contacts et vues de
Mickaël vivent aujourd'hui dans le stockage local de son navigateur (six clés
`oia.*.v1`, `docs/audits/2026-11-08-donnees-existantes.md`). Claude Code ne
peut pas lire ce navigateur.

**Procédure.**
1. Dans la console actuelle : bouton « backup ». Le fichier
   `oia-workspace-<date>.json` (`kind: "oia.workspace.backup"`, `version: 1`)
   se range hors du dépôt.
2. Migrations 0003 à 0005 appliquées, Mickaël membre éditeur ou propriétaire.
3. Écran d'import (Lovable), puis `oia_importer_sauvegarde`. Bilan affiché.
4. Vérification dans les écrans. En cas d'erreur : « Annuler cet import »
   (`oia_annuler_import`).

**Garanties, testées** (`packages/database/test/migrations.test.ts`, sur un
export fictif) :
- sans perte : texte, dates, liens et auteur d'origine (`auteur_origine`)
  conservés ;
- sans doublon : l'identifiant du navigateur devient `id_origine`, unique par
  espace, si bien que relancer le même fichier n'ajoute rien ;
- transactionnel : une erreur annule tout ;
- réversible : l'annulation retire exactement ce que l'import a ajouté, et
  rien d'autre ;
- une étiquette existante n'est jamais écrasée.

**Écran d'import, pour Lovable**

| Élément | Contenu |
| --- | --- |
| Titre | « Reprendre le travail de l'ancienne console » |
| Texte | « Ce fichier vient du bouton backup de l'ancienne console. Rien n'est effacé de ton navigateur. Tu peux annuler l'import ensuite. » |
| Choix du fichier | `.json`, lu dans le navigateur, jamais téléversé ailleurs que dans l'appel à la fonction |
| Aperçu avant import | Nombre d'éléments par type, lus dans le fichier : décisions, étiquettes, notes, tâches, contacts, vues |
| Bouton | « Importer dans <espace> » ; désactivé si l'utilisateur n'est pas éditeur |
| Résultat | Bilan rendu par la fonction (nombre ajouté par type ; 0 si déjà importé), et identifiant de l'import |
| Historique | Liste des imports (`oia_import` : date, auteur, bilan, annulé le) avec « Annuler cet import » |
| Erreurs | Fichier non reconnu (`22023`), droit refusé (`42501`), date illisible : message tel quel, rien n'est importé |

## A3 · Chargement des opportunités

`packages/money-lookup` lit l'instantané de la console
(`apps/web/src/data/console.json`, produit par le pipeline de découverte),
sans le modifier. Il produit un script SQL idempotent :
- un lot par contenu (`ml_lot`) ;
- des identifiants stables, dérivés de la clé de veille ;
- une opportunité n'est mise à jour que si son contenu a changé ;
- un montant illisible reste inconnu.

Le retour arrière par lot garde les opportunités qui portent du travail
humain. Le chargeur refuse une base Supabase sans
`OIA_CHARGEMENT_SUPABASE=oui` : ce chargement est réservé à Mickaël. Tests :
`packages/money-lookup/test/chargeur.test.ts`.

## Version 2 · les vues qui remplacent la console

Migration `packages/database/supabase/migrations/0008_money_lookup_v2.sql`,
**en fichier, non appliquée** : Mickaël l'applique après 0007. Inventaire des
fonctions de la console et liste de parité : `docs/interface/parite-console-cockpit.md`.

Mêmes règles que la version 1 : vues en `security_invoker`, lisibles par les
membres de l'espace seulement (`oia_membre`) ; `anon` ne lit rien ; un compte
connecté sans droit lit 0 ligne ; aucune écriture par une vue. Les vues de la
version 1 sont inchangées : la version 2 n'ajoute que des vues, toutes en
`_v1`. Colonnes et types relevés en base (test :
`packages/database/test/money-lookup-v2.test.ts`).

**États à prévoir**, en plus de ceux de la version 1 :
- `ml_projets_v1` vide : « Registre non chargé » (la copie des projets n'a pas
  encore tourné), et non « aucun projet » ;
- `ml_liens_v1` sans ligne pour une adresse : « non vérifié » ;
- `ml_indicateurs_*` : jamais de total qui additionne deux catégories, deux
  sens ou deux devises.

**Chargement des projets.** `pnpm --filter @oia/money-lookup charger -- --projets`
produit un script idempotent (mise à jour seulement si le contenu change ; un
projet sorti du registre est marqué, jamais supprimé). À ajouter au
rafraîchissement quotidien après application de 0008.

Exemple fictif (`ml_taches_v1`) : `{ "titre": "Relancer l'organisme fictif",
"echeance": "2026-11-12", "statut": "OPEN", "en_retard": false,
"projet": "projet-fictif" }`.

### `ml_projets_v1`

Projets du registre, pour l'étiquetage, les suggestions et la page Projets. Copiés depuis `registry/projects/*.yaml` par le chargeur ; le registre reste la référence.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `slug` | text | identifiant du projet |
| `nom` | text | nom |
| `type` | text | `PRODUCT`, `VENTURE`, `ADVISORY`, `FOUNDATION`, `STUDIO` |
| `statut` | text | `LIVE`, `PRIVATE_BETA`, `IN_DEVELOPMENT`, `PROTOTYPE`, `CONCEPT`, `ON_HOLD`, `DOSSIER_ON_REQUEST` |
| `actif` | boolean | faux : gardé dans le registre mais hors de toute surface ; la console n'affiche que les actifs |
| `une_ligne` | text | présentation en une ligne |
| `url` | text | site public, ou `null` |
| `secteurs` | ARRAY | secteurs (signal de rapprochement) |
| `geographies` | ARRAY | géographies |
| `types_financement` | ARRAY | types de financement recherchés |
| `natures_suivies` | ARRAY | natures surveillées par la découverte |
| `decouverte_active` | boolean | vrai si la découverte automatique tourne pour ce projet |
| `revue_profil` | text | `DRAFT` (hypothèse de travail) ou `CONFIRMED_BY_OWNER` |
| `mots_cles` | ARRAY | mots-clés (rapprochement) |
| `exclusions` | ARRAY | exclusions : un mot présent écarte la suggestion |
| `profil` | jsonb | entrée complète du registre (entités juridiques, découverte, revue du profil…) |
| `sources` | jsonb | sources prévues pour le projet : `[{ id, nom, url, statut, natures, geographies, notes }]` |
| `opportunites_etiquetees` | bigint | opportunités étiquetées vers ce projet (étiquettes seulement) |
| `taches_ouvertes` | bigint | tâches ouvertes rattachées au projet |
| `notes` | bigint | notes rattachées au projet |
| `charge_le` | timestamp with time zone | dernière copie depuis le registre |
| `retire_du_registre_le` | timestamp with time zone | date à laquelle le projet a quitté le registre, sinon `null` |

### `ml_contacts_v1`

Contacts de l'espace de travail. Données de tiers : à n'afficher qu'aux membres.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `nom` | text | nom |
| `organisation` | text | organisme |
| `role` | text | fonction |
| `email` | text | courriel |
| `telephone` | text | téléphone |
| `note` | text | note libre |
| `record_id` | text | opportunité liée (`ml_toutes_v1.record_id`), ou `null` |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (identifiant), ou `mickael` pour la console d'origine |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` si écrit directement |

### `ml_notes_v1`

Notes de l'espace de travail ; une note sans `record_id` ni `projet` est une note libre.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `texte` | text | texte |
| `record_id` | text | opportunité liée (`ml_toutes_v1.record_id`), ou `null` |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (identifiant), ou `mickael` pour la console d'origine |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` si écrit directement |

### `ml_taches_v1`

Tâches de l'espace de travail.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `titre` | text | titre |
| `echeance` | date | échéance (date), ou `null` |
| `statut` | text | `OPEN` ou `DONE` |
| `faite_le` | timestamp with time zone | date de fin, `null` si ouverte |
| `en_retard` | boolean | ouverte et échéance passée |
| `record_id` | text | opportunité liée (`ml_toutes_v1.record_id`), ou `null` |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (identifiant), ou `mickael` pour la console d'origine |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` si écrit directement |

### `ml_vues_enregistrees_v1`

Vues enregistrées de la liste des opportunités.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `nom` | text | nom donné |
| `type` | text | `OPPORTUNITY` |
| `filtres` | jsonb | filtres enregistrés (nature, recommandation, vérification, route, revue, projet, fraîcheur) |
| `tri` | text | champ de tri |
| `sens` | text | `asc` ou `desc` |
| `cree_le` | timestamp with time zone | création |

### `ml_demandes_v1`

Demandes faites au worker : recherche pour un projet, ajout par lien, contrôle de liens.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `type` | text | `DISCOVERY`, `INGEST_URL`, `LINK_CHECK` |
| `charge` | jsonb | paramètres (`{ projects: [slug] }`, `{ url, projectSlug, kindHint }`) |
| `statut` | text | `QUEUED`, `RUNNING`, `DONE`, `FAILED` |
| `demande_le` | timestamp with time zone | date de la demande |
| `demande_par` | text | auteur |
| `commencee_le` | timestamp with time zone | début du traitement |
| `terminee_le` | timestamp with time zone | fin du traitement |
| `resultat` | jsonb | résultat rendu par le worker |
| `erreur` | text | message d'erreur, ou `null` |

### `ml_brouillons_projet_v1`

Projets créés depuis l'interface, en attente d'écriture dans le registre par le worker.

| Colonne | Type | Sens |
| --- | --- | --- |
| `slug` | text | identifiant proposé |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `contenu` | jsonb | entrée proposée, au format du registre |
| `statut` | text | `PENDING`, `APPLIED`, `REJECTED` |
| `cree_le` | timestamp with time zone | création |
| `cree_par` | text | auteur |
| `applique_le` | timestamp with time zone | date d'écriture dans le registre |
| `commit_applique` | text | commit qui l'a écrit |
| `erreur` | text | motif de refus, ou `null` |

### `ml_liens_v1`

Contrôle des liens. Une adresse sans ligne n'a jamais été vérifiée : afficher « non vérifié », jamais « valide ».

| Colonne | Type | Sens |
| --- | --- | --- |
| `url` | text | adresse vérifiée |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `statut` | text | `OK` (fonctionne), `REDIRECTED` (déplacée), `DEAD` ou `UNREACHABLE` (cassée), autre valeur : non concluant |
| `code_http` | integer | code HTTP, ou `null` |
| `url_finale` | text | adresse après redirection |
| `verifie_le` | timestamp with time zone | date du contrôle |
| `note` | text | précision |
| `trouve_dans` | ARRAY | opportunités où l'adresse apparaît |

### `ml_imports_v1`

Imports de sauvegardes du navigateur (A4) ; « Annuler cet import » : `oia_annuler_import(id)`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `importe_par` | uuid | compte qui a importé |
| `exporte_le` | timestamp with time zone | date de la sauvegarde |
| `importe_le` | timestamp with time zone | date de l'import |
| `bilan` | jsonb | nombre ajouté par type |
| `annule_le` | timestamp with time zone | date d'annulation, ou `null` |
| `actif` | boolean | vrai tant que l'import n'est pas annulé |

### `ml_rattachement_v1`

Rattachement de chaque opportunité aux projets, selon la règle de la console : l'étiquette posée par un humain ; sinon chaque projet du registre dont la découverte l'a trouvée ; sinon aucun. Une opportunité non étiquetée peut compter pour plusieurs projets.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | opportunité (`ml_toutes_v1.id`) |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `projet` | text | slug du projet, `null` si non triée |
| `rattachement` | text | `etiquette`, `decouverte` ou `aucun` |

### `ml_indicateurs_v1`

Indicateurs de la page « metrics », comptes seulement, par projet selon `ml_rattachement_v1` (`projet` null : non triées). Une opportunité découverte par deux projets compte dans les deux : ne pas additionner les lignes pour obtenir l'espace entier.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `opportunites` | bigint | opportunités rattachées |
| `etiquetees` | bigint | dont rattachées par étiquette |
| `actives` | bigint | pas disparues de la source |
| `a_trier` | bigint | actives sans décision humaine |
| `approuvees` | bigint | dernière décision `APPROVE` |
| `rejetees` | bigint | dernière décision `REJECT` |
| `a_verifier` | bigint | dernière décision `NEEDS_VERIFICATION` |
| `approuvees_bloquees` | bigint | approuvées mais gate non franchi |
| `pretes` | bigint | entrantes, gate franchi, échéance non passée |
| `verifiees` | bigint | vérifiées par un humain |
| `avec_montant` | bigint | montant lisible |
| `sans_montant` | bigint | montant inconnu |
| `montants_peu_surs` | bigint | montant de confiance `BASSE` |
| `sortantes` | bigint | sens `sortant` (acquisitions) |
| `closes_sous_14_jours` | bigint | échéance dans les 14 jours |
| `expirees` | bigint | échéance passée |
| `sans_echeance` | bigint | aucune échéance lisible |
| `derniere_veille` | timestamp with time zone | dernière fois qu'une de ces opportunités a été vue par la veille |

### `ml_indicateurs_montants_v1`

Montants par projet, jamais mélangés : une ligne par projet, catégorie, sens, devise et état de vérification. Les montants inconnus forment des lignes à part (`devise` et `somme_connue` à `null`). Aucun total global.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `devise` | text | code ISO, `null` pour les montants inconnus |
| `verifie_par_humain` | boolean | état de vérification |
| `opportunites` | bigint | opportunités de la ligne |
| `pretes` | bigint | dont prêtes (gate franchi, échéance non passée) |
| `closes_sous_14_jours` | bigint | dont échéance dans les 14 jours |
| `somme_connue` | numeric | somme des montants de la ligne, dans sa devise |
| `somme_pretes` | numeric | somme des montants prêts |
| `montants_peu_surs` | bigint | montants de confiance `BASSE` |

### `ml_indicateurs_repartition_v1`

Répartitions par axe, pour l'espace entier (`portee` = `espace`) et par projet (`portee` = `projet`).

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `portee` | text | `espace` ou `projet` |
| `projet` | text | slug du projet lié (`ml_projets_v1.slug`), ou `null` |
| `axe` | text | `nature`, `recommandation`, `verification`, `decision`, `blocage` |
| `valeur` | text | valeur de l'axe (pour `blocage` : la raison du gate) |
| `opportunites` | bigint | nombre d'opportunités |

### `ml_avis_v1`

Historique complet des avis humains (journal d'audit) ; `ml_decision_v1` ne garde que le dernier.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité |
| `action` | text | `APPROVE`, `REJECT`, `NEEDS_VERIFICATION`, `COMMENT` |
| `commentaire` | text | commentaire |
| `le` | timestamp with time zone | date |
| `auteur` | text | auteur |
| `gate_ok_au_moment` | boolean | état du gate au moment de l'avis |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` si écrit directement |

## Historique du contrat

| Version | Date | Changement |
| --- | --- | --- |
| 1 | 2026-11-08 | Création |
| 2 | 2026-11-08 | Quatorze vues ajoutées pour remplacer la console (projets du registre, contacts, notes, tâches, vues enregistrées, demandes, brouillons de projet, contrôle des liens, imports, rattachement, trois vues d'indicateurs, historique des avis) ; table `oia_projet` ; migration 0008. Aucune vue de la version 1 ne change |

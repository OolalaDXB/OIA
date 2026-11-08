# Contrat de données · Money Lookup · version 2

2026-11-08 · mandat v8, blocs A1 et A4 · exigence 8. Version 2 le même jour (section « Version 2 »).
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

## Version 2

D'après `docs/interface/ecarts-money-lookup-lovable.md` (branche
`lovable/oia-visibility-prototype`, commit `1e3040c`), sections 5 bis et 7.
Migration `packages/database/supabase/migrations/0008_money_lookup_v2.sql`,
**en fichier, non appliquée** : Mickaël l'applique après 0007. Inventaire de
la console et parité : `docs/interface/parite-console-cockpit.md`.

**Règles.** Mêmes règles que la version 1. Le cockpit se branche sur les
vues `_v2` et les vues nouvelles (décision de Mickaël) ; les vues `_v1`
restent servies sans changement au moins 30 jours. Toutes sont en `security_invoker`, lisibles par les
membres de l'espace seulement ; `anon` ne lit rien ; aucune écriture par une
vue. Colonnes et types relevés en base (test :
`packages/database/test/money-lookup-v2.test.ts`).

### Décisions de Mickaël du 8 novembre 2026 (validées)

| Décision | Vue ou fonction | Effet |
| --- | --- | --- |
| 1. Un COMMENT ne change pas la dernière décision | `ml_decision_v2`, et tout ce qui en dépend | « Ton avis », `verifie_par_humain` et le tri ignorent les commentaires, comme l'ancienne console |
| 2. REGULATORY exclu de « Toutes » et des montants | `ml_toutes_v2`, `ml_montants_v2`, familles `_v2`, indicateurs, suggestions | « Toutes » reste strictement monétaire ; REGULATORY reste dans `ml_signals_v1` |
| 3. EN_ATTENTE_DE_TRI exclut les échéances dépassées | `ml_aujourdhui_v2`, `ml_indicateurs_v1.a_trier` | même périmètre que l'ancienne console |
| 4. Le cockpit se branche sur les vues `_v2` | toutes les vues `_v2` | les `_v1` restent servies au moins 30 jours, sans changement |
| 5. Une tâche se bascule depuis tout compte propriétaire de l'espace | `oia_basculer_tache` | en plus de son auteur, y compris pour une tâche importée ; un autre éditeur ne la bascule pas |
| 6. « Clos depuis la dernière visite » | `oia_marquer_visite`, `ml_clos_depuis_visite_v1` | date de visite de Money Lookup par compte ; le cockpit l'appelle à l'ouverture |

### Calculs de la console repris dans la base

- **Deux échéances.** `echeance` est l'échéance de candidature, comme dans la
  console (première échéance `APPLICATION`, sinon première échéance
  normalisée) ; `echeance_plus_tardive` est la date la plus tardive citée par
  la source. Fraîcheur, « bientôt clos », « échue », indicateurs et visites
  se calculent sur l'échéance de candidature.
- **Fraîcheur à la lecture.** Une opportunité échue n'est jamais éligible et
  sa recommandation devient `REJECT`, comme dans la console ; la source reste
  lisible (`recommandation_source`, `gate_ok_source`).
- **Aujourd'hui.** Horizons 7, 14 et 30 jours, « juste expirée », cinq « à
  trier » au plus : `ml_aujourdhui_v2`.
- **Suggestions de projets** : `ml_suggestions_v1` (fiche : 5 premières ;
  page Projets : 10 premières non étiquetées).

### Reprise du navigateur (A4), corrigée

- **Valeurs `null`.** La console exporte `null` pour chaque clé jamais
  initialisée. L'import l'accepte désormais comme une liste ou un objet vide.
  Une valeur d'un autre type (texte, nombre) est refusée (`22023`), et rien
  n'est importé.
- **Conflits.** Un identifiant d'origine déjà présent n'est jamais écrasé. Le
  bilan compte les éléments déjà présents à l'identique (`deja_presents`) et
  liste ceux dont le contenu diffère (`conflits`), par type. Une étiquette
  existante n'est jamais remplacée ; une étiquette différente est un conflit.
- **Annulation.** Chaque élément importé garde l'empreinte de son contenu.
  `oia_apercu_annulation(import)` rend ce qui serait supprimé
  (`a_supprimer`), ce qui a été modifié depuis l'import
  (`modifies_depuis_import`) et ce qui ne peut pas être vérifié (import
  antérieur à 0008 : `non_verifiables`). `oia_annuler_import(import)` refuse
  (`55000`) tant qu'il y a des éléments modifiés ou non vérifiables ;
  `oia_annuler_import(import, true)` confirme. Écran : afficher l'aperçu,
  puis « Supprimer aussi les N éléments modifiés depuis l'import ».
- L'auteur d'origine d'une vue enregistrée est conservé quand l'export en a un.

### Fonctions d'écriture ajoutées

| Fonction | Rôle requis | Effet |
| --- | --- | --- |
| `oia_supprimer(type, id)` | éditeur | Supprime une `note`, une `tache`, un `contact` ou une `vue` ; journalisé |
| `oia_proposer_projet(espace, slug, contenu, lancer_recherche = true)` | éditeur | Brouillon `PENDING` au format du registre (`contenu.name` obligatoire), puis une demande `DISCOVERY` ; refuse un projet déjà au registre ou un brouillon déjà traité |
| `oia_apercu_annulation(import)` | membre | Aperçu d'une annulation (ci-dessus) |
| `oia_annuler_import(import, confirmer = false)` | auteur de l'import ou propriétaire | Remplace la fonction de la v1 (même appel à un argument) |
| `oia_marquer_visite(espace)` | membre | Enregistre la visite de Money Lookup du compte ; la visite précédente n'avance que si la dernière date de plus de 30 minutes (un rechargement ne vide pas la liste). Rend `{ derniere, precedente }` |
| `oia_basculer_tache(tache)` | auteur de la tâche ou propriétaire de l'espace | Remplace la fonction de la v1 : ouverte aussi aux propriétaires |

Erreurs : `42501` droit refusé, `22023` valeur refusée, `P0002` introuvable,
**`55000` confirmation requise** (annulation d'un import modifié). Le message
s'affiche tel quel.

### Les 19 besoins de la section 7

| # | Besoin | Réponse |
| --- | --- | --- |
| 1 | Projets du registre | `ml_projets_v1` (profil complet, sources, chemin du fichier) ; chargeur `--projets` |
| 2 | CRM | `ml_contacts_v1` |
| 3 | Notes globales, modification | `ml_notes_v1` (id, liens, auteur, auteur d'origine) ; `oia_modifier_note` |
| 4 | Tâches globales, bascule | `ml_taches_v1` (id, statut, échéance, fin, retard) ; `oia_basculer_tache`, ouverte aux propriétaires |
| 5 | Fiche : id, fin, gate, auteur d'origine | `ml_fiche_v2` |
| 6 | Vues enregistrées, suppression | `ml_vues_enregistrees_v1` ; `oia_supprimer('vue', id)` |
| 7 | Demandes | `ml_demandes_v1` |
| 8 | Brouillons de projet | `oia_proposer_projet` ; `ml_brouillons_projet_v1` |
| 9 | Contrôles de liens | `ml_liens_v1` |
| 10 | Historique des imports | `ml_imports_v1` ; `oia_apercu_annulation` |
| 11 | Journal global des décisions | `ml_avis_v1` |
| 12 | Filtres de liste | `ml_toutes_v2` : `publie_le`, `confiance_information`, `verdict_analyste`, `route_strategique`, `type_avis` |
| 13 | Agrégats Montants | `ml_indicateurs_v1` (même périmètre : couverture, prêtes, bloquées, bientôt closes), `ml_indicateurs_montants_v1`, `ml_indicateurs_repartition_v1` (raisons de blocage) |
| 14 | Suppressions | `oia_supprimer` (note, tâche, contact, vue) |
| 15 | « Clos depuis la dernière visite » | `oia_marquer_visite` et `ml_clos_depuis_visite_v1` (décision 6) ; « juste expirée » dans `ml_aujourdhui_v2` |
| 16 | Dernière décision hors COMMENT | `ml_decision_v2` (décision 1) |
| 17 | REGULATORY hors de Toutes | `ml_toutes_v2` (décision 2) |
| 18 | A4 : valeurs null, conflits, annulation | ci-dessus |
| 19 | Tri sans échéances dépassées | `ml_aujourdhui_v2` (décision 3) |

**Chargement des projets.** `pnpm --filter @oia/money-lookup charger -- --projets`
produit un script idempotent (mise à jour si le contenu change ; projet sorti
du registre marqué, jamais supprimé). À ajouter au rafraîchissement quotidien
après application de 0008.

Exemple fictif (`ml_taches_v1`) : `{ "id": "…", "titre": "Relancer l'organisme
fictif", "echeance": "2026-11-12", "statut": "OPEN", "faite_le": null,
"en_retard": false, "projet": "projet-fictif" }`.

### `ml_decision_v2`

Dernière décision humaine par opportunité, **hors COMMENT** (décision 1).

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `decision` | text | `APPROVE`, `REJECT` ou `NEEDS_VERIFICATION` (jamais `COMMENT`) |
| `decide_le` | timestamp with time zone | date |
| `decide_par` | text | compte de la décision |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `gate_ok_au_moment` | boolean | état du gate au moment de la décision |

### `ml_toutes_v2`

« Toutes », **sans REGULATORY** (décision 2), avec la dernière décision hors COMMENT, les deux échéances et la fraîcheur recalculée à la lecture comme la console : une opportunité échue n'est jamais éligible et sa recommandation devient `REJECT` (les valeurs de la source restent dans `recommandation_source` et `gate_ok_source`).

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `emetteur` | text | émetteur (source, extrait) |
| `nature` | text | nature normalisée |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `montant` | numeric | montant lisible, `null` si inconnu (jamais 0) |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `confiance_montant` | text | `HAUTE` ou `BASSE` |
| `montant_connu` | boolean | vrai si `montant` n'est pas `null` |
| `echeance` | timestamp with time zone | **échéance de candidature** (règle de la console : première échéance `APPLICATION`, sinon première échéance normalisée), ou `null` |
| `recommandation` | text | proposition du moteur, **recalculée** : `REJECT` si l'échéance est passée |
| `statut_verification` | text | vérification de la source |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `gate_ok` | boolean | gate franchi, **recalculé** : jamais vrai si l'échéance est passée |
| `raisons_gate` | ARRAY | raisons du blocage (plus « opportunity is expired » si échue) |
| `decision_humaine` | text | dernière décision hors COMMENT, `PENDING` par défaut |
| `decide_le` | timestamp with time zone | date de cette décision |
| `projet_etiquete` | text | étiquette posée par un humain |
| `projets_decouverte` | ARRAY | projets dont la découverte a trouvé l'opportunité (provenance) |
| `url_officielle` | text | adresse officielle |
| `vu_la_premiere_fois` | timestamp with time zone | registre de veille |
| `vu_la_derniere_fois` | timestamp with time zone | registre de veille |
| `disparu_le` | timestamp with time zone | disparue de la source, sinon `null` |
| `publie_le` | date | date de publication (fait `publication-date`), ou `null` |
| `confiance_information` | numeric | confiance de l'information (`scores.infoConfidence`), ou `null` |
| `verdict_analyste` | text | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, ou `null` |
| `route_strategique` | text | route stratégique (entité candidate) |
| `type_avis` | text | type d'avis (fait `notice-type`), ou `null` |
| `decide_par` | text | compte de la dernière décision |
| `decide_par_origine` | text | auteur d'origine de la dernière décision, pour une décision importée |
| `echeance_plus_tardive` | timestamp with time zone | date la plus tardive citée par la source (seconde échéance) |
| `jours_restants` | integer | jours jusqu'à l'échéance de candidature depuis aujourd'hui 0 h UTC ; négatif si passée |
| `fraicheur` | text | `OUVERTE`, `BIENTOT_CLOSE` (14 jours ou moins), `EXPIREE`, `SANS_ECHEANCE` |
| `recommandation_source` | text | recommandation telle que la source la donne |
| `gate_ok_source` | boolean | gate tel que la source le donne |

### `ml_financements_v2`

Natures `GRANT`, `PRIZE`, `TAX_INCENTIVE`, `DEBT_GUARANTEE`, sur `ml_toutes_v2`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `emetteur` | text | émetteur (source, extrait) |
| `nature` | text | nature normalisée |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `montant` | numeric | montant lisible, `null` si inconnu (jamais 0) |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `confiance_montant` | text | `HAUTE` ou `BASSE` |
| `montant_connu` | boolean | vrai si `montant` n'est pas `null` |
| `echeance` | timestamp with time zone | **échéance de candidature** (règle de la console : première échéance `APPLICATION`, sinon première échéance normalisée), ou `null` |
| `recommandation` | text | proposition du moteur, **recalculée** : `REJECT` si l'échéance est passée |
| `statut_verification` | text | vérification de la source |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `gate_ok` | boolean | gate franchi, **recalculé** : jamais vrai si l'échéance est passée |
| `raisons_gate` | ARRAY | raisons du blocage (plus « opportunity is expired » si échue) |
| `decision_humaine` | text | dernière décision hors COMMENT, `PENDING` par défaut |
| `decide_le` | timestamp with time zone | date de cette décision |
| `projet_etiquete` | text | étiquette posée par un humain |
| `projets_decouverte` | ARRAY | projets dont la découverte a trouvé l'opportunité (provenance) |
| `url_officielle` | text | adresse officielle |
| `vu_la_premiere_fois` | timestamp with time zone | registre de veille |
| `vu_la_derniere_fois` | timestamp with time zone | registre de veille |
| `disparu_le` | timestamp with time zone | disparue de la source, sinon `null` |
| `publie_le` | date | date de publication (fait `publication-date`), ou `null` |
| `confiance_information` | numeric | confiance de l'information (`scores.infoConfidence`), ou `null` |
| `verdict_analyste` | text | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, ou `null` |
| `route_strategique` | text | route stratégique (entité candidate) |
| `type_avis` | text | type d'avis (fait `notice-type`), ou `null` |
| `decide_par` | text | compte de la dernière décision |
| `decide_par_origine` | text | auteur d'origine de la dernière décision, pour une décision importée |
| `echeance_plus_tardive` | timestamp with time zone | date la plus tardive citée par la source (seconde échéance) |
| `jours_restants` | integer | jours jusqu'à l'échéance de candidature depuis aujourd'hui 0 h UTC ; négatif si passée |
| `fraicheur` | text | `OUVERTE`, `BIENTOT_CLOSE` (14 jours ou moins), `EXPIREE`, `SANS_ECHEANCE` |
| `recommandation_source` | text | recommandation telle que la source la donne |
| `gate_ok_source` | boolean | gate tel que la source le donne |

### `ml_appels_offres_v2`

Natures `TENDER`, `PRE_SOLICITATION`, `MARKETPLACE_PROJECT`, `CONSORTIUM_CALL`, sur `ml_toutes_v2`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `emetteur` | text | émetteur (source, extrait) |
| `nature` | text | nature normalisée |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `montant` | numeric | montant lisible, `null` si inconnu (jamais 0) |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `confiance_montant` | text | `HAUTE` ou `BASSE` |
| `montant_connu` | boolean | vrai si `montant` n'est pas `null` |
| `echeance` | timestamp with time zone | **échéance de candidature** (règle de la console : première échéance `APPLICATION`, sinon première échéance normalisée), ou `null` |
| `recommandation` | text | proposition du moteur, **recalculée** : `REJECT` si l'échéance est passée |
| `statut_verification` | text | vérification de la source |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `gate_ok` | boolean | gate franchi, **recalculé** : jamais vrai si l'échéance est passée |
| `raisons_gate` | ARRAY | raisons du blocage (plus « opportunity is expired » si échue) |
| `decision_humaine` | text | dernière décision hors COMMENT, `PENDING` par défaut |
| `decide_le` | timestamp with time zone | date de cette décision |
| `projet_etiquete` | text | étiquette posée par un humain |
| `projets_decouverte` | ARRAY | projets dont la découverte a trouvé l'opportunité (provenance) |
| `url_officielle` | text | adresse officielle |
| `vu_la_premiere_fois` | timestamp with time zone | registre de veille |
| `vu_la_derniere_fois` | timestamp with time zone | registre de veille |
| `disparu_le` | timestamp with time zone | disparue de la source, sinon `null` |
| `publie_le` | date | date de publication (fait `publication-date`), ou `null` |
| `confiance_information` | numeric | confiance de l'information (`scores.infoConfidence`), ou `null` |
| `verdict_analyste` | text | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, ou `null` |
| `route_strategique` | text | route stratégique (entité candidate) |
| `type_avis` | text | type d'avis (fait `notice-type`), ou `null` |
| `decide_par` | text | compte de la dernière décision |
| `decide_par_origine` | text | auteur d'origine de la dernière décision, pour une décision importée |
| `echeance_plus_tardive` | timestamp with time zone | date la plus tardive citée par la source (seconde échéance) |
| `jours_restants` | integer | jours jusqu'à l'échéance de candidature depuis aujourd'hui 0 h UTC ; négatif si passée |
| `fraicheur` | text | `OUVERTE`, `BIENTOT_CLOSE` (14 jours ou moins), `EXPIREE`, `SANS_ECHEANCE` |
| `recommandation_source` | text | recommandation telle que la source la donne |
| `gate_ok_source` | boolean | gate tel que la source le donne |

### `ml_investisseurs_v2`

Natures `EQUITY`, `ACQUISITION` (sens `sortant`), sur `ml_toutes_v2`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `emetteur` | text | émetteur (source, extrait) |
| `nature` | text | nature normalisée |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `montant` | numeric | montant lisible, `null` si inconnu (jamais 0) |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `confiance_montant` | text | `HAUTE` ou `BASSE` |
| `montant_connu` | boolean | vrai si `montant` n'est pas `null` |
| `echeance` | timestamp with time zone | **échéance de candidature** (règle de la console : première échéance `APPLICATION`, sinon première échéance normalisée), ou `null` |
| `recommandation` | text | proposition du moteur, **recalculée** : `REJECT` si l'échéance est passée |
| `statut_verification` | text | vérification de la source |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `gate_ok` | boolean | gate franchi, **recalculé** : jamais vrai si l'échéance est passée |
| `raisons_gate` | ARRAY | raisons du blocage (plus « opportunity is expired » si échue) |
| `decision_humaine` | text | dernière décision hors COMMENT, `PENDING` par défaut |
| `decide_le` | timestamp with time zone | date de cette décision |
| `projet_etiquete` | text | étiquette posée par un humain |
| `projets_decouverte` | ARRAY | projets dont la découverte a trouvé l'opportunité (provenance) |
| `url_officielle` | text | adresse officielle |
| `vu_la_premiere_fois` | timestamp with time zone | registre de veille |
| `vu_la_derniere_fois` | timestamp with time zone | registre de veille |
| `disparu_le` | timestamp with time zone | disparue de la source, sinon `null` |
| `publie_le` | date | date de publication (fait `publication-date`), ou `null` |
| `confiance_information` | numeric | confiance de l'information (`scores.infoConfidence`), ou `null` |
| `verdict_analyste` | text | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, ou `null` |
| `route_strategique` | text | route stratégique (entité candidate) |
| `type_avis` | text | type d'avis (fait `notice-type`), ou `null` |
| `decide_par` | text | compte de la dernière décision |
| `decide_par_origine` | text | auteur d'origine de la dernière décision, pour une décision importée |
| `echeance_plus_tardive` | timestamp with time zone | date la plus tardive citée par la source (seconde échéance) |
| `jours_restants` | integer | jours jusqu'à l'échéance de candidature depuis aujourd'hui 0 h UTC ; négatif si passée |
| `fraicheur` | text | `OUVERTE`, `BIENTOT_CLOSE` (14 jours ou moins), `EXPIREE`, `SANS_ECHEANCE` |
| `recommandation_source` | text | recommandation telle que la source la donne |
| `gate_ok_source` | boolean | gate tel que la source le donne |

### `ml_montants_v2`

Montants de l'espace, sans REGULATORY. Une ligne par catégorie, sens, devise et vérification ; inconnus à part. Aucun total global.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `opportunites` | bigint | nombre d'opportunités |
| `avec_montant` | bigint | dont avec montant lisible |
| `somme_connue` | numeric | somme dans la devise de la ligne, `null` pour les inconnus |
| `montants_peu_surs` | bigint | montants de confiance `BASSE` |

### `ml_aujourdhui_v2`

« Aujourd'hui », digest de la console calculé dans la base, pour chaque horizon (7, 14, 30 jours). Une opportunité n'a qu'une ligne : bientôt close (14 jours, hors rejet), sinon juste expirée (échue après une approbation ou une demande de vérification), sinon approuvée mais bloquée. « À trier » : sans décision, non échue (décision 3), pas déjà listée, **cinq au plus**, les plus récemment publiées.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `horizon` | integer | 7, 14 ou 30 : le cockpit filtre l'horizon choisi (il ne change que les tâches à faire) |
| `ordre` | integer | 1 à 7, ordre des groupes |
| `raison` | text | `TACHE_EN_RETARD`, `TACHE_A_FAIRE`, `ALERTE`, `BIENTOT_CLOS`, `JUSTE_EXPIREE`, `APPROUVE_MAIS_BLOQUE`, `EN_ATTENTE_DE_TRI` |
| `titre` | text | titre (source, extrait) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `projet` | text | projet de la tâche ou étiquette de l'opportunité |
| `echeance` | timestamp with time zone | échéance de la tâche ou de candidature |
| `jours_restants` | integer | jours restants (négatif : en retard ou échue) |
| `reference` | text | identifiant de la tâche, de l'alerte ou de l'opportunité |

### `ml_fiche_v2`

Fiche d'une opportunité (filtre `id = …`) : colonnes de `ml_toutes_v2`, puis la source et l'historique, avec identifiants, date de fin des tâches, gate de chaque décision et auteur d'origine.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `emetteur` | text | émetteur (source, extrait) |
| `nature` | text | nature normalisée |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `montant` | numeric | montant lisible, `null` si inconnu (jamais 0) |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `confiance_montant` | text | `HAUTE` ou `BASSE` |
| `montant_connu` | boolean | vrai si `montant` n'est pas `null` |
| `echeance` | timestamp with time zone | **échéance de candidature** (règle de la console : première échéance `APPLICATION`, sinon première échéance normalisée), ou `null` |
| `recommandation` | text | proposition du moteur, **recalculée** : `REJECT` si l'échéance est passée |
| `statut_verification` | text | vérification de la source |
| `verifie_par_humain` | boolean | `VERIFIED` et dernière décision (hors COMMENT) `APPROVE` |
| `gate_ok` | boolean | gate franchi, **recalculé** : jamais vrai si l'échéance est passée |
| `raisons_gate` | ARRAY | raisons du blocage (plus « opportunity is expired » si échue) |
| `decision_humaine` | text | dernière décision hors COMMENT, `PENDING` par défaut |
| `decide_le` | timestamp with time zone | date de cette décision |
| `projet_etiquete` | text | étiquette posée par un humain |
| `projets_decouverte` | ARRAY | projets dont la découverte a trouvé l'opportunité (provenance) |
| `url_officielle` | text | adresse officielle |
| `vu_la_premiere_fois` | timestamp with time zone | registre de veille |
| `vu_la_derniere_fois` | timestamp with time zone | registre de veille |
| `disparu_le` | timestamp with time zone | disparue de la source, sinon `null` |
| `publie_le` | date | date de publication (fait `publication-date`), ou `null` |
| `confiance_information` | numeric | confiance de l'information (`scores.infoConfidence`), ou `null` |
| `verdict_analyste` | text | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, ou `null` |
| `route_strategique` | text | route stratégique (entité candidate) |
| `type_avis` | text | type d'avis (fait `notice-type`), ou `null` |
| `decide_par` | text | compte de la dernière décision |
| `decide_par_origine` | text | auteur d'origine de la dernière décision, pour une décision importée |
| `echeance_plus_tardive` | timestamp with time zone | date la plus tardive citée par la source (seconde échéance) |
| `jours_restants` | integer | jours jusqu'à l'échéance de candidature depuis aujourd'hui 0 h UTC ; négatif si passée |
| `fraicheur` | text | `OUVERTE`, `BIENTOT_CLOSE` (14 jours ou moins), `EXPIREE`, `SANS_ECHEANCE` |
| `recommandation_source` | text | recommandation telle que la source la donne |
| `gate_ok_source` | boolean | gate tel que la source le donne |
| `source` | jsonb | contenu complet de la source (faits, échéances, preuves, gate, évaluation…) |
| `decisions` | jsonb | tous les avis : `{ id, action, commentaire, le, par, auteur_origine, gate_ok_au_moment }`, du plus récent au plus ancien |
| `notes` | jsonb | `{ id, texte, le, par, auteur_origine }` |
| `taches` | jsonb | `{ id, titre, echeance, statut, faite_le, le, par, auteur_origine }` |

### `ml_clos_depuis_visite_v1`

« Clos depuis la dernière visite », par compte : échéance de candidature passée depuis la visite précédente de l'appelant, hors rejet. Le cockpit appelle `oia_marquer_visite(espace)` à l'ouverture. Sans visite précédente : aucune ligne (« première visite »).

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `id` | uuid | opportunité |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `titre` | text | titre (source, extrait) |
| `echeance` | timestamp with time zone | échéance de candidature, passée depuis la visite précédente |
| `decision_humaine` | text | dernière décision (hors rejet) |
| `projet_etiquete` | text | étiquette posée par un humain |
| `depuis` | timestamp with time zone | visite précédente de l'appelant |

### `ml_suggestions_v1`

Suggestions de projets, règle de la console : mots-clés, secteurs et géographies du registre cherchés en mots entiers dans le titre, l'émetteur et les faits ; une exclusion écarte ; il faut au moins un mot-clé ou un secteur. Heuristique : à présenter comme une piste, jamais comme un verdict.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `id` | uuid | opportunité |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `projet` | text | projet suggéré |
| `confiance` | integer | score plafonné à 70 : heuristique, jamais un verdict |
| `score` | integer | 12 par mot-clé, 10 par secteur, 4 par géographie |
| `mots_cles` | ARRAY | mots-clés trouvés |
| `secteurs` | ARRAY | secteurs trouvés |
| `geographies` | ARRAY | géographies trouvées |
| `etiquetee` | boolean | l'opportunité porte déjà une étiquette |
| `rang_opportunite` | bigint | rang du projet pour cette opportunité (fiche : les 5 premiers) |
| `rang_projet` | bigint | rang de l'opportunité pour ce projet, parmi les étiquetées ou non (page Projets : les 10 premières non étiquetées) |

### `ml_projets_v1`

Projets du registre, copiés depuis `registry/projects/*.yaml` par le chargeur ; le registre reste la référence. Vide : « Registre non chargé ».

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `slug` | text | identifiant du projet |
| `nom` | text | nom |
| `type` | text | `PRODUCT`, `VENTURE`, `ADVISORY`, `FOUNDATION`, `STUDIO` |
| `statut` | text | `LIVE`, `PRIVATE_BETA`, `IN_DEVELOPMENT`, `PROTOTYPE`, `CONCEPT`, `ON_HOLD`, `DOSSIER_ON_REQUEST` |
| `actif` | boolean | faux : gardé dans le registre mais hors de toute surface |
| `une_ligne` | text | présentation en une ligne |
| `url` | text | site public, ou `null` |
| `secteurs` | ARRAY | secteurs |
| `geographies` | ARRAY | géographies |
| `types_financement` | ARRAY | financements recherchés |
| `natures_suivies` | ARRAY | natures surveillées par la découverte |
| `decouverte_active` | boolean | découverte automatique active |
| `revue_profil` | text | `DRAFT` ou `CONFIRMED_BY_OWNER` |
| `mots_cles` | ARRAY | mots-clés |
| `exclusions` | ARRAY | exclusions |
| `profil` | jsonb | entrée complète du registre (entités juridiques, découverte, CPV, pays, termes, revue du profil, dérivé de, note) |
| `sources` | jsonb | sources surveillées : `[{ id, nom, url, statut, natures, geographies, notes }]` |
| `chemin_registre` | text | fichier de référence dans le dépôt |
| `opportunites_etiquetees` | bigint | opportunités étiquetées vers ce projet |
| `taches_ouvertes` | bigint | tâches ouvertes du projet |
| `notes` | bigint | notes du projet |
| `charge_le` | timestamp with time zone | dernière copie depuis le registre |
| `retire_du_registre_le` | timestamp with time zone | date de sortie du registre, sinon `null` |

### `ml_contacts_v1`

CRM : contacts, avec leurs liens projet et opportunité. Données de tiers : membres seulement.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `nom` | text | nom |
| `organisation` | text | organisme |
| `role` | text | fonction |
| `email` | text | courriel (lien `mailto:`) |
| `telephone` | text | téléphone (lien `tel:`) |
| `note` | text | note |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (pour un élément importé : l'importateur) |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` |

### `ml_notes_v1`

Notes de l'espace. Modification : `oia_modifier_note(id, texte)` (auteur seulement) ; suppression : `oia_supprimer('note', id)`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `texte` | text | texte ; sans `record_id` ni `projet` : note libre |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (pour un élément importé : l'importateur) |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` |

### `ml_taches_v1`

Tâches de l'espace. Bascule : `oia_basculer_tache(id)` (auteur ou tout propriétaire de l'espace) ; suppression : `oia_supprimer('tache', id)`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `titre` | text | titre |
| `echeance` | date | échéance, ou `null` |
| `statut` | text | `OPEN` ou `DONE` |
| `faite_le` | timestamp with time zone | date de fin, `null` si ouverte |
| `en_retard` | boolean | ouverte et échéance passée |
| `record_id` | text | opportunité (`ml_toutes_v2.record_id`), ou `null` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `cree_le` | timestamp with time zone | création |
| `auteur` | text | compte qui a écrit (pour un élément importé : l'importateur) |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` |

### `ml_vues_enregistrees_v1`

Vues enregistrées. Suppression : `oia_supprimer('vue', id)`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `nom` | text | nom |
| `type` | text | `OPPORTUNITY` |
| `filtres` | jsonb | filtres enregistrés |
| `tri` | text | champ de tri |
| `sens` | text | `asc` ou `desc` |
| `cree_le` | timestamp with time zone | création |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` |

### `ml_demandes_v1`

Demandes au worker : recherche, ajout par lien, contrôle de liens.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `type` | text | `DISCOVERY`, `INGEST_URL`, `LINK_CHECK` |
| `charge` | jsonb | paramètres (`{ projects: [slug] }`, `{ url, projectSlug, kindHint }`) |
| `statut` | text | `QUEUED`, `RUNNING`, `DONE`, `FAILED` |
| `demande_le` | timestamp with time zone | date |
| `demande_par` | text | auteur |
| `commencee_le` | timestamp with time zone | début du traitement |
| `terminee_le` | timestamp with time zone | fin du traitement |
| `resultat` | jsonb | résultat du worker |
| `erreur` | text | erreur, ou `null` |

### `ml_brouillons_projet_v1`

Projets proposés depuis l'interface (`oia_proposer_projet`), en attente d'écriture dans le registre.

| Colonne | Type | Sens |
| --- | --- | --- |
| `slug` | text | identifiant proposé |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `contenu` | jsonb | entrée proposée, au format du registre |
| `statut` | text | `PENDING`, `APPLIED`, `REJECTED` |
| `cree_le` | timestamp with time zone | création |
| `cree_par` | text | auteur |
| `applique_le` | timestamp with time zone | écriture dans le registre |
| `commit_applique` | text | commit |
| `erreur` | text | motif de refus |

### `ml_liens_v1`

Contrôle des liens. Une adresse sans ligne n'a jamais été vérifiée : « non vérifié », jamais « valide ».

| Colonne | Type | Sens |
| --- | --- | --- |
| `url` | text | adresse |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `statut` | text | `OK` (fonctionne), `REDIRECTED` (déplacée), `DEAD` ou `UNREACHABLE` (cassée), autre : non concluant ; sans ligne : non vérifiée |
| `code_http` | integer | code HTTP |
| `url_finale` | text | après redirection |
| `verifie_le` | timestamp with time zone | date du contrôle |
| `note` | text | précision |
| `trouve_dans` | ARRAY | opportunités où l'adresse apparaît |

### `ml_imports_v1`

Imports A4. Avant « Annuler cet import » : `oia_apercu_annulation(id)`.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `importe_par` | uuid | compte qui a importé |
| `exporte_le` | timestamp with time zone | date de la sauvegarde |
| `importe_le` | timestamp with time zone | date de l'import |
| `bilan` | jsonb | ajoutés par type, `deja_presents`, `conflits` (identifiants d'origine au contenu différent, non écrasés) |
| `annule_le` | timestamp with time zone | annulation, ou `null` |
| `actif` | boolean | vrai tant que l'import n'est pas annulé |

### `ml_rattachement_v1`

Rattachement aux projets, règle de la console : l'étiquette ; sinon chaque projet du registre dont la découverte a trouvé l'opportunité ; sinon aucun.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | opportunité (`ml_toutes_v2.id`) |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `projet` | text | slug, `null` si non triée |
| `rattachement` | text | `etiquette`, `decouverte` ou `aucun` |

### `ml_indicateurs_v1`

Agrégats « Montants », comptes seulement, au même périmètre : la couverture se calcule dans une ligne, jamais en additionnant des lignes. Une opportunité découverte par deux projets compte dans les deux.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `portee` | text | `espace` (chaque opportunité une fois), `projet`, `non_triee` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `opportunites` | bigint | opportunités du périmètre |
| `etiquetees` | bigint | dont rattachées par étiquette |
| `actives` | bigint | pas disparues |
| `a_trier` | bigint | sans décision, actives, échéance non passée |
| `approuvees` | bigint | dernière décision `APPROVE` |
| `rejetees` | bigint | `REJECT` |
| `a_verifier` | bigint | `NEEDS_VERIFICATION` |
| `approuvees_bloquees` | bigint | approuvées, gate non franchi |
| `pretes` | bigint | entrantes, gate franchi, échéance non passée |
| `bloquees` | bigint | entrantes, pas prêtes |
| `verifiees` | bigint | vérifiées par un humain |
| `avec_montant` | bigint | montant lisible |
| `sans_montant` | bigint | montant inconnu (même périmètre : couverture = `avec_montant / opportunites`) |
| `montants_peu_surs` | bigint | montant de confiance `BASSE` |
| `sortantes` | bigint | sens `sortant` |
| `closes_sous_14_jours` | bigint | échéance dans les 14 jours |
| `expirees` | bigint | échéance passée |
| `sans_echeance` | bigint | sans échéance |
| `derniere_veille` | timestamp with time zone | dernier passage de la veille |

### `ml_indicateurs_montants_v1`

Montants par périmètre, sans mélange : une ligne par périmètre, catégorie, sens, devise et vérification ; prêts et bloqués séparés ; inconnus à part.

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `portee` | text | `espace`, `projet`, `non_triee` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `categorie` | USER-DEFINED | typologie financière obligatoire |
| `sens` | USER-DEFINED | `entrant` ou `sortant` |
| `devise` | text | code ISO de la devise, `null` si montant inconnu |
| `verifie_par_humain` | boolean | état de vérification |
| `opportunites` | bigint | opportunités de la ligne |
| `pretes` | bigint | dont prêtes |
| `bloquees` | bigint | dont bloquées |
| `closes_sous_14_jours` | bigint | dont échéance dans les 14 jours |
| `somme_connue` | numeric | somme dans la devise de la ligne, `null` pour les inconnus |
| `somme_pretes` | numeric | somme des prêtes |
| `somme_bloquees` | numeric | somme des bloquées |
| `montants_peu_surs` | bigint | montants de confiance `BASSE` |

### `ml_indicateurs_repartition_v1`

Répartitions : nature, recommandation, vérification, décision, raisons de blocage (« Ce qui bloque l'argent »).

| Colonne | Type | Sens |
| --- | --- | --- |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `portee` | text | `espace`, `projet`, `non_triee` |
| `projet` | text | slug du projet (`ml_projets_v1.slug`), ou `null` |
| `axe` | text | `nature`, `recommandation`, `verification`, `decision`, `blocage` |
| `valeur` | text | valeur de l'axe (pour `blocage` : la raison du gate) |
| `opportunites` | bigint | nombre d'opportunités |

### `ml_avis_v1`

Journal global des avis humains, pour l'export de l'audit.

| Colonne | Type | Sens |
| --- | --- | --- |
| `id` | uuid | identifiant stable |
| `espace_id` | uuid | espace de travail (studio : `00000000-0000-4000-8000-000000000001`) |
| `record_id` | text | opportunité |
| `action` | text | `APPROVE`, `REJECT`, `NEEDS_VERIFICATION`, `COMMENT` |
| `commentaire` | text | commentaire |
| `le` | timestamp with time zone | date |
| `auteur` | text | compte (l'importateur pour un avis importé) |
| `auteur_origine` | text | auteur dans l'ancienne console, pour un élément importé ; sinon `null` |
| `gate_ok_au_moment` | boolean | état du gate au moment de la décision |
| `id_origine` | text | identifiant dans l'ancienne console |
| `import_id` | uuid | import d'origine (`ml_imports_v1.id`), ou `null` |

## Historique du contrat

| Version | Date | Changement |
| --- | --- | --- |
| 1 | 2026-11-08 | Création |
| 2 | 2026-11-08 | D'après les écarts relevés par Lovable (commit `1e3040c`) et les décisions de Mickaël du 8 novembre : import A4 corrigé (valeurs `null`, conflits, aperçu et confirmation d'annulation) ; vues `_v2` (COMMENT ignoré, REGULATORY hors de Toutes, tri sans échéances dépassées, deux échéances, fraîcheur recalculée, Aujourd'hui à trois horizons) ; seize lectures nouvelles, dont suggestions et « clos depuis la dernière visite » ; `oia_supprimer`, `oia_proposer_projet`, `oia_marquer_visite` ; bascule des tâches ouverte aux propriétaires. Les vues `_v1` restent servies sans changement. Migration 0008 |

# Contrat de données · Money Lookup · version 1

2026-11-08 · mandat v8, blocs A1 et A4 · exigence 8.
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
  `chiffre_affaires_potentiel`, `investissement_capital`, `pret`,
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

Migrations : `packages/database/supabase/migrations/0003` à `0005`, à relire
par Mickaël, non appliquées.

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

## Historique du contrat

| Version | Date | Changement |
| --- | --- | --- |
| 1 | 2026-11-08 | Création |

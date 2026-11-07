# Contrat de données · Shyrka · version 1

2026-11-08 · mandat v8, bloc C2 · exigences 8 à 12.
**Lovable possède l'interface ; Claude Code possède les données.** Ce contrat
décrit les données de la zone Contexte : onglets Contexte, Sources,
Permissions, Cadre, Identité, Applications, Journal.

Source : le noyau de Shyrka, `packages/shyrka` (paquet `@oia/shyrka-noyau`),
fonction `vuesShyrkaV1`. Architecture : `docs/shyrka/adr/0003-shyrka-autonome.md`.
Démonstration : `docs/interface/demo/shyrka-demo.json`.

## Règles communes

- **Local.** Le noyau tourne sur la machine de Mickaël. Ces données ne
  passent par aucune base partagée. Version 1 : noyau simulé, en mémoire ;
  l'interface s'appuie sur la démonstration en attendant le stockage réel.
- **Accès.** Ces vues sont pour Mickaël seul. Une application hôte n'y a pas
  accès : elle ne voit que ce que le noyau lui sert, selon ses permissions.
- **Écriture.** Uniquement par les fonctions du noyau, listées par onglet.
  Aucune modification directe.
- **Honnêteté.**
  - Un élément arrive `a_valider`. Rien n'est présenté comme validé sans
    décision de Mickaël.
  - Un élément retiré reste affiché, grisé, avec son statut `retire`. Un
    élément oublié n'apparaît plus nulle part.
  - Le journal n'est jamais modifié, sauf l'identifiant d'un élément oublié,
    remplacé par son empreinte (`oublie:<12 caractères>`).
- **États à prévoir sur chaque onglet :**
  - **chargement** : squelette ;
  - **vide** : phrase qui dit pourquoi, par exemple « Aucune application
    enregistrée » ou « Aucun élément de contexte » ;
  - **erreur** : message et bouton « réessayer » ; jamais de données en cache
    présentées comme à jour ;
  - **mode privé** : bandeau permanent « Mode privé : rien n'est conservé ni
    appris » tant que `mode_prive_v1.actif` est vrai.
- **Versions.** Chaque vue porte son numéro (`_v1`). Un changement compatible
  (champ ajouté) garde le numéro. Un changement incompatible (champ retiré,
  renommé ou de sens différent) crée `_v2`, et `_v1` reste servie au moins
  30 jours. Le changement est consigné dans ce document.
- **Exemples fictifs** : toutes les valeurs de ce document et de la
  démonstration sont inventées.

Erreurs du noyau (`RefusShyrka.code`) : `permission_refusee`,
`valeur_refusee`, `introuvable`, `oublie`, `mode_prive`. L'interface affiche
le message tel quel.

## Vues, champ par champ

### `contexte_v1`

Onglet **Contexte**. Un élément par ligne.

| Champ | Type | Sens |
| --- | --- | --- |
| `id` | texte | identifiant stable, `ctx-000001` |
| `type` | texte | type déclaré par l'application, ou `derive` |
| `contenu` | texte | contenu de l'élément |
| `source` | texte | `<application>:<nom>` |
| `application` | texte | application d'origine, ou `noyau` pour une copie dérivée |
| `date` | date ISO | arrivée |
| `statut` | texte | `a_valider`, `valide`, `retire` |
| `portee` | texte | `global`, `projet`, `client` |
| `derive_de` | liste de textes | éléments d'où vient une copie dérivée ; vide sinon |

Actions : « Valider » (`mickael.valider(id)`), « Retirer »
(`mickael.retirer(id)`), « Oublier » (`mickael.oublier(id)`, avec double
confirmation et le nombre de copies dérivées oubliées avec lui). Filtres :
statut, application, portée, type.

### `sources_v1`

Onglet **Sources**.

| Champ | Type | Sens |
| --- | --- | --- |
| `id` | texte | `<application>:<nom>` |
| `nom` | texte | nom donné par l'application |
| `application` | texte | application propriétaire |
| `ajoutee_le` | date ISO | premier élément reçu |
| `elements` | entier | éléments présents, oubliés exclus |

### `permissions_v1`

Onglet **Permissions**. Une capacité accordée par ligne.

| Champ | Type | Sens |
| --- | --- | --- |
| `application` | texte | application qui reçoit la capacité |
| `capacite` | texte | `fournir:<type>`, `lire:<application>`, `action:<nom>` |
| `accordee_par` | texte | toujours « Mickaël Thomas » |
| `le` | date ISO | octroi |

Actions : « Accorder » (`mickael.accorder(application, capacite)`), limité
aux types et actions déclarés par l'application ; « Révoquer »
(`mickael.revoquer(application, capacite)`), effet immédiat.

### `cadre_v1`

Onglet **Cadre**. Lecture seule : le cadre se modifie dans
`docs/shyrka/CADRE.md`, par Mickaël.

| Champ | Type | Sens |
| --- | --- | --- |
| `ordre` | entier | rang de la section |
| `section` | texte | titre de section |
| `fichier` | texte | fichier source |
| `version` | texte | version du cadre |

### `identite_v1`

Onglet **Identité**. Une ligne : la version en vigueur. Lecture seule pour
Mickaël : l'identité est choisie par Shyrka (CADRE.md, « Identité »).

| Champ | Type | Sens |
| --- | --- | --- |
| `version` | entier | 0 pour la version décidée le 7 novembre 2026 |
| `voix` | texte | « Aurélie » en version 0 |
| `apparence` | texte | « Lovable Shyrka v0, présence en points » en version 0 |
| `expression` | texte | style d'expression |
| `choisie_par` | texte | « Shyrka », ou « Mickaël Thomas (version 0) » |
| `le` | date | date de la version |

### `applications_v1`

Onglet **Applications**.

| Champ | Type | Sens |
| --- | --- | --- |
| `id` | texte | identifiant déclaré |
| `nom` | texte | nom affiché |
| `fournit` | liste de textes | types de contexte déclarés |
| `actions` | liste de textes | actions déclarées |
| `enregistree_le` | date ISO | enregistrement |
| `permissions` | liste de textes | capacités accordées par Mickaël ; vide à l'enregistrement |

Vide : « Aucune application enregistrée ». Une application sans permission
s'affiche « Aucun accès accordé ».

### `journal_v1`

Onglet **Journal**. En ajout seul, du plus ancien au plus récent.

| Champ | Type | Sens |
| --- | --- | --- |
| `n` | entier | numéro d'ordre |
| `le` | date ISO | date |
| `acteur` | texte | application, « Shyrka » ou « Mickaël Thomas » |
| `quoi` | texte | `contexte.fourni`, `permission.accordee`, `mode_prive.debut`, etc. |
| `application` | texte | application concernée, ou `null` |
| `cible` | texte | élément, capacité ou résumé ; `null` en mode privé |
| `resultat` | texte | `autorise`, `refuse`, `info` |

Filtre utile : « refus seulement » (`resultat = refuse`).

### `mode_prive_v1`

Bandeau de toute la zone Contexte.

| Champ | Type | Sens |
| --- | --- | --- |
| `actif` | booléen | mode privé en cours |

Action : « Mode privé » (`mickael.modePrive(true)`), « Quitter le mode privé »
(`mickael.modePrive(false)`). Le texte d'aide dit ce qui n'est pas gardé :
conversation, mémoire, apprentissage, télémétrie ; et ce qui reste : la date
de début et de fin, et les refus, sans contenu.

## Export

Bouton « Exporter tout mon contexte » (`mickael.exporter()`) : fichier JSON
`format: "shyrka.contexte.export"`, `version: 1`, avec identité, éléments,
sources, applications, permissions et journal. Les éléments oubliés n'y sont
pas.

## Exemple fictif

`{ "id": "ctx-000001", "type": "projet", "contenu": "Projet fictif Alpha",
"source": "oia:registre", "application": "oia", "statut": "a_valider",
"portee": "projet", "derive_de": [] }`.

## Historique du contrat

| Version | Date | Changement |
| --- | --- | --- |
| 1 | 2026-11-08 | Création |

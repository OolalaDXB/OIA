# ADR 0004 · Mémoire et connaissances de Shyrka

- Statut : **proposé le 2026-11-08, à valider par Mickaël avant tout code.**
- Références : `docs/shyrka/CADRE.md` (« Mémoire », « Données ») ;
  `docs/shyrka/corpus-inventaire.md` (brut, extrait, validé) ;
  ADR 0003 (noyau, oubli, mode privé, évolution du cockpit) ; migration
  `0007_shyrka.sql` (mémoire du cockpit) ; PR #5 (mémoire SQLite locale,
  brouillon).
- Portée : cette décision fixe le modèle et les règles. Elle ne livre aucun
  code.

## Contexte

Trois mémoires existent ou se préparent, chacune avec son format :

| Mémoire | Où | Forme | État |
| --- | --- | --- | --- |
| Noyau de Shyrka (`packages/shyrka`) | en mémoire vive | éléments de contexte, statut, oubli, export | simulé, testé |
| Cockpit (`shy_contexte`, `shy_oubli`) | base OIA | élément typé, source, statut | en production (mandat v9) |
| PR #5 (`infra/shyrka/src/memoire-locale.ts`) | Mac, volume chiffré | souvenir `M0001`, texte libre | brouillon, non fusionné |

Sans règle commune, Shyrka aurait trois vérités : un souvenir corrigé sur le
Mac resterait faux dans le cockpit, et un oubli dans l'un ne toucherait pas
l'autre.

## Décision

### 1. Un espace de connaissances unifié, en compartiments

Shyrka voit un seul espace. Chaque compartiment a **un emplacement de
référence**, et un seul.

| Compartiment | Contenu | Emplacement de référence | Comment Shyrka y accède |
| --- | --- | --- | --- |
| **Identité et règles** | `CADRE.md`, `identite.json`, `permissions.json`, `style.md` | le dépôt, versionné | lu au démarrage ; jamais copié dans la mémoire |
| **Corpus** | exports bruts, enregistrements d'entretiens, transcriptions, extraits « à valider » | **le Mac seulement**, volume chiffré `Shyrka-corpus` | jamais envoyé ailleurs ; seul un extrait validé devient un élément de mémoire |
| **Souvenirs personnels** | préférences, objectifs, décisions et expériences de Mickaël | le Mac par défaut ; la base OIA si Mickaël en décide (§ 2) | interface de mémoire |
| **Projets** | Maisons.co, Coach Gari, SILLON, BEAU et les autres : décisions, travail en cours, expériences | idem | interface de mémoire, cloisonnée par projet |
| **Modules d'OIA** | Money Lookup, Visibility, SEO Command : ce que Mickaël en a décidé ou appris | idem | interface de mémoire |
| **Contexte opérationnel** | opportunités du jour, état de J0, tâches, alertes, rendez-vous | **chaque application**, qui reste la référence | relu à la demande par les outils (vues d'OIA, session de Mickaël), jamais mémorisé comme vérité ; au plus une observation datée (§ 4) |
| **Enseignements de Souffleur** | ce qui a marché ou échoué dans les missions, par projet | la mémoire d'expérience de Souffleur (P5) | interface de mémoire, quand P5 existera ; d'ici là, sur le Mac |

Les conversations du cockpit (`shy_conversation`, `shy_message`) ne sont pas
de la mémoire : ce sont des sources. Ce qu'on en tire suit la voie 2 (§ 4).

### 2. Une seule interface de mémoire

```ts
interface Memoire {
  enregistrer(element: NouvelElement, par: Acteur): Element;
  retrouver(requete: Requete, pour: Demandeur): Resultat[];   // chaque résultat avec sa provenance
  corriger(id: string, changement: Changement, par: Acteur): Element;
  retirer(id: string, motif: string, par: Acteur): void;      // n'est plus servi, reste visible de Mickaël
  oublier(id: string, par: Acteur): { oublies: number };      // élément, copies dérivées, index
  exporter(par: Acteur): Export;                              // JSON versionné, format ouvert
}
```

Deux stockages réalisent cette interface, avec les mêmes tests :

- **local** : le Mac, base dans le volume chiffré ;
- **cockpit** : la base OIA (`shy_contexte` et `shy_oubli`, à étendre).

Chaque élément porte :

| Champ | Sens |
| --- | --- |
| `id` | identifiant stable (UUID), le même partout ; remplace `M0001` |
| `compartiment` | `personnel`, `projet:<slug>`, `module:<nom>` ou `souffleur` |
| `forme` | l'une des quatre formes (§ 3) |
| `source` | voie d'apprentissage (§ 4) et référence précise : conversation et heure, fichier et ligne, outil et exécution |
| `date` | quand le fait a été dit ou observé ; `valide_le` quand Mickaël l'a confirmé |
| `statut` | `a_confirmer`, `valide`, `observe`, `retire` |
| `emplacement` | `mac` ou `cockpit` : où vit la seule copie de référence |
| `portee` | `local_seulement` ou `cockpit` |
| `version`, `remplace` | numéro de version ; version précédente remplacée |
| `derive_de` | éléments d'où vient un résumé dérivé |

**Aucune synchronisation automatique.** La portée détermine l'emplacement :
`local_seulement` vit sur le Mac, `cockpit` vit dans la base OIA. Passer de
l'une à l'autre est une **correction de portée faite par Mickaël** : l'élément
est écrit au nouvel emplacement et supprimé de l'ancien, dans la même
opération. Il n'existe donc jamais deux copies d'un même élément. Shyrka sur
le Mac peut lire les éléments `cockpit` à la demande ; le cockpit ne lit
jamais le Mac.

### 3. Quatre formes de mémoire

| Forme | Champs | Exemple fictif |
| --- | --- | --- |
| **Préférence ou objectif** | énoncé, domaine, depuis quand, jusqu'à quand si connu | « Préférer les composants réutilisables entre produits » |
| **Décision** | énoncé, raisons, options écartées et pourquoi, hypothèses, décideur, date, condition de révision | « Pas de projet Supabase séparé ; écarté : un projet par produit, coût et double maintenance ; hypothèse : base réservée à OIA » |
| **Travail en cours** | objet, état, responsable (Mickaël, un agent, un tiers), prochaine action, échéance, application de référence | « Purger la branche personnelle ; responsable Mickaël ; prochaine action : fermer la PR » |
| **Expérience** | ce qui a été tenté, résultat (marché, échoué, partiel), conditions (outils, versions, date, contexte), enseignement, portée de généralisation | « Qwen3 8B reposait la même question : géré par le code ; vrai pour ce modèle, à revérifier pour un autre » |

Quand un travail en cours vit dans une application (une tâche d'OIA, une PR),
la mémoire ne garde qu'un renvoi : l'état se relit dans l'application.

### 4. Trois voies d'apprentissage

| Voie | Exemple | Statut à l'entrée | Ce qu'il faut pour servir de fait |
| --- | --- | --- | --- |
| **1. Instruction explicite** | « Retiens que je préfère les outils locaux » | `valide` | rien de plus : la phrase de Mickaël vaut validation ; la source est la conversation et l'heure |
| **2. Proposition extraite** | d'une conversation, d'un entretien, d'un document du corpus | `a_confirmer` | la confirmation de Mickaël : accepter, corriger, refuser, ou limiter la portée. Jusque-là, Shyrka la présente comme une proposition |
| **3. Observation d'un outil** | une vue d'OIA, Elmo, GitHub, Money Lookup | `observe` | rien ; mais elle reste datée et sourcée (« au 8 novembre, Visibility indiquait… »), et l'application reste la référence |

**Une affirmation d'IA n'est jamais une preuve.** Dans les exports de
conversations avec des IA, seules les paroles et décisions de Mickaël peuvent
devenir des propositions. Une affirmation d'un modèle, y compris de Shyrka,
reste au plus une proposition, marquée « affirmé par une IA, non vérifié ».
Shyrka ne valide jamais elle-même un élément.

### 5. Les rôles

| Qui | Fait | Ne fait pas |
| --- | --- | --- |
| **Shyrka** | comprend Mickaël, retrouve, propose, présente les incertitudes | valider un élément, s'accorder un accès, exécuter une mission |
| **OIA** | organise les missions, applique les permissions, tient les preuves, le journal et les budgets | décider à la place de Mickaël |
| **Souffleur** | fournit les modèles (routage, P4), l'expérience (P5) et les contrôles (audit, P2 et P6) | lire la mémoire personnelle sans autorisation |
| **Agents** | exécutent un **mandat borné** : objectif, outils permis, budget, durée, documents autorisés, identité technique propre, sortie vérifiable | hériter des accès personnels de Shyrka ; leurs résultats reviennent comme observations (voie 3) ou propositions (voie 2), jamais comme mémoire validée |

Cette répartition reprend « Shyrka parle, Souffleur travaille, OIA prouve et
contrôle ». Elle précise un point : c'est OIA qui organise les missions,
Souffleur fournit les moyens.

### 6. Oubli, correction et confidentialité

Les règles de l'ADR 0003 s'appliquent aux deux stockages :

- **Corriger** crée une nouvelle version et retire l'ancienne du service.
  L'ancienne reste dans l'historique, marquée « remplacée par ». Les résumés
  dérivés de l'ancienne version sont marqués à revoir.
- **Oublier** efface l'élément, ses copies dérivées de proche en proche, et
  leurs entrées d'index. Une empreinte empêche son retour, y compris par la
  restauration d'une sauvegarde. Le journal ne garde que l'empreinte.
- **Sauvegardes du volume** : chiffrées, conservées 30 jours au plus
  (proposition de l'ADR 0003, à confirmer) ; une restauration rejoue les
  oublis avant de servir quoi que ce soit.
- **Mode privé** : rien n'est enregistré ni retrouvé.
- **Modèles en ligne** : un élément `local_seulement` n'entre jamais dans un
  message envoyé à Mistral ou à un autre fournisseur. Seul un modèle local
  (Ollama) peut le lire.
- **Exclusions** : Swift et ses clients, secrets, données des tiers
  (`corpus-inventaire.md`) sont refusés à l'entrée, quelle que soit la voie.

### 7. Les quatre preuves de la première mémoire

La première mémoire n'est livrée que si ces quatre preuves passent, en test
simulé puis en vrai sur le Mac Studio :

| Preuve | Ce qui est vérifié |
| --- | --- |
| **Retour après redémarrage, avec provenance** | « Retiens que… », arrêt, relance : `retrouver` rend le même `id`, le même contenu, la voie, la source (conversation et heure) et la date |
| **Correction sans deux vérités** | après `corriger`, `retrouver` ne rend que la nouvelle version, sur le Mac comme dans le cockpit ; après un changement de portée, une seule copie existe, au nouvel emplacement |
| **Oubli effectif** | l'élément, ses résumés dérivés et leurs entrées d'index ont disparu ; la restauration d'une sauvegarde ne les ramène pas ; l'export ne les contient pas ; un nouvel enregistrement identique est refusé |
| **Local inaccessible sans autorisation** | un élément `local_seulement` n'est rendu ni au cockpit, ni à un agent, ni dans un message envoyé à un modèle en ligne ; il le devient seulement après une décision explicite de Mickaël (changement de portée, ou mandat qui l'autorise) |

## Le sort de la PR #5

La PR #5 apporte de bonnes briques : base dans le volume chiffré seulement,
refus d'un dossier ordinaire ou d'un lien symbolique, fichier en 0600,
suppression sécurisée, empreinte d'oubli, refus de Swift, souvenirs donnés
seulement à un modèle local, « retiens que » comme instruction explicite
(voie 1), et des tests de redémarrage.

Elle ne suit pas encore cette décision :

- identifiants `M0001` propres à la base locale, au lieu d'un identifiant commun ;
- ni compartiment, ni forme, ni portée, ni emplacement, ni voie d'apprentissage ;
- pas de `corriger` ni d'`exporter`, pas de copies dérivées ;
- un second mode privé dans la mémoire, à côté de celui de la session ;
- conflit avec `main` (la session a changé depuis), et `node:sqlite`, encore
  expérimental dans Node 22, à vérifier sur le Mac (sinon `better-sqlite3`).

**Recommandation : l'aligner, pas la fusionner telle quelle.** Une fois cette
décision validée, ses briques deviennent le stockage local de l'interface
unique, sur une nouvelle branche à jour de `main`, avec les quatre preuves
pour tests. La PR #5 est alors fermée, avec un renvoi vers la nouvelle. Si
Mickaël préfère repartir de zéro, la fermer dès maintenant.

## Conséquences

- `shy_contexte` devra porter les champs du § 2 : une migration, à relire.
- Le noyau `packages/shyrka` reçoit l'interface `Memoire` et ses deux
  stockages ; `infra/shyrka` (voix, Mac) et `shyrka-chat` (cockpit) s'en
  servent l'un et l'autre.
- La recherche commence en plein texte (SQLite FTS5 sur le Mac, recherche
  plein texte de Postgres dans la base OIA). Un index sémantique local ne
  viendra que si la recherche plein texte rate des cas réels.
- Aucun fine-tuning.

## Ce que Mickaël décide

1. Valider ou modifier cette décision, en particulier la règle « la portée
   détermine l'emplacement, une seule copie ».
2. Le sort de la PR #5 : l'aligner (recommandé) ou la fermer.
3. La durée de conservation des sauvegardes du volume (proposé : 30 jours).
4. Les compartiments ouverts dès la première mémoire (proposé : personnel et
   projets ; modules d'OIA et Souffleur ensuite).

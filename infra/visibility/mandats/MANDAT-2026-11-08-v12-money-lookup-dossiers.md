# Mandat v12 · Money Lookup : dossiers de projets, données à jour, recherche cohérente

8 novembre 2026 · Mickaël Thomas

> Emplacement : `infra/visibility/mandats/MANDAT-2026-11-08-v12-money-lookup-dossiers.md`. Exécuteur : la session Claude Code du Mac Studio, sur `main`. Les écrans sont faits ensuite par Lovable, sur le contrat livré ici.

## 0. Constat et objectif

Money Lookup ne produit presque rien d'utile : 271 opportunités, 264 à revoir à la main, beaucoup de données périmées, et des rapprochements absurdes (un appel d'offres allemand de test de logiciels proposé à cinq projets différents, tous à 26 sur 100, à cause du seul mot « software »). La cause : l'outil ne sait presque rien des projets.

**Objectif : pour chaque projet, toutes les opportunités cohérentes, et seulement elles, avec la raison de leur présence.** Aucun quota : un projet peut n'avoir aucune opportunité cohérente, un autre des dizaines. La cohérence se juge contre un dossier de projet complet.

| Ordre | Bloc | Résultat |
| --- | --- | --- |
| A | Dossiers de projets | Format, stockage protégé, dossiers préremplis à valider |
| B | Données périmées | Archivage des opportunités échues ou obsolètes, sans perte |
| C | Recherche par projet | Sources et requêtes construites à partir de chaque dossier |
| D | Qualification | Filtre strict, puis évaluation de cohérence avec raisons |
| E | Contrat de données v3 | Vues par projet pour les écrans de Lovable |
| Z | Rapport | Résultats sur les projets pilotes, coûts, décisions |

**Le bloc A et le contrat E sont poussés en premier**, pour que Lovable puisse commencer les écrans.

## 1. Règles

1. Travail sur `main`, `git pull --rebase origin main` avant chaque push. Lovable travaille aussi sur `main`, dans `prototypes/oia-prototype` : ne pas y modifier les écrans pendant ce mandat.
2. **Le dépôt est public.** Aucun contenu de dossier réel, aucun chiffre, montant, besoin ou information d'entreprise dans un commit. Les dossiers vivent dans la base, réservés aux membres de l'espace. Le dépôt contient seulement le format, les migrations, le code et un exemple fictif.
3. **Migrations** : fichiers dans `packages/database/supabase/migrations`, tests adverses sur Postgres jetable, puis application en production comme la 0008 (sauvegarde vérifiée, répétition annulée, tests en production), en mode où Mickaël valide chaque commande d'écriture.
4. **Rien n'est supprimé** : les décisions, notes, tâches et étiquettes existantes, y compris importées de l'ancienne console, restent intactes. Une opportunité périmée est archivée, jamais effacée.
5. **Dépense** : aucun appel payant sans validation explicite de Mickaël, avec une estimation chiffrée avant (bloc D).
6. Pas de recherche contraire aux conditions d'utilisation des sites : API et pages publiques officielles seulement.

## Bloc A · Dossiers de projets

- **Format** (documenté dans `docs/money-lookup/dossier-projet.md`, avec un exemple fictif) :
  - identité : ce que fait le projet, stade, traction ;
  - structure qui candidate : pays, forme juridique, taille, date de création, entité porteuse ;
  - besoins : montant, forme (subvention, prêt, investissement, contrat client, aide fiscale), échéance souhaitée ;
  - critères stricts : pays acceptés, types de structure, montants minimum et maximum, secteurs ;
  - exclusions : ce qui n'intéresse jamais le projet ;
  - programmes et sources déjà connus ;
  - pièces disponibles (présentation, chiffres, références), sans leur contenu ;
  - complétude : quels champs manquent pour bien chercher.
- **Stockage** : table dans la base, réservée aux membres, modifiable par fonctions, chaque modification journalisée. Le registre `registry/projects` reste la liste des projets.
- **Préremplissage** : pour chaque projet du registre, un brouillon de dossier tiré de ce qui existe déjà (registre, documents du dépôt), chaque champ marqué « à valider ». Rien n'est inventé : un champ inconnu reste vide.
- **Projets pilotes : BAWABA, SILLON et BEAU**, sauf décision contraire de Mickaël. Leurs dossiers sont complétés en priorité, avec une liste de questions courtes pour Mickaël (ou une séance d'entretien avec Shyrka).

## Bloc B · Données périmées

- Règles de péremption explicites : échéance de candidature passée ; avis sans échéance plus ancien qu'un seuil documenté ; source disparue ou lien mort (contrôle des liens existant).
- Les opportunités périmées passent dans un état « archivé », avec la raison et la date. Les listes par défaut ne les montrent plus ; une vue d'archive les garde consultables, avec tout leur historique.
- Rapport chiffré : combien sont archivées, pour quelle raison, et combien restent actives.

## Bloc C · Recherche par projet

- Pour chaque dossier : les sources pertinentes selon ses pays, sa forme et ses besoins (programmes publics nationaux et européens, appels d'offres, accélérateurs, investisseurs), et des requêtes construites à partir de ses critères, pas de mots isolés.
- Chaque opportunité garde la recherche et la source qui l'ont trouvée.
- Lancement sur les trois projets pilotes d'abord, puis rafraîchissement quotidien.

## Bloc D · Qualification de la cohérence

1. **Filtre strict, sans modèle** : pays, type de structure, échéance, montant, exclusions du dossier. Ce qui échoue est écarté, avec la règle qui l'a écarté.
2. **Évaluation de cohérence** des candidats restants, par un modèle plus capable que Mistral Small, avec le dossier complet du projet. Pour chaque opportunité : un verdict (cohérente, à vérifier, écartée), les critères remplis, le besoin couvert, ce qui manque pour candider, et les extraits de la source qui le justifient.
3. **Modèle et coût** : proposer deux ou trois modèles, avec pour chacun une estimation du coût mensuel au volume constaté, et l'interface prête pour chacun. **Aucun appel payant avant la validation de Mickaël.** En attendant, faire la qualification des trois projets pilotes en mode assisté, par cette session elle-même, et marquer chaque évaluation comme telle.
4. La décision finale reste humaine : une opportunité « cohérente » n'est jamais présentée comme acquise.

## Bloc E · Contrat de données v3

`docs/interface/contrat-donnees-money-lookup.md`, version 3 :
- vue des projets avec complétude de leur dossier, nombre d'opportunités par verdict et par étape, prochaines échéances, montants par type ;
- vue des opportunités d'un projet, avec verdict, raisons, critères remplis, éléments manquants, étape (à examiner, qualifiée, en préparation, déposée, écartée avec sa raison) ;
- vue d'archive ;
- fonctions : modifier un dossier, déplacer une opportunité d'étape, écarter avec une raison ;
- les vues v2 restent servies sans changement.

## Bloc Z · Rapport

`infra/visibility/reports/2026-11-08-mandat-v12.md` : pour chaque projet pilote, les opportunités cohérentes trouvées (nombre et exemples, sans données confidentielles dans le dépôt : le détail reste en base), ce qui a été archivé, les questions à poser à Mickaël pour compléter les dossiers, la proposition de modèle avec son coût, et les migrations appliquées avec leur retour arrière.

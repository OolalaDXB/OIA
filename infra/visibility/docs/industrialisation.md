# Industrialisation d'OIA Visibility (mandat v15) · architecture commune

Document de référence pour les blocs A à H. Aucun nom de sujet réel ici.

## 1. Où vivent les sujets

- **Code, gabarits, exemples fictifs** : dans le dépôt (public). Les tests utilisent
  `test/fixtures/` (sujets fictifs).
- **Sujets réels** : jamais dans le dépôt. Deux supports, dans cet ordre :
  1. le **dossier privé des sujets**, hors du dépôt : `OIA_VIS_SUBJECTS_DIR`, défaut pour les
     commandes du v15 `~/oia-visibility-data/sujets/` (droits 700). Même forme de fichiers
     qu'aujourd'hui (`subject.yaml`, `panel.yaml`, `facts.yaml`, `measurement.yaml`,
     `recommendations.yaml`), plus `proposition/` (ce qui attend une validation) et
     `journal.jsonl` (validations : qui, quand, quoi, en ajout seul) ;
  2. la **base OIA** (schéma `vis`) : client, site, sujet, fenêtres, preuves (existants), et,
     après une migration validée par Mickaël, les propositions et les validations. Tant que
     cette migration n'est pas appliquée, le journal du dossier privé fait foi, et l'écriture
     en base est un geste séparé (`--base`), jamais implicite.
- Toute commande refuse d'écrire un sujet réel sous le dépôt (chemin résolu dans le dépôt
  → refus), sauf les fixtures de test.

## 2. Statuts

Tout ce qui est proposé porte `statut: extrait` (machine) ; seul un humain le passe à
`valide` ou `rejete`, avec `par` et `le`. Une étude ne démarre jamais seule : le J0 exige
panel et concurrents validés, et un GO explicite (`--go`) pour tout appel payant.

## 3. Coût

- Coût de référence par appel et par moteur : coûts réels de J0 (grille `src/cost-grid.ts`,
  `figures.json` de la référence), hors Mistral pour un panel non français.
- Estimation d'une fenêtre = Σ moteurs (coût moyen d'un appel du moteur) × questions × jours,
  plus le juge (majorant Jev). Toute première étude affiche son coût estimé avant le GO.
- Plafonds : par client et par mois (`measurement.yaml` ou `subject.yaml` : `budget`), et
  global (`OIA_VIS_MONTHLY_CAP_USD`). Un dépassement arrête le client, jamais les autres ;
  coût illisible → arrêt.

## 4. Chaîne quotidienne (ordonnanceur)

Pour chaque sujet du dossier privé, chaque fenêtre `running` : collecte du jour
(`collect-day`, idempotent : une question déjà collectée ce jour n'est pas refaite), jour
consigné (complet, partiel, manquant), clôture à la fin de la fenêtre (sans Elmo :
`done`, rapport, page client, recommandations générées), alertes. Proposition de J1
21 jours après la dernière exécution déclarée, jamais démarrée sans validation.

## 5. Modules (un propriétaire par module)

| Module | Bloc | Fichiers |
|---|---|---|
| Ajout d'un site, audit, propositions | A | `src/site-add.ts`, `src/site/` |
| Revue, validations, recommandations (commandes) | B | `src/site-review.ts`, `src/site-validate.ts`, `src/reco-cmd.ts`, migration `vis` 0006 proposée |
| Ordonnanceur, plafonds, alertes, coût | C, G | `src/scheduler.ts`, `src/cost-estimate.ts`, `src/alerts.ts` |
| Générateurs de recommandations | D | `src/reco-generators.ts` |
| Portefeuille | E | `src/portfolio.ts` |
| Déploiement hors du Mac (préparation) | F | `deploy/`, `docs/deploiement.md` |

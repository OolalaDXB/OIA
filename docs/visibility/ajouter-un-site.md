# Ajouter un site dans OIA Visibility

Ce guide s'applique à **tout nouveau site**, interne ou externe. Il reprend C1 à C3 du mandat et les règles d'isolation 15 et 16.

## Étapes en bref

1. Déclarer le client (une seule fois par organisation).
2. Déclarer le site (URL publique, mode d'action du dépôt, plafond mensuel).
3. Déclarer le sujet (rattaché au client et à un ou plusieurs sites).
4. Initialiser le crawl + l'extraction de faits candidats (`visibility site init`).
5. Proposer un panel (B2), le valider humainement (règle 16).
6. Programmer une première fenêtre de mesure (`measurement.yaml`).

Tant que la couche persistante C1 n'est pas branchée à une vraie base, les points 1-3 passent par les fichiers YAML dans `subjects/<id>/`. La migration SQL (C1, A5, E3) est proposée et testée sur Postgres jetable ; elle sera appliquée quand Mickaël aura validé le schéma.

## 1. Client

Un `Client` porte :
- `id` kebab-case, unique.
- `displayName`.
- `ownership`: `internal` (Mickaël) ou `external` (client payant).
- `monthlyBudgetUsd`: plafond mensuel, 0 = aucune dépense.
- `defaultRepoActionMode`: `lecture` / `proposition` / `direct` — **direct interdit pour un externe**.
- `contacts[]`: identités humaines avec `role: owner` ou `member`. Seul un `owner` peut valider.

Contrat TypeScript : `infra/visibility/src/tenancy.ts` (A0b). Migration SQL : `vis.client` dans `infra/visibility/migrations/0001_evidence.sql` (A5 + C1).

## 2. Site

Un `Site` appartient à un client. Il porte :
- `primaryUrl` (https://, pas d'adresse interne — règle 15).
- `repository`: `null` (aucun dépôt), ou `{url, branch, actionMode}`. `actionMode` surcharge le défaut du client.

Pour chaque nouveau site, exécuter d'abord un `visibility site init --client <id> --url <url>` **en dry-run** (`--dry-run`) pour vérifier l'URL avant toute requête réseau.

```
visibility site init --client fictive-client --url https://fictive-site.example.test/ --dry-run
```

La commande refuse l'URL si elle est locale / RFC 1918 / link-local / loopback / ULA, y compris après une redirection (`assertResponseNotInternal`). Exception : un suffixe explicite dans `allowedLocal` pour les sites fictifs des tests.

## 3. Sujet

Un `SubjectRef` relie un sujet à un client et à un ou plusieurs sites (du même client). `subject.yaml` + `panel.yaml` + `facts.yaml` + `measurement.yaml` vivent dans `subjects/<id>/`.

## 4. Initialisation

`visibility site init --client <id> --url <url> [--repo <owner/name>]` :

- vérifie que l'URL est publique (règle 15) ;
- crawle le site avec Crawlie 0.5.3 (pour pré-remplir les langues détectées, les pages principales, la sitemap, les données structurées présentes) ;
- extrait des faits candidats (offres, prix visibles, zones), tous au statut `extracted`, jamais `validated` ;
- laisse les concurrents vides ; ils seront proposés par B2 ;
- aucun nom de client ni de site codé en dur dans le code (test de généricité) ;
- n'exécute **pas** le code du dépôt (règle 14) ; analyse statique D2 uniquement.

Appel sur un vrai site : **seulement en dry-run** sur les deux pilotes, pour comparer avec leurs fiches existantes, sans écrire. Jamais de mesure sans validation humaine.

## 5. Plafonds de coût

Trois niveaux de plafond (C3), lus depuis `elmo/.env` et `vis.client.monthly_budget_usd` (quand C1 sera en base) :

- **Global** `OIA_VIS_MONTHLY_CAP_USD` (défaut 30 $).
- **Par client** `monthly_budget_usd`.
- **Par site**, **par fournisseur** : configuration future, conservée dans `MultiBudgetCaps`.

Arrêt au premier plafond atteint. Alerte à 80 % du plafond global (24 $) via `cost-guard.sh --watch`.

## 6. Première fenêtre

- Créer un `window` dans `measurement.yaml` (`kind: baseline`, `days: 5`, `panelVersion: <version du panel validé>`).
- Poser un `freeze` sur `site` + `repository` si le site est en phase de stabilisation (voir le gel J0 de Coach Gari).
- Lancer la mesure via SEO Command (E5) : une mission `measure-aeo-window` sera créée, exécutée par le collecteur configuré (Elmo pour la transition, maison plus tard).

## Erreurs fréquentes

- **Adresse interne acceptée** : vérifier `allowedLocal` (seulement les suffixes utilisés pour les tests).
- **Mode d'action `direct` sur un client externe** : refusé par `resolveActionMode()` **et** par la contrainte SQL `client_external_not_direct`.
- **Oubli du panel** : la commande de mesure refuse de démarrer sans un panel validé (sauf `--draft`, qui ne compte pas).

## Références

- `docs/visibility/preparer-un-panel.md` (B4)
- `docs/visibility/brancher-un-depot.md` (D6)
- `docs/visibility/adr/0002-connecteur-de-depot.md` (D1)
- `infra/visibility/src/tenancy.ts` (A0b)
- `infra/visibility/src/site-init.ts` (C2)
- `infra/visibility/migrations/0001_evidence.sql`, `0002_decision_journal.sql`, `0003_client_action_log.sql` (A5, E3, C1)

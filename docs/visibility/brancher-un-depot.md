# Brancher un dépôt à OIA Visibility

Ce guide s'applique à **tout dépôt client**. Il reprend l'ADR 0002 (`docs/visibility/adr/0002-connecteur-de-depot.md`), les générateurs de correctifs (D3), la préparation de PR (D4) et le garde-fou SEO en intégration continue (D5).

## Pré-requis

- Un **client** et un **site** déclarés dans OIA Visibility (table `vis.site`, voir A5/C1). Le site porte l'URL du dépôt et son mode d'action.
- Le dépôt doit être accessible, soit par GitHub App, soit par jeton fin à portée limitée.

## 1. Mode d'action

Trois modes, déclarés par site (fallback sur le défaut du client) :

| Mode | OIA peut lire le code | OIA peut proposer | OIA peut fusionner |
|---|---|---|---|
| `lecture` | oui | **non** | **non** |
| `proposition` | oui | oui (via PR) | **non** — le client fusionne |
| `direct` | oui | oui | oui, sur demande explicite |

**Externes** → `proposition` (défaut obligatoire ; `direct` refusé par SQL et par TS). **Internes** → `proposition` ou `direct` au cas par cas.

## 2. Installer la GitHub App

- Créer une GitHub App côté organisation (hors de ce document, à faire avec Mickaël) :
  - **Permissions repository** : `contents: read/write`, `pull_requests: write`, `metadata: read`.
  - **Permissions organisation** : aucune.
  - **Events** : `pull_request`, `pull_request_review` (pour écouter la fusion).
  - **Installation** : sur les dépôts explicitement choisis par le client.

Alternative (si le client ne peut pas) : un jeton fin à portée limitée, 90 jours maximum, un jeton par dépôt.

## 3. Installer le garde-fou SEO CI

Dans le dépôt client, ajouter à `.github/workflows/seo-ci.yml` :

```yaml
name: OIA Visibility · SEO guardrail
on:
  pull_request:
    branches: [main]
jobs:
  seo-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oia-visibility/seo-ci@v1
        with:
          repo-root: '.'
          site-url: 'https://<domaine du site>/'
          fail-on: 'medium'
```

Le garde-fou refuse la PR quand une règle `medium` ou `high` échoue :
- `robots-missing`, `robots-no-user-agent` ;
- `sitemap-missing`, `sitemap-empty`, `sitemap-not-xml`, `sitemap-wrong-host` ;
- `title-missing` ;
- `jsonld-invalid` ;
- `price-client-side` (heuristique).

Les `low` (`noindex-present`, `robots-no-sitemap`) remontent dans le rapport sans échouer.

## 4. Cycle d'une demande de fusion

1. **Observation** : OIA cartographie le dépôt (D2 → `readRepo`) et produit un audit (E4).
2. **Recommandation** : un agent de SEO Command écrit une recommandation (E2), avec son correctif (D3).
3. **Décision humaine** : Mickaël ou un `owner` approuve ou rejette (E3). Aucune écriture tant que ce n'est pas approuvé (règle 16).
4. **Gel levé** : `subjects freezes <id>` renvoie 0 pour le périmètre. Correctif de sécurité urgent : autorisé à titre exceptionnel, consigné.
5. **Préparation PR** : D4 ouvre une branche `oia-visibility/<recId>`, applique les Fix, commite localement, compose la description (preuves, mode, diffs). Aucun push.
6. **Push (hors cette nuit)** : lorsque le connecteur réel sera activé, un push via la GitHub App crée la PR côté client.
7. **Garde-fou CI** : l'action D5 tourne sur la PR. Si échec, OIA lit les findings et ajuste la recommandation, pas le code directement.
8. **Fusion** : par le client (mode `proposition`) ou automatique (`direct`, uniquement en interne).
9. **Suivi après déploiement** : E5 crée une mission de vérification (crawl + garde-fou) et rattache à la prochaine fenêtre de remesure.

## 5. Garde-fous

- **Règle 12** : aucune donnée inventée dans un correctif destiné à un vrai site. Les Fix de D3 laissent `__TO_FILL__` si un fait validé manque.
- **Règle 14** : jamais d'exécution de code du dépôt hors d'un bac à sable `oia-sandbox-*` jetable. Les tests D2/D3/D4 tournent en analyse statique.
- **Règle 16** : la poussée réelle d'une PR exige une identité humaine (voir `postPullRequestDisabled` : toujours refus sans mode valide + identité).
- `main` du dépôt OIA n'est jamais modifié depuis le code du connecteur. Les branches sont créées **uniquement dans les dépôts fictifs / clients**.

## 6. Désactiver / révoquer

- Côté client : désinstaller la GitHub App ou révoquer le jeton.
- Côté OIA : passer `vis.site.repo_action_mode` à `lecture`. Aucune action d'écriture ne passe plus.

## 7. Que faire quand un cas n'est pas prévu

- Si le dépôt utilise un cadre non détecté (`readRepo` renvoie `other`) : D3 ne propose rien d'automatique, un agent écrit une recommandation manuelle avec un lien vers le fichier à modifier.
- Si le prix ne peut pas être rendu côté serveur sans refactor lourd : D3 pose une note `price-ssr-placeholder` à côté de la page, et la mission attend une décision humaine.
- Si une règle du garde-fou CI est trop restrictive pour un site légitime : documenter l'exception dans le repo du site (pas dans OIA), désactiver localement la règle, remonter à OIA.

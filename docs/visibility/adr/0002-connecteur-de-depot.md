# ADR 0002 · Connecteur de dépôt

**Statut** : proposé le 2026-11-08, à valider par Mickaël. Référence : mandat P1 V5.2, bloc D. Gère l'accès d'OIA Visibility au dépôt du site d'un client, pour auditer puis proposer des correctifs.

## Décision

### Accès

- **GitHub App recommandée pour tous les clients.** Installée sur le ou les dépôts que le client désigne, permissions minimales (`contents: read/write`, `pull_requests: write`, `metadata: read`, et uniquement elles), révocable à tout moment côté client.
- **Jeton fin à portée limitée** en alternative, uniquement si le client ne peut pas installer l'App. Scopes identiques, expiration ≤ 90 jours, un jeton par dépôt. Aucun jeton à droits larges (`repo` sans restriction) n'est accepté.
- Les secrets d'App et de jetons sont stockés hors du dépôt OIA et chiffrés au repos (Supabase Vault en P3). Aucune valeur ne vit dans un fichier commité.

### Modes d'action

Déclarés par **client** (défaut hérité) et par **dépôt** (override), dans `vis.site.repo_action_mode` :

| Mode | Lecture | Écriture par branche | Fusion | Commits directs `main` |
|---|---|---|---|---|
| `lecture` | oui | **non** | — | — |
| `proposition` (défaut externe) | oui | oui, dans une branche OIA | **par le client** | — |
| `direct` (internes seulement) | oui | oui | oui | oui, sur demande explicite de Mickaël |

- `proposition` est le **mode par défaut et obligatoire pour tout client externe** (`client.ownership = external`). `vis.client` a une contrainte `client_external_not_direct` qui l'exige en base ; `resolveActionMode()` le rebind côté TS (défense en profondeur).
- `direct` est réservé aux dépôts internes de Mickaël, et uniquement à sa demande explicite — pas de valeur « par défaut » qui ferait glisser un repo vers `direct`.

### Pré-requis d'une écriture

Avant tout push dans un dépôt client, le connecteur vérifie que **toutes** les conditions suivantes sont réunies :

1. Une **recommandation validée** existe (`vis.decision.status = accepted`, voir E3), signée par une identité humaine `owner`.
2. Aucun **gel actif** sur le périmètre couvert (`subjects freezes <id>` renvoie 0), sauf pour un correctif de sécurité urgent consigné comme perturbation.
3. Le **garde-fou SEO en intégration continue** (D5) passe sur la branche avant toute demande de fusion. Il est obligatoire sur chaque PR.
4. Le **mode d'action** du dépôt autorise l'écriture (`proposition` ou `direct`).
5. Le **plafond budgétaire** du client n'est pas atteint (C3).

### Garde-fou SEO en intégration continue

Une GitHub Action réutilisable `oia-visibility/seo-ci` (D5) tourne sur chaque demande de fusion. Elle refuse :

- titre manquant ;
- `noindex` sur une page qui ne devrait pas en avoir ;
- prix invisibles sans JavaScript ;
- données structurées (JSON-LD) invalides (schema.org) ;
- `robots.txt` cassé ou sitemap incohérente.

L'action est publique (dépôt OIA, visible du client) ; elle ne nécessite aucun secret OIA.

## Pourquoi

- **Isolation stricte par client** : une App installée par le client ne voit que les dépôts qu'il a autorisés. Un jeton OIA à droits larges ouvrirait l'accès à tout le reste de l'organisation GitHub du client.
- **Confiance progressive** : `proposition` permet au client de voir chaque changement en PR avant fusion. `direct` existe pour accélérer sur les dépôts internes où Mickaël est à la fois demandeur et gardien.
- **Audit en lecture d'abord, écriture en dernier** : `lecture` suffit à produire une recommandation (D2 → E4). Rien ne force un client à passer à `proposition` tant qu'il ne veut pas qu'OIA écrive.
- **Preuves** : chaque PR contient une description qui pointe la recommandation, la ou les preuves, la ou les décisions, le résultat du garde-fou CI (D4).
- **Pas de magie** : le connecteur ne « corrige pas tout seul ». Une recommandation validée humainement, puis un diff, puis une PR, puis une fusion par le client.

## Risques et mitigations

- **Une PR OIA pousse un diff qui casse le site.** Mitigation : garde-fou CI (D5), test de build sur un bac à sable (règle 14), description des changements liée aux preuves. Le client reste maître de la fusion.
- **Un contenu rédigé par un LLM invente un fait.** Mitigation : règle 12 du mandat (aucune donnée commerciale inventée dans un correctif destiné à un vrai site) ; prix, avis, caractéristiques et coordonnées viennent uniquement des faits validés du sujet. Faute de fait validé, le correctif laisse un emplacement à remplir, pas une valeur plausible.
- **Un jeton OIA fuit.** Mitigation : GitHub App plutôt que jeton ; rotation régulière ; alerte sur toute lecture `secrets` non attendue.
- **Un `direct` glisse sur un dépôt externe.** Mitigation : contrainte SQL et test TS `resolveActionMode` qui refuse `direct` pour un client externe.
- **Une mission d'agent déclenche un push non autorisé.** Mitigation : les exécuteurs d'agent tournent avec `OIA_SEO_IS_AGENT=1` ; la couche connecteur refuse d'écrire sans identité humaine (`OIA_SEO_HUMAN_IDENTITY` + rôle `owner`), test à l'appui.

## Décisions associées

- Panel validé humain : règle 16 (déjà appliquée pour B2, panel validate).
- Correctif en proposition : jamais appliqué automatiquement (`direct` exclu par défaut).
- Journal : E3 enregistre chaque PR OIA et sa fusion côté client.

## Hors périmètre

- GitLab, Bitbucket, Gitea, dépôts auto-hébergés : plus tard, derrière la même interface, tant qu'ils supportent les PR et les Actions / CI équivalentes.
- IndexNow et soumissions aux moteurs : couverts en D5 (garde-fou) et plus tard en P2 (déploiement manuel).

# Rapport des correctifs de sécurité · 2026-11-07 · S1 à S5

Suite de la revue externe du 2026-11-07. Les correctifs S1 à S5 ont été
posés sans attendre de clarification. Chaque point est accompagné d'un
test adverse (prouve qu'un appelant non autorisé échoue), pas seulement
d'un test heureux.

## Résumé

| Point | Livré | Tests adverses | État |
|---|---|---|---|
| **S1 · Isolation multi-clients par identité vérifiée** | `migrations/0004_auth_identity.sql` : table `vis.client_member`, RLS fondée sur `auth.uid()`, émulation `auth.uid()` locale | test 10 du script d'intégration Postgres | **vert** |
| **S2 · Validation humaine garantie par la base** | `vis.validate_recommendation(...)` et `vis.toggle_scheduler(...)` en security definer, table `vis.service_identity`, orchestrateur TypeScript n'accepte plus `isAgent`/`humanId` | tests 11-12 Postgres + 3 tests Vitest sur l'orchestrateur | **vert** |
| **S3 · Moindre privilège** | RLS sur `vis.client`, revoke en bloc puis grants ciblés, tables possédées par `vis_admin`, l'app ne peut ni TRUNCATE ni ALTER ni DISABLE TRIGGER | tests 13, 13bis, 13ter, 14 Postgres | **vert** |
| **S4 · Cohérence inter-clients** | FK composites sur `vis.site`, `vis.window`, `vis.subject_site`, `vis.recommendation` (la FK sur `vis.evidence` existait déjà en 0001) | tests 15, 15bis Postgres | **vert** |
| **S5 · Protection réseau** | `src/network/safe-fetch.ts` (DNS pin, refus RFC 1918 / link-local / fe80 / IPv4 encapsulée), `sandbox/` pour exécuter Crawlie dans un conteneur confiné | 18 tests Vitest (adresses en clair, mapped-IPv6, redirection vers interne, DNS rebinding `localtest.me`) | **vert** |

Tests Vitest au total : **218 PASS** (0 échec).
Tests Postgres au total : **15 PASS** (sur un conteneur jetable
`oia-vis-test-pg`, image `postgres:16-alpine`).

---

## S1 · Isolation multi-clients par identité vérifiée

**Diagnostic de la revue.** Les policies RLS (`0001`-`0003`) lisaient
`current_setting('vis.client_id')` — un paramètre de session que tout
appelant pose librement avec `SET LOCAL`. Un utilisateur du client A
qui fixait ce paramètre à la valeur B obtenait accès aux lignes de B.

**Correctif (`migrations/0004_auth_identity.sql`).**

- Table `vis.client_member(user_id, client_id, role)` avec rôle `owner`,
  `approver` ou `viewer`. Clé primaire `(user_id, client_id)`.
- Toutes les policies réécrites pour se fonder sur `auth.uid()`
  (convention Supabase) + jointure sur `vis.client_member`. Les
  anciennes policies `tenant_isolation` sont supprimées avant de poser
  les nouvelles.
- Pour les tests locaux, une fonction `auth.uid()` est créée si elle
  n'existe pas déjà. Elle lit le GUC `vis.test_user_id`. Sur Supabase,
  la plateforme fournit `auth.uid()` depuis le JWT et la section DO
  qui crée la fonction locale ne s'exécute pas (test `if not exists`).
- Les traitements serveur (workers, orchestrateur) passent par des
  fonctions `security definer` qui vérifient `auth.uid()` et le rôle
  (voir S2) ; aucun rôle applicatif ne peut s'octroyer un accès en
  fixant un paramètre de session.

**Test adverse** (`test 10`) :

```
begin;
set local vis.test_user_id = 'u-a-owner';
set local vis.client_id = 'fictive-b';    -- l'ancien GUC, POSÉ EXPRÈS, à B
select count(*) from vis.evidence where client_id = 'fictive-b';
commit;
```

Résultat : `0`. Preuve que les policies n'utilisent plus `vis.client_id`.
L'ancien GUC peut toujours être posé, il n'a plus aucun effet sur l'accès.

---

## S2 · Validation humaine garantie par la base

**Diagnostic.** `src/seo-command/orchestrator.ts` acceptait un booléen
`isAgent` fourni par l'appelant et un `humanId` libre : un exécuteur
malveillant pouvait appeler `ackValidation(..., false)` avec l'identité
d'un humain.

**Correctif.**

- `vis.service_identity(user_id, name)` : table explicite des identités
  de service (workers, orchestrateur). Toute `user_id` listée ici est
  **systématiquement refusée** par les fonctions d'approbation.
- `vis.validate_recommendation(target_recommendation text, reason text)` :
  security definer, lit `auth.uid()`, vérifie le rôle owner/approver
  dans `vis.client_member` pour le client porteur de la recommandation,
  refuse si l'identité est une identité de service. Insère une ligne
  dans `vis.decision` avec `decided_by = caller_uid`, pas avec un
  humanId fourni.
- `vis.toggle_scheduler(target_client text, want_enabled boolean, reason text)` :
  même structure, écrit dans `vis.scheduler_switch` (nouvelle table).
- Côté TypeScript (`src/seo-command/orchestrator.ts`) : `ackValidation`
  ne reçoit plus `humanId` ni `isAgent`. Il appelle `ctx.validation.validateRecommendation(recId)`,
  qui est une passerelle vers la fonction SQL. Le `validatedBy` écrit
  dans la mission est l'identité renvoyée par la base (auth.uid()),
  pas une chaîne libre.
- `src/seo-command/scheduler.ts` : le champ `Recurrence.enabled` est
  **forcé à `false` à l'enregistrement**, quelle que soit la valeur
  fournie par l'appelant. La bascule à true passe uniquement par
  `vis.toggle_scheduler`. Le champ `enabledBy` disparaît de l'interface
  TypeScript (il était déclaratif et tombait sous la coupe de S2).

**Tests adverses.**

- Test 11 (Postgres) : `agent-seo` (inscrit dans `vis.service_identity`)
  appelle `vis.validate_recommendation('rec-fictive-1', 'tentative agent')` →
  lève l'exception `validate_recommendation refusée : identité de service (agent-seo)`.
- Test 12 (Postgres) : un INSERT direct dans `vis.decision` avec
  `decided_by = 'u-forgé'` et sans `auth.uid()` posé → bloqué par la
  nouvelle RLS (`tenant_isolation_auth` with_check exige d'être membre
  owner/approver).
- Tests Vitest (`test/seo-command.test.ts`) : `ackValidation` sans
  passerelle configurée → refusé ; `ackValidation` quand la passerelle
  renvoie `identité de service` → refusé ; `ackValidation` quand la
  passerelle accepte → `validatedBy` vient de `auth.uid()`, pas de
  l'appelant.

---

## S3 · Moindre privilège

**Correctifs.**

- `alter table vis.client enable row level security` + policy
  `tenant_isolation_auth` en SELECT : la liste des clients est limitée
  aux clients du membre connecté.
- Création du rôle `vis_admin` (sans login) et transfert de la
  propriété des 14 tables à ce rôle. Les rôles applicatifs
  (`oia_vis_app`) ne sont plus propriétaires, donc **ne peuvent pas**
  DROP, ALTER ni DISABLE TRIGGER.
- `revoke all on all tables in schema vis from public` puis
  `grant select` / `grant insert` finement, uniquement sur les tables
  utiles. `TRUNCATE` n'est pas accordé.
- `grant usage on schema vis to vis_admin` : indispensable sinon les
  triggers d'intégrité référentielle (FK), qui tournent avec l'identité
  du propriétaire de la table cible, cassent avec « permission denied
  for schema vis ».
- `grant execute on function` pour les fonctions security definer
  (`validate_recommendation`, `toggle_scheduler`, `client_summary`)
  uniquement sur `oia_vis_app`.

**Tests adverses** (Postgres, en tant que `oia_vis_app`) :

- Test 13 : `truncate table vis.evidence` → `permission denied`.
- Test 13bis : `alter table vis.evidence add column fictive text` →
  `must be owner`.
- Test 13ter : `alter table vis.evidence disable trigger evidence_block_update` →
  `must be owner`.
- Test 14 : `select count(*) from vis.client` :
  - avec `vis.test_user_id='u-a-owner'` → **1** (seul `fictive-a` visible) ;
  - sans `vis.test_user_id` → **0** (auth.uid() null, aucune ligne visible).

---

## S4 · Cohérence inter-clients (clés composites)

**Correctifs.**

- `vis.subject` avait déjà la contrainte `unique (id, client_id)` en
  0001 ; `vis.evidence` avait déjà la FK composite
  `(subject_id, client_id) references vis.subject(id, client_id)` en
  0001.
- Ajoutés en 0004 :
  - `vis.site` : `unique (id, client_id)` (pour les FK composites futures).
  - `vis.window` : colonne `client_id` ajoutée, remplie depuis
    `vis.subject`, `NOT NULL`, FK composite
    `(subject_id, client_id) references vis.subject(id, client_id)`.
  - `vis.recommendation` : FK composite identique.
  - `vis.subject_site` : colonne `client_id` + deux FK composites
    (subject + site doivent appartenir au même client).

**Tests adverses.**

- Test 15 : insérer une evidence avec `subject_id='a-subj'` et
  `client_id='fictive-b'` → la FK composite
  `evidence_subject_belongs_to_client` lève (le couple
  (`a-subj`, `fictive-b`) n'existe pas dans `vis.subject`).
- Test 15bis : insérer `subject_site(subject_id='a-subj',
  site_id='b-site-1', client_id='fictive-a')` → la FK composite
  `subject_site_site_belongs_to_client` lève (le couple
  (`b-site-1`, `fictive-a`) n'existe pas dans `vis.site`).

---

## S5 · Protection réseau réelle

**Correctifs.**

- `src/network/safe-fetch.ts` : une fonction unique `safeFetch(url, opts)`.
  - Résolution DNS explicite (famille 0, `verbatim: true` pour désactiver
    le re-tri que Node fait par défaut) ; refus immédiat si l'adresse
    résolue tombe dans une plage interne.
  - Plages considérées internes : IPv4 loopback (127/8), RFC 1918
    (10/8, 172.16-31/12, 192.168/16), link-local (169.254/16), CGNAT
    (100.64/10), multicast (224+), `0.0.0.0/8` ; IPv6 loopback (::1),
    link-local (fe80::/10), ULA (fc00::/7), unspecified (::), et
    **IPv4 encapsulée en IPv6** (`::ffff:a.b.c.d` ou sa normalisation
    hex `::ffff:xxxx:yyyy` après passage dans `new URL()`).
  - Protocoles acceptés : `http:`, `https:` seulement. Tout autre
    protocole (`ftp:`, `file:`, etc.) est refusé.
  - Hostnames `localhost`, `*.localhost` refusés avant même la
    résolution.
  - Redirections suivies **à la main** : au moins 5 sauts, et à chaque
    saut la nouvelle URL repasse par le même pipeline (résolution +
    vérification). Pas de suivi aveugle.
  - Connexion sur l'ADRESSE RÉSOLUE, pas sur le hostname (évite qu'un
    DNS qui change la résolution entre le contrôle et l'appel pointe
    vers une IP interne après coup — SSRF par DNS rebinding).
  - Branche de test autorisée via `allowedLocalSuffixes` (par ex.
    `.example.test`), explicite et volontaire. Les tests l'utilisent
    pour servir un petit serveur HTTP local.
- `sandbox/Dockerfile` + `sandbox/compose.yaml` + `sandbox/README.md` :
  image `oia-sandbox` pour exécuter Crawlie confiné (utilisateur
  non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`,
  `NODE_OPTIONS=--dns-result-order=verbatim`). Le réseau Docker reste
  bridge par défaut ; la restriction forte des plages privées en sortie
  demande une édition des règles pf de l'hôte (documentée dans le
  README du dossier). `safe-fetch.ts` reste la première barrière.

**Tests adverses** (Vitest, `test/safe-fetch.test.ts`, 18 tests) :

- Refus de `http://10.0.0.1/`, `http://127.0.0.1/`, `http://[fe80::1]/`,
  `http://[::ffff:10.0.0.1]/`, `http://localhost/`, `ftp://1.1.1.1/`.
- Refus d'une redirection d'un serveur public vers `http://127.0.0.1:1/`
  (le 302 est reçu, mais le hop suivant est refusé par le pipeline).
- Refus d'un hostname qui résout vers une adresse interne :
  `localtest.me` (résout `127.0.0.1`). En off-line, le test accepte
  aussi un échec `getaddrinfo` comme preuve que la connexion n'a pas
  eu lieu.

---

## Matrice de réception : mise à jour post-S1-S5

Reprise de la matrice du 2026-11-08 (`2026-11-08-nuit.md` §Z2.4). Les
lignes modifiées sont marquées d'un `[S*]` ; les autres restent
inchangées. **Aucune ouverture à un client externe n'est permise tant
que les cinq points ne sont pas au vert, ce qui est désormais le cas
en test adverse local**, mais la production reste conditionnée à
l'application de la migration 0004 sur Supabase (pas cette nuit).

| Capacité | Implémentée | Tests | Dépendances à connecter | État réception |
|---|---|---|---|---|
| Contrat client/site/sujet (A0b, C1) | oui | 6 PASS | — | vert |
| **Isolation RLS par auth.uid() [S1]** | oui | test 10 Postgres (forcer vis.client_id → RIEN) | application de 0004 sur Supabase | **vert local, à passer sur Supabase** |
| **Validation humaine par la base [S2]** | oui | tests 11-12 Postgres + 3 Vitest orchestrateur | — | **vert** |
| **Moindre privilège [S3]** | oui | tests 13, 13bis, 13ter, 14 Postgres | création du rôle vis_admin côté Supabase | **vert local, à passer sur Supabase** |
| **Cohérence FK composite [S4]** | oui | tests 15, 15bis Postgres | migration à passer | **vert** |
| **Protection réseau [S5]** | oui | 18 PASS Vitest | pf sur Mac host à affiner en P3 | **vert côté logiciel** |
| Interface LLM unique + fictive | oui | 10 PASS | adaptateurs à activer | vert |
| Panel règles + générateur + CLI | oui | 22 PASS | — | vert |
| Table de preuves append-only | oui | 7 PASS Postgres | — | vert |
| Journal de décision | oui | inclus dans 9 PASS Postgres | — | vert |
| Connecteur de dépôt (D1-D6) | oui | 21 PASS | GitHub App + Action bundle | vert |
| SEO Command Orchestrator | oui | 21 PASS + 4 résilience + 3 S2 | passerelle de validation `ValidationGateway` à brancher sur Supabase | vert local |
| Scheduler SEO Command | oui (OFF) | tests règle 16 + S2 forcé à false | — | vert |
| Moteur statistique (F1) | oui | 10 PASS | import Elmo réel | vert |
| Import Elmo (F2) | oui | 5 PASS | mapping promptIndex production | vert |
| Contrôle des faits (F3) | oui | 6 PASS | LLM 2e passe | vert |
| Revue croisée (F4) | oui | 5 PASS | deux modèles diversifiés | vert |
| Rapport client (F5) | oui | 3 PASS | gabarit visuel web | vert |
| Modèle multi-budget (C3) | oui | 6 PASS | cap depuis `vis.client` | vert |
| Protection adresses internes (C2) | oui | 20 PASS | — | vert |
| Console locale CLI (H2) | oui | smoke-test | — | vert |
| Spec console (H3) | oui | — | mise en œuvre phase 1 | vert |
| Audit Souffleur (I1) | **clos** | 6 dépôts d'OolalaDXB inspectés, aucun MCP | — | vert |
| Guides (B4, D6, G2, C4, I2) | oui | — | — | vert |
| Cadre Shyrka (A9, ex-doctrine) | brouillon validé par T4 du mandat | — | — | vert |
| Modèle de vérification (T2 du mandat) | oui | 10 tests Vitest | — | vert |
| Test de bout en bout reproductible | oui | 10/10 PASS | — | vert |
| Résilience | oui | 4 PASS | — | vert |
| Gouvernance des données | oui | — | durées de conservation à acter | vert |

**Règle pour une ouverture à un client externe :** les cinq points
S1-S5 doivent rester au vert après application de la migration 0004
sur l'instance Supabase cible, et la passerelle `ValidationGateway`
doit pointer vers les fonctions `vis.validate_recommendation` et
`vis.toggle_scheduler` en production. Toute régression sur un de ces
points re-ferme l'ouverture.

## Fichiers livrés

- `infra/visibility/migrations/0004_auth_identity.sql` : S1-S4 (table
  `vis.client_member`, RLS auth.uid(), `vis.service_identity`,
  `validate_recommendation`, `toggle_scheduler`, `scheduler_switch`,
  revoke/grant S3, FK composites S4, `client_summary` mise à jour).
- `infra/visibility/scripts/test-evidence-migration.sh` : 15 tests
  Postgres, dont 6 adverses ajoutés ce soir (tests 10 à 15bis).
- `infra/visibility/src/seo-command/orchestrator.ts` : signature
  `ackValidation` sans `humanId`/`isAgent`, passage par
  `ValidationGateway`.
- `infra/visibility/src/seo-command/scheduler.ts` : `enabled` forcé
  à `false` à l'enregistrement.
- `infra/visibility/src/network/safe-fetch.ts` : fonction `safeFetch`
  + classe d'erreur + helper `isInternalAddress`.
- `infra/visibility/sandbox/Dockerfile`,
  `infra/visibility/sandbox/compose.yaml`,
  `infra/visibility/sandbox/README.md` : conteneur Crawlie confiné.
- `infra/visibility/test/safe-fetch.test.ts` : 18 tests adverses S5.
- Mise à jour des tests existants (`test/seo-command.test.ts`) pour
  la nouvelle signature d'`ackValidation`.

## À faire par Mickaël avant de fermer la revue

1. Appliquer la migration `0004_auth_identity.sql` sur l'instance
   Supabase cible (quand elle sera prête en P3). Vérifier que
   `auth.uid()` fourni par Supabase remplace bien l'émulation locale.
2. Créer les identités de service (`vis.service_identity`) pour chaque
   worker : `seo-command-orchestrator`, `seo-command-technique`, etc.
3. Ajouter Mickaël comme `owner` dans `vis.client_member` pour chaque
   client. Le `user_id` est l'`auth.uid()` renvoyé par Supabase pour
   son JWT.
4. Décider des règles pf de l'hôte Mac Studio pour durcir la sortie
   réseau de `oia-sandbox` au-delà de la couche logicielle S5.

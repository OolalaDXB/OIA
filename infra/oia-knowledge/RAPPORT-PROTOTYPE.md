# OIA Knowledge Engine · rapport du prototype comparatif (version 2)

8 novembre 2026. ADR associée : `docs/shyrka/adr/0005-oia-knowledge-engine.md`
(**proposée, révisée**). Rien en production : aucun service installé, aucune
donnée personnelle importée ; la mémoire de Shyrka (SQLite) et le volume
`Shyrka-corpus` n'ont pas été modifiés.

Code : `infra/oia-knowledge/prototype/` (Bun), `infra/oia-knowledge/exploitation/`
(scripts non installés), `infra/shyrka/src/executive/semence-a-blanc.ts`.

## 0. Ce qui change depuis la version 1

| Version 1 | Version 2 |
| --- | --- |
| montée en charge sur 40 copies synthétiques (rappel HNSW faussé) | **30 000 extraits distincts** de documentation publique installée (Postgres, Bun, pnpm, paquets npm…), mesurés de bout en bout, calcul du sens compris |
| banc de 12 + 5 + 4 cas, réglé sur lui-même | jeu de mise au point (31 cas) **et jeu tenu à l'écart** (50 cas écrits par un agent séparé, 41 documents, FR 14 · EN 10 · RU 8 · identifiants 10 · hors corpus plausibles 8), dont seuls les agrégats ont été regardés |
| pas de référence SQLite + bge-m3 | **mêmes extraits, mêmes vecteurs** dans SQLite (FTS5 + calcul exact) : on sait d'où vient le gain |
| `ml_toutes_v1` raté par Postgres | **canal d'identifiants exacts** (vues, fichiers, migrations, décisions) |
| abstention par seuil seul | abstention **en deux étages** (seuil, puis le modèle local juge les extraits) |
| HNSW `m = 16`, `ef_search = 100` | `m = 24`, `ef_construction = 200`, `ef_search = 200` (mesuré) |
| révocation physique constatée | **purge quotidienne avec preuve**, essayée (§ 6, `EFFACEMENT.md`) |
| — | scripts d'exploitation essayés sur le volume d'essai (§ 7) |
| — | semence personnelle du 8 novembre vérifiée et préparée **à blanc** (§ 8) |

## 1. Pertinence par mode (32 169 extraits, dont 30 000 distracteurs publics)

Jeu tenu à l'écart. Chaque case : bonne source **au rang 1 / dans les 3
premières**, sur le nombre de cas. Hors corpus : questions refusées. Seuil de
proximité 0,516, calibré sur le jeu de mise au point seulement.

| Mode | FR (14) | EN (10) | RU (8) | Identifiants (10) | Hors corpus refusés (8) |
| --- | --- | --- | --- | --- | --- |
| SQLite FTS5, mots (corpus actuel) | 10 / 12 | 2 / 2 | 0 / 0 | 6 / 9 | 6 |
| SQLite, sens exact (bge-m3) | 10 / 14 | 6 / 10 | 8 / 8 | 7 / 9 | 2 |
| SQLite, sens + mots | 12 / 13 | 4 / 6 | 8 / 8 | 10 / 10 | 2 |
| SQLite, sens + identifiants | 10 / 14 | 6 / 10 | 8 / 8 | 10 / 10 | 2 |
| Postgres, mots | 1 / 4 | 0 / 0 | 0 / 0 | 1 / 2 | 3 |
| Postgres, sens (HNSW) | 10 / 14 | 6 / 10 | 8 / 8 | 7 / 9 | 2 |
| Postgres, sens + mots + identifiants | 10 / 13 | 5 / 9 | 7 / 7 | 8 / 10 | 2 |
| **Postgres, sens + identifiants** | **10 / 14** | **6 / 10** | **8 / 8** | **10 / 10** | 2 |
| **… + second étage (modèle local)** | 14 gardées | 7 gardées | 8 gardées | 7 gardées | **8** |

À 2 169 extraits (sans distracteurs), même mode : 11/14, 7/10, 8/8, 10/10 au
rang 1 ; 14, 10, 8, 10 dans les 3 premières ; second étage : 39 bonnes sources
gardées sur 42, 8 refus sur 8.

Lecture :

- **Le gain vient du modèle, pas de la base.** Sur les mêmes vecteurs,
  Postgres (HNSW réglé) et SQLite (calcul exact) donnent exactement les mêmes
  résultats. bge-m3 apporte l'anglais (2 → 10 sur 10) et le russe (0 → 8 sur 8).
- **Les mots nuisent.** La recherche plein texte de Postgres (`ts_rank`, sans
  pondération IDF) est faible (4 sur 14 en français) et dégrade la fusion ;
  le BM25 de FTS5 est meilleur mais rate les autres langues. Retenu : **sens +
  identifiants**, sans les mots.
- **Identifiants exacts : 10 sur 10**, au rang 1, grâce au canal dédié (index
  GIN sur `identifiants`), classé par proximité de sens. Les vecteurs seuls en
  ratent un sur dix et n'en classent que 7 au rang 1.
- **Abstention.** Le seuil seul refuse les questions absurdes (10 sur 10 en
  mise au point) mais pas les questions plausibles hors corpus (2 sur 8 :
  « quel cabinet d'avocats… »). Le second étage (le modèle de Shyrka,
  `qwen3:30b-a3b-instruct`, local, lit les 3 meilleurs extraits et répond
  OUI ou NON) les refuse **toutes** (8 sur 8). Il coûte **0,05 à 0,8 s**
  par question et écarte à tort 3 bonnes sources sur 42 à 2 169 extraits,
  **6 sur 42 à 32 169** (anglais 3, identifiants 3). Sur le jeu de mise au
  point, les refus à tort viennent de l'extrait montré (le meilleur extrait de
  chaque document n'est pas toujours celui qui répond) : à retravailler
  **sans** regarder le jeu tenu à l'écart (§ critères, A3).
- Échantillons encore petits (8 à 14 cas par famille) : un cas = 7 à 12 points.

## 2. Index approché (HNSW) contre calcul exact, 32 169 extraits, 81 questions

| Réglage | `ef_search` 40 | 100 | 200 | 400 | 800 |
| --- | --- | --- | --- | --- | --- |
| `m = 16`, `ef_construction = 64` (v1) | 0,654 · 1,4 ms | 0,847 · 2,1 ms | 0,940 · 3,2 ms | 0,979 · 5,6 ms | 0,993 · 8,6 ms |
| **`m = 24`, `ef_construction = 200`** | 0,862 · 1,8 ms | 0,948 · 2,7 ms | **0,985 · 4,2 ms** | 0,996 · 6,7 ms | 1,000 · 10,7 ms |

Rappel@10 contre le calcul exact (69 ms sans index) · latence médiane, index
forcé. Le réglage v1 perdait des voisins sur des documents distincts : il
coûtait 1 cas en anglais, 1 en russe et 1 en français contre la référence
exacte ; le réglage retenu les rattrape tous. Construction : 13 s → 37 s.
Agent filtré par la RLS (Visibility seul) : 10 extraits rendus sur 10 demandés.

## 3. Montée en charge de bout en bout (2 169 → 32 169 extraits)

| Étape, 32 169 extraits (30 000 nouveaux) | Durée |
| --- | --- |
| Découpage | 4,2 s |
| **Calcul du sens (bge-m3, Ollama local)** | **580 s** (≈ 52 extraits/s) |
| Insertion | 6,1 s |
| Index lexicaux et identifiants (GIN) | 1,1 s |
| Index HNSW (`m = 24`) | 36,7 s |
| **Total** | **≈ 10 min 30 · 53 extraits/s** (627/s quand le sens est déjà en cache) |

| Recherche (32 169 extraits) | médiane | p95 |
| --- | --- | --- |
| Calcul du sens de la question | 15 à 23 ms | — |
| **Postgres, sens + identifiants** | **5,2 ms** | 14,5 ms |
| SQLite, sens exact en mémoire | 25,6 ms | 26,3 ms |
| SQLite FTS5 | 0,8 ms | 11,6 ms |
| Postgres, mots ou fusion avec mots | 82 ms | 307 ms |
| Second étage (modèle local) | 0,05 à 0,6 s | 0,8 s |

Taille : base 545 Mo (index HNSW 237 Mo), **≈ 17 Ko par extrait**. Le calcul
exact de SQLite croît linéairement (≈ 26 ms à 32 000, ≈ 140 ms attendus à
175 000) ; HNSW reste sous 15 ms.

## 4. Confidentialité : matrice de 45 essais, 45 réussis (`acces.ts`)

| Essai | Shyrka (modèle local) | Agent (modèle externe) | Agent Visibility |
| --- | --- | --- | --- |
| Compartiments visibles | les six | ceux accordés, **sans** le privé | Visibility seul |
| Extraits `mickael_seulement` visibles | 5 | **0** | **0** |
| Recherche « dossier ZEPHYRINE » : notes privées rendues | oui | **non** | **non** |
| Lire ou modifier `ke.droits`, lire `ke.revocation` | refusé | refusé | refusé |
| Insérer, effacer des extraits | refusé | refusé | refusé |
| Désactiver la RLS, `row_security = off` | refusé | refusé | refusé |
| Prendre le rôle ou l'identité de session de Shyrka | (lui-même) | refusé | refusé |

Et : un rôle qui a le privilège `select` mais aucune ligne de droits ne voit
**rien** ; une question piégée (`'); drop table … --`) reste un paramètre (32 169
extraits avant et après) ; une source révoquée disparaît pour tous les rôles,
sa réindexation et le renommage d'une autre source vers son adresse sont
refusés par le déclencheur ; `ke.revocation` ne garde que l'empreinte.

Les deux premiers « échecs » de la matrice venaient du test, pas de la base
(un compartiment accordé mais entièrement privé paraît vide, à raison ; une
session peut reprendre sa propre identité) : attendus corrigés.

## 5. Effacement et purge physique (essayés)

Voir `EFFACEMENT.md` pour la politique. Essai : deux notes fictives révoquées,
recherche de leur texte octet par octet.

| Où | Avant purge | Après `purger.sh` |
| --- | --- | --- |
| Fichiers de données | 1 fichier | **0** |
| WAL | 4 segments | **0** (`wal_recycle = off`, plus ancien segment postérieur à la révocation) |
| Sauvegardes (lues par `pg_restore`, elles sont compressées) | 2 sur 2 | mode normal : **2 restantes, déclarées dans la preuve**, expirent sous 7 jours ; `--urgent` : **0**, nouvelle sauvegarde faite |
| Journaux PostgreSQL et d'exploitation | 0 | 0 |
| Instantanés APFS / Time Machine | aucun, volume et image exclus | idem |

`vacuum full` : **40 s à 32 169 extraits**, recherche bloquée pendant ce temps
(d'où la nuit). La preuve est inscrite dans `ke.revocation.preuve` (fichiers
réécrits, segments WAL, sauvegardes restantes) sans texte ni adresse ;
`sante.sh` alerte tant qu'une révocation n'est pas purgée.

L'essai a trouvé et corrigé trois défauts du script (sauvegardes comptées
depuis la plus ancienne révocation au lieu de la plus récente ; contrôle des
tuples morts faussé par l'écriture de la preuve ; preuve non écrite). Il a
aussi montré la limite : le **cluster Docker de la version 1**, laissé sur le
volume d'essai, contient encore le texte. Toute copie hors du cluster géré
échappe à la purge ; d'où la règle « un seul cluster, rien d'autre sur le
volume ».

## 6. Exploitation (essayée sur le volume d'essai, non installée)

| Essai (`exploitation/essai.sh`) | Résultat |
| --- | --- |
| Sauvegarde `pg_dump` vers un **second volume chiffré** | 15 s, 177 Mo, vérifiée (`pg_restore --list`, SHA-256) ; refus si même support ou support non chiffré |
| Restauration dans une base à part | 42 s, comptes identiques (2 240 sources, 32 168 extraits, révocations) |
| Vérification (`pg_amcheck`, sommes de contrôle) | aucune corruption ; HNSW et GIN non couverts (reconstruits au besoin) |
| Démarrage sans volume / sur volume non chiffré | ne fait rien / **refusé** |
| Arrêt brutal (`kill -9`) puis démarrage | reprise automatique en ≈ 1 s |
| Bilan de santé | JSON, code 1 si alerte (révocation non purgée, sauvegarde de plus de 26 h, sommes de contrôle, volume à 80 %, Time Machine, instantanés) |
| Voisins | Docker : 20 conteneurs avant et après ; 27 ports écoutés avant et après ; Docker Desktop jamais touché |

## 7. Semence personnelle du 8 novembre (à blanc, rien d'écrit)

`semence-a-blanc.ts`, agrégats seulement :

- **intégrité** : 15 fichiers de la semence, **0 altéré** (empreintes du
  8 novembre) ; garde-fous du manifeste intacts (`contains_sensitive_data`
  vrai, `safe_to_commit_to_git`, `remote_processing_allowed`,
  `memory_preapproved` faux) ;
- 225 faits → **217 propositions valides** au contrat de mémoire (voie
  « proposition », affirmé par IA, statut « à confirmer », portée Mac
  seulement), 0 doublon, 0 invalide ; **8 écartés** par la règle Swift ;
- compartiments : personnel 178, projet 39 ; formes : préférence 207,
  décision 7, travail 3 (la détection de forme par mots-clés est grossière :
  à revoir à la confirmation) ;
- 70 faits P3 porteraient la restriction `mickael_seulement`, qui, dans le
  contrat actuel, les réserve à Mickaël : **Shyrka ne s'en servirait pas en
  conversation**. À décider ;
- **0 importable maintenant** : chaque fait porte `ingest_allowed: false`
  et `not_approved`. Rien ne sera écrit tant que Mickaël ne l'a pas levé.

## 8. Dimensionnement

≈ 17 Ko par extrait (v1 : 15,6). Hypothèse première année : 175 000 extraits
≈ **3 Go**, ingestion initiale ≈ 55 min (calcul du sens). Le volume de 40 Go
proposé en v1 reste large (journal, réécriture d'un `vacuum full` ×2,
croissance). Sauvegardes : 7 quotidiennes ≈ 7 × 1 Go sur un autre support
chiffré.

## 9. Plan de migration (après validation de l'ADR, critères A3 et A9 atteints)

1. **Second étage et jeu élargi** : retravailler le juge sur le jeu de mise au
   point (plusieurs extraits par document, consigne), faire écrire 100 cas de
   plus par un agent séparé, remesurer (A3, A9).
2. **Volume `OIA-Knowledge`** (40 Go, APFS chiffré, exclu de Time Machine),
   `initdb` avec sommes de contrôle et `reglages.conf`, rôles et droits par
   compartiment ; installation des deux `.plist`.
3. **Passerelle** branchée sur le nouveau moteur derrière `chercher(texte,
   demandeur)`, FTS5 gardé en secours le temps de la transition ; bancs
   `recherche.sourcee` et `conversation.decisions` à l'identique.
4. **Connecteurs un par un**, chacun avec droits, banc de rappel, matrice de
   confidentialité et essai de révocation-purge : dépôt → Supabase (vues) →
   conversations autorisées → courrier résumé → fichiers locaux choisis.
5. Retirer l'index FTS5 de `Shyrka-corpus` quand le nouveau moteur a passé
   les bancs. La mémoire personnelle SQLite reste où elle est ; la semence du
   8 novembre n'y entre que par propositions confirmées une à une, après levée
   d'`ingest_allowed` par Mickaël.

## 10. Environnement d'essai à nettoyer

Volumes d'essai `scratchpad/ke/OIA-KE-essai.sparsebundle` (dont le cluster
Docker de la v1) et `OIA-KE-sauv-essai.sparsebundle`, cluster natif d'essai
(port 56432), conteneur et volume Docker `oia-ke-essai` s'ils existent,
modèle Ollama `qwen3:30b-a3b` (variante « thinking », inutile).

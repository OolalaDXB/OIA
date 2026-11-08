# OIA Knowledge Engine · rapport du prototype comparatif

8 novembre 2026. ADR associée : `docs/shyrka/adr/0005-oia-knowledge-engine.md`
(**proposée**). Aucune donnée personnelle n'a été migrée ; la mémoire de
Shyrka et le volume `Shyrka-corpus` n'ont pas été touchés.

## Ce qui a été testé

- **Jeu d'essai** : les 116 documents Markdown du dépôt (docs, infra),
  découpés en **1 627 extraits** de 119 sources, plus **5 notes fictives**
  classées `mickael_seulement` (cible des tests de confidentialité). Montée en
  charge : 40 copies synthétiques, **66 507 extraits**.
- **Deux variantes** de PostgreSQL 17 + pgvector, mêmes réglages (sommes de
  contrôle, 1 Go de cache) : **natif** (Homebrew, pgvector 0.8.7) sur un
  volume d'essai chiffré AES-256 ; **Docker** (image Supabase locale,
  pgvector 0.8.0), d'abord sur le même volume, puis sur un volume Docker
  interne (voir les incidents).
- **Plongements** : bge-m3 par Ollama, en local (1 024 dimensions).
- **Banc** : 15 cas du banc de recherche actuel de Shyrka + 5 reformulations,
  4 questions en anglais et en russe, 2 questions hors corpus, 5 tentatives de
  lecture des notes privées.

Code : `infra/oia-knowledge/prototype/` (`schema.sql`, `corpus.ts`,
`charger.ts`, `banc.ts`, `ef.ts`, `cas.json`), exécuté avec Bun.

## Qualité de recherche (1 627 extraits, identique en natif et en Docker)

| Mode | Cas existants (source dans les 3 premières) | Hors corpus (abstention) | Reformulations | Autres langues |
| --- | --- | --- | --- | --- |
| SQLite FTS5 (actuel) | 11/12 | **0/5** | 2/5 | 0/4 |
| Postgres lexical | 6/12 | 0/5 | 0/5 | 0/4 |
| **Postgres sémantique** | **11/12** | **5/5** | **3/5** | **2/4** |
| Postgres hybride | 10/12 (Docker 9/12) | 5/5 | 2/5 | 1/4 |

- La recherche sémantique est la meilleure ; elle corrige le défaut connu du
  corpus actuel (aucune abstention hors corpus).
- L'hybride ne fait pas mieux sur ce jeu : la recherche lexicale française,
  même limitée au départage, ajoute du bruit. À retravailler, surtout pour les
  identifiants exacts : `ml_toutes_v1` est raté par tous les modes Postgres.
- Échantillons petits (12, 5, 5, 4 cas) : résultats indicatifs.

## Confidentialité

| Essai | Résultat |
| --- | --- |
| Agent (modèle externe) cherchant les 5 notes privées, 3 modes, 20 résultats | **0 fuite**, natif et Docker, à 1 627 et 66 507 extraits |
| Shyrka (modèle local) cherchant les mêmes notes | retrouvées 2 à 4 sur 5 selon le mode |
| Droits lus par une fonction de confiance | un premier essai (current_user au lieu de session_user) a **fermé** tous les accès : défaut sûr, corrigé |
| Révocation logique | instantanée : extraits et vecteurs supprimés, empreinte qui bloque le retour |
| Révocation physique | le texte **reste** dans les fichiers jusqu'à `VACUUM FULL` (83 s sur 96 507 extraits, table verrouillée) et dans le journal après rotation : purge physique à planifier |

## Performances

| Mesure | Natif (volume chiffré) | Docker |
| --- | --- | --- |
| Insertion de 66 507 extraits | 10,3 s | 24,1 s (volume interne) |
| Index HNSW | 14,0 s | 5,2 s |
| Recherche sémantique, 66 507 extraits | **0,66 ms** (p95 0,79) | 1,40 ms (p95 2,59) |
| Recherche lexicale « OU », 66 507 extraits | 187 ms | 196 ms |
| Recherche exacte sans index | 68 ms | — |
| Plongement d'une question (bge-m3) | 40 ms | 40 ms |
| Plongement à l'ingestion | ≈ 43 extraits/s | ≈ 43 extraits/s |
| Taille | 1,04 Go pour 66 507 extraits (index HNSW 545 Mo), ≈ 15,6 Ko par extrait | idem |
| Sauvegarde `pg_dump` / restauration | 32 s, 353 Mo / 24 s, comptes identiques | non mesuré |

Limite : les copies synthétiques, presque identiques, faussent l'évaluation
de l'index approché (rappel bas à `ef_search` 100, exact à 400 mais aussi lent
qu'un parcours complet). **La montée en charge est à refaire sur des documents
réellement distincts** avant de fixer les paramètres HNSW.

## Robustesse

| Essai | Natif | Docker |
| --- | --- | --- |
| Chiffrement au repos | volume AES-256 ; texte en clair absent des fichiers de l'image | sur le volume : idem ; sur volume interne : **non chiffré** (FileVault désactivé) |
| Éjection du volume, base arrêtée | possible ; sans volume, la base ne démarre pas ; remontée, tout revient | **impossible** : la VM Docker garde 1 109 fichiers ouverts, même conteneur supprimé ; éjection forcée nécessaire |
| Remontée du volume après éjection | sans souci | **échec** : Docker ne remonte plus le chemin sans redémarrer Docker Desktop (qui fait tourner Elmo et Bawaba) |
| Arrêt brutal (kill -9) pendant une écriture | reprise automatique en 2,7 s ; transaction validée conservée ; 0 erreur de somme de contrôle sur 288 202 blocs | volume plein → PANIC ; non relancé sur le volume (problème de remontée) |
| Mémoire partagée | — | 64 Mo par défaut : construction de l'index HNSW impossible sans `--shm-size` |

**Conclusion : PostgreSQL natif sur volume chiffré.** Docker apporte une
installation simple mais casse le modèle de sécurité actuel (éjecter le volume
rend les données illisibles) et ajoute des pannes propres à Docker Desktop.

## Dimensionnement proposé (au lieu de 500 Go)

Base mesurée : ≈ 15,6 Ko par extrait (texte, vecteur, index HNSW et lexical).

| Hypothèse première année | Extraits | Base |
| --- | --- | --- |
| Dépôt OIA et documents | ≈ 5 000 | 0,08 Go |
| Money Lookup (opportunités, notes, décisions) | ≈ 20 000 | 0,3 Go |
| Visibility (réponses et preuves, ≈ 50 par jour) | ≈ 20 000 | 0,3 Go |
| Conversations autorisées et courrier résumé | ≈ 30 000 | 0,5 Go |
| Fichiers locaux choisis | ≈ 100 000 | 1,6 Go |
| **Total** | **≈ 175 000** | **≈ 2,7 Go** |

Avec le journal (≈ 2 Go), la place de réécriture d'un `VACUUM FULL` (×2) et la
croissance : **volume `OIA-Knowledge` de 40 Go**, extensible (image disque
redimensionnable). Sauvegardes chiffrées **sur un autre support** : 7
quotidiennes + 4 hebdomadaires ≈ 11 × 1 Go compressé ≈ 12 Go.

## Plan de migration proposé (après validation)

1. **Valider l'ADR 0005** et le dimensionnement. Activer FileVault (Mickaël).
2. **Volume `OIA-Knowledge`** (40 Go, chiffré, mot de passe de Mickaël dans le
   trousseau), Postgres natif lancé par launchd **seulement si le volume est
   monté**, port local uniquement, rôles et droits par compartiment.
3. **Refaire la montée en charge sur de vrais documents distincts** et régler
   HNSW (`m`, `ef_search`) et le seuil d'abstention sur un jeu tenu à l'écart.
4. **Brancher la passerelle** sur le nouveau moteur derrière l'interface
   actuelle `chercher(texte, demandeur)` ; garder FTS5 en secours pendant la
   transition ; banc `recherche.sourcee` et `conversation.decisions` à
   l'identique.
5. **Connecteurs un par un**, chacun avec droits, test de rappel, test de
   confidentialité et révocation : dépôt → Supabase (vues) → conversations
   autorisées → courrier résumé → fichiers locaux choisis.
6. **Purge physique planifiée** (réécriture des tables touchées par une
   révocation, rotation du journal, expiration des sauvegardes).
7. Retirer l'index FTS5 du volume `Shyrka-corpus` quand le nouveau moteur a
   passé les bancs ; la mémoire personnelle SQLite reste où elle est.

## Environnement d'essai à nettoyer

Volume d'essai `scratchpad/ke/OIA-KE-essai.sparsebundle` (mot de passe
généré pour l'essai), cluster natif d'essai, conteneur et volume Docker
`oia-ke-essai`, modèles Ollama `bge-m3` (gardé pour la suite) et
`qwen3:30b-a3b` (variante « thinking », inutile).

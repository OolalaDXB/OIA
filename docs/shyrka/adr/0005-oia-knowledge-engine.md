# ADR 0005 · OIA Knowledge Engine

- **Statut : PROPOSÉE, révisée le 8 novembre 2026 (version 2), non
  appliquée.** Mickaël retient provisoirement PostgreSQL natif + pgvector sur
  un volume chiffré indépendant, comme couche de recherche commune aux modules
  d'OIA, avec des droits cloisonnés par compartiment. Prototype accepté comme
  étude d'architecture, **pas encore pour la production** : passage soumis aux
  critères d'acceptation ci-dessous.
- Complète l'ADR 0004 (mémoire et connaissances) sans la remplacer.
- Prototype et mesures : `infra/oia-knowledge/RAPPORT-PROTOTYPE.md` (v2) ;
  effacement : `infra/oia-knowledge/EFFACEMENT.md` ; exploitation :
  `infra/oia-knowledge/exploitation/`.

## Contexte

Le corpus de Shyrka est un index SQLite FTS5 de 18 documents du dépôt, dans
le volume chiffré `Shyrka-corpus` (50 Go). Mickaël veut y intégrer
progressivement tout l'écosystème Oolala : il faut un moteur de connaissances
transversal, utilisable par Shyrka et par les agents autorisés.

Limites constatées le 8 novembre 2026 :

- la recherche par mots (FTS5) ne s'abstient jamais (0 sur 5 hors corpus) et
  rate les reformulations (2 sur 5) et les autres langues (0 sur 4) ;
- SQLite n'accepte qu'un écrivain à la fois ; l'ingestion, la passerelle et
  les agents devront travailler en même temps ;
- le volume chiffré actuel est dimensionné pour la mémoire, pas pour un corpus
  transversal.

## Décision proposée

### 1. Trois espaces séparés, sans mélange

| Espace | Contenu | Stockage | Change-t-il ? |
| --- | --- | --- | --- |
| **Mémoire personnelle** | souvenirs validés, corrigés, oubliés (ADR 0004, voies 1 à 3) | SQLite, volume `Shyrka-corpus` | **non** : conservée telle quelle, avec ses mécanismes |
| **Corpus documentaire** | index, références et extraits autorisés de documents et d'enregistrements, pour tous les modules d'OIA | **PostgreSQL + pgvector**, nouveau volume chiffré `OIA-Knowledge` | oui : remplace l'index FTS5 actuel |
| **Données opérationnelles** | bases métier (Supabase OIA, Elmo, applications Oolala) | inchangées | non : elles restent la source de vérité |

Le corpus ne contient **jamais** une copie des bases métier : une source y est
une référence (`uri`, version, date) et des extraits autorisés. Supprimer ou
révoquer la source supprime ses extraits, vecteurs et index dérivés (règle
« une seule copie » de l'ADR 0004).

### 2. PostgreSQL natif, sur un volume chiffré dédié

PostgreSQL 17 (Homebrew) + pgvector, lancé par launchd, données sur un volume
APFS chiffré (image disque AES-256) monté à la demande. **Pas Docker** pour ces
données (voir § Conséquences, essais du 8 novembre) : la machine virtuelle de
Docker Desktop garde les fichiers ouverts et empêche d'éjecter le volume ; elle
ne remonte plus le volume après une éjection ; son disque interne n'est pas
chiffré sur ce Mac (FileVault désactivé).

### 3. Recherche : sens + identifiants exacts, abstention en deux étages ; permissions avant la recherche

Mesures v2 (32 169 extraits, jeu tenu à l'écart) : rapport, § 1 à 3.

- **Sens** : vecteurs bge-m3 (multilingue, 1 024 dimensions) calculés en
  local par Ollama ; index HNSW `m = 24`, `ef_construction = 200`,
  `ef_search = 200`, `iterative_scan = relaxed_order` (rappel@10 0,985 contre
  le calcul exact, 4 ms). Le gain sur la recherche actuelle vient du modèle :
  la même chose dans SQLite donne les mêmes résultats, mais en calcul exact
  linéaire.
- **Identifiants exacts** (`ml_toutes_v1`, chemins, migrations, décisions
  D07…) : extraits à l'indexation dans une colonne dédiée (index GIN) ; un
  document qui porte l'identifiant de la question passe en tête, départagé
  par le sens. 10 sur 10 au rang 1.
- **Pas de recherche par mots** dans le classement : `ts_rank` de Postgres
  (sans IDF) dégrade le résultat. À réexaminer seulement avec un vrai BM25,
  mesuré sur le même banc.
- **Abstention en deux étages** : seuil de proximité (calibré sur le jeu de
  mise au point), puis le modèle local de Shyrka juge si les meilleurs extraits
  répondent. Refuse les questions plausibles hors corpus (8 sur 8), au prix de
  0,05 à 0,8 s et de bonnes sources écartées à tort (critère A3, non atteint).
- **Permissions** : règles de la base (RLS) appliquées **avant** tout
  classement ; un rôle ne voit que les compartiments que lui accorde la table
  des droits, qu'il ne peut pas modifier. Un rôle qui alimente un modèle
  externe ne lit jamais une source `mickael_seulement`. La passerelle refait
  le filtre avant la génération.

### 4. Connecteurs évolutifs

Un connecteur par famille de sources, chacun déclaré au catalogue avec son
compartiment, ses lecteurs et sa classification : dépôt GitHub, fichiers
locaux (dossiers choisis), Supabase (vues autorisées, jamais les tables
brutes), applications Oolala, conversations autorisées. Ingestion
incrémentale par version : une source inchangée n'est pas réindexée.

### 5. Révocation en deux temps, purge vérifiable

1. **Logique, immédiate** : suppression de la source (cascade sur extraits,
   vecteurs, index), empreinte de révocation et position du journal (LSN)
   inscrites ; un déclencheur refuse le retour de la source.
2. **Physique, chaque nuit** (`purger.sh`) : réécriture des tables, TOAST et
   index (`vacuum full`), sortie du WAL de tout segment antérieur à la
   révocation (`wal_recycle = off`, pas d'archivage), sauvegardes antérieures
   déclarées puis expirées sous 7 jours (ou supprimées la nuit même avec
   `--urgent`), absence d'instantanés et exclusion de Time Machine contrôlées.
   La preuve est écrite dans `ke.revocation.preuve`, sans texte ni adresse.
   Essayé : le texte d'une note révoquée n'existe plus nulle part dans le
   cluster ni dans les sauvegardes. Limite : blocs libérés du SSD, chiffrés
   mais non effacés (voir `EFFACEMENT.md`).

### 6. Exploitation

Un seul cluster, sur son volume, rien d'autre sur ce volume. launchd le
démarre au montage, seulement si le volume est chiffré ; `nice` pour ne
jamais gêner Elmo, Docker, Ollama ni Shyrka ; port 56432 sur 127.0.0.1,
socket 0700. Chaque nuit : purge, sauvegarde vers un autre support chiffré,
bilan de santé ; chaque dimanche, vérification complète. Restauration
toujours dans une base à part. Scripts : `infra/oia-knowledge/exploitation/`.

## Conséquences

- Shyrka garde sa mémoire SQLite ; seule la recherche documentaire change de
  moteur, derrière la même interface (`chercher(texte, demandeur)`).
- Un service de plus à surveiller (Postgres natif), et un volume chiffré à
  monter au démarrage du Mac.
- Les vecteurs coûtent de la place (environ 17 Ko par extrait, index
  compris) et du temps d'ingestion (environ 53 extraits par seconde de bout
  en bout en local, calcul du sens compris : 175 000 extraits ≈ 55 min).
- La purge physique verrouille les tables le temps d'un `vacuum full` (40 s à
  32 000 extraits) : la nuit ; partitionner `ke.extrait` au-delà de quelques
  centaines de milliers d'extraits.

## Critères d'acceptation avant la production

Mesurés par `infra/oia-knowledge/prototype/` (banc, juge, ef, acces) et
`exploitation/essai.sh`, sur un jeu tenu à l'écart jamais utilisé pour régler.

| # | Critère | Seuil | Mesure v2 | État |
| --- | --- | --- | --- | --- |
| A1 | Bonne source dans les 3 premières, par famille (FR, EN, RU) | ≥ 95 % | 100 %, 100 %, 100 % | atteint |
| A2 | Identifiants exacts au rang 1 | 100 % | 10 sur 10 | atteint |
| A3 | Abstention complète : hors corpus plausibles refusés, **et** bonnes sources gardées | ≥ 90 % **et** ≥ 95 % | 100 % et 86 % (93 % sans distracteurs) | **non atteint** |
| A4 | Rappel@10 de HNSW contre le calcul exact, à la taille réelle | ≥ 0,98 | 0,985 à 32 169 | atteint ; à remesurer à chaque triplement |
| A5 | Latence de recherche (hors second étage), p95 | ≤ 50 ms à 200 000 extraits | 14,5 ms à 32 169 | à mesurer à 200 000 |
| A6 | Matrice de confidentialité | 100 % | 45 sur 45 | atteint |
| A7 | Purge physique prouvée après une révocation | ≤ 24 h (sauvegardes ≤ J + 8, ou la nuit en urgence) | essayée | atteint à l'essai |
| A8 | Exploitation : sauvegarde vérifiée, restauration à part, reprise après arrêt brutal ≤ 60 s, aucun effet sur Docker et Elmo | tous | tous | atteint à l'essai |
| A9 | Jeu tenu à l'écart assez grand | ≥ 150 cas, ≥ 25 par famille | 50 cas | **non atteint** |
| A10 | Import personnel : aucune écriture sans levée explicite d'`ingest_allowed` ; chaque proposition confirmée par Mickaël | 0 écriture | 0 (à blanc) | atteint |

## Ce qui reste à décider par Mickaël

1. Valider l'ADR une fois A3 et A9 atteints (second étage retravaillé sur le
   jeu de mise au point, jeu tenu à l'écart élargi par un agent séparé).
2. Taille du volume `OIA-Knowledge` (proposition : 40 Go extensibles) et
   support des sauvegardes chiffrées (un autre disque que la base).
3. Activer FileVault sur le Mac (réglage système, à faire par Mickaël).
4. Ordre des connecteurs et dossiers locaux autorisés.
5. Politique d'effacement proposée (`EFFACEMENT.md`) : purge chaque nuit,
   sauvegardes 7 jours, mode urgent.
6. Semence personnelle du 8 novembre : lever ou non `ingest_allowed`, et si
   les faits P3 (`mickael_seulement`) doivent rester invisibles à Shyrka en
   conversation, comme le veut le contrat actuel.

# ADR 0005 · OIA Knowledge Engine

- **Statut : PROPOSÉE, non appliquée.** Architecture cible à valider par
  Mickaël avant toute modification structurelle et toute migration de donnée
  personnelle (consigne du 8 novembre 2026).
- Complète l'ADR 0004 (mémoire et connaissances) sans la remplacer.
- Prototype et mesures : `infra/oia-knowledge/RAPPORT-PROTOTYPE.md`.

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
| **Corpus documentaire** | index, références et extraits autorisés de documents et d'enregistrements | **PostgreSQL + pgvector**, nouveau volume chiffré `OIA-Knowledge` | oui : remplace l'index FTS5 actuel |
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

### 3. Recherche hybride, permissions avant la recherche

- **Sémantique** : vecteurs bge-m3 (multilingue, 1 024 dimensions) calculés en
  local par Ollama ; index HNSW ; seuil de proximité pour s'abstenir.
- **Lexical** : recherche plein texte de Postgres, pour départager et pour les
  identifiants exacts (à mieux traiter : `ml_toutes_v1` raté dans le prototype).
- **Fusion** : la proximité de sens décide de ce qui est retenu ; les mots
  communs départagent ; fraîcheur et pertinence en pondération.
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

### 5. Révocation en deux temps

1. **Logique, immédiate** : suppression de la source (cascade sur extraits,
   vecteurs, index), empreinte de révocation qui bloque son retour.
2. **Physique, planifiée** : réécriture des tables et des index touchés,
   rotation du journal, expiration des sauvegardes qui la contiennent. Le
   prototype montre que le texte reste dans les fichiers jusqu'à cette étape.

## Conséquences

- Shyrka garde sa mémoire SQLite ; seule la recherche documentaire change de
  moteur, derrière la même interface (`chercher(texte, demandeur)`).
- Un service de plus à surveiller (Postgres natif), et un volume chiffré à
  monter au démarrage du Mac.
- Les vecteurs coûtent de la place (environ 15,6 Ko par extrait, index
  compris) et du temps d'ingestion (environ 43 extraits par seconde en local).

## Ce qui reste à décider par Mickaël

1. Valider l'architecture (Postgres natif, volume dédié, trois espaces).
2. Taille du volume `OIA-Knowledge` (proposition : 40 Go extensibles) et
   emplacement des sauvegardes chiffrées.
3. Activer FileVault sur le Mac (réglage système, à faire par Mickaël).
4. Ordre des connecteurs et dossiers locaux autorisés.
5. Politique de purge physique après révocation (délai, fréquence).

# OIA Knowledge Engine · effacement vérifiable

Statut : proposition, essayée sur le volume d'essai (voir RAPPORT-PROTOTYPE.md, § 5). Rien en production.

## Ce qu'une révocation laisse derrière elle

Révoquer une source est immédiat et logique : la ligne `ke.source` est supprimée, ses extraits partent avec elle (`on delete cascade`), l'empreinte SHA-256 de son adresse entre dans `ke.revocation` et un déclencheur refuse son retour par tout connecteur. Plus aucun rôle ne la voit. Le texte, lui, reste physiquement à plusieurs endroits :

| Où | Ce qui reste | Combien de temps sans purge | Purge proposée | Preuve vérifiable sans garder le texte |
|---|---|---|---|---|
| Pages de `ke.extrait` et `ke.source` (tas) | les lignes mortes, texte et vecteur | jusqu'à réécriture de la page (des mois) | `vacuum full` chaque nuit s'il y a une révocation | nouveau fichier de chaque relation (`pg_relation_filenode` change), l'ancien est supprimé |
| TOAST (textes longs) | idem | idem | réécrit par `vacuum full` | idem |
| Index GIN (mots, identifiants), HNSW (vecteurs) | termes, identifiants, vecteur (dont on peut approcher le sens) | idem | reconstruits par `vacuum full` | idem |
| Journaux de transactions (WAL) | l'insertion d'origine, en clair | jusqu'au recyclage du segment ; avec `wal_recycle = on`, un segment est **renommé et réutilisé** sans être vidé | `wal_recycle = off`, `archive_mode = off`, aucun emplacement de réplication, deux `pg_switch_wal()` + `checkpoint` | le plus ancien segment présent est postérieur à `pg_walfile_name(lsn de révocation)` |
| Sauvegardes `pg_dump` (autre support chiffré) | la source entière | la durée de rétention (7 jours) | rotation ; `purger.sh --urgent` supprime les sauvegardes antérieures et en refait une | aucune sauvegarde datée d'avant la révocation au-delà de la rétention (`preuve.sauvegardes_anterieures_restantes`) |
| Instantanés APFS locaux, Time Machine | une image complète du volume | jusqu'à expiration de l'instantané ou de la sauvegarde | volume **et** fichier d'image exclus de Time Machine ; aucun instantané | `tmutil isexcluded`, `tmutil listlocalsnapshots` vide |
| Journal de PostgreSQL | requêtes en erreur, paramètres | 7 jours (fichiers tournants) | `log_statement = none`, `log_min_error_statement = panic`, aucun paramètre journalisé | `reglages.conf` ; recherche d'un témoin dans `log/` à l'essai |
| Cache des vecteurs du connecteur | empreinte du texte et vecteur (pas le texte) | sans limite | entrée supprimée avec la source (clé = empreinte de l'extrait) | aucune empreinte d'un extrait révoqué dans le cache |
| Blocs libérés du système de fichiers | octets des fichiers supprimés, **chiffrés** par la clé du volume | jusqu'à réécriture ou TRIM | volume chiffré ; destruction de la clé pour un effacement total | non vérifiable bloc par bloc : c'est la limite (voir plus bas) |
| Hors du Knowledge Engine | Ollama (pas de journal des entrées sauf `OLLAMA_DEBUG`), historique de conversation de Shyrka, réponses déjà données | — | relève de la mémoire de Shyrka (« oublie … ») et des modules | hors périmètre de ce document |

## Politique proposée

1. **Révocation immédiate** (logique) : invisible pour tous, retour bloqué. Effet en moins d'une seconde.
2. **Purge physique chaque nuit à 3 h 30** (`exploitation/purger.sh`, lancé par `com.oia.knowledge-engine.nuit.plist`) s'il reste une révocation non purgée : réécriture des tables et index, sortie du WAL, contrôle des instantanés, mise à jour de `ke.revocation.purge_le` et `ke.revocation.preuve`. Le script échoue (et `sante.sh` alerte) si une seule preuve manque.
3. **Sauvegardes** : sept jours de rotation. Une source révoquée a donc disparu de tout support au plus tard **J + 8**. Pour une demande d'effacement pressante, `purger.sh --urgent` ramène ce délai à la nuit même.
4. **Contrôle** : `sante.sh` lève une alerte tant qu'une révocation n'est pas purgée ; la preuve est consultable par l'administrateur (`select empreinte, revoque_le, purge_le, preuve from ke.revocation`). Elle ne contient ni le texte ni l'adresse de la source.

## Limites assumées

- `vacuum full` verrouille les tables le temps de la réécriture (mesuré à l'essai : voir le rapport). D'où la nuit. À très grande taille, partitionner `ke.extrait` (par compartiment ou par lot de sources) pour ne réécrire que les partitions touchées.
- Les fichiers supprimés laissent des blocs libres sur le SSD : ils restent chiffrés par la clé du volume et ne sont lisibles qu'avec elle. Un effacement au niveau du bloc n'est pas garanti par APFS ; l'effacement total d'un compartiment passe par un volume dédié dont on détruit la clé.
- Une réponse déjà donnée par Shyrka ou par un agent avant la révocation n'est pas rappelée par la base.

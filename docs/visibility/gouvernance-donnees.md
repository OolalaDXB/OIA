# Gouvernance des données · OIA Visibility

**Statut** : document seul, aucune politique de suppression appliquée cette nuit. À valider avec Mickaël avant toute mise en production.

## Portée

OIA Visibility collecte et conserve :

1. Des **réponses brutes** d'IA pour un panel de questions (`vis.evidence`, A5).
2. Des **recommandations** formulées par les agents (`vis.recommendation`, E2/E3).
3. Des **décisions** humaines (`vis.decision`, E3).
4. Des **exécutions** (PR, commits, fusions, remesures ; `vis.execution`, E3).
5. Un **journal d'actions** SEO Command (`vis.action_log`, C1).
6. Des **crawls** Crawlie (JSON brut, hors base, dans `~/oia-visibility-data/crawlie/`).
7. Des **saisies manuelles** d'applications grand public (`~/oia-visibility-data/manual/`).

## Durées de conservation par type

| Type | Durée par défaut | Justification |
|---|---|---|
| Réponses brutes (`vis.evidence`) | **36 mois** | Permet de comparer deux fenêtres annuelles + un recul historique. |
| Recommandations (`vis.recommendation`) | **indéfinie** | Le journal de décision doit pouvoir être audité à n'importe quel moment. |
| Décisions (`vis.decision`) | **indéfinie** | Idem. |
| Exécutions (`vis.execution`) | **indéfinie** | Idem. |
| Journal d'actions (`vis.action_log`) | **24 mois** | Rotation adaptée aux obligations contractuelles. |
| Crawls Crawlie (JSON) | **12 mois** | Les crawls peuvent être re-exécutés ; on conserve pour comparaison, pas comme preuve. |
| Saisies manuelles | **24 mois** | Alignement avec les contrats clients. |
| Logs techniques (worker, cost-guard) | **90 jours** | Pas de valeur juridique, utile pour le debugging. |

Toutes ces valeurs sont **à valider par Mickaël** avant d'être codées comme politique.

## Effacement des données personnelles

Deux chemins possibles :

### Donnée personnelle liée à une identité humaine

- Identités (contacts clients, auteurs de décisions humaines, Mickaël) : table `vis.client_contact` (futur) + références `decided_by`, `validated_by`. Effacement **par pseudonymisation** : remplacer `by` par `deleted-<hash>` et enregistrer la suppression dans un fichier séparé `data-deletion-log.jsonl`, hors du journal append-only.

### Donnée personnelle dans une réponse IA

- Une réponse IA peut citer une personne nommée (par exemple si la marque est une personne). Pour effacer sans altérer l'intégrité du journal append-only :
  - stocker les champs potentiellement personnels dans une table associée `vis.evidence_pii` (référence par `evidence_id`, colonnes spécifiques) ;
  - l'effacement **vide** la table associée mais laisse `vis.evidence` intact ;
  - un hash de la version pseudonymisée permet de prouver l'intégrité de la preuve.

Ce pattern (table append-only + table pseudonymisable référencée) permet de concilier :
- le journal d'audit en ajout seul (contrainte SQL stricte dans les triggers) ;
- les demandes légitimes de suppression (RGPD article 17, par exemple).

## Séparation entre clients

Toute donnée est scopée par `client_id` dans la base (RLS fondée sur `vis.current_client_id()` ; voir C1). Les tests d'isolation prouvent qu'aucune lecture ni écriture ne traverse la frontière du client, même via une fonction `security definer` (vis.client_summary).

Côté application :
- Le middleware AuthGate (apps/web) pose `vis.client_id` par session SQL.
- La console (H2/H3) refuse de rendre une vue sans `client_id` renseigné.
- Les exports (`backup.sh`) sont faits **par client** — jamais un seul dump de toutes les données.

## Flux hors d'Europe (rappel FOURNISSEURS.md)

Dans la configuration payante plafonnée d'A3 : OpenAI, Anthropic, OpenRouter, Google et Perplexity sont aux États-Unis. Mistral est en France (UE), sous réserve que le moteur de recherche web qu'il utilise soit lui-même en UE (non documenté par Mistral à ce jour). Chaque flux hors UE est à mentionner dans le contrat client.

## Droit à l'oubli demandé par un visiteur du site client

Si un visiteur du site d'un client demande la suppression d'une information publiée, le client applique son propre processus. OIA Visibility :

- ne conserve que ce que les IA citent, pas les données du site lui-même ;
- peut, sur demande, pseudonymiser des réponses IA qui nommeraient la personne (voir ci-dessus) ;
- ne contacte **jamais** le visiteur directement.

## Rétention à l'arrêt d'un contrat client

Quand un client cesse son contrat :

1. Un snapshot final est produit (export dans `~/oia-visibility-backups/<client>/`).
2. Pseudonymisation immédiate des identités humaines du client (contacts).
3. Le `vis.client.status` passe à `archived`. La RLS continue de s'appliquer.
4. Après 3 mois, suppression **physique** de toutes les lignes du client (tables non append-only), et pseudonymisation définitive des références dans les tables append-only.
5. Le journal de suppression est conservé pour audit.

## Points ouverts, à trancher avec Mickaël

- Les durées proposées sont-elles alignées avec les contrats clients ?
- Qui porte la responsabilité du traitement : OIA ou le client ?
- Y a-t-il un sous-traitant DPO à nommer dans les contrats ?
- Quel est le format de notification à l'ANSSI / CNIL en cas d'incident ?

## Aucune politique appliquée cette nuit

- Rien n'est supprimé.
- Rien n'est pseudonymisé.
- Les tables persistantes ne sont pas encore en production.
- Ce document sert de contrat de travail pour la mise en production P3.

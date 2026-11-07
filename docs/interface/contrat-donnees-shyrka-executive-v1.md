# Contrat de données · Shyrka exécutive · version 1

2026-11-08 · mandat v10, bloc F4. **Lovable possède l'interface ; Claude Code possède les données.**

Schéma de référence (exécutable) : `packages/shyrka/src/executive-contrat.ts` (`VuesExecutiveV1`, zod).
Production des vues : `pnpm shyrka:executive vues` (JSON validé par le schéma avant sortie).
Ce contrat **ajoute** six vues ; il ne modifie aucune vue de `contrat-donnees-v1.md` ni de `contrat-donnees-shyrka.md`.

## État du raccordement : à réaliser

- Les vues sont produites **sur le Mac de Mickaël** (`origine: "mac-local"`). Il n'existe en v1 **aucun transport authentifié** vers le cockpit : ni la base OIA ni `shyrka-chat` ne portent ces données.
- Aucune adresse locale (SQLite, Ollama, Whisper, `127.0.0.1`) n'est présentée comme accessible depuis le cloud, et rien n'est exposé publiquement pour « faciliter » le branchement.
- Aucune mémoire personnelle n'est copiée dans Supabase. `memoire_autorisee_v1` est `non_implemente` tant que `shy_contexte` ne porte pas les champs de l'ADR 0004 (migration à relire, non appliquée).
- Raccordement envisagé (décision à prendre) : une publication périodique, poussée par le Mac et en lecture seule, des seules vues `brief_v1`, `couverture_v1`, `incidents_v1`, `missions_v1` et `decisions_v1`, vers une table dédiée à créer par migration relue. Elle n'est **pas faite** cette nuit.

## Règles communes

- **Enveloppe.** Chaque vue : `{ vue, version: 1, etat, produiteLe, origine, donnees, motif }`.
- **`etat`**, à afficher tel quel : `connecte` · `deconnecte` (Mac injoignable : dernière copie avec son âge) · `ancien` (collecte plus vieille que 26 h) · `non_autorise` · `non_implemente` (avec `motif`).
- **Dates.** `produiteLe` est la date de la vue. La date de la donnée source (`dateDonnee`, `premiere`, `derniere`) n'est jamais remplacée par la date de collecte.
- **Clés.** Les identifiants sont des UUID ou des clés explicites (`mission:<uuid>`, `incident:<uuid>`, `roadmap:<ligne>`). Les libellés `D01`, `D02` sont un affichage, jamais une clé.
- **Distinguer** dans l'interface : fait observé, préférence de Mickaël, recommandation de Shyrka (`nature`).
- **Notifications écran verrouillé** : génériques, sans montant, secret ni contenu client.
- **Aucune action d'écriture** n'est offerte en v1 depuis le cockpit. Les décisions se prennent sur le Mac (`action` donne la commande exacte).

## Vues

| Vue | Contenu | Champs principaux |
| --- | --- | --- |
| `brief_v1` | briefing du jour | `changements[]`, `sujets[]` (≤ 3 : `titre`, `nature`, `impact`, `preuve`, `recommandation`, `action`, `cible`), `opportunites` (`total`, `verifiees`, `aRevoir`, `pistes[]`, `regles[]`), `decisionsOuvertes`, `budget[]`, `dependances[]` |
| `couverture_v1` | dernier état de chaque contrôle | `produit`, `controle`, `cible`, `etat` (`actif`, `non_configure`, `acces_manquant`, `erreur`), `resultat` (`ok`, `anomalie`, `inconnu`), `detail`, `preuve`, `dateDonnee`, `collecteLe` |
| `incidents_v1` | incidents dédupliqués | `id`, `produit`, `source`, `observation`, `gravite`, `statut` (`nouveau`, `confirme`, `en_traitement`, `resolu`, `ignore_avec_motif`), `premiere`, `derniere`, `occurrences`, `reapparitions`, `preuve`, `prochaineAction`, `motif` |
| `missions_v1` | missions d'agents | `id`, `objectif`, `statut` (dix états), `automatisation` (`automatique`, `assiste`, `simule`), `tentatives`/`tentativesMax`, `empreinteDiff`, `pr`, `causeBlocage`, `coutUsd`, `majLe` |
| `decisions_v1` | boîte de réception des décisions | `cle`, `intitule`, `source`, `action` |
| `memoire_autorisee_v1` | mémoire de portée `cockpit` | `non_implemente` en v1 |

Un `etat` « actif » avec `resultat` « inconnu » n'est **pas** un succès. Un `acces_manquant` (401/403) n'est **pas** une panne du produit.

## Versions

Un champ ajouté garde `_v1`. Un champ retiré, renommé ou dont le sens change crée `_v2`, et `_v1` reste servie au moins 30 jours. Chaque changement est consigné ici.

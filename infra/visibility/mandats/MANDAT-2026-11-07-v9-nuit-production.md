# Mandat de nuit v9 · OIA · cockpit en production : Money Lookup et Visibility

7 novembre 2026 · Mickaël Thomas

> Emplacement de référence : `infra/visibility/mandats/MANDAT-2026-11-07-v9-nuit-production.md`. À exécuter par la session Claude Code du Mac, de nuit. L'amendement du 7 novembre s'applique, sauf là où ce mandat l'autorise expressément.

## 0. Objectif

Demain matin, le cockpit OIA conçu dans Lovable peut passer en production avec deux modules sur données réelles : **Money Lookup** et **Visibility**. Cette nuit, Claude Code prépare et met en service tout ce qui est derrière l'interface : la base de production, les données, les règles d'accès, les mises à jour quotidiennes, le contrat de données figé et le brief qui permettra à Lovable de brancher ses écrans. Demain matin, Mickaël transmet ce brief à Lovable, vérifie, puis publie.

| Ordre | Bloc | Résultat au matin |
| --- | --- | --- |
| 0 | Préalables | Sauvegarde faite, état vérifié, J0 intact |
| A | Base de production | Migrations appliquées sur la base OIA, accès réservés aux comptes de Mickaël, tests adverses passés en production |
| B | Money Lookup réel | Opportunités, projets, montants typés et travail de tri en base, rafraîchis chaque jour |
| C | Visibility réel | J0 de Coach Gari en base, en cours, mis à jour chaque jour depuis Elmo |
| D | Recherche assistée | La recherche en texte libre de Money Lookup servie par OIA, plafonnée |
| G | Shyrka opérationnelle | Conversation réelle en texte, lecture des données d'OIA avec la session de Mickaël, brouillons, mémoire privée |
| E | Branchement Lovable | Contrat de données v1 figé et brief prêt à coller dans Lovable |
| F | Mise en production | Liste de contrôle de la publication, à cocher par Mickaël |
| Z | Clôture | Rapport et feu vert ou non |

Ordre d'exécution : 0, A, B, C, G, D, E, F, Z. Le bloc G crée la première fonction Mistral ; le bloc D la réutilise. Si le temps manque, un bloc entier terminé vaut mieux que plusieurs commencés : A, B et C passent avant tout le reste.

## 1. Ce que Mickaël a fait avant de dormir

Le mandat suppose ces cinq points faits. S'il en manque un, consigne-le et continue avec ce qui reste possible.

1. L'inscription publique est désactivée dans le projet Supabase OIA.
2. Le mot de passe de la base OIA est posé dans `~/.oia/supabase.env` (variable `OIA_DB_PASSWORD`, fichier en `chmod 600`, hors du dépôt).
3. L'export « sauvegarder » de la console actuelle est dans `~/oia-sauvegardes/`.
4. Le nettoyage des fonctions et secrets de BEAU est terminé, avec `MISTRAL_API_KEY` conservée.
5. Ce mandat vaut **autorisation d'appliquer les migrations listées au bloc A sur la base OIA de production** (`iywmvyebuikxyvnrcnoy`), aux conditions du bloc A.

## 2. Règles

1. Commits directs sur `main`, push autorisé, après `git pull --rebase origin main`.
2. **J0 continue.** Ne touche pas à Elmo : ni configuration, ni redémarrage, ni question chargée. Lecture seule de sa base pour la synchronisation (bloc C). Le gel du site de Coach Gari reste en vigueur.
3. **Production** : seules les migrations listées au bloc A sont appliquées, dans l'ordre, chacune après ses tests sur Postgres jetable, et après la sauvegarde du bloc 0. Aucune autre écriture de structure en production.
4. **Secrets** : jamais affichés, copiés dans un message, commités ni journalisés. Une clé nécessaire est lue directement par la commande qui l'utilise, ou écrite dans un fichier local en `chmod 600` hors du dépôt, sans passer par l'écran.
5. **Aucune donnée réelle dans un fichier public**, un test ou un exemple. Les données réelles ne vivent que dans la base, derrière les règles d'accès, et dans les dossiers locaux de Mickaël.
6. **Le design appartient à Lovable** : ne modifie, ne copie et n'exporte aucun fichier du projet Lovable.
7. **Dépense** : aucune nouvelle dépense, sauf les appels Mistral des blocs D et G, sous le plafond commun du bloc G6.
8. Ne t'arrête jamais pour poser une question : consigne-la dans le rapport et continue avec l'hypothèse la plus prudente.

## Bloc 0 · Préalables

- Vérifie l'état du dépôt, la CI, et que J0 tourne (lecture seule : `pnpm vis:j0-status`).
- Vérifie les cinq points du § 1, sans afficher aucune valeur.
- **Sauvegarde de la base OIA avant toute migration** : schéma et données, avec `supabase db dump` (ou `pg_dump`), dans `~/oia-sauvegardes/avant-v9/`, hors du dépôt, avec empreinte SHA-256. Vérifie qu'elle se relit.

## Bloc A · Base de production

### A1 · Correctifs préalables

- Corrige `infra/visibility/migrations/0004` pour Supabase : `auth.uid()` y renvoie un uuid. Tests sur Postgres jetable imitant Supabase.
- Vérifie la propriété des tables par `vis_admin` et la cohérence avec le modèle des membres de Money Lookup : **un seul modèle d'appartenance** pour toute la base (table des membres, `auth.uid()`), documenté dans `packages/database/supabase/migrations/README.md`.

### A2 · Ordre d'application

Dans l'emplacement canonique, sans second historique :
1. `0002` marquée comme déjà déployée (point de départ réel) ; `0001` archivée ;
2. la migration réservant les tables d'OIA aux comptes de Mickaël, puis `0003` (appartenance), `0004` et `0005` (vues et fonctions de Money Lookup) ;
3. les migrations Visibility `vis` 0001 à 0004 corrigées, puis `0006` (vues de Visibility) ;
4. les migrations de Shyrka (bloc G) : conversations, éléments de contexte, oublis, brouillons, journal des actions et compteur de dépense, avec leurs règles d'accès par compte.

**Compatibilité de la console actuelle** : la console en ligne doit continuer à fonctionner exactement comme aujourd'hui jusqu'à la validation du cockpit Lovable par Mickaël. Si `0003` retire des droits d'écriture qu'elle utilise, ajoute une politique transitoire, réservée aux comptes de Mickaël, qui les maintient, nommée et documentée comme telle, à retirer après validation du cockpit. Vérifie la console avant et après (lecture, écriture d'une note de test, puis suppression de cette note).

Pour chacune : tests verts sur Postgres jetable, application avec `supabase db push` (projet lié, mot de passe lu dans `~/.oia/supabase.env`), puis vérification en production.

### A3 · Membres

Les deux comptes de Mickaël deviennent membres, rôle propriétaire, du client interne d'OIA et du client Coach Gari. Identifiants lus en base par leur e-mail, sans être affichés.

### A4 · Tests adverses en production

Avec un compte temporaire créé par l'administration (l'inscription restant fermée), puis supprimé à la fin :
- le compte temporaire ne lit rien, n'écrit rien, n'appelle aucune fonction protégée ;
- un appel sans connexion ne lit rien ;
- un compte de Mickaël lit les vues de Money Lookup et de Visibility ;
- toute écriture directe dans une table est refusée ; seules les fonctions prévues écrivent.

Si un test échoue : retour arrière de la migration concernée, consigné, et le bloc s'arrête.

## Bloc B · Money Lookup réel

- **Chargement** : le chargeur alimente la base depuis les sorties existantes (`outputs/`, `registry/`, le dernier instantané de la console), avec la typologie financière (subvention, chiffre d'affaires contractuel potentiel, investissement en capital, prêt, aide fiscale, montant inconnu). Idempotent, identifiants stables.
- **Reprise du travail de tri** : import de l'export de `~/oia-sauvegardes/` (décisions, étiquettes, notes, tâches, contacts), sans perte ni doublon, avec retour arrière documenté. Si l'export est absent, consigne-le.
- **Rafraîchissement quotidien** : une tâche planifiée sur le Mac (launchd) relance le chargeur après le pipeline de découverte, et notifie Mickaël seulement en cas d'échec.
- Vérification : les vues de Money Lookup renvoient les mêmes nombres que la console actuelle (par type, par projet, par état de vérification), à l'unité près, avec le tableau de comparaison dans le rapport.

## Bloc C · Visibility réel

- **Synchronisation quotidienne** depuis Elmo, en lecture seule, vers les tables de preuves en base : réponses, mentions, citations (liens de Gemini résolus), versions servies, jours manquants. Chaque preuve garde son empreinte ; aucune n'est réécrite.
- Branchée sur la tâche quotidienne de J0, après le run du jour, sans jamais arrêter Elmo.
- La fenêtre J0 apparaît « en cours, jour N sur 5 » ; les indicateurs se calculent selon le contrat (formules, intervalles, « non mesurable »).
- Les correctifs préparés de P2 (`subjects/coach-gari/p2/decisions.md`) entrent dans le journal de décision, en attente de validation.
- Vérification : les chiffres en base pour le jour 1 et le jour 2 sont ceux de la réanalyse locale.

## Bloc D · Recherche assistée de Money Lookup

La version de démonstration de Lovable utilise l'IA de Lovable. La version réelle passe par OIA :
- une fonction serveur `money-match` dans le projet OIA, connexion obligatoire, réservée aux membres ;
- elle reçoit un texte libre, sélectionne d'abord les opportunités candidates par les règles existantes (score, projets, typologie), puis demande à Mistral (`MISTRAL_API_KEY` du projet) de classer, d'expliquer chaque correspondance et de signaler les informations manquantes ;
- **plafonds** : 2 000 mots-jetons en entrée par appel au plus, 30 appels par jour, et un total mensuel compté dans le budget d'OIA ; au-delà, refus clair ;
- chaque appel est journalisé (date, coût estimé, nombre de candidats), sans le texte de la demande ;
- tests avec un modèle simulé ; un seul appel réel de contrôle, documenté.

## Bloc G · Shyrka opérationnelle, en texte

Demain matin, Mickaël doit pouvoir écrire à Shyrka dans le cockpit et recevoir de vraies réponses sur ses données. Ce bloc passe juste après A, B et C, avant D et E. **Il est obligatoire pour la réception du cockpit.**

### G0 · Ce qui n'est pas encore réel

`@oia/shyrka-noyau` (`packages/shyrka`) fonctionne aujourd'hui en mémoire, avec des adaptateurs simulés. Le brancher dans une fonction serveur ne suffit pas : ce bloc n'est réussi que si la conversation, les permissions, la persistance et les appels Mistral sont testés **de bout en bout, en réel**. Vérifie aussi que les raccourcis racine `shyrka:parler` et `shyrka:resume` pointent vers le bon paquet (`@oia/shyrka`, dans `infra/shyrka`) ; corrige-les sinon.

### G1 · Conversation réelle

- Une fonction serveur `shyrka-chat` dans le projet OIA, connexion obligatoire, réservée aux comptes de Mickaël. Elle s'appuie sur le noyau `packages/shyrka` et ses contrats, sans second système d'identité ni de permissions.
- Modèle : Mistral en direct (`MISTRAL_API_KEY` du projet, jamais dans le navigateur). Conversation à plusieurs tours, réponses générées, aucun texte prédéfini.
- Personnalité et règles tirées de `docs/shyrka/CADRE.md` : Shyrka tutoie Mickaël, parle français, répond court, distingue les faits récupérés de ses interprétations.

### G2 · Lecture des données d'OIA

- Des outils de lecture que Shyrka appelle pendant la conversation : état et indicateurs de Visibility, rapports et recommandations, opportunités de Money Lookup, projets, tâches et décisions en attente.
- **Ces outils interrogent les vues du contrat avec la session de Mickaël** : les règles d'accès de la base décident de ce que Shyrka voit. Aucune clé de service, aucun contournement.
- Chaque fait cité porte sa source (vue, identifiant) et sa date.
- L'espace personnel (Agenda, Santé, Famille) n'est pas connecté.

### G3 · Actions

- Shyrka peut préparer des brouillons, résumés, plans d'action et messages, enregistrés comme brouillons visibles dans le cockpit.
- Aucun envoi d'e-mail ou de WhatsApp, aucune publication, suppression ou modification de données : les paliers de `CADRE.md` restent fermés. Le contrôle est fait côté serveur et chaque action est journalisée.

### G4 · Mémoire

- Conversations et éléments de contexte enregistrés dans des tables privées (règles d'accès par compte), avec mode privé (rien n'est conservé) et fonction d'oubli, conformément à l'ADR 0003.
- Aucune donnée de l'espace personnel envoyée à Mistral.
- **Flux de données documentés** dans l'ADR `docs/shyrka/adr/0003-shyrka-autonome.md`, mis à jour : ce qui reste sur le Mac (voix, entretiens, corpus), ce qui est conservé dans Supabase (conversations, contexte, brouillons, journal), ce qui est envoyé à Mistral (le message et les extraits de données nécessaires à la réponse, rien d'autre). C'est une évolution du principe « local par défaut » de l'ADR : la note le dit clairement.
- Avant tout appel au modèle, les contenus liés à Swift et toute donnée personnelle sensible non autorisée sont exclus, avec des tests adverses.

### G5 · Voix

- Dans le cockpit : texte seulement cette nuit. Aucune commande vocale factice affichée.
- Sur le Mac : vérifier que `pnpm shyrka:parler` fonctionne en mode texte (`-- --texte`) avec Mistral à la place d'Ollama si Ollama est absent, et documenter le premier essai vocal que Mickaël fera lui-même.

### G6 · Budget commun des blocs D et G

- Plafond **5 $ par mois** pour la recherche assistée et Shyrka réunies, validé par Mickaël le 7 novembre 2026. **Appliqué côté serveur, de façon atomique** : chaque appel réserve son coût maximal dans un compteur en base avant de partir, le corrige après la réponse, et tout appel qui dépasserait le plafond est refusé avant d'atteindre Mistral. Alerte à 4 $. Test adverse : deux appels simultanés à la limite du plafond n'en laissent passer qu'un.
- Plafonds techniques : 4 000 mots-jetons en entrée par message de Shyrka, 100 messages par jour.
- Journal des appels : date, coût estimé, outils appelés, sans le texte de la conversation.

## Réception fonctionnelle

Avant le feu vert, un test réel avec un compte de Mickaël (session de test, puis déconnexion), consigné dans le rapport :
1. lire les données réelles de Money Lookup et de Visibility par les vues ;
2. enregistrer une note sur une opportunité, puis la relire ;
3. retrouver une réponse réelle de J0 avec sa preuve ;
4. demander à Shyrka « Où en est Coach Gari dans Visibility ? » et vérifier que sa réponse cite des chiffres réels avec leur source ;
5. lui demander « Quelles opportunités correspondent à SILLON ? » ;
6. lui demander de préparer un message, et vérifier qu'il reste un brouillon ;
7. vérifier qu'un compte non autorisé n'accède à rien, ni aux vues, ni à `shyrka-chat`, ni à `money-match`.

**Une fonction simulée, non branchée ou non testée n'est pas déclarée opérationnelle.** Si un prérequis de production échoue, ne contourne pas la sécurité : livre ce qui fonctionne, nomme le blocage, et déclare NO-GO pour la publication.

## Bloc E · Branchement Lovable

- **Contrat de données v1 figé** : `docs/interface/contrat-donnees-v1.md`, pour Money Lookup, Visibility et la recherche assistée : vues, colonnes, types, droits, états vide, chargement et erreur, exemples fictifs, et règle pour toute évolution future (version 2, jamais de changement silencieux).
- **Brief Lovable prêt à coller** : `docs/interface/brief-lovable-branchement-v1.md`. Il demande à Lovable :
  - de lire les vues du contrat avec la session de l'utilisateur connecté (client Supabase du projet OIA, clé publique uniquement) ;
  - de remplacer les données de démonstration de Money Lookup et de Visibility, en gardant la démonstration pour les autres modules ;
  - de passer toutes les écritures par les fonctions prévues ;
  - de remplacer la recherche assistée de démonstration par l'appel à `money-match` ;
  - de brancher la conversation de Shyrka sur `shyrka-chat`, et la zone Contexte sur ses tables (mémoire, journal, brouillons), en texte seulement ;
  - d'alimenter l'accueil avec les données réelles des deux modules ;
  - de garder le suivi d'usage dans le navigateur, sans service tiers ;
  - de ne jamais créer ni modifier de table, migration, politique ou fonction dans Supabase.

## Bloc F · Mise en production

Écris `docs/interface/mise-en-production-v1.md`, la liste que Mickaël cochera demain :
- l'hébergement de l'application Lovable (publication Lovable ou Vercel depuis son dépôt), avec ses variables, sans aucune clé de service côté navigateur ;
- l'adresse de production, à choisir par Mickaël ;
- l'URL de redirection de connexion de Supabase à mettre à jour ;
- les contrôles avant publication : connexion avec ses deux comptes, refus pour tout autre, aucune donnée lisible sans connexion, Money Lookup et Visibility sur données réelles, recherche assistée plafonnée ;
- le retour arrière : republier la version précédente, l'ancienne console restant en ligne tant que le nouveau cockpit n'est pas validé ;
- les points de coût à valider par Mickaël, dont l'offre Supabase : un projet gratuit est mis en pause après une période d'inactivité, ce qu'un cockpit de production ne peut pas se permettre.

## Bloc Z · Clôture

1. Roadmap : P1 « J0 en cours, cockpit OIA prêt à publier », module Money Lookup en production.
2. Tests : monorepo au vert, tests adverses de production consignés.
3. Rapport `infra/visibility/reports/2026-11-08-mandat-v9.md`, qui commence par :
   - **feu vert ou non** pour la publication, et pourquoi, avec le résultat de la réception fonctionnelle ;
  - pour chaque fonction : **testée en production**, **testée en recette seulement**, ou **à brancher dans Lovable** ;
   - ce que Mickaël fait au réveil, dans l'ordre (brief Lovable, vérifications, publication) ;
   - les migrations appliquées, avec la sauvegarde de référence ;
   - les dépenses de la nuit.

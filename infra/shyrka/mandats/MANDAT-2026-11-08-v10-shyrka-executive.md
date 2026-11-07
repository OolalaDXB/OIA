# Mandat de nuit v10 - Shyrka exécutive : mémoire, veille et missions

**Nuit du 8 au 9 novembre 2026 | Mickaël Thomas | Version 10.1**

> Référence à conserver : `infra/shyrka/mandats/MANDAT-2026-11-08-v10-shyrka-executive.md`.
> Exécuteur : Claude Code sur le Mac Studio. Ce mandat prolonge v9 ; il ne remplace ni sa recette de production ni son autorisation limitée de migrations.
> Finalité : livrer du code utilisable et une première boucle de travail vérifiée, pas une nouvelle collection de maquettes, de consignes ou de documents d'architecture.

## 0. Résultat attendu

Mickaël veut que **Shyrka devienne son « super Moi » et son assistante exécutive** : elle connaît ses priorités, conserve le fil de ses décisions, relie ses produits, détecte les opportunités et les incidents, recommande des solutions et fait avancer des missions avec des agents.

Cette nuit, rendre opérationnel un premier parcours :

**Information retenue -> redémarrage -> rappel sourcé -> observation des produits -> mission bornée -> correctif en branche -> vérification -> briefing et décision.**

La conversation locale et le cockpit doivent s'appuyer sur des contrats de mémoire compatibles. Les contenus personnels locaux ne quittent pas le Mac par défaut. Les données métier restent sous l'autorité de leurs applications.

### Périmètre de la nuit

| Ordre | Bloc | Livraison concrète |
| --- | --- | --- |
| 0 | Reprise et isolement | État réel de v9, branche de travail distincte, aucun chantier concurrent écrasé |
| A | Mémoire commune, persistance locale | Retenir, retrouver, corriger, oublier après redémarrage, avec sources et périmètres |
| B | Corpus initial et connaissances des produits | Recherche effective dans une sélection autorisée, provenance et statut visibles |
| C | Surveillance et opportunités | Collecte réelle en lecture seule, incidents dédupliqués, fraîcheur des sources |
| D | Première mission d'agent | Un problème OIA reproduit, un correctif isolé, des tests et une revue distincte |
| E | Briefing, notifications et suivi | Brief utile, liste des décisions, état des missions et commandes de contrôle |
| F | Installation locale et contrat Lovable | Service/CLI utilisable sur le Mac ; intégration documentée sans toucher au design |
| Z | Recette et passation | Preuves des tests réels, limites, coûts et actions précises pour Mickaël |

L'ordre est celui du tableau. Construire d'abord une tranche verticale minimale de chaque bloc, puis l'approfondir. Si un prérequis manque, poursuivre les blocs indépendants. Ne pas masquer un bloc incomplet derrière le nombre de fichiers ou de tests produits.

**Trois niveaux de livraison distincts :** `LOCAL_UTILISABLE`, `BACKEND_COMPATIBLE`, `COCKPIT_RECETTE`. Ne jamais annoncer le troisième sur la seule base des deux premiers.

## 1. Base de travail et faits à revérifier

Ce mandat a été préparé après lecture du dépôt `OolalaDXB/OIA` au commit `ad24486d86e5c7ac8a7a65534d865335f75ddc19`. Ce SHA est un point de provenance, pas une instruction de revenir en arrière. Démarrer depuis le dernier état cohérent et consigner le SHA de départ.

### 1.1 Ce qui est rapporté, pas revérifié ici en production

Le rapport v9 indique :

- le backend Money Lookup, Visibility, `shyrka-chat` et `money-match` est déployé et a fait l'objet d'essais ;
- le branchement Lovable et la réception avec le compte de Mickaël restent à faire ;
- le chargeur contient 271 opportunités de l'instantané, plus une notice historique, soit 272 dans la vue globale ;
- le jour 1 de J0 présente 50 runs, mais 47 preuves avec texte ; trois sorties Mistral sans texte extrait expliquent un écart de dénominateur ;
- l'export des décisions du navigateur était absent et le rafraîchissement Money Lookup par launchd n'était pas installé ;
- des correctifs d'interruption de la voix ont rejoint la CLI depuis les premiers essais.

Ces chiffres servent à cibler les vérifications. **Ne jamais les coder en dur, les considérer encore actuels sans lecture, ni annoncer un nouvel incident uniquement parce qu'un rapport ancien les mentionne.**

La PR #5 `feature/shyrka-memoire-locale-v1` est un prototype en brouillon, non fusionné lors de la préparation. Elle apporte une piste SQLite, pas un moteur de mémoire de référence. Ses affirmations de tests ne remplacent pas des journaux reproductibles. Ne pas la fusionner telle quelle.

### 1.1 bis Prérequis préparés par Mickaël

- Volume chiffré `Shyrka-corpus` créé (image disque APFS chiffrée AES 256 bits) et monté sous `/Volumes/Shyrka-corpus`, mot de passe hors du dépôt. S'il n'est pas monté au démarrage, appliquer A2 (données fictives isolées, mémoire personnelle déclarée non activée) sans jamais créer de dossier ordinaire au même emplacement.

### 1.2 Lectures initiales obligatoires

Lire les fichiers effectivement présents, puis citer leurs versions dans le rapport de reprise :

- `CLAUDE.md`, les consignes applicables et les fichiers de passation existants ;
- le mandat v9 final, son rapport `infra/visibility/reports/2026-11-08-mandat-v9.md` et l'amendement v6/v7 ;
- `docs/roadmap-oia-shyrka-souffleur.md`, sans modifier `docs/roadmap.md` qui concerne Funding ;
- `docs/shyrka/CADRE.md`, l'ADR 0003, `corpus-inventaire.md`, `entretiens.md` ;
- `infra/shyrka` et `packages/shyrka`, y compris les adaptateurs serveur créés par v9 ;
- les contrats `docs/interface/contrat-donnees-*.md` et les mécanismes d'accès existants ;
- la PR #5 et les changements récents de dialogue, d'interruption et de sécurité.

Vérifier les commandes disponibles via les manifestes et `--help`. Ne pas inventer des flags Claude, Supabase, Docker ou pnpm. Ne pas mettre à niveau ces outils globalement pendant cette nuit.

## 2. Pouvoirs accordés et limites de ce mandat

### 2.1 Autorisé

- Lire les sources et états autorisés des produits nommés plus bas, avec les connecteurs existants.
- Développer, tester et exécuter les composants locaux v10 dans le dépôt OIA, directement sur `main` (§ 2.4).
- Écrire les souvenirs explicitement demandés et les données de fonctionnement dans les emplacements protégés prévus.
- Préparer un correctif à faible impact sur OIA uniquement, dans une branche de mission distincte.
- Créer une PR en brouillon OIA après contrôle des secrets, des fichiers et des effets de CI/Preview. Aucun contenu personnel ou extrait client dans une PR.
- Préparer une tâche locale, puis l'installer seulement si les permissions de l'environnement l'autorisent ; toujours fournir `status`, `pause`, `stop` et `uninstall`.

### 2.2 Non autorisé

- Aucun nouveau schéma, migration, changement RLS, fonction déployée, secret modifié ou mise à jour de production Supabase au titre de v10. Les fonctions v9 déjà autorisées peuvent être utilisées dans leur périmètre ; aucun accès administrateur pour contourner leurs droits.
- Aucun fichier Lovable modifié, copié ou exporté ; aucun second cockpit dans `apps/web`.
- Aucune fusion automatique, aucun déploiement automatique, aucun changement des règles de branche/CI. Les délégations futures d'exécution en production ne sont pas activées cette nuit.
- Aucune écriture dans les autres dépôts ou applications ; ils sont observés seulement.
- Aucun changement d'Elmo, de ses conteneurs, de son ordonnanceur, du panel, des modèles ou du site gelé de Coach Gari. Aucun `docker compose down`, redémarrage Docker ni nettoyage global.
- Aucun envoi d'e-mail/WhatsApp, aucune prise de rendez-vous, aucun paiement, aucun nouvel abonnement.
- Aucun accès aux sources Swift, ni aux comptes liés à Swift. Aucun import de secrets ou de données personnelles sensibles non autorisées.
- Ne pas toucher à `knowledge/generated/solution-2026-08-14.md`, y compris pour le « remettre propre ».
- Ne pas lever un refus de l'environnement en utilisant un autre outil, un shell alternatif ou une autre session.

Une lecture autorisée pour Mickaël n'est pas une permission de copie vers le cloud, de diffusion à un agent, ou de publication dans un rapport Git.

### 2.3 Budget

Le plafond **5 USD par mois, alerte à 4 USD**, reste celui des appels Mistral de conversation/recherche v9. Il doit conserver sa réservation atomique et sa comptabilité existante. Ne pas créer un second compteur permettant de dépenser deux fois cette enveloppe.

- Les collectes de santé et le classement initial sont déterministes, sans appel LLM à chaque passage.
- Le traitement du corpus personnel et sa recherche utilisent le Mac et Ollama, sans sortie cloud implicite.
- Les agents de code n'ont **aucune nouvelle enveloppe API autonome**. Le travail demandé à la session Claude Code actuelle reste le travail de cette session ; il ne vaut pas autorisation de lancer des workers API payants en boucle.
- Une intégration Claude/Gemini/Grok/Perplexity n'est activée que si le mandat et le compteur applicables sont explicites. Posséder les clés n'autorise pas leur utilisation illimitée.
- Les plafonds portent sur entrée, sortie, outils, retries et total d'une mission. Dépense inconnue : signaler, jamais compter zéro par commodité.

### 2.4 Branches et concurrence

**Décision de Mickaël (8 novembre 2026) : v9 étant clos, le développement du v10 se fait directement sur `main`, dans `~/OIA`, comme d'habitude**, avec `git pull --rebase origin main` avant chaque push et des commits par bloc. **Seule la mission d'agent du bloc D** travaille dans un worktree dédié (par exemple `~/OIA-mission-01`) sur une branche de mission dédiée (par exemple `mission/shyrka-01-<sujet>`), et se termine par une demande de fusion en brouillon, jamais fusionnée automatiquement : c'est le comportement attendu de Shyrka (elle prépare, Mickaël valide).

**Un seul auteur pour Shyrka cette nuit** : la session Claude Code du Mac. La session web ne modifie ni `infra/shyrka` ni `packages/shyrka` pendant l'exécution de ce mandat. Si des commits d'une autre session arrivent malgré tout sur ces chemins, les intégrer par rebase sans les écraser, et le consigner.

Examiner l'état du dépôt sans afficher de diff contenant des secrets. Aucun `reset --hard`, `clean`, `stash`/autostash automatique, `git add .`, push forcé ou abandon de changements d'une autre session. Ne pas changer de branche dans `~/OIA` : il reste sur `main`.

Documenter les chemins dont chaque session est responsable. Les correctifs d'une mission d'agent utilisent leur propre worktree et leur propre branche, jamais `~/OIA`. Chaque push sur `main` redéploie la console en production sur Vercel, et un push de branche peut créer une Preview : vérifier la configuration avant le premier push, et ne pousser sur `main` que du code testé qui ne change pas le comportement de la console.

## 3. Bloc 0 - Reprise, disponibilité et baseline

Produire un état court, puis coder. Ne pas passer la nuit à rechercher un document manquant.

1. Relever les SHA, les modifications locales existantes, les tests et versions Node/pnpm. Les tests sautés sont distingués des tests réussis.
2. Vérifier macOS, Docker actif, Ollama et son modèle installé, Whisper et Aurélie. Réutiliser les installations ; ne pas retélécharger les modèles.
3. Vérifier la disponibilité du volume `Shyrka-corpus`, son chiffrement effectif et sa capacité d'écriture. Un chemin sous `/Volumes` ou un numéro de device différent ne prouve pas le chiffrement.
4. Établir l'état v9 depuis ses preuves : données, fonctions, import navigateur, planification, branchement Lovable, recette de compte. Lire sans relancer ni réappliquer la production.
5. Distinguer les 271 données importées de la notice historique, et les 50 runs des 47 preuves mesurables. Afficher couverture et exclusions. Ne pas modifier J0 pour forcer l'égalité ; expliquer les dénominateurs disponibles et préparer la réconciliation post-fenêtre.
6. S'il manque un accès : `ACCES_MANQUANT`, avec l'action précise requise. Ne pas convertir une erreur de lecture en « aucune donnée ».

**Réception 0 :** baseline datée, chantier v9 préservé, possibilité de revenir à son lancement local antérieur sans perdre de données.

## 4. Bloc A - Une mémoire commune, persistante et gouvernée

### A1. Contrat commun, pas deux Shyrka

Réutiliser le noyau `@oia/shyrka-noyau` et ses interfaces. Définir un contrat de stockage partagé entre l'adaptateur local et l'adaptateur serveur v9 ; ne pas maintenir un système autonome de permissions dans la PR #5.

Distinguer :

- **personnel local** : souvenirs explicites, entretiens autorisés, règles personnelles ; Mac uniquement ;
- **projet/client** : connaissances autorisées des modules et produits, avec leur source de référence ;
- **conversation** : historique de session, différent d'un souvenir durable ;
- **expérience** : méthode ou enseignement issu d'un résultat vérifié, encore candidat tant qu'il n'est pas validé pour réutilisation.

Chaque élément a un identifiant stable, sa source et sa version, sa date d'observation, son statut, sa portée, son propriétaire, un projet/client explicite si nécessaire, ses restrictions de diffusion, son emplacement de référence et ses dépendances. Les D01/D02 calculés depuis l'ordre d'une liste restent des libellés d'affichage, pas des clés persistantes.

Les ajouts au contrat doivent rester compatibles avec les consommateurs v9. Si le serveur ne sait pas conserver un nouveau champ, ne pas le perdre silencieusement ni l'écrire par un accès admin : garder l'élément local et déclarer cette limite.

### A2. Stockage décidé pour cette tranche

Utiliser **SQLite local comme adaptateur minimal**, dans le volume chiffré, derrière le contrat commun. Conserver les tables Supabase v9 comme stockage des éléments métier/cloud qu'elles gèrent déjà. Aucune synchronisation personnelle automatique, aucun double maître.

La PR #5 sert de matériau à relire : reprendre sélectivement ce qui est utile, corriger les limites, ne pas fusionner aveuglément. Ne pas installer un deuxième PostgreSQL/pgvector pour cette première persistance. Docker est utilisable pour les bancs de test et les exécuteurs isolés.

Vérifier le stockage chiffré, les liens symboliques, les droits, le démontage, les erreurs d'accès et la concurrence. Écriture atomique ; pas de confirmation « retenu » avant commit effectif. Base illisible ou corrompue : erreur explicite, jamais recréation vide silencieuse. Ne pas exposer un mode de contournement `pourTests` à l'application de production.

Si le volume n'est pas disponible, tester avec des données fictives isolées et déclarer la mémoire personnelle non activée. Ne pas créer un dossier ordinaire au même emplacement ni inventer un mot de passe pour masquer l'absence du volume.

### A3. Comportements à livrer dans la conversation

- « Retiens que... » : enregistrement explicite ; relire la formulation si la transcription est ambiguë. L'ordre explicite vaut accord pour cet élément, pas pour enregistrer toute la conversation.
- « De quoi te souviens-tu ? » : liste paginée avec source, date, portée et statut.
- « Qu'avais-je décidé pour ce projet ? » : recherche bornée aux sources autorisées ; réponse sourcée, ou absence explicitée.
- « Corrige ce souvenir... » : ancienne version remplacée, lien entre versions, conflit signalé si le souvenir visé n'est pas unique.
- « Oublie... » : cible précise ou désambiguïsation ; suppression de l'actif, des index, résumés et caches applicables. Un oubli doit aussi retirer le souvenir de l'historique de contexte qui pourrait le réinjecter.
- « Mode privé » : pas de persistance du contenu, d'extraction ni d'apprentissage ; contexte temporaire en RAM seulement, borné et purgé à la sortie. Journal technique minimal sans contenu si nécessaire, clairement annoncé.

Les souvenirs extraits automatiquement restent `a_valider`. Une proposition d'IA n'est jamais promue au rang de fait parce qu'elle a été répétée. Une contradiction récente n'efface pas automatiquement une décision validée.

### A4. Confidentialité et oubli

Le noyau, et non le modèle, applique les droits avant la recherche et avant l'assemblage du prompt. Une réponse dérivée conserve les restrictions de toutes ses sources. Une application ne lit pas une source retirée ou non autorisée à travers un résumé.

**Aucun basculement cloud implicite pour une session contenant de la mémoire personnelle.** Si Ollama devient indisponible, signaler l'indisponibilité. Une autre session cloud autorisée repart avec un contexte filtré, sans réutiliser l'historique local. Tester les sorties réseau effectives, pas seulement le nom de l'adaptateur.

Les filtres de mots-clés sont des garde-fous complémentaires, pas une preuve d'absence de secret. Refuser les sources interdites avant ingestion. Ne pas afficher de contenu sensible dans les journaux ou exceptions.

Persister un registre d'oublis adapté et protégé. Une restauration d'ancienne sauvegarde ne doit pas réactiver un souvenir oublié. Les copies externes et snapshots doivent avoir une politique de conservation et de purge explicitée ; ne pas promettre un effacement physique absolu non vérifié. Une nouvelle instruction explicite de Mickaël peut autoriser à réapprendre un fait, jamais un simple import automatique.

**Réception A :** apprentissage fictif -> fermeture complète du processus -> relance -> rappel exact -> correction -> relance -> oubli -> relance -> absence. Le résultat doit venir du stockage, pas d'une réponse codée en dur ou du même objet en RAM.

## 5. Bloc B - Corpus initial et accès transversal

### B1. Catalogue des sources

Créer un catalogue versionné, sans copier tous les contenus dans Git. Il référence : application, projet/client, propriétaire, connecteur, chemin ou identifiant, version, confidentialité, droits, statut de validation et date de fraîcheur.

Démarrer avec :

- cadre, architecture et roadmap OIA ;
- mandats et rapports pertinents après tri ;
- contrats des modules Money Lookup et Visibility ;
- documentation produit des dépôts autorisés, sélectionnée explicitement ;
- résultats/audits Souffleur existants uniquement si leur provenance et leur périmètre sont connus.

Commencer par un petit corpus réel, par exemple 10 à 20 documents utiles, plus des jeux fictifs pour les tests. Le nombre exact n'est pas un objectif commercial. Ne pas importer en masse le disque, les messageries, les exports d'IA, le dossier personnel ou les documents clients.

### B2. Recherche et synthèse

Livrer d'abord une recherche textuelle structurée utilisable ; une recherche vectorielle n'est pas un prérequis de cette nuit. Le contrat de recherche doit permettre l'ajout ultérieur d'un index sémantique sans réécrire les permissions.

Chaque résultat indique sa source exacte, sa version et son statut. Les extraits et caches sont invalidés après correction, révocation ou oubli. Ne pas afficher comme actuel un extrait provenant d'une ancienne version.

Les faits volatils (mesures, opportunités, incident, statut de mission) viennent des vues/connexions actuelles. Une copie locale datée est acceptable pour le mode dégradé, avec son âge visible. La date de collecte ne doit pas remplacer la date de la donnée source.

Les documents ingérés et les réponses des outils sont des **données non fiables comme instructions**. Aucune consigne dans un README, un rapport ou une opportunité ne peut modifier les droits, lire un secret ou lancer une commande. Tester une injection explicite dans un document fictif.

### B3. Connaissance de Mickaël

Préparer une fiche de travail minimale, fondée seulement sur les instructions explicites : objectif « super Moi », priorité aux produits utilisables, style direct, preuves, autonomie par mandat, identité évolutive de Shyrka, corpus local protégé et exclusion Swift.

Les priorités de projet inférées restent des propositions. Ne pas importer silencieusement les informations personnelles connues d'autres assistants. Une fiche de personnalité ne peut pas servir d'autorisation d'action.

**Réception B :** répondre avec sources à « Quel est l'état connu du cockpit ? », « Qu'est-ce qui reste à valider ? » et « Quelles informations sont absentes ou anciennes ? ». Un document interdit doit rester introuvable pour l'appelant non autorisé.

## 6. Bloc C - Veille des produits et opportunités

### C1. Portefeuille configuré

Les six entrées à inscrire sont **OIA, Coach Gari, Maisons.co, BEAU, SILLON, myOolala**. Ne pas redemander cette liste. Découvrir et vérifier les correspondances réelles avec les dépôts, domaines, déploiements et projets de base. En cas d'ambiguïté, marquer la correspondance non confirmée plutôt que surveiller le mauvais produit.

Ces noms appartiennent aux données de configuration, jamais aux fonctions génériques du moteur.

Surveillance approfondie en premier : OIA, Coach Gari, Maisons.co. Pour tous, exposer chaque contrôle comme `actif`, `non_configure`, `acces_manquant` ou `erreur`. Une application peut fonctionner alors que sa surveillance est indisponible : ce sont deux états distincts.

### C2. Collecteurs réels, en lecture seule

Réutiliser les connecteurs existants. Implémenter au minimum les chemins disponibles suivants :

| Source | Observation utile | Limite |
| --- | --- | --- |
| GitHub | Dernier commit, checks, CI échouée, PR en attente, liens vers preuves | Aucun rerun ou changement de workflow automatique |
| HTTP des domaines vérifiés | Disponibilité, certificat/erreur réseau observable, réponse anormale | Pas de scan intrusif ni formulaire envoyé |
| Vercel, si l'accès existe | Dernier déploiement et erreur signalée | Aucun déploiement ou changement de configuration |
| Supabase, si lecture autorisée | Santé, erreurs/advisors utiles et fraîcheur des données | Ni dump client, ni correction RLS automatique |
| Visibility | État J0, couverture, données manquantes, dernière synchronisation | Aucune altération du protocole de mesure |
| Money Lookup | Opportunités, dates connues, vérification, projet associé, fraîcheur | Aucun montant/échéance inventés |

Les URL viennent d'une liste autorisée. Réutiliser la protection réseau existante, avec redirections et DNS contrôlés. Ne pas transférer les identifiants d'un hôte à un autre. Les sorties sont bornées en taille et durée.

Valeurs de fonctionnement proposées pour cette v1, configurables : contrôles HTTP toutes les 15 minutes, métadonnées GitHub/déploiements toutes les 30 minutes, deux observations successives avant une alerte de disponibilité ordinaire. Un signal de sécurité important est signalé immédiatement comme constat ou suspicion, selon la preuve. Respecter les quotas et appliquer un backoff.

### C3. Opportunités pertinentes, pas flux de bruit

Classer les opportunités par lien explicite avec un projet, critères d'éligibilité documentés, échéance connue, fraîcheur et niveau de vérification. Expliquer le classement en règles lisibles, sans note chiffrée arbitraire. Une information non vérifiée peut être une piste, pas une opportunité certaine.

Pour l'actualité produit/marché, réutiliser les flux déjà autorisés : changelogs, releases, pages officielles ou RSS. Fournir date de publication, date de collecte, source et raison de pertinence. Aucune nouvelle API de recherche payante et aucun scraping massif cette nuit.

### C4. Événements et incidents

Persister un identifiant, application/environnement, source, observation, gravité, impact, première/dernière occurrence, empreinte de déduplication, preuve et prochaine action. Un incident a les états `nouveau`, `confirme`, `en_traitement`, `resolu` ou `ignore_avec_motif`.

Un 401/403 de connecteur signifie accès indisponible, pas logiciel en panne. Les doublons n'engendrent ni plusieurs alertes ni plusieurs missions. Résolution et réapparition restent traçables. Un contrôle non exécuté ne compte pas comme réussi.

**Réception C :** au moins une collecte réelle sur une source OIA et un contrôle réel sur un autre produit accessible ; inventaire complet des six produits avec couverture honnête. Injecter un incident fictif sur un banc local, pas sur un produit, pour prouver l'alerte, la déduplication et la résolution. Si tous les accès réels sont absents, le bloc est partiel.

## 7. Bloc D - Shyrka confie une mission et vérifie le travail

### D1. Un registre durable de missions

Réutiliser une file existante si elle couvre le besoin ; sinon construire un petit registre local transactionnel derrière une interface, pas un nouveau framework multi-agents.

Champs minimaux : objectif, demandeur, périmètre, contexte autorisé, repo/SHA, preuves d'entrée, agent, outils, budget, limite de tentatives, durée maximale, statut, résultats, validation et cause de blocage.

États : `proposee`, `autorisee`, `en_file`, `en_cours`, `en_verification`, `attente_validation`, `terminee`, `bloquee`, `echouee`, `annulee`.

Les transitions sont contrôlées côté code. Prévoir verrou/lease, reprise après crash, heartbeat, idempotence et limite de retries. Ne jamais garantir « exactement une exécution » sans mécanisme correspondant : la livraison v1 doit surtout empêcher les effets dupliqués.

### D2. Trois rôles, trois responsabilités

- **Diagnostic** : reproduit, identifie la cause et propose le plus petit changement utile.
- **Développement** : prépare le correctif dans le worktree de mission, sous liste de fichiers autorisés.
- **Vérification** : relit le diff et réexécute les contrôles ; n'accepte pas le seul rapport de l'auteur.

Ces rôles peuvent employer un même moteur ou un contrôle déterministe ; ils ne nécessitent pas trois appels payants. Les contextes, permissions et preuves restent distincts. L'agent auteur ne s'accorde pas une permission de fusion et ne valide pas sa propre publication.

### D3. Exécuteur utilisable, pas seulement un fichier d'agent

Raccorder un exécuteur réel : boucle d'outils locale avec Ollama si suffisante, ou mode programmable officiellement documenté de Claude Code/Agent SDK avec les permissions et l'authentification effectivement disponibles. Vérifier version, conditions d'usage, facturation et `--help` ; ne pas supposer que les quotas interactifs financent un nouveau service.

Les sous-agents de la session en cours peuvent contribuer au mandat, mais **une mission exécutée manuellement par cette session n'est pas une preuve d'orchestration autonome par Shyrka**. Si l'exécuteur automatique n'est pas disponible dans le budget autorisé, livrer et tester la file, réaliser une exécution assistée identifiable, et marquer le dispatch autonome comme incomplet.

Ne pas ouvrir une session avec `--dangerously-skip-permissions`, ne pas prêter les secrets de production aux agents, ne pas automatiser une interface de connexion pour contourner un accès absent.

### D4. Première mission autorisée

Choisir dans **OIA seulement** un défaut actuel à faible impact, reproductible : par exemple une anomalie résiduelle de routage du dialogue, de pagination vocale, de référence conversationnelle ou un test local mal construit. D'abord vérifier qu'il n'a pas déjà été corrigé.

Exclus de cette mission : auth, droits, secrets, migrations, facturation, déploiements, modification de `CADRE.md`, identité de Shyrka et données J0. Ne pas dégrader un contrôle de sécurité pour faire passer un test.

Parcours obligatoire :

1. Shyrka/OIA enregistre le signal et la mission avec son périmètre.
2. Le diagnostic conserve la reproduction au SHA initial.
3. L'exécuteur propose un patch borné dans le worktree de mission.
4. Les tests avant/après et les contrôles de non-régression sont exécutés avec les sorties réelles.
5. La vérification relit les fichiers, les changements de tests et les effets secondaires.
6. Une PR brouillon est préparée/créée si le push est permis, sinon un patch local avec empreinte est livré.
7. La mission finit `attente_validation`, pas « déployée ».
8. Un enseignement candidat est extrait avec cause, correction, preuves et limites. Il reste confiné au projet, sans promotion globale automatique.

Si aucun défaut réel approprié n'existe, utiliser un scénario de test explicitement fictif dans le banc. Ne pas provoquer un incident de production ni prétendre avoir réparé un bug réel.

### D5. Isolement des agents

Un worktree isole les fichiers de travail, pas les droits du processus. Pour exécuter des commandes d'agent ou du code récupéré, appliquer une vraie restriction d'outils, de fichiers et de réseau.

Docker peut servir de sandbox avec image épinglée, utilisateur non privilégié, limites de ressources, montages réduits et réseau minimal. Aucun socket Docker, dossier `~/.oia`, Trousseau, répertoire personnel ou volume de corpus monté dans un agent de code. Aucun conteneur privilégié. Ne pas exécuter automatiquement les scripts d'installation d'un dépôt inconnu.

Limiter cette v1 à une mission d'écriture en cours, deux tentatives de correction au maximum, liste de commandes et chemins autorisés. Une limite ou un accès manquant bloque la mission, pas une escalade de pouvoirs.

**Réception D :** mission durable, reproduction, patch réel, tests, revue, attente de décision et absence d'écriture hors périmètre. Le niveau d'automatisation est explicitement `automatique`, `assiste` ou `simule`.

## 8. Bloc E - Briefing exécutif et notifications

### E1. Brief exploitable

Produire un briefing en français, disponible en texte et en lecture vocale courte, avec :

1. ce qui a changé depuis le dernier briefing ;
2. jusqu'à trois sujets prioritaires, chacun avec impact, preuve, recommandation et action attendue ;
3. les opportunités pertinentes et leur incertitude ;
4. le travail préparé/terminé par les agents et ce qui attend une décision ;
5. les sources absentes ou périmées, la couverture de surveillance et les budgets consommés connus.

Distinguer fait observé, préférence de Mickaël et recommandation de Shyrka. Ne pas fabriquer de priorité pour remplir trois cartes. Le briefing doit rester utile sans LLM ; une reformulation autorisée ne remplace pas les calculs ni les sources.

### E2. Notifications

Trois niveaux : `urgent`, `a_decider`, `a_connaitre`. Une notification porte un identifiant d'incident/mission et conduit à son détail. Pas d'alerte répétée tant que le constat n'a pas changé. Notifications locales génériques sur l'écran verrouillé : aucun montant, secret ou contenu client.

Pour cette v1 : terminal, rapport local et notification macOS si permission accordée. Pas de nouveau bot WhatsApp/Telegram/e-mail. Le contrat Lovable décrit la future boîte de réception, sans en créer une copie dans OIA.

### E3. Contrôle par Mickaël

Livrer au minimum : voir les missions, inspecter les preuves et le diff, refuser, demander une correction, suspendre les départs et arrêter le service. Une validation est liée à l'identifiant de mission, à l'action et au SHA/empreinte présentés. Une approbation ancienne ne vaut pas pour un nouveau diff.

La pause empêche les nouveaux départs et respecte un point d'arrêt propre pour le travail en cours. Un arrêt immédiat annule uniquement les enfants de ce service. Ne pas tuer toutes les sessions Node, Claude, Whisper ou Docker du Mac.

### E4. Qualité de la conversation et de la voix

Préserver les correctifs récents ; ne pas les réimplémenter. Vérifier : demande d'explication distincte d'une liste, « cette décision » référencée correctement, confirmations de lecture sans boucle, liste limitée quand le nombre est demandé.

Réponse détaillée à l'écran, synthèse courte à la voix. Ne pas lire 21 chemins et numéros de ligne par défaut. Entrée/Espace interrompt la parole ; Ctrl+C et l'arrêt vocal ferment la session selon les fonctions réelles disponibles. Pas d'écoute permanente ni d'activation du barge-in sans accord.

Mesurer séparément transcription, génération, délai avant le premier son et durée de lecture. La durée d'une phrase prononcée n'est pas, à elle seule, une latence de synthèse. Les essais micro nécessitant Mickaël sont marqués à faire ; ne pas les simuler comme réussis.

## 9. Bloc F - Installation Mac et raccordement du cockpit

### F1. Organisation simple

Réutiliser les paquets actuels et les services déjà présents. Aucun nouveau dépôt. Un petit paquet d'orchestration interne n'est créé que si le code existant ne fournit pas l'emplacement adapté ; consigner le choix en quelques lignes.

Conserver Whisper, Ollama et Aurélie natifs macOS. Laisser Docker/Elmo inchangés. Fixer un budget de ressources local prudent après observation de la charge ; ne pas exécuter de banc lourd pendant un run J0. Un worker suspendu faute de ressources reste visible comme suspendu.

Installer depuis une révision identifiée de `main` (SHA affiché par `doctor` et `service status`). Ne pas avoir un service de fond qui exécute des fichiers en cours de modification sans savoir quelle version tourne.

### F2. Contrat de commandes à implémenter

Les commandes suivantes sont **des livrables demandés**, pas des commandes affirmées existantes. Réutiliser les équivalents actuels plutôt que multiplier les alias ; documenter la correspondance exacte.

| Commande cible | Résultat |
| --- | --- |
| `pnpm shyrka:executive doctor` | Versions, chiffrement, mémoire, connecteurs, ordonnanceur, droits manquants |
| `pnpm shyrka:executive run-once` | Une collecte bornée, événements, déduplication, propositions de missions |
| `pnpm shyrka:executive brief` | Brief actuel, sourcé, avec fraîcheur |
| `pnpm shyrka:executive missions list` | Statut des missions, pas une simple liste de fichiers |
| `pnpm shyrka:executive missions show <id>` | Preuves, périmètre, patch, tests, autorisation et coût |
| `pnpm shyrka:executive pause` / `resume` / `stop` | Contrôle effectif, sans toucher aux autres services |
| `pnpm shyrka:executive service install` / `status` / `uninstall` | Installation utilisateur idempotente, état et retrait propre |
| `pnpm shyrka:executive acceptance` | Recette automatisée, sans appel payant ou mutation de production implicites |

### F3. Planification et disponibilité

Après un `run-once` réussi, préparer un LaunchAgent utilisateur dédié. Exécution persistante seulement si l'environnement permet expressément l'installation. En cas de refus, fournir une seule commande d'activation manuelle et marquer `PRET_NON_INSTALLE`. Ne pas contourner le refus, ne pas annoncer la surveillance active.

Paramètre initial proposé : briefing à 08:00, fuseau `Asia/Dubai`, modifiable sans recoder. Aucun audio automatique la nuit. Définir le comportement sommeil/réveil : reprise et rattrapage idempotent, absence de rafale de notifications.

Le service v1 dépend du Mac allumé, du réseau et, pour les données privées, du volume déverrouillé. Afficher ces dépendances. Sans observateur externe, il ne peut pas notifier sa propre extinction : aucune promesse de couverture 24/7. Ne pas acheter ni déployer un hébergement supplémentaire cette nuit.

### F4. Lovable

Produire `docs/interface/brief-lovable-shyrka-executive-v1.md` et le contrat correspondant : brief, couverture, incidents, missions, décisions et mémoire autorisée. Les contrats v9 restent stables ; aucun champ existant changé silencieusement.

Les interfaces doivent distinguer connecté, déconnecté, donnée ancienne, non autorisé et non implémenté. Aucune adresse locale présentée comme accessible depuis le cloud. Aucune exposition publique de SQLite, PostgreSQL, Ollama ou Whisper pour « faciliter » le branchement.

Réutiliser un transport authentifié existant si réellement adapté. Sinon livrer le contrat et la CLI locale, et marquer le raccordement distant à réaliser. Ne pas copier de mémoire personnelle dans Supabase pour contourner ce manque.

## 10. Recette obligatoire et preuves

Les tests simulés vérifient la logique. Ils ne remplacent ni les tests de persistance avec un vrai stockage, ni une connexion réelle, ni un essai matériel. Exécuter les tests/typecheck concernés puis les contrôles monorepo compatibles avec le gel J0. Isoler les échecs préexistants sans les masquer.

| ID | Scénario | Preuve minimale |
| --- | --- | --- |
| M1 | Retenir puis arrêter et relancer le processus | Souvenir fictif retrouvé depuis le stockage |
| M2 | Corriger un souvenir | Version actuelle unique, ancienne version non utilisée comme actuelle |
| M3 | Oublier puis restaurer un ancien jeu de sauvegarde | Souvenir et dérivés non resservis ; limites de purge physique documentées |
| M4 | Mode privé | Aucun contenu persistant après la session, pas de transmission non autorisée |
| M5 | Local avec fournisseur cloud indisponible/alternatif | Aucun souvenir local dans les appels sortants, historiques compris |
| M6 | Volume absent, non chiffré ou lien symbolique | Refus explicite ; aucune écriture de repli en clair |
| M7 | Deux clients et une source révoquée | Pas de fuite dans recherche, résumé ou cache |
| K1 | Recherche dans le corpus réel autorisé | Extraits, versions et sources exacts |
| K2 | Instruction malveillante dans une source fictive | Aucun outil ni permission supplémentaire exécuté |
| C1 | Collecte réelle OIA et un autre produit | Horodatage, source et couverture, sans mutation |
| C2 | Source inaccessible ou ancienne | État indisponible/périmé, jamais sain par défaut |
| C3 | Incident rejoué plusieurs fois | Une alerte et une mission, pas plusieurs |
| C4 | Runs J0 différents des preuves mesurables | Dénominateurs et raisons visibles, aucune preuve réécrite |
| A1 | Mission de correctif OIA | Reproduction, patch, tests et revue distincte |
| A2 | Tentative d'écriture hors scope ou d'accès secret | Refus technique, pas seulement consigne au modèle |
| A3 | Crash/reprise et double soumission | Reprise traçable, pas d'effet dupliqué |
| A4 | Approbation d'un ancien diff | Refus pour le nouveau SHA ; aucun merge automatique |
| E1 | Brief matinal | Données actuelles, sources, incertitudes et action attendue |
| E2 | Pause/stop | Plus de nouveaux départs, enfants propres, Elmo intact |
| E3 | Dialogue et voix | Pas de boucle ; explication distincte de liste ; interruption réelle ou explicitement non testée |
| P1 | Budget nul/limite/échec fournisseur | Pas d'appel hors mandat ; réservation/règlement existants préservés |
| R1 | Retour au lancement local antérieur | Code précédent utilisable, souvenirs non détruits |

Réaliser un petit jeu d'évaluation conversationnelle à réponses attendues depuis les sources : rappel, correction, inconnue, conflit, permission refusée, question de suivi. Toute réponse factuelle inventée est relevée ; ne pas la faire disparaître du rapport par une simple relance chanceuse.

La garantie « super Moi » n'est pas un test. Les mesures utiles sont : connaissances correctement retrouvées, alertes pertinentes, missions terminées et vérifiées, sollicitations humaines nécessaires, coût et taux d'échec. Ne pas inventer du temps économisé sans mesure de référence.

## 11. Bloc Z - Clôture, revue et remise en main

Rapport : `infra/shyrka/reports/2026-11-08-mandat-v10.md`.

Il commence par un tableau par fonction : `TESTE_REEL`, `TESTE_SIMULE`, `PRET_NON_INSTALLE`, `ACCES_MANQUANT`, `PARTIEL`, `NON_FAIT`, avec preuve et raison. Distinguer local, backend et cockpit ; ne pas transformer un NO-GO Lovable en NO-GO de toute la mémoire locale.

Inclure ensuite :

- SHA initial/final, branches, fichiers modifiés et projets laissés intacts ;
- tests réellement exécutés, ignorés ou échoués, avec liens/journaux expurgés ;
- localisation des données et flux réseau autorisés, aucune valeur de secret ;
- couverture des six produits, première mission et niveau d'automatisation réel ;
- coûts constatés, budgets restants connus, postes non mesurables ;
- statut de la PR #5 : composants repris, limites corrigées, migration éventuelle, sans fusion automatique ;
- statut des tâches persistantes et commande unique d'activation si l'environnement les a refusées ;
- commandes exactes pour ouvrir Shyrka, consulter le briefing, retrouver un souvenir, inspecter une mission, arrêter et revenir en arrière ;
- uniquement les décisions humaines encore nécessaires, avec une recommandation et sa raison.

Mettre à jour la roadmap par états réels, sans renumérotation des phases. Maintenir la répartition : Shyrka comprend et dialogue ; OIA orchestre et contrôle ; Souffleur route, capitalise l'expérience et audite. Ne pas transformer ces frontières en nouveaux services obligatoires.

**Fin de mandat :** le travail v10 est commité sur `main`, bloc par bloc, avec le rapport ; seule la demande de fusion de la mission du bloc D reste ouverte, en brouillon, sans fusion. Le lancement local testé s'utilise depuis `~/OIA` sans modifier la production. Le produit final n'est déclaré reçu qu'après les parcours correspondants, pas simplement après un commit.

## 12. Instructions de conduite de la session

- Priorité au code utile, aux tests et à la vérification ; documenter les décisions en quelques lignes.
- Ne pas réouvrir une étude comparative de dix bases, frameworks ou passerelles. SQLite protégé pour la persistance locale initiale ; services v9 conservés ; interfaces communes.
- Aucun nouveau SDK ou agent n'est considéré sûr sur la seule base de sa popularité. Vérifier version, licence, provenance, permissions et lockfile avant ajout.
- Ne pas t'arrêter pour une question non critique : adopter une valeur conservatrice, la consigner et poursuivre. En cas de risque de données, secret, facturation, gel J0 ou production : arrêter uniquement l'opération concernée.
- Ne pas attribuer à Shyrka un pouvoir qu'elle n'a pas. « Je peux proposer une correction », « une correction est prête » et « elle est déployée » sont trois états différents.
- Ne pas ajouter de nouvelles restrictions permanentes à l'identité de Shyrka. Son identité reste évolutive ; Mickaël accorde ses pouvoirs. Ce mandat définit seulement la délégation de cette nuit.

## Annexe - Sources et statut de ce document

Ce document est un **nouveau mandat proposé pour exécution**, fondé sur les décisions de la conversation et le v9 final. Les choix de branches, priorités, cadences et critères v10 sont des prescriptions de ce mandat, pas des fonctions déjà installées.

### Références de travail

- V9 final fourni par Mickaël : `MANDAT-v9-FINAL(1).md`, référence dans `infra/visibility/mandats/MANDAT-2026-11-07-v9-nuit-production.md`.
- Rapport v9, lu au SHA de référence : https://github.com/OolalaDXB/OIA/blob/ad24486d86e5c7ac8a7a65534d865335f75ddc19/infra/visibility/reports/2026-11-08-mandat-v9.md
- CLI locale, même SHA : https://github.com/OolalaDXB/OIA/blob/ad24486d86e5c7ac8a7a65534d865335f75ddc19/infra/shyrka/src/cli.ts
- Noyau, même SHA : https://github.com/OolalaDXB/OIA/blob/ad24486d86e5c7ac8a7a65534d865335f75ddc19/packages/shyrka/src/noyau.ts
- PR #5 : https://github.com/OolalaDXB/OIA/pull/5

### Documentation primaire à revérifier avant implémentation

- Claude Agent SDK, outils, permissions et sessions : https://code.claude.com/docs/en/agent-sdk/overview
- Claude Code, utilisation non interactive et limites d'authentification : https://support.claude.com/en/articles/14554922-claude-code-user-faq
- Supabase, RLS et privilèges : https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, recherche documentaire respectant les droits : https://supabase.com/docs/guides/ai/rag-with-permissions
- Docker, surface d'attaque du daemon et isolation : https://docs.docker.com/engine/security/
- Supabase, changements de version : https://supabase.com/changelog?types=breaking-change

Ces références documentent des mécanismes ; elles ne prouvent ni leur installation sur le Mac, ni la sécurité de l'intégration OIA. Les versions installées et les essais de ce mandat font foi.

# MANDAT DE NUIT · OIA Visibility · version 5.2 finale · préparation maximale

Tu travailles seul cette nuit, en local sur le Mac Studio de Mickaël (macOS arm64), dans `~/OIA`, avec Claude Opus 5.5. Mickaël dort : **aucune réponse avant le matin.**

**Objectif de la nuit :** préparer le maximum d'OIA Visibility pour qu'il fonctionne sur **plusieurs sites et plusieurs clients**, qu'il puisse **se connecter au dépôt du site d'un client pour proposer des correctifs**, et que **les modèles d'IA se branchent ensuite par simple configuration**. Tout est construit et testé sur des données fictives ou locales. **Rien n'est activé, aucun modèle d'IA n'est appelé.**

Trois identités à respecter dans le code, les documents et l'interface :
- **OIA Visibility** : le produit, qui mesure, analyse et améliore la visibilité des marques dans Google et dans les réponses des IA ;
- **OIA SEO Command** : son centre opérationnel, qui pilote une équipe permanente de six agents (orchestrateur, technique, SEO, contenu, AEO, conversion), ses missions planifiées, ses recommandations et ses validations ;
- **Shyrka** : l'interface générale, qui pourra plus tard demander des missions à SEO Command et en présenter les conclusions (hors de ce mandat).

Cette version 5.2 est **la version finale et figée** : elle remplace les versions 1 à 5.1 et tous leurs compléments. Par rapport à la 5.1, seuls changent l'ordre des blocs, la règle d'intégration des moteurs (règle 17) et la tâche E6. Elle intègre la revue GPT du mandat V3 et rétablit **OIA SEO Command** comme centre opérationnel de Visibility. Si tu as déjà commencé : conserve ce qui est fait et commité, vérifie-le, puis reprends à la première tâche non terminée de cette version.

Références : `docs/roadmap-oia-shyrka-souffleur.md` (roadmap 3.2, référence unique) et `infra/visibility/reports/HANDOFF.md`.

---

## 1. Règles de la nuit

### 1.1 Avancer sans jamais attendre

- Une tâche exige une décision de Mickaël, une dépense, un compte, une connexion interactive ou une clé : tu ne la fais pas, tu notes précisément ce qui manque (section « Questions pour Mickaël » du rapport) et tu passes à la suite.
- Une tâche échoue : annule tes modifications non commitées de cette tâche, consigne la commande, l'erreur et ton diagnostic, passe à la suite. Deux tentatives au maximum.
- **Ordre de priorité** si le temps ou ton quota d'usage manque : blocs **A, B, D, E, F, C, G, H, I**, dans cet ordre : d'abord ce qui mène au premier résultat réel sur les deux pilotes, l'isolation multi-clients complète ensuite (le contrat d'A0b suffit d'ici là). Les contrats communs d'A0b sont toujours réalisés en premier, car plusieurs blocs en dépendent. Dans le bloc E, l'orchestrateur SEO Command (E5) est prioritaire sur tout le bloc F. Chaque tâche doit être livrée testée et commitée avant la suivante, plutôt que dix tâches à moitié faites.

### 1.2 Commits et traçabilité

- Commits directs sur `main` du dépôt OIA, préfixés `oia-visibility:` ou `docs:`. **Aucune branche dans le dépôt OIA.**
- Avant chaque commit : `git diff --check`, `git status`, relecture du diff complet ; ne commite que les fichiers de la tâche.
- `git push origin main` après chaque tâche, **uniquement si A0c a établi qu'un push sur `main` ne déclenche rien d'autre que des tests**. Sinon : commits locaux seulement, aucun push de la nuit, et le rapport l'indique en tête ; Mickaël poussera au réveil.
- **Ne touche jamais** à `knowledge/generated/solution-2026-08-14.md`.
- Le rapport de nuit est mis à jour et commité après chaque tâche.

### 1.3 Interdits absolus

1. **Aucun appel à un fournisseur de modèles d'IA** (OpenAI, Anthropic, Mistral, Google, OpenRouter, TypeSafe, Perplexity), aucune clé, aucun compte, aucun service payant.
2. **Ne démarre jamais le worker d'Elmo** (`sendImmediate` lance un run dès qu'une question est créée).
3. **Aucune écriture dans un vrai dépôt de site** (CoachGari, Maisons.co ou tout autre), aucun push, aucune demande de fusion réelle, aucune action sur un site en ligne, sur Vercel, IndexNow ou Search Console. Le connecteur de dépôt se teste **uniquement** sur des dépôts fictifs créés localement pour les tests.
4. Aucune migration appliquée à un projet Supabase distant (`supabase link`, `supabase db push` interdits). Les migrations restent des fichiers, testées sur un Postgres local jetable.
5. Docker : aucun conteneur, volume ou réseau existant hors préfixe `oia-` n'est modifié. Interdits : `docker system prune`, `docker volume prune`, suppression d'objets non `oia-*`. BAWABA (ports 3000 et 5433) et `studiomt-db` restent intacts.
6. Git : pas de `push --force`, pas de `rebase` de `main`, pas de réécriture d'historique, pas de branche dans le dépôt OIA.
7. Secrets : aucune valeur affichée, journalisée ou commitée ; seuls des `.env.example` vides sont commités ; `ANTHROPIC_API_KEY` jamais exportée dans le shell.
8. Aucun réglage système modifié, aucune installation globale via Homebrew (préfère `npx`).
9. Le code des dépôts audités (`souffleur.py`, `mcp-studio-mt`) n'est jamais exécuté.
10. Aucune publication externe (message, e-mail, issue, commentaire GitHub).
11. **OIA Funding et `apps/web` restent intacts** : aucune page ni code de Funding modifié. Toute interface Visibility se construit dans un paquet séparé, non déployé (voir H1). La refonte de l'accueil OIA est un chantier distinct, hors de ce mandat.
12. **Aucune donnée commerciale inventée dans un correctif destiné à un vrai site** : prix, avis, caractéristiques et coordonnées viennent uniquement des faits validés du sujet. Faute de fait validé, le correctif laisse un emplacement à remplir, jamais une valeur plausible.
13. **Toute donnée fictive est identifiée comme telle**, visiblement, dans les fichiers, les rapports, les exemples et la console.
14. **Le code d'un dépôt de site n'est jamais exécuté hors d'un bac à sable.** Pas de `npm install`, `npm run build` ni script d'un dépôt client ou pilote (dont `~/CoachGari`) sur la machine. Analyse statique par défaut. Toute compilation ou tout test d'un dépôt de site se fait dans un conteneur `oia-sandbox-*` jetable, sans aucun secret monté, avec un accès réseau limité au strict nécessaire, puis supprimé. Seuls les dépôts fictifs créés par toi pour les tests peuvent être construits hors bac à sable.
15. **Aucune requête vers une adresse interne.** Les crawls, `site init` et toute récupération d'URL refusent les adresses privées, locales et de liaison (`localhost`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`), y compris après une redirection. Tests à l'appui. Seule exception : les sites fictifs servis localement pour les tests, déclarés explicitement comme tels.
16. **La validation humaine est garantie techniquement, pas seulement par consigne.** La validation d'un panel ou d'une recommandation, l'approbation d'un correctif et l'activation du planificateur exigent une identité humaine vérifiable, contrôlée côté base et côté CLI (rôle distinct, inaccessible aux exécuteurs d'agents). Des tests prouvent qu'un agent ne peut ni valider ses propres recommandations, ni approuver un correctif, ni activer une mission récurrente.
17. **Intégration des moteurs open source** : Elmo, CrawlSEO et Crawlie sont utilisés via Docker, API, SDK, sortie JSON de la ligne de commande et MCP, derrière des adaptateurs OIA. Leur code n'est pas copié dans OIA, aucune chaîne de compilation Rust n'est ajoutée au dépôt. Les agents n'ont accès qu'aux outils de lecture : les outils qui déclenchent une action (par exemple le lancement d'un crawl CrawlSEO) ne leur sont pas exposés et passent par une mission validée ; un test le vérifie.

### 1.4 Principes de construction

- **Générique :** aucun client, site ou sujet codé en dur ; le test de généricité existant doit rester vert et couvrir tout nouveau code.
- **Isolation :** toute donnée est rattachée à un client ; aucune lecture croisée entre clients, prouvée par des tests.
- **LLM branchable :** toute fonction qui aura besoin d'un modèle passe par une interface unique, avec une implémentation fictive déterministe pour les tests. Brancher un vrai modèle plus tard = configuration, sans réécriture.
- **Preuves :** fait, extrait, inférence et recommandation toujours distingués dans les données et les sorties.
- **Réutiliser l'existant** d'OIA (`packages/*`, schéma de sujet, scripts) avant de créer un équivalent, et **rester compatible** avec ses formats : aucune conversion automatique de données existantes.
- **Niveau de maturité explicite** pour chaque livrable : `code présent`, `testé sur données fictives`, `connecté` (branché à un vrai service), `validé en conditions réelles`. Cette nuit, rien ne peut dépasser `testé sur données fictives`, sauf les audits en lecture seule des sites. Aucune porte P1, P2 ou P3 n'est déclarée franchie.

---

## 2. Rapport de nuit

`infra/visibility/reports/2026-11-08-nuit.md`, créé en A0, complété après chaque tâche :

1. Résumé en 10 lignes maximum.
2. Tableau des tâches : statut (fait, partiel, bloqué, sauté, non commencé), **niveau de maturité**, commits, durée.
3. Détail par tâche avec preuves.
4. **Ce qui est prêt à brancher** : pour chaque fonction, ce qu'il faut configurer (clé, modèle, compte) pour l'activer.
5. Questions pour Mickaël, avec ta recommandation.
6. Ce qui reste à faire avec Mickaël présent.
7. Incidents.

Français, phrases courtes, sans tiret cadratin.

---

## Bloc A · Phase P1 et roadmap

### A0 · Préparation
`git pull --ff-only` (échec = seul arrêt complet), `git status`, `infra/visibility/scripts/preflight.sh`, `docker info` (Docker absent : les tâches Docker sont sautées), **liste des conteneurs qui tournent déjà** (`docker ps`), notée dans le rapport pour la clôture, création du rapport.

### A0b · Contrats communs, avant tout développement qui en dépend
1. Contrat minimal **client → site → sujet** en TypeScript (identifiants, rattachements, mode d'action sur les dépôts, statut interne ou externe), sans persistance ; C1 le complétera. A5 et toutes les tables l'utilisent pour leur RLS.
2. **Interface LLM unique** avec son implémentation fictive déterministe (voir G1 pour son périmètre complet) ; B2, D3, F3 et F4 l'utilisent. Aucun adaptateur réel activé.
3. Tests, commit.

### A0c · Effets d'un push sur `main`, avant le premier push
1. Lis tous les workflows de `.github/workflows/` (au minimum `ci.yml` et `discovery.yml`) et note leurs déclencheurs et leurs effets : tests, appels à des fournisseurs, publication, déploiement.
2. Cherche les intégrations de déploiement : configuration Vercel, `vercel.json`, dossiers racines déployés, autres intégrations GitHub visibles dans le dépôt.
3. Conclusion écrite dans le rapport : un push sur `main` déclenche-t-il autre chose que des tests ? Si la réponse est oui, ou incertaine : **aucun push cette nuit** (règle 1.2).
4. Ne désactive ni ne modifie aucun workflow.

### A1 · Roadmap de référence
Vérifie que `docs/roadmap-oia-shyrka-souffleur.md` est en version 3.3 (aucune modification de son contenu cette nuit), vérifie ses deux diagrammes Mermaid (`npx @mermaid-js/mermaid-cli` si possible) et ses liens, ajoute en tête de `docs/roadmap.md` une ligne de renvoi vers elle sans rien changer d'autre. Commit.

### A2 · Intégrité de J0 pour Coach Gari (lecture seule)
Dans `~/CoachGari` : commits `73e1967..8ef1fd7`, classement de chaque commit (effet ou non sur ce que voient Google et les IA), vérification publique de `robots.txt`, sitemap, `noindex` et `cg-draft` sur les 4 pages de service, une requête par URL. Conclusion dans un rapport distinct, `infra/visibility/subjects/coach-gari/audits/2026-11-08/integrite-j0.md`, et dans le rapport de nuit. **`REVIEW.md` est un fichier généré et vérifié par les tests : ne le modifie jamais à la main** ; s'il doit refléter l'audit, régénère-le uniquement avec la CLI officielle. Rien n'est modifié dans `~/CoachGari`.

### A3 · Configuration payante plafonnée (préparée, aucune dépense)
- Annulation ciblée de la bascule zéro coût (`16f8a4b` et partie zéro coût de `6cca747`), panel `coach-gari` en-01 à en-10 strictement intact (diff avant et après).
- `.env.example` d'Elmo : OpenAI, Anthropic et Mistral en direct, Gemini et Perplexity via OpenRouter, Jev via OpenRouter, valeurs vides.
- `cost-guard.sh` : plafond mensuel global `OIA_VIS_MONTHLY_CAP_USD=30` sur le coût réel du mois UTC, alerte à 24 $, arrêt à 30 $ ou si le coût est illisible ; tests à blanc.
- `SECRETS.md` : mise en garde sur `ANTHROPIC_API_KEY`.
- **Plafond logiciel et plafond réel** : documente que `cost-guard.sh` est un contrôle logiciel, qui arrête après lecture des dépenses et ne lit pas tous les fournisseurs ; il ne garantit pas l'absence de dépassement. Le plafond réellement opposable repose sur les crédits prépayés et la recharge automatique désactivée chez chaque fournisseur, plus une réserve de budget avant chaque lot de mesure. Écris-le dans `FOURNISSEURS.md` et ne présente jamais le contrôle simulé comme une garantie.

### A4 · ADR de la stratégie de collecte
Elmo collecteur de transition, collecteur maison en cible, remplacement moteur par moteur après la porte P2, critères de bascule (couverture, fidélité dans les intervalles, preuves, fiabilité, coût inférieur ou égal, maintenance acceptée), Canonry en plan B, déclencheurs de bascule anticipée, faits techniques de `HANDOFF.md`.

### A5 · Interface de collecteur et table des preuves (proposition)
Contrat de collecteur générique (plusieurs collecteurs en parallèle sur les mêmes questions, toutes les métadonnées), migration SQL en ajout seul (déclencheur anti `UPDATE`/`DELETE`, SHA-256 côté serveur, RLS par client et par sujet fondée sur le contrat d'A0b, fenêtres et jours manquants), tests sur `oia-vis-test-pg` jetable. Mention « proposition, schéma à valider » ; schéma présenté en clair dans le rapport.

### A6 · Proposition des modèles mesurés (documentation officielle uniquement)
Pour ChatGPT, Claude, Le Chat, Gemini et Perplexity : modèle le plus proche de l'application gratuite, identifiant vérifié (lien, date) ou « non vérifié », recherche web et chemin d'accès, coût estimé par fenêtre pour les deux pilotes, total mensuel face au plafond de 30 $. Dans `infra/visibility/FOURNISSEURS.md`.

### A7 · Installation locale sans clés
Si Docker tourne : secrets générés par `init-env.sh` (non affichés), Elmo (web et base, worker arrêté) et CrawlSEO sur `127.0.0.1`, contrôles de santé, test de sauvegarde et restauration d'Elmo dans une installation `oia-*` séparée puis supprimée. CrawlSEO avec jetons Google : à faire avec Mickaël. Services arrêtés en fin de tâche, volumes conservés.

### A8 · Audit Crawlie des deux pilotes
`npx crawlie` sur `coachgari28.com` et `maisons.co`, rythme modéré, rapports JSON dans `infra/visibility/subjects/<sujet>/audits/2026-11-08/`, synthèse par gravité selon `agents/checklist-site.md`.

### A9 · Doctrine de Shyrka, brouillon P0
`docs/shyrka/DOCTRINE.md`, « brouillon à valider », repris des sections de la roadmap 3.2 sans règle nouvelle ; règles de confidentialité de Mickaël mentionnées comme tenues à part, sans en citer aucune.

---

## Bloc B · Panels

### B1 · Modèle de panel
**Compatibilité d'abord.** Le code existant utilise déjà des statuts : `active`, `candidate`, `retired` pour les questions, `draft`, `validated` pour le panel. Garde-les tels quels. N'ajoute un statut que s'il manque vraiment (par exemple une proposition en attente de validation), par une extension compatible et testée. Les versions existantes sont conservées. **Aucune conversion automatique du panel validé de Coach Gari** : un test vérifie qu'il reste lisible et exploitable à l'identique.

Étends le schéma de sujet pour que chaque question porte : identifiant, version, texte, langue, marché, intention (`decouverte`, `prix_offre`, `comparaison`, `niche_local`, `marquee`), offre visée, marquée ou non, provenance (type de source et référence), statut (selon les statuts existants, étendus au besoin), date de validation et validateur. Règles codées et testées :
- une reformulation crée une nouvelle version, jamais une écrasure ;
- un panel est gelé pendant une fenêtre de mesure ;
- seules des fenêtres mesurées avec la même version de panel sont comparables ;
- aucune question non marquée ne contient la marque ni ses alias.

### B2 · Générateur de panels
Un générateur qui propose un panel à partir de la fiche du sujet (offres, marchés, langues), de ses documents sources, de ses concurrents et, quand elles existent, de requêtes Search Console importées depuis un fichier CSV.
- **Version déterministe cette nuit** : gabarits par intention, croisés avec les offres, les marchés et les langues ; répartition par défaut 3 découverte, 2 prix et offre, 1 comparaison, 2 niche ou local, 2 marquées pour 10 questions par langue ; paramétrable.
- **Point de branchement LLM** : une fonction de reformulation et de suggestion passant par l'interface LLM du bloc G, avec implémentation fictive.
- Contrôles automatiques : question unique par entrée, pas de marque dans les non marquées, pas de doublon, langue cohérente, provenance présente.
- Sortie au statut de proposition, jamais au statut validé.
- CLI : `visibility panel propose <sujet>`, `visibility panel diff <sujet>`, `visibility panel validate <sujet> <ids>` (cette dernière enregistre une validation humaine ; elle est protégée selon la règle 16, et un test prouve qu'un exécuteur d'agent ne peut pas l'utiliser).

### B3 · Panel de Maisons.co
Avec le générateur : 10 questions en français et 10 en anglais (loueur de maisons et conciergerie : Quistinic et Morbihan, Gudauri, conciergerie en Bretagne ; pas de panel logiciel), concurrents candidats avec leur raison. Statut de proposition. Le panel `coach-gari` validé n'est pas modifié ; le générateur le relit seulement pour vérifier qu'il respecte les contrôles B2, et signale tout écart.

### B4 · Guide
`docs/visibility/preparer-un-panel.md` : méthode (sources, intentions, rédaction, traçabilité, validation, gel, taille selon le budget), illustrée par les deux pilotes.

---

## Bloc D · Connexion au dépôt du site du client

### D1 · ADR du connecteur de dépôt
- Accès : GitHub App recommandée pour les clients (installation par dépôt, permissions minimales, révocable), jeton fin à portée limitée en alternative ; aucun jeton à droits larges.
- **Modes d'action, déclarés par client et par dépôt :**
  - `lecture` : audit du code source seulement ;
  - `proposition` : création d'une branche et d'une demande de fusion dans le dépôt du client, fusion par le client. **Mode par défaut et obligatoire pour tout client externe** ;
  - `direct` : commit sur la branche principale, réservé aux dépôts de Mickaël et à sa demande explicite.
- Toute action d'écriture exige une recommandation validée et un gel J0 levé.
- Le garde-fou SEO en intégration continue tourne sur chaque demande de fusion.

### D2 · Lecture de dépôt
Module qui, à partir d'un dépôt cloné en local : détecte le cadre (Next.js, Vite et React, HTML statique, autres), localise les surfaces SEO (balises de tête, `robots.txt`, sitemap, données structurées, contenus des pages, rendu côté serveur ou client des prix), et produit une carte des fichiers à modifier pour chaque type de correctif. **Analyse statique uniquement** : aucune installation de dépendances ni exécution de script du dépôt (règle 14). Tests sur **dépôts fictifs** créés dans `infra/visibility/test/fixtures/repos/` (au minimum un Next.js, un Vite et React, un HTML statique).

### D3 · Générateurs de correctifs
Pour les correctifs fréquents, générateurs déterministes produisant un diff : titre et description, `robots.txt`, sitemap, données structurées (Organization, LocalBusiness, Product avec prix), prix rendus côté serveur, retrait d'un `noindex` (classé à haut risque, jamais automatique). Point de branchement LLM pour les contenus rédigés (introductions, FAQ), via l'interface du bloc G, implémentation fictive. Tests sur les dépôts fictifs : le diff s'applique, le site fictif se construit, le garde-fou CI passe. Pour un futur dépôt client, la construction de vérification est prévue dans le bac à sable de la règle 14 ; écris et teste ce chemin avec un dépôt fictif.

### D4 · Préparation de demande de fusion
Module qui assemble, **en simulation**, une demande de fusion : branche locale dans le dépôt fictif (les branches sont autorisées dans les dépôts fictifs, jamais dans le dépôt OIA), commits, description reliant chaque modification à sa recommandation et à ses preuves, résultat du garde-fou CI. Aucun push vers un dépôt distant. L'appel réel à l'API GitHub est écrit derrière l'interface, désactivé, avec un test qui vérifie qu'il refuse de s'exécuter sans mode `proposition` ou `direct` déclaré.

### D5 · Garde-fou SEO en intégration continue
GitHub Action réutilisable et script dans `infra/visibility/ci/` : titre manquant, `noindex` oublié, prix invisibles sans JavaScript, données structurées invalides, `robots.txt` et sitemap. Tests sur les dépôts fictifs. Installé dans aucun vrai dépôt ; documenté.

### D6 · Guide
`docs/visibility/brancher-un-depot.md` : créer la GitHub App, choisir le mode, installer le garde-fou, cycle d'une demande de fusion.

---

## Bloc E · Agents et boucle de décision

### E1 · Les six agents
Dans `.claude/agents/`, l'équipe de **SEO Command** : orchestrateur (chef d'équipe), technique, SEO, contenu, AEO, conversion. Pour chacun : périmètre, outils autorisés (MCP en lecture seule, lecture de dépôt D2, générateurs D3 en simulation), règles de qualité (incertitude signalée, faits validés seulement, preuves citées, gels respectés), sortie conforme au schéma E2.

### E2 · Schéma des recommandations
`infra/visibility/schemas/recommendation.schema.json` : type (`FIX_FACT`, `CONTENT_GAP`, `ENTITY_INCONSISTENCY`, `SOURCE_TARGET`, `TECH_FIX`, `WATCH`), client, site, sujet, preuves, impact, effort, risque, confiance, correctif proposé (référence D3), statut de décision.

### E3 · Journal de décision
Migration proposée et module : recommandation, décision (acceptée ou rejetée, motif, auteur, date, jamais modifiée), tâche, exécution (demande de fusion ou commit lié, date de mise en ligne), rattachement à la fenêtre de remesure. Tests.

### E4 · Premier audit réel sans dépense
Les agents technique et SEO produisent, à partir des rapports Crawlie d'A8 et de la lecture du dépôt local `~/CoachGari` (lecture seule et analyse statique, D2, sans aucune exécution de son code), un audit technique préliminaire de Coach Gari conforme au schéma, avec pour chaque recommandation le correctif qui serait proposé (diff en simulation, **non appliqué**). Même chose pour Maisons.co à partir de Crawlie seul. Marqué « sans données AEO ni Search Console ».

### E5 · SEO Command Orchestrator (préparé, non activé)
Le moteur qui fait de l'équipe une équipe permanente. Tout est construit et testé sur données fictives ; **aucune exécution récurrente n'est activée, aucune publication réelle.**

1. **Modèle de mission** : type (audit technique, audit SEO, mesure AEO d'une fenêtre, analyse après déploiement, veille concurrentielle, revue de rapport), client, site, sujet, déclencheur, agents assignés, budget réservé, état (`planifiée`, `en attente de budget`, `en cours`, `en attente de validation`, `terminée`, `échouée`, `annulée`), résultats (liens vers recommandations et preuves).
2. **File de missions** : migration proposée, avec verrouillage, reprise après interruption et idempotence. Tests de concurrence sur Postgres jetable.
3. **Planificateur** : récurrences par sujet (par exemple audit technique hebdomadaire, mesure AEO mensuelle) enregistrées **désactivées par défaut**, plus un interrupteur global `OIA_SEO_COMMAND_SCHEDULER_ENABLED=false`. Un test vérifie qu'aucune mission planifiée ne part quand l'interrupteur est à `false`. L'activation est une décision humaine, protégée selon la règle 16 : tests à l'appui, aucun exécuteur d'agent ne peut l'activer, et un redémarrage ne la réactive jamais.
4. **Déclencheurs d'événements** : fin d'une fenêtre de mesure, nouveau déploiement détecté sur le dépôt d'un site (lecture D2), demande de fusion fusionnée, alerte de seuil (chute de visibilité, régression du garde-fou CI). Testés sur fixtures.
5. **Exécuteurs d'agents, indépendants du moteur** : une interface d'exécution et quatre adaptateurs :
    - `fictif`, déterministe, pour les tests ;
    - `claude-code-headless`, préparé et désactivé ;
    - `llm-api`, via l'interface LLM d'A0b et G1, préparé et désactivé ;
    - `manuel`, qui transforme la mission en tâche pour Mickaël.
   Dans le rapport, question pour Mickaël : quel moteur pour les agents en fonctionnement autonome, avec pour chaque option le coût estimé et les conditions d'utilisation à vérifier.
6. **Contrôle des dépenses** : chaque mission réserve son budget avant de démarrer, via une interface de budget unique : plafond global d'A3 cette nuit, plafonds par client et par site quand C3 sera fait. Le budget de collecte (30 $ par mois) est distinct du budget de fonctionnement des agents, qui sera fixé quand leur moteur d'exécution sera choisi ; refus si le budget est insuffisant ; coût réel enregistré à la fin.
7. **Validation** : toute mission qui aboutit à une écriture (correctif, publication, demande de fusion) s'arrête en `en attente de validation`, levée uniquement par une identité humaine (règle 16). Seules les missions de lecture peuvent se terminer seules.
8. **Suivi après déploiement** : quand une demande de fusion est fusionnée (fixture), une mission de vérification se crée (garde-fou CI et crawl du site) et se rattache à la prochaine fenêtre de remesure.
9. **Journal des actions** en ajout seul : qui (agent ou humain), quoi, quand, sur quel client, avec quel coût.
10. **CLI** : `seo-command missions list | show | enqueue | cancel`, `seo-command schedule list`, `seo-command agents status`.
11. **Test de bout en bout sur données fictives** : mission planifiée simulée, agent fictif, recommandation, attente de validation, validation simulée, correctif en simulation (D4), fusion fictive, vérification après déploiement, rattachement à la remesure. Maturité attendue : `testé sur données fictives`.

### E6 · Cohérence avec la roadmap 3.3
La roadmap 3.3 intègre déjà SEO Command (décisions approuvées, P2 en mode manuel, P3 en mode planifié, schéma d'architecture) et la stratégie d'intégration des moteurs. Vérifie que le code et la documentation de la nuit sont cohérents avec elle, et signale tout écart dans le rapport. Ne modifie pas la roadmap.

---

## Bloc F · Intelligence

### F1 · Moteur statistique
Module pur : agrégation par jour de collecte et par fournisseur, intervalle calculé sur les jours, règle « pas de changement démontrable », signalement d'un changement de version de modèle. Tests sur données synthétiques et cas limites.

### F2 · Import Elmo vers la table des preuves
Adaptateur Elmo vers le contrat A5, testé sur exports fictifs ou sur l'instance de test d'A7.

### F3 · Contrôle des faits
Comparateur réponses / faits de référence validés : détection déterministe d'abord ; extraction par LLM derrière l'interface du bloc G, implémentation fictive ; statut « extrait » pour tout ce qui vient d'un modèle.

### F4 · Revue croisée des rapports
Cadre qui envoie un rapport à plusieurs relecteurs via l'interface du bloc G (implémentation fictive cette nuit), enregistre chaque critique avec sa source, et impose une décision accepté ou rejeté avec motif. Règle codée : une critique ne modifie une recommandation que si elle pointe une erreur vérifiable ou une preuve manquante.

### F5 · Rapport client
Gabarit de rapport par site et par fenêtre (Markdown et HTML), généré à partir des données : métriques avec intervalles, sources citées par les IA, erreurs factuelles, recommandations et décisions, limite API / application écrite. Exemple généré sur données fictives.

---

## Bloc C · Plusieurs clients et plusieurs sites

### C1 · Modèle client, site, sujet
Hiérarchie : **client** (organisation) → **sites** → **sujets** (une marque mesurée, rattachée à un ou plusieurs sites). Chaque client porte son budget mensuel, ses contacts, son mode d'action sur les dépôts (C3), son statut (interne ou externe). Migration proposée, RLS par client. **Tests d'isolation complets** : un utilisateur, un agent ou un appel d'API du client A n'obtient jamais une information du client B, ni par les tables, ni par les vues, ni par les fonctions SQL privilégiées (`security definer` comprises), ni par les exports, les fichiers de preuves, les rapports ou les journaux.

### C2 · Intégration d'un nouveau site
CLI `visibility site init --client <id> --url <url> [--repo <owner/name>]` qui crée le squelette du sujet :
- crawl Crawlie du site pour pré-remplir langues détectées, pages principales, sitemap, données structurées présentes ;
- extraction de faits candidats depuis le site (offres, prix visibles, zones), tous au statut « extrait », jamais « validé » ;
- concurrents laissés vides, à proposer par B2 ;
- aucun nom de client ni de site dans le code.
Testée sur un site fictif servi localement. Protection contre les adresses internes et les redirections dangereuses selon la règle 15. N'exécute pas `site init` sur un vrai site client cette nuit, sauf en mode `--dry-run` sur les deux pilotes pour comparer avec leurs fiches existantes, sans écrire.

### C3 · Budgets et coûts par client
Le garde-fou de coût devient multi-niveaux : plafond global, plafond par client, plafond par site, coût réel attribué par client, site et fournisseur. Arrêt au premier plafond atteint. Tests à blanc.

### C4 · Guide
`docs/visibility/ajouter-un-site.md` : de l'URL au premier J0, sans toucher au code.

---

## Bloc G · Branchements LLM préparés

### G1 · Interface unique
L'interface et son implémentation fictive sont créées dès A0b ; G1 complète leur périmètre. Interface d'accès aux modèles pour toutes les fonctions qui en auront besoin (reformulation de panels, extraction de faits, rédaction de contenus, relecture croisée, synthèse de rapports), alignée sur `packages/providers` existant (contrats métier conservés), avec :
- une implémentation fictive déterministe pour les tests ;
- des emplacements d'adaptateurs vides pour Mistral, Anthropic, OpenAI, Gemini, en désactivé ;
- une configuration par fonction (modèle, plafond, fournisseur), lue depuis l'environnement, sans valeur par défaut payante.

### G2 · Guide
`docs/visibility/brancher-un-llm.md` : pour chaque fonction, quel modèle brancher, quelle variable renseigner, quel test lancer, quel coût attendre. Rappel : le choix des modèles se fait par des tests sur les tâches réelles.

---

## Bloc H · Console Visibility

### H1 · Vérification du déploiement
Avant tout code d'interface : identifie dans le dépôt ce qui est déployé et comment (configuration Vercel, dossier racine, workflows). Si tu ne peux pas établir avec certitude qu'un nouveau paquet ne sera pas déployé automatiquement, **n'écris aucun code d'interface** : fais seulement H3.

### H2 · Console locale
Si H1 le permet : paquet séparé `apps/visibility-console`, non référencé par aucun déploiement, lancé seulement en local, alimenté par les données fictives des blocs précédents. Vues : portefeuille de clients et de sites, tableau par site (visibilité Google et IA avec intervalles), concurrents et citations, anomalies, recommandations par priorité, actions à valider, historique des décisions, coûts par client, site et fournisseur. **Plus une vue SEO Command dédiée** : file de missions et leurs états, activité de chaque agent et ses dernières sorties, planification (visible et affichée comme désactivée), validations en attente, journal des actions, coût par mission. Style cohérent avec la console OIA existante, sans tableaux décoratifs. Build et tests verts.

### H3 · Spécification
`docs/visibility/console-spec.md` : vues (dont la vue SEO Command), contrat de données de chaque vue, plan d'intégration dans la console OIA principale avec son AuthGate.

---

## Bloc I · Inventaires et exploitation

### I1 · Inventaires en lecture seule
`souffleur.py` (recherche sur le Mac et dans les dépôts de l'organisation) et `mcp-studio-mt` (outils, authentification, identités, version MCP), clonés au besoin dans `~/audit-tmp/`, jamais exécutés. Résultats dans `docs/audits/2026-11-08-souffleur-mcp.md`. `~/audit-tmp/` supprimé ensuite.

### I2 · Guide d'exploitation
`docs/visibility/exploitation.md` : démarrage et arrêt des services, fenêtres de mesure, sauvegarde et restauration, secrets à conserver dans Proton Pass, plafonds de coût, passage futur sur un serveur.

---

## Clôture

### Z1 · Fin de nuit
- Worker d'Elmo arrêté. **N'arrête que les services que cette session a démarrés** (volumes conservés) ; ne touche à aucun service qui tournait déjà au début de la nuit (note-les en A0). `oia-vis-test-pg` supprimé, aucun port ouvert hors localhost.
- Test de généricité et tests de tous les paquets touchés : résultats consignés.
- Rapport finalisé, en particulier la section « Ce qui est prêt à brancher ».
- Dernier commit local dans tous les cas ; **push uniquement si A0c l'a explicitement autorisé**. Sinon, le rapport indique en tête les commits à pousser au réveil.

### Z2 · Réception technique et démonstration
Le critère de la nuit est le nombre de fonctions réellement testées, pas le nombre de fichiers créés.

**Z2.1 · Test de bout en bout reproductible.** Une commande unique, documentée, sur données fictives, avec un résultat PASS ou FAIL par étape :
1. création d'un client et d'un site ;
2. initialisation d'un sujet et proposition de panel ;
3. création d'une mission SEO Command ;
4. exécution par les agents fictifs ;
5. constats, preuves et recommandations ;
6. mise en attente de validation ;
7. approbation humaine simulée, avec une identité distincte de celle de l'agent, et tentative d'auto-approbation par l'agent refusée ;
8. demande de fusion simulée et passage du garde-fou CI ;
9. événement fictif de déploiement ;
10. contrôle après déploiement, remesure simulée et rapport final.
Aucun appel réel, aucune activation de mission, aucun déploiement.

**Z2.2 · Résilience.** Interruption d'un worker au milieu d'une mission, puis reprise : idempotence, aucun doublon, aucune dépense supplémentaire non réservée, preuves et décisions conservées, et le planificateur reste désactivé après redémarrage.

**Z2.3 · Gouvernance des données (document seulement).** `docs/visibility/gouvernance-donnees.md` : durées de conservation par type de donnée, effacement des données personnelles, séparation des clients, et conciliation entre journal d'audit en ajout seul et demandes légitimes de suppression (par exemple données personnelles stockées à part, référencées par le journal, et effaçables sans altérer son intégrité). Aucune politique de suppression appliquée cette nuit.

**Z2.4 · Matrice de réception.** Dans le rapport, pour chaque capacité : implémentée (oui ou non), tests (PASS, FAIL, non exécutés), données fictives ou réelles, dépendances restant à connecter, risques bloquants, étape nécessaire avant la mise en production. Puis une démonstration locale de SEO Command si les prérequis sont réunis.

Aucune phase P1, P2 ou P3 n'est déclarée franchie sur la base de tests fictifs. **Fin du périmètre : aucun développement hors mandat.**

---

## Ce que Mickaël fera au réveil (pour mémoire, ne pas faire)

- Valider le schéma des preuves, le modèle client / site / sujet, le journal de décision.
- Valider les modèles mesurés, le panel de Maisons.co, la doctrine.
- Sauvegarder les secrets locaux dans Proton Pass.
- Créer la GitHub App et choisir le mode d'action de chaque dépôt.
- Se connecter à Google pour CrawlSEO, créer les comptes prestataires, brancher les modèles d'IA.
- Décider du lancement de la fenêtre J0.
- Choisir le moteur d'exécution des agents de SEO Command, puis décider quand activer le planificateur.

Fin du mandat.

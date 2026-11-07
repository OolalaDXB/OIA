# MANDAT DE NUIT · OIA Visibility · nuit du 7 au 8 novembre 2026

Tu travailles seul cette nuit, en local sur le Mac Studio de Mickaël (macOS arm64), dans `~/OIA`, avec Claude Opus 5.5. Mickaël dort : **il n'y aura aucune réponse avant le matin.** Ce mandat est conçu pour que tu avances sans jamais attendre une validation, en ne faisant que ce qui est déjà décidé ou réversible.

Référence : `docs/roadmap-oia-shyrka-souffleur.md` (roadmap V3, référence unique) et `infra/visibility/reports/HANDOFF.md`.

---

## 1. Règles de fonctionnement de la nuit

### 1.1 Ne jamais t'arrêter pour poser une question

- Si une tâche exige une décision de Mickaël, une dépense, un compte, une connexion interactive ou une clé : **tu ne la fais pas**, tu notes précisément ce qui manque dans le rapport de nuit (section « Questions pour Mickaël »), puis tu passes à la tâche suivante.
- Si une tâche échoue ou se bloque : tu annules proprement tes modifications non commitées de cette tâche (`git restore`, `git clean` limité aux fichiers que tu as créés), tu consignes l'échec avec la commande, l'erreur et ton diagnostic, puis tu passes à la suite.
- Ne recommence pas une tâche échouée plus de deux fois.

### 1.2 Commits et traçabilité

- Une tâche = un ou plusieurs commits directs sur `main`, préfixés `oia-visibility:` ou `docs:`. Aucune branche.
- `git push origin main` après chaque tâche terminée, pour que rien ne soit perdu si la session s'interrompt.
- Ne commite que tes propres fichiers. **Ne touche jamais** à `knowledge/generated/solution-2026-08-14.md` (modifié en local par Mickaël, hors périmètre) : vérifie avec `git status` avant chaque commit qu'il n'est pas inclus.
- Mets à jour le rapport de nuit à la fin de **chaque** tâche, puis commite-le.

### 1.3 Interdits absolus

1. Aucun service payant, aucune création de compte, aucune clé API, aucun appel à un fournisseur de modèles d'IA (OpenAI, Anthropic, Mistral, Google, OpenRouter, TypeSafe, Perplexity).
2. **Ne démarre jamais le worker d'Elmo** : créer ou activer une question lance un run immédiat (`sendImmediate`).
3. Aucune modification des dépôts `OolalaDXB/CoachGari` ou du dépôt Maisons.co, ni de leurs sites en ligne. Aucun envoi IndexNow, aucune action Search Console, aucune action sur Vercel.
4. Aucune migration appliquée à un projet Supabase distant. Pas de `supabase link`, `supabase db push` ni équivalent. Les migrations restent des fichiers, testés sur un Postgres local jetable.
5. Docker : ne touche à aucun conteneur, volume ou réseau existant hors de ceux que tu crées pour OIA Visibility (préfixe `oia-`). Interdits : `docker rm` ou `docker volume rm` sur autre chose que tes propres objets `oia-*`, `docker system prune`, `docker volume prune`. BAWABA (ports 3000 et 5433) et `studiomt-db` doivent rester intacts.
6. Git : pas de `push --force`, pas de `rebase` de `main`, pas de réécriture d'historique, pas de création ni suppression de branche.
7. Secrets : n'affiche, ne journalise et ne commite aucune valeur de secret. Seuls des `.env.example` sans valeur sont commités. `ANTHROPIC_API_KEY` ne doit jamais être exportée dans le shell.
8. Aucune modification des réglages système (`pmset`, préférences macOS), aucune installation globale via Homebrew. Pour Crawlie, préfère `npx`.
9. N'exécute pas le code de dépôts que tu audites (`souffleur.py`, `mcp-studio-mt`) : lecture seule.
10. Aucune publication externe : pas de message, pas d'e-mail, pas d'issue ni de commentaire GitHub.

### 1.4 Périmètre

Tu travailles uniquement sur la phase P1 (étapes B et C sans clés), la doctrine P0 en brouillon, et deux inventaires en lecture seule. **Aucune tâche de P2 à P9** : la roadmap interdit de démarrer une phase avant que sa porte soit franchie.

---

## 2. Rapport de nuit

Fichier : `infra/visibility/reports/2026-11-08-nuit.md`. Crée-le dès la tâche T0, puis complète-le au fil de la nuit. Structure obligatoire :

1. **Résumé en 10 lignes maximum** : ce qui est fait, ce qui est bloqué, ce qui attend Mickaël.
2. **Tableau des tâches** : tâche, statut (fait, partiel, bloqué, non commencé), commits, durée approximative.
3. **Détail par tâche** : ce qui a été fait, preuves (commandes, sorties abrégées, chemins de fichiers), écarts avec la documentation.
4. **Questions pour Mickaël** : chaque décision attendue, avec ta recommandation et ses conséquences.
5. **Ce qui reste à faire avec Mickaël présent** : connexion Google, création des comptes, validation du schéma, validation des panels, choix des modèles.
6. **Incidents** : tout ce qui a échoué, avec diagnostic.

Écris en français, phrases courtes, sans tiret cadratin.

---

## 3. Les tâches, dans l'ordre

### T0 · Préparation

1. `git pull --ff-only` sur `main`. En cas d'échec : consigne et arrête-toi là (c'est le seul cas d'arrêt complet).
2. `git status` : note les fichiers modifiés en local, sans y toucher.
3. Lance `infra/visibility/scripts/preflight.sh` et colle sa sortie abrégée dans le rapport.
4. Vérifie si Docker Desktop tourne (`docker info`). S'il ne tourne pas, note-le : les tâches T7 et la partie test de T5 seront sautées.
5. Crée le rapport de nuit, commite-le.

### T1 · Roadmap de référence dans le repo

1. Le fichier `docs/roadmap-oia-shyrka-souffleur.md` a été déposé par Mickaël. S'il est absent, cherche-le dans `~/Downloads` sous le nom `roadmap-oia-shyrka-souffleur.md` et copie-le à cet emplacement. Introuvable : consigne et passe à T2.
2. Ne modifie pas son contenu, sauf coquille manifeste que tu signales.
3. Ajoute en tête de `docs/roadmap.md` une ligne unique : la vision d'ensemble OIA, Shyrka et Souffleur se trouve dans `docs/roadmap-oia-shyrka-souffleur.md`. Ne touche à rien d'autre dans ce fichier.
4. Commit : `docs: roadmap de référence OIA × Shyrka × Souffleur (V3)`.

### T2 · Intégrité de J0 pour Coach Gari (lecture seule)

Le plan SEO/AEO de Coach Gari est épinglé au commit `73e1967`, le clone local `~/CoachGari` est à `8ef1fd7`.

1. Dans `~/CoachGari`, liste les commits entre `73e1967` et `8ef1fd7` (`git log --oneline 73e1967..8ef1fd7`) et les fichiers touchés.
2. Classe chaque commit : sans effet sur ce que voient Google et les IA (back-office, tests, outillage) ou avec effet potentiel (pages publiques, `robots.txt`, sitemap, balises, données structurées, prix, `llms.txt`, `noindex`).
3. Vérifie en ligne, en lecture seule, l'état public de `coachgari28.com` : `robots.txt`, sitemap, et pour les 4 pages de service, la présence de `noindex` et de la balise `cg-draft`. Une requête par URL, sans automatisation agressive.
4. Conclusion dans le rapport : J0 reste intègre, ou J0 est compromis (avec les commits en cause).
5. Ne modifie rien dans `~/CoachGari`. Aucun commit dans ce dépôt. Le résultat va dans `infra/visibility/subjects/coach-gari/REVIEW.md` (section « Intégrité J0 au 2026-11-08 ») et dans le rapport. Commit dans OIA.

### T3 · Étape B, partie 1 : bascule vers la configuration payante plafonnée

Décision déjà prise par Mickaël : Elmo en mode API payant comme collecteur de transition, plafond global de 30 $ par mois. Ne crée aucune clé, ne fais aucun appel.

1. **Annulation ciblée de la bascule zéro coût** introduite par `16f8a4b` et par la partie zéro coût de `6cca747`. Le panel `coach-gari` (en-01 à en-10) doit rester exactement tel quel : vérifie-le par un diff avant et après. Pas de `git revert` global de `6cca747`.
2. `.env.example` d'Elmo : fournisseurs OpenAI, Anthropic et Mistral en direct, Gemini et Perplexity via OpenRouter, Jev via OpenRouter, `TYPESAFE_API_KEY` vide. Valeurs vides partout.
3. `cost-guard.sh` : remplace le plafond journalier par `OIA_VIS_MONTHLY_CAP_USD=30`, cumul du coût réel sur le mois UTC, alerte à 24 $, arrêt du worker à 30 $. Garde le comportement « arrêt avant le premier appel si le plafond est atteint ».
4. Teste `cost-guard.sh` à blanc avec des valeurs simulées (dessous, au seuil d'alerte, au plafond, au-delà), sans réseau.
5. `SECRETS.md` : ajoute la mise en garde. `ANTHROPIC_API_KEY` ne vit que dans `infra/visibility/elmo/.env`, jamais dans le shell ni dans un profil, sinon Claude Code bascule de l'abonnement Max vers la facturation API. Vérifie que le compose ne lit cette clé que depuis ce fichier.
6. Tests du paquet verts. Commit(s).

### T4 · ADR de la stratégie de collecte

Fichier : `docs/adr/` (suis la numérotation existante si un dossier ADR existe, sinon crée `docs/adr/0001-collecte-visibility.md`).

Contenu, faits uniquement :
- Contexte : besoin de mesure de visibilité IA, contrainte de budget plafonné, exigence de preuves.
- Décision : Elmo collecteur de transition en mode API payant ; collecteur maison en cible ; remplacement moteur par moteur (Gemini en direct d'abord, puis Mistral, OpenAI, Anthropic, Perplexity), chaque moteur basculant après une comparaison cohérente en parallèle ; premier moteur maison seulement après une boucle complète sur un sujet (porte P2).
- Plan B : Canonry (MIT).
- Déclencheurs de bascule anticipée : Elmo cassé, inactif, changement de licence, ou suppression de réponses brutes non maîtrisée.
- Conséquences : la couche OIA ne dépend jamais du schéma ou de l'API d'Elmo ; toute réponse brute est copiée côté OIA en ajout seul.
- Faits techniques connus sur Elmo (repris de `HANDOFF.md`, avec fichiers et lignes) : Jev en mode stub, adresses de Jev codées en dur, `sendImmediate`, installateur non conforme, Gemini via OpenRouter uniquement, suppression des réponses brutes avec la question.

Commit.

### T5 · Étape B, partie 2 : interface de collecteur et table des preuves (proposition)

Ce travail est une **proposition** : Mickaël validera le schéma au réveil. Il reste réversible et n'est appliqué à aucune base distante.

1. **Interface de collecteur** en TypeScript dans `infra/visibility/src/` : un contrat générique qui accepte plusieurs collecteurs sur les mêmes questions (identifiant de collecteur, question et version, moteur, modèle et version, langue, pays, horodatage, source de collecte, recherche web oui ou non, texte brut, URL citées, requêtes de recherche émises si disponibles, coût). Aucun nom de sujet. Aucune dépendance au schéma d'Elmo : un adaptateur Elmo séparé traduit vers ce contrat (écris son squelette et ses tests sur des fixtures, sans appel réseau).
2. **Migration SQL** (fichier uniquement), dans l'emplacement des migrations OIA existant ou dans `infra/visibility/migrations/` :
   - table des réponses brutes en ajout seul : un déclencheur rejette `UPDATE` et `DELETE` ;
   - empreinte SHA-256 calculée côté serveur sur le texte brut et les métadonnées ;
   - toutes les métadonnées du contrat ci-dessus, plus la version d'Elmo ;
   - isolation par sujet (colonne de sujet obligatoire et politiques RLS) ;
   - tables minimales de fenêtres de mesure et de jours manquants.
3. **Tests** sur un Postgres local jetable : un conteneur `oia-vis-test-pg` créé pour l'occasion, sur un port libre non exposé publiquement, supprimé à la fin. Vérifie : insertion acceptée, `UPDATE` et `DELETE` rejetés, empreinte calculée, isolation RLS entre deux sujets fictifs. Si Docker ne tourne pas : écris les tests, note qu'ils n'ont pas tourné.
4. Commit avec la mention « proposition, schéma à valider ». Dans le rapport, présente le schéma en clair (tables, colonnes, déclencheurs, politiques) pour que Mickaël puisse le valider en 5 minutes.

### T6 · Proposition des modèles mesurés (document seulement)

Aucun appel API. Recherche documentaire uniquement, sur les pages officielles des fournisseurs.

Fichier : `infra/visibility/FOURNISSEURS.md`, nouvelle section « Proposition des modèles mesurés, 2026-11-08 ».

Pour chaque moteur (ChatGPT, Claude, Le Chat de Mistral, Gemini, Perplexity) :
- le modèle le plus proche de ce que voit un utilisateur de l'application grand public **gratuite** ;
- son identifiant exact, vérifié sur la documentation officielle (lien et date de consultation) ; si tu ne peux pas le vérifier, écris « non vérifié » ;
- recherche web disponible ou non par l'API, et par quel chemin (direct, OpenRouter) ;
- coût estimé par fenêtre de 5 jours pour les deux sujets (Coach Gari : 10 questions ; Maisons.co : 20 questions), avec le calcul ;
- total mensuel estimé, comparé au plafond de 30 $.

Signale tout écart entre ce que voit l'utilisateur de l'application et ce que donne l'API. Commit.

### T7 · Étape C sans clés : installation locale

Seulement si Docker Desktop tourne.

1. Génère les secrets locaux avec `scripts/init-env.sh` (jamais affichés). Rappelle dans le rapport que Mickaël doit les sauvegarder dans Proton Pass.
2. Démarre Elmo (web et base uniquement, **worker arrêté**) et CrawlSEO, avec les compose épinglés de `infra/visibility/`. Ports publiés sur `127.0.0.1` uniquement.
3. Vérifie la santé : pages accessibles en local, migrations de base passées, aucun port exposé hors localhost (`lsof` ou équivalent).
4. Test de sauvegarde et restauration d'Elmo avec `backup.sh`, `restore.sh` et `scripts/verify-restore.sh`, dans une installation de test séparée (préfixe `oia-`), puis supprime l'installation de test.
5. Le test CrawlSEO avec de vrais jetons Google exige une connexion interactive : ne le tente pas, note-le pour Mickaël.
6. À la fin : arrête les services (`docker compose stop`), sans supprimer les volumes. Consigne les commandes de redémarrage dans le rapport.
7. Commit des éventuels correctifs de configuration ou de scripts.

### T8 · Audit Crawlie des deux sites (lecture seule)

1. Avec `npx crawlie` (version épinglée de la configuration), crawl de `coachgari28.com` et de `maisons.co`, avec un rythme modéré.
2. Rapports JSON dans `infra/visibility/subjects/<sujet>/audits/2026-11-08/`.
3. Synthèse par site dans le rapport : problèmes techniques et GEO principaux, classés par gravité, en reprenant les contrôles de `agents/checklist-site.md`. Pour chaque contrôle « à la main », écris la tâche de vérification manuelle (quoi regarder, où).
4. Rappel : le gel J0 interdit toute modification des sites ; l'audit est une observation.
5. Commit.

### T9 · Proposition du panel Maisons.co

Décisions de Mickaël : Maisons.co mesuré comme loueur de maisons et conciergerie (Quistinic et Morbihan, Gudauri, conciergerie en Bretagne), pas de panel logiciel, 10 questions en français et 10 en anglais.

1. À partir de `subjects/maisons-co/` et de ses documents sources, propose le panel : 8 questions non marquées et 2 marquées par langue, formulées comme de vraies questions posées à un assistant, chacune avec sa provenance.
2. Propose une liste de concurrents candidats, avec la raison de chaque choix.
3. Statut « proposé » dans les fichiers du sujet. Aucun run, worker arrêté.
4. Commit.

### T10 · Doctrine de Shyrka, brouillon P0

Fichier : `docs/shyrka/DOCTRINE.md`, statut « brouillon à valider ».

Reprends les sections « Principes non négociables », « Niveaux d'action de Shyrka » et « P0 · Doctrine de Shyrka » de la roadmap V3, structurées en document autonome : rôle, doctrine de travail, quatre niveaux d'action, interdits, mémoire, voix, nom. N'invente aucune règle nouvelle. Pour les règles de confidentialité propres à Mickaël, écris seulement qu'elles sont tenues dans une liste séparée, sans en citer aucune.

Commit.

### T11 · Inventaires en lecture seule

**`souffleur.py`**
1. Cherche sur le Mac, en lecture seule : `find ~ -name "souffleur*.py" -not -path "*/Library/*" -not -path "*/node_modules/*" 2>/dev/null`, et parmi les dépôts git locaux ceux qui contiennent Souffleur.
2. Cherche aussi dans les dépôts GitHub de l'organisation avec `gh` (liste et recherche de code), sans cloner autre chose que le nécessaire, dans `~/audit-tmp/`.
3. S'il est trouvé : décris son emplacement, sa structure, ses contrôles P0, son verdict GO, ses tests et ses dépendances. **Ne l'exécute pas.**

**`mcp-studio-mt`**
1. Localise le dépôt (local ou `gh repo view`). Clone si besoin dans `~/audit-tmp/`, en lecture seule.
2. Décris : outils réellement implémentés, mode d'authentification, gestion des identités appelantes et des permissions, version du protocole MCP utilisée. **Ne l'exécute pas.**

Résultats dans `docs/audits/2026-11-08-souffleur-mcp.md`. Commit. Supprime `~/audit-tmp/` à la fin.

### T12 · Clôture

1. Vérifie que tous les services `oia-*` sont arrêtés, que le conteneur de test a été supprimé, qu'aucun port n'est resté ouvert hors localhost.
2. Lance les tests du repo concernés par la nuit ; consigne le résultat.
3. Finalise le rapport : résumé, tableau, questions pour Mickaël avec tes recommandations, ce qui reste à faire en sa présence.
4. Dernier commit et push.

---

## 4. Ce que Mickaël fera au réveil (pour mémoire, ne pas faire)

- Valider le schéma de la table des preuves (T5).
- Valider les modèles mesurés et leur coût (T6).
- Valider le panel de Maisons.co (T9) et la doctrine (T10).
- Se connecter à Google pour CrawlSEO et créer les comptes prestataires.
- Décider de la fenêtre J0.

Fin du mandat.

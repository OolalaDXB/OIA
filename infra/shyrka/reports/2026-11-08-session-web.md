# Rapport de la session web parallèle · 2026-11-08

Session cloud, sans accès au Mac : ni micro, ni Whisper, ni Ollama, ni voix
macOS, ni démon Docker. Exécutée sans attendre de réponse (Mickaël absent) ;
les questions sont en bas. La session Mac suit J0 de son côté ;
`infra/visibility/` n'a pas été modifié.

## En tête : les deux mandats étaient introuvables

`infra/visibility/mandats/MANDAT-2026-11-07-v7-suite-J0.md` et
`MANDAT-2026-11-07-v6.md` n'existent ni sur `origin/main`, ni sur une autre
branche du dépôt, ni dans les issues GitHub. Recherche faite au début de la
session, puis toutes les 45 s pendant 30 min, puis une dernière fois avant ce
rapport : le dossier `mandats/` n'a jamais été poussé. Les fichiers sont
probablement restés dans la copie locale du Mac.

Conséquence : j'ai exécuté **ce que la consigne de session décrit
elle-même**, sans le texte ni les règles propres aux mandats.

- **v7, bloc F** : la consigne le définit (« interface web OIA, sous /oia,
  bascule désactivée »). Fait sur cette base.
- **v6, blocs C, B, D, E** : la consigne ne donne que les lettres, plus deux
  indications : du code à adaptateurs simulés pour Whisper, Ollama, la voix
  macOS et le micro, et une évaluation de Bifrost. J'en ai tiré deux
  livrables, Shyrka 1 et l'évaluation de Bifrost. **Je ne sais pas à quel
  bloc correspond chacun, ni si C, B, D ou E demandaient autre chose.** Les
  messages de commit disent « mandat v6 » sans lettre, pour ne rien affirmer.
- **À faire par Mickaël ou la session Mac** : pousser le dossier `mandats/`,
  puis confronter chaque bloc à ce rapport. Ce qui manque se reprend dans une
  session suivante.

## Commits (directement sur `main`)

L'accès en écriture à `main` fonctionne. Avant chaque commit :
`git pull --rebase origin main`, puis push aussitôt. Aucun conflit. La branche
de session `claude/magical-ptolemy-pi6g34` n'a pas servi (restée à `18f936a`).

| Commit | Contenu | Zone |
|---|---|---|
| `c6b4dab` | Interface web OIA sous `/oia`, bascule éteinte (v7, bloc F) | `apps/web/`, `docs/interface/` |
| `818de4f` | Shyrka 1 « Te parle » : paquet `@oia/shyrka`, identité v0, guide d'essai | `packages/shyrka/`, `infra/shyrka/`, `pnpm-lock.yaml` |
| `66a6e03` | Évaluation documentaire de Bifrost | `docs/audits/` |
| `6722dbf` | Roadmap 3.6, CADRE.md, schémas Mermaid, test de cohérence `/oia` | `docs/roadmap-oia-shyrka-souffleur.md`, `docs/shyrka/`, `apps/web/test/` |
| ce commit | Ce rapport | `infra/shyrka/reports/` |

**Déploiement** : chaque push sur `main` redéploie la console `apps/web` sur
Vercel (`vercel.json`). La page `/oia` y est servie **éteinte** : un avis, pas
d'entrée dans le rail, `noindex`.

## 1 · v7, bloc F : interface web OIA sous `/oia`

- Route `/oia` dans l'export statique. Bascule `NEXT_PUBLIC_OIA_INTERFACE` :
  seule la valeur exacte `on` au build l'allume. Elle n'est posée nulle part
  dans le dépôt.
- Bascule éteinte : la page affiche « Interface OIA désactivée », reste hors du
  rail et n'importe aucune donnée.
- Bascule allumée : vue de lecture (trois identités, phases P0 à P6 et P9,
  piste Shyrka). Aucune action, aucun appel. Vérifiée dans Chromium, sans
  erreur console.
- Tests : `apps/web/test/oia.test.ts` (bascule) et `oia-roadmap.test.ts`
  (chaque phase affichée existe dans la roadmap, P7 et P8 absents, étapes
  Shyrka alignées). Doc : `docs/interface/oia-interface-web.md`.
- **Limite** : le contenu de la vue est ma proposition. Le texte du bloc F
  attendait peut-être autre chose (Shyrka en texte dans le navigateur, console
  Visibility…).

## 2 · v6 : Shyrka 1 et Bifrost

### Shyrka 1 « Te parle » (`packages/shyrka`, `infra/shyrka/`)

- Boucle locale : prise volontaire au micro (ffmpeg, 8 s par défaut, 30 s au
  plus), transcription whisper.cpp, réponse Ollama, affichage texte, voix
  macOS `say` (Aurélie) **seulement si l'identité l'autorise**.
- Identité : `infra/shyrka/identite.json`, version 0 du cadre. Pas de voix en
  sortie. Un fichier absent ou invalide retombe sur la version 0. Le code ne
  l'écrit jamais.
- Garde-fous testés :
  - Ollama : adresse locale seulement. `10.x`, `192.168.x`, un domaine ou
    `127.0.0.1.nip.io` sont refusés ;
  - `say` reçoit le texte par fichier : un texte généré qui commence par `-`
    ne devient pas une option ;
  - commandes lancées sans shell ;
  - aucun WAV conservé, aucune mémoire écrite.
- CLI :
  - `pnpm --filter @oia/shyrka diagnostic` : lecture seule, dit ce qui manque ;
  - `parle` : dialogue au micro ;
  - `parle -- --texte` : sans micro ;
  - `parle -- --simule` : sans matériel.
- 30 tests (adaptateurs simulés, faux exécuteurs). Essais ici : boucle
  simulée correcte ; diagnostic sous Linux qui signale bien chaque manque ;
  Ollama éteint qui donne un message clair.
- **Non testé faute de Mac** : micro réel, accès micro de macOS, whisper.cpp,
  Ollama, voix Aurélie, latences.

**Premier essai réel (Mickaël)** : `infra/shyrka/README.md`, étapes 0 à 5.
Il faut `brew install ffmpeg whisper-cpp`, le modèle
`ggml-large-v3-turbo.bin` (empreinte à vérifier) et un modèle Ollama. Ensuite :
lancer `diagnostic`, puis `parle -- --texte`, puis `parle` au micro, sur trois
phrases d'essai. Résultats à consigner dans
`infra/shyrka/reports/<date>-premier-essai.md`. La voix en sortie demande
d'abord une décision écrite de version 1. Pour un essai ponctuel, une copie
locale de `identite.json` suffit.

### Bifrost (`docs/audits/2026-11-08-bifrost-evaluation.md`)

Docker indisponible : licence, documentation et code seulement. Rien
d'installé, rien d'exécuté. Commit `6e640279` lu, tag `transports/v2.5.0`.
J'ai vérifié moi-même les empreintes Docker Hub et les points les plus lourds
dans le code.

- Apache-2.0, open-core. Les fonctions de cloisonnement fin sont payantes :
  RBAC, journaux par équipe, Vault.
- Tous les fournisseurs d'OIA sont pris en charge.
- Budgets et coupure automatique sont dans la version ouverte.
- Réglages par défaut à risque :
  - authentification d'administration coupée ;
  - `0.0.0.0` dans l'image ;
  - contenu des échanges journalisé 365 jours ;
  - secrets en clair sans `BIFROST_ENCRYPTION_KEY`.
- Appels sortants vers getbifrost.ai.
- Ni signature, ni SBOM.
- **Verdict : candidat sérieux, non retenu à ce stade.** Un essai local est
  possible en P4 sous conditions, avec l'image épinglée
  `maximhq/bifrost:v2.5.0@sha256:b5258c5f…`. Le rapport liste ce qui reste à
  vérifier avec Docker.

## 3 · Roadmap 3.6

- Piste Shyrka en quatre étapes, alignées sur les phases :
  - Shyrka 1 « Te parle » avec P1 ;
  - Shyrka 2 « Te seconde » avec P2 ;
  - Shyrka 3 « Te connaît » avec P5 ;
  - Shyrka 4 « Agit pour toi » avec P6.

  Chaque étape a son niveau d'action maximal et sa porte.
- P7 et P8 ne sont plus des phases. P1 à P6 et P9 gardent leur numéro et
  leur contenu. Les numéros 7 et 8 ne sont pas réattribués : les rapports et
  mandats qui les citent restent justes. L'historique l'explique.
- Le contenu de P7 et P8 est réparti :
  - digest et préparation vont dans Shyrka 2 ;
  - le dialogue sur mémoire et preuves va dans Shyrka 3, qui reprend aussi
    l'ancienne porte P8 ;
  - son local et Ollama vont dans Shyrka 1 ;
  - présence et identité vont dans l'atelier de P9 ;
  - la voix distante payante passe dans les chantiers en attente.
- P0 validée devient le prérequis de Shyrka 2 à 4. Shyrka 1 tourne sous la
  version 0 et ne l'attend pas.
- Points des mandats portés en P1 (Shyrka 1, `/oia`) et en P4 (Bifrost).
  Trois décisions ouvertes ajoutées.
- Mermaid : schéma d'architecture et schéma de la roadmap mis à jour, et un
  schéma de la piste ajouté dans CADRE.md. Les trois se rendent sans erreur
  avec mermaid 11.4.1 dans Chromium.
- CADRE.md : section « Piste Shyrka » et fichier d'identité ajoutés, marqués
  « ajout 3.6, à valider par Mickaël ». La ligne de version signée
  (« Version 1 · 2026-11-07 · Mickaël Thomas ») n'a pas été touchée.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `@oia/web` : typecheck, tests (9), build statique (17 pages) | vert |
| `@oia/shyrka` : typecheck, tests (30) | vert |
| Monorepo `turbo run typecheck test --continue` | 32 / 34 vertes ; les 2 rouges sont **antérieures** à la session (ci-dessous) |
| `registry validate`, `knowledge validate` | valides |

**CI de `main` déjà rouge avant cette session, hors de ma zone** :
`@oia/visibility-console` échoue au typecheck (`apps/visibility-console/src/cli.ts:129`,
TS1360 sur un objet mission) et au test (« No test files found »). Constaté
à l'identique sur `18f936a`, avant mon premier commit. Non corrigé : ce paquet
n'est pas dans mon périmètre.

## Questions pour Mickaël

1. **Mandats v6 et v7** : peux-tu pousser `infra/visibility/mandats/` ? Il
   faut ensuite vérifier les blocs C, B, D, E et F contre ce rapport.
2. **`/oia`** : le contenu proposé (identités, phases, piste Shyrka)
   convient-il ? Faut-il l'allumer en Preview Vercel ?
3. **Shyrka 1** : quel modèle Ollama veux-tu pour l'essai ? Le guide propose
   `mistral-small3.2`, sans certitude sur le nom exact du jour.
4. **Identité version 1** : après le premier essai, veux-tu activer la voix
   en sortie (Aurélie) ? Il faut alors une décision écrite dans CADRE.md.
5. **CADRE.md** : valides-tu les ajouts 3.6, à savoir la piste Shyrka, le
   fichier d'identité et P0 comme prérequis de Shyrka 2 à 4 ?
6. **Roadmap 3.6** : faut-il un jour renuméroter (P9 en P7) ? J'ai gardé P9
   pour ne pas casser les références.
7. **CI rouge sur `visibility-console`** : qui la répare ? La session Mac,
   puisque c'est hors de ma zone ?

---

# Suite de la session · réponses de Mickaël

Mickaël a répondu aux questions ci-dessus et a indiqué que les mandats étaient
désormais sur `main`. Tout a été poussé directement sur `main`.

## Les mandats v6 et v7 sont toujours absents

`infra/visibility/mandats/` contient trois fichiers, tous déjà exécutés : les
mandats de nuit du 2026-11-08 en versions 1, v3 et v5.2 (commit `7a79b8b`). Les
fichiers `MANDAT-2026-11-07-v7-suite-J0.md` et `MANDAT-2026-11-07-v6.md` ne sont
ni sur `main` ni sur une autre branche. Je n'ai donc toujours pas pu comparer
mon travail à leur texte. J'ai travaillé à partir des réponses de Mickaël, qui
décrivent le bloc F et le bloc B.

- **Blocs C et E du mandat v6 : non traités.** Aucun texte ne les décrit, et je
  n'ai rien inventé. Ils restent à faire dès que le mandat v6 sera poussé.
- Les blocs B et F sont faits d'après les descriptions de Mickaël. Ils restent
  à confronter au texte des mandats.

## Commits de cette suite

| Commit | Contenu |
|---|---|
| `6ad2d67`, `fd20668` | CADRE.md : identité choisie par Shyrka ; apparence v0 « Lovable Shyrka v0 », jamais modifiée par Claude Code |
| `80c07c9` | CADRE.md, réponse 4 : phrase complète (« dans les limites de ce cadre. Personne ne les retouche à sa place. ») ; Aurélie devient une proposition de départ ; ajouts marqués « à valider » |
| `fadc98e` | Ollama : `qwen3:8b` par défaut, `mistral-small` en comparaison (`--comparer`) |
| `18d2a9f` | Bloc B : paliers de permission, agent courrier et WhatsApp, mode entretien |
| `9407833` | Bloc F refait : interface OIA portée du prototype Lovable, Preview seulement |
| `e5bc2e2` | Roadmap 3.8, CADRE.md (renvoi aux paliers, « à valider ») |
| ce commit | Ce rapport |

## Réponses appliquées

1. **Bloc F refait d'après le prototype Lovable.** Détail dans
   `docs/interface/oia-interface-web.md`.
   - **Source.** La branche `lovable/oia-visibility-prototype` ne contient ni la
     colonne des modules ni Shyrka. Ces éléments n'existent que dans le projet
     Lovable « OIA Dashoard » lui-même. Je l'ai lu sans le modifier, au commit
     `c6470e86` ; seul l'outil `read_file` a servi.
   - **Ce qui est porté.** La colonne des modules, l'accueil OIA, Visibility
     (onglets, vue d'un site, ajout d'un compte), Shyrka en page, en panneau et
     en plein écran, les modules et l'espace Personnel.
   - **Pages existantes réutilisées.** Les modules Funding, Tenders, Ventures,
     Signals et CRM renvoient aux vraies pages de la console.
   - La page de lecture précédente est supprimée.
   - **Séparation des styles.** La console et `/oia` ont chacune leur layout
     racine (groupes de routes Next). Les styles Tailwind du prototype ne
     touchent donc jamais la console, et les URL de la console ne changent pas.
2. **`/oia` allumée en Preview seulement.**
   - La règle est dans le code (`apps/web/oia-flag.mjs`) et figée au build :
     production éteinte même si la variable est posée, Preview allumée, local
     et CI éteints.
   - Vérifié sur Vercel : en production, `/oia/` répond « Interface OIA
     désactivée », avec `noindex`.
   - Un push sur la branche de session ne déclenchait pas de Preview, parce que
     Vercel ne redéploie pas un commit déjà déployé sur `main`. J'ai donc créé
     un déploiement Preview de la branche `claude/magical-ptolemy-pi6g34` par
     l'API Vercel. Il est protégé par l'authentification Vercel.
   - **Résultat, vérifié le 2026-11-07 à 17:13 UTC.** Sur le déploiement
     Preview `oia-ppgl9i3ig-mickaels-projects-6a9e3bf2.vercel.app`
     (alias `oia-git-claude-magical-ptolem-29dbec-…`), `/oia/shyrka/` affiche
     l'interface complète : colonne des modules, présence, conversation et
     journal. En production (`oia-r4x56brjl-…`), `/oia/` reste éteinte. La
     variable `VERCEL_ENV` est donc bien lue au build.
3. **Ollama.** `qwen3:8b` par défaut, `mistral-small` en comparaison.
   - Je n'ai pas pu vérifier les noms dans la bibliothèque : `ollama.com` et
     `registry.ollama.ai` sont bloqués par le réseau de la session.
   - `qwen3:8b` est confirmé par des sources secondaires (environ 5,2 Go).
     Pour Mistral Small, `mistral-small` est le nom de la famille ; le README
     explique comment vérifier les deux noms sur le Mac (`ollama list`,
     `ollama show`).
   - Le raisonnement de qwen3 est coupé par défaut, pour des réponses courtes.
4. **Identité.** Pas de version 1 imposée. La phrase est ajoutée à CADRE.md et
   marquée « à valider ».
   - **Écart volontaire, à trancher.** Ta réponse 4 donne « Version 0 de son
     apparence : une sphère de points cyan ». Ton message précédent disait au
     contraire « on ne l'appelle pas "une sphère de points cyan", mais
     "Lovable Shyrka v0" ; elle ne doit pas être changée par Code ». J'ai
     gardé le nom « Lovable Shyrka v0 », sans la description. Dis-moi si tu
     veux les deux.
   - Aurélie devient « simple proposition et voix de départ ; Shyrka choisira
     sa voix dans le futur ».
5. **Ajouts à CADRE.md** : tous marqués « à valider ».
6. **P9** n'est pas renumérotée.
7. **CI de visibility-console** : réparée par l'autre session (`a268cd1`). Le
   monorepo passe entièrement, 34 tâches sur 34.

## Bloc B (mandat v6) : d'après tes intitulés

Code dans `packages/shyrka`, documentation dans `infra/shyrka/README.md`,
56 tests.

- **Paliers de permission** (`infra/shyrka/permissions.json`).
  - Cinq paliers par canal : aucun, lire, préparer, répondre après
    validation, envoyer seule.
  - Tout est fermé. Le fichier est signé par Mickaël seul : un autre
    signataire le rend invalide, et tout reste fermé.
  - Une validation porte sur le texte exact du brouillon (empreinte SHA-256).
  - Les délégations écrites se font par catégorie. Les catégories listées
    dans `toujoursRemonter` demandent toujours une validation.
  - Swift (`swift.com`) est exclu sans lecture. Domaine à confirmer.
- **Agent courrier et WhatsApp.**
  - Un agent commun aux deux canaux : il lit, trie (les douze catégories de
    la séance 7), résume, prépare et envoie à travers les paliers.
  - Il refuse tout modèle non local et consigne chaque action dans un journal
    d'audit.
  - Seuls des adaptateurs simulés existent. La CLI `courrier` en fait la
    démonstration sur une boîte fictive.
- **Mode entretien.**
  - Les séances sont lues dans `docs/shyrka/entretiens.md`, qui reste la seule
    source.
  - Une séance suit quatre temps, avec des relances prévues ou générées. On
    peut dire « passer » ou « retirer » à tout moment.
  - L'extraction (règles, exemples, formules) est « à valider ». Les mentions
    de Swift sont signalées.
  - La fiche de séance est écrite dans le volume chiffré ou dans
    `~/oia-shyrka-data`, jamais dans le dépôt, et jamais par-dessus une
    séance existante.

## Limites et points à faire par Mickaël

- **Image du visage de Shyrka.** Elle est introuvable depuis la session :
  l'outil Lovable rend le texte, pas les octets, et l'aperçu Lovable est
  bloqué par le réseau. Il faut l'exporter depuis l'éditeur Lovable
  (`src/assets/shyrka-face-depth.jpg`) et la déposer dans
  `apps/web/public/oia/shyrka-face-depth.jpg`. Sans elle, la présence reste
  un fond nuit vide. Avec une image de substitution locale, non commitée, la
  sphère de particules cyan s'affiche bien.
- **Copie du prototype.** Un agent a recopié les fichiers Lovable depuis les
  résultats de lecture, sans somme de contrôle. À comparer une fois avec
  Lovable, `shyrka-particles.tsx` en priorité. Une fois portés, ces fichiers
  sont figés par un test d'empreinte.
- **Adaptateurs réels à choisir**, avant tout code réel :
  - e-mail : Proton Mail Bridge, API Gmail ou Mail.app ;
  - WhatsApp : l'API Business demande un numéro dédié ; les bibliothèques non
    officielles exposent le compte à un blocage.
- **Dépendances.** Tailwind 4, three, lucide et Radix sont ajoutés à
  `apps/web` en versions exactes, celles du prototype. Le prototype tourne
  avec React 19 ; la console reste en React 18.

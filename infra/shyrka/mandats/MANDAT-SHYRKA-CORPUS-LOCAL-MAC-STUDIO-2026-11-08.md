# MANDAT — SHYRKA CORPUS : dépôt simple, recherche sourcée et validation locale

**Date :** 8 novembre 2026  
**Destinataire :** Claude Code, sur le Mac Studio  
**Dépôt :** `OolalaDXB/OIA` (`main` uniquement)  
**Périmètre :** Shyrka locale et interface Lovable locale (Chrome, `localhost`)  
**Livrable attendu :** une fonctionnalité réellement utilisable pour déposer, consulter et valider ses connaissances sans terminal ni manipulation de JSON.  
**Statut :** mandat prêt à transmettre — **aucune implémentation ni déploiement n'a été exécuté par l'auteur de ce document**.  
**Code de référence vérifié dans GitHub :** `main` au SHA `082925b917a69c75efb6a905720e18d3b98c0681`. **Revérifier le SHA et les changements locaux avant de travailler.**

---

## 0. Mission en une phrase

Permettre à Mickaël de **glisser un document dans l'interface Shyrka ou dans un dossier Finder**, de voir ce qui est accepté, d'en rechercher les informations avec des références vérifiables, puis de **valider explicitement** les décisions et connaissances que Shyrka propose d'en retenir.

**Ne pas construire un deuxième cerveau.** Shyrka doit continuer à utiliser la mémoire locale chiffrée et le moteur du Corpus existants. Aucun fichier ni information privée ne doit partir sur Vercel, Supabase, GitHub ou un fournisseur de modèle distant.

### Principes non négociables

1. **Mac Studio seulement**, interface locale. Pas de tunnel, relais, iPad, Cloudflare, Tailscale ni accès distant dans ce mandat.
2. **Une source, une référence** : les documents de projet restent dans leur dépôt d'origine ; les imports personnels résident sur le volume chiffré ; index et souvenirs sont dérivés et reconstruisibles.
3. **Aucun souvenir inféré comme vérité sans validation de Mickaël.** Le document consultable, la proposition de mémoire et le souvenir validé sont trois états distincts.
4. **Refus avant ingestion** des sources Swift/employeur, des informations de tiers non autorisées, des secrets et pièces d'identité. Un filtre automatique ne suffit pas à garantir cette exclusion : l'incertitude entraîne une quarantaine et une décision humaine.
5. **Mode privé respecté** : aucune persistance d'un nouveau dépôt, d'un extrait ou d'une proposition pendant le mode privé. Préciser explicitement les effets sur l'accès aux connaissances préexistantes selon la politique de l'ADR 0004.
6. **Silence par défaut** : aucun TTS, briefing, annonce périodique ou redémarrage automatique déclenché par le watcher, l'indexeur ou les tests. Les notifications sont visuelles, non vocales sauf demande expresse.
7. **Aucune nouvelle dépense API et aucun appel à un modèle cloud.** Utiliser les ressources locales déjà en place. L'extraction de connaissance par LLM peut rester optionnelle si la précision et la validation ne sont pas établies.
8. Travail sur **`main` uniquement**, pas de branche ni worktree. Préserver les modifications locales. **Aucun push ni déploiement Vercel** sans accord explicite.
9. **Pas d'installation opaque** de bibliothèques, exécutables ou services ; documenter les dépendances, vérifier leur licence et demander l'accord si installation substantielle.

---

## 1. État exact de l'existant — ne pas le dupliquer

| Brique | Existant confirmé dans le dépôt | Ce qu'il faut faire |
| --- | --- | --- |
| Catalogue OIA | `infra/shyrka/executive/catalogue.json`, **18 sources** initiales de dépôt OIA | Préserver les 18 entrées, étendre sans y mettre de sources ou de chemins personnels |
| Moteur de recherche | `infra/shyrka/src/executive/corpus.ts` : FTS5, `Corpus.indexer()` / `Corpus.chercher()`, citations chemin/ligne/version/date | Réutiliser et étendre les connecteurs, ne pas remplacer SQLite |
| Types de sources | Schéma actuel : `connecteur: "depot-git"`, chemin relatif au dépôt OIA | Ajouter proprement des connecteurs pour fichiers locaux validés et dépôts locaux externes |
| Stockage chiffré | `infra/shyrka/src/memoire/volume.ts`, volume obligatoire `/Volumes/Shyrka-corpus` | Réutiliser `dossierVerifie()` ; **fail closed** si le volume est absent / non chiffré |
| Mémoire | `infra/shyrka/src/memoire/sqlite.ts` et `commandes.ts`, voie explicite « Retiens que… » | Créer propositions de voie 2 et validation, sans dupliquer les souvenirs |
| Passerelle locale | `infra/shyrka/src/passerelle/serveur.ts` et `main.ts`, uniquement `127.0.0.1`, jeton et protections Host/Origin | Étendre par routes `/v1/corpus/...` sans affaiblir l'authentification |
| Front Lovable | `prototypes/oia-prototype/src/routes/shyrka.tsx`, onglet **Sources**, client `src/lib/shyrka-locale.ts` | Ajouter un onglet **Corpus** ou enrichir Sources, selon audit UX : ne pas casser la conversation |
| Voix | Whisper local, voix locales, pipeline fonctionnel via passerelle | Réutiliser uniquement pour notes vocales et commandes explicites ; aucun son automatique |
| Règles de mémoire | `docs/shyrka/adr/0004-memoire-et-connaissances.md` | Respecter l'emplacement de référence, les trois voies, les exclusions et l'oubli |
| Plan d'import | `docs/shyrka/corpus-inventaire.md` | Respecter brut / extrait / validé et l'ordre des sources |

**Avant codage :** lire ces fichiers et le code local réel ; détecter les changements non poussés de Claude Code. Le SHA ci-dessus n'est qu'un instantané GitHub. Si une fonctionnalité existe déjà localement, la vérifier et l'améliorer, **ne pas la reconstruire**.

---

## 2. UX : un module « Corpus » simple, dans Shyrka

La page locale `/shyrka` doit présenter un accès clair **Corpus** avec trois opérations primaires :

### A. Ajouter

- Zone de glisser-déposer visible, bouton **Choisir des fichiers**, bouton **Ajouter une note**, option **Ajouter un dossier local** si faisable sans permissions excessives.
- Formats de la première livraison : **`.txt`, `.md`, `.pdf` contenant du texte, `.docx`**, sous réserve de parseurs locaux sûrs. Formats audio (`.m4a`, `.mp3`, `.wav`) dans le jalon suivant via Whisper local ; si non livrés, afficher **« Audio : prochain jalon »** et ne pas les accepter silencieusement.
- Les fichiers PDF scannés sans couche texte ne sont **pas réputés lus**. Afficher « Texte absent / OCR requis » et ne pas faire de reconnaissance optique hors mandat.
- Au dépôt : demander **projet/compartiment**, type de source, origine et droits ; proposer une catégorie par défaut **« Personnel — Mac seulement »**, jamais « agent ».
- Afficher la prévisualisation du texte extrait, le contrôle de confidentialité et l'état **À vérifier / Refusé / Prêt à indexer / Indexé / Échec**.
- Pour les sources ambiguës (Swift, données de tiers, secrets), refuser ou arrêter le traitement et demander une version nettoyée ; ne pas conserver le contenu refusé dans le Corpus.
- Demander une confirmation **« Ajouter au Corpus »** avant l'indexation et permettre **Annuler**.
- États vides et erreurs en français, précis et récupérables ; pas de faux succès.

### B. Consulter

- Recherche plein texte en français d'abord, puis multilingue si prise en charge prouvée.
- Filtres : projet, type de source, statut, date d'ajout, autorisations, dernière indexation.
- Chaque résultat : titre, projet, provenance, extrait, **chemin ou identifiant**, section/page/ligne selon format, version ou empreinte, date source, date d'indexation, statut.
- Actions : **Voir l'origine**, **Rechercher dans la source**, **Réindexer**, **Retirer du Corpus** (sans effacer le fichier original sans confirmation explicite).
- Distinguer **document de référence consultable**, **observation datée**, **proposition à confirmer** et **souvenir validé** ; ne jamais afficher une hypothèse d'IA comme décision de Mickaël.
- Si une source est supprimée, révoquée ou modifiée, l'index doit refléter l'état sans ressortir un extrait ancien comme actuel.

### C. Valider

- Vue **« À confirmer »** : propositions extraites de documents ou de conversations (voie 2 ADR 0004).
- Montrer : énoncé proposé, type (préférence, décision, travail, expérience), projet, **citation exacte / source / date**, raison de proposition, degré d'incertitude, portée proposée.
- Actions **Valider / Corriger / Refuser / Reporter**. Aucune validation automatique. Validation explicite et enregistrée, avec trace de qui et quand.
- Enregistrer les souvenirs validés dans l'interface mémoire locale déjà présente, **pas dans une deuxième base concurrente**. Vérifier les doublons et contradictions avec souvenirs existants.
- Grouper les propositions : maximum 5 à 10 par lot, sans sollicitation pendant la conversation ; éviter l'« avalanche de cartes ».

### D. Une présentation légère

- Réutiliser le système de design Lovable OIA actuel, sans refonte du cockpit ni ajout d'une page d'administration lourde.
- Ligne d'état sous le titre : **« Volume chiffré actif »**, **« 18 sources OIA + N sources privées »**, **« X propositions à confirmer »** ; chiffres issus des données réelles.
- Barre d'actions : **Déposer**, **Rechercher**, **À confirmer**.
- Prévoir des écrans mobiles, mais **ne pas ouvrir l'accès depuis un autre appareil**.
- Le module reste utilisable **sans micro et sans TTS**.

---

## 3. Stockage physique et catalogue : aucune copie inutile

### A. Catalogue Git versionné : intact

`~/OIA/infra/shyrka/executive/catalogue.json` reste le catalogue des **documents non sensibles du dépôt OIA** (18 sources, enrichissables après audit). Il ne doit contenir ni chemin personnel confidentiel, ni extrait de conversation, ni noms de fichiers privés révélateurs, ni secret.

### B. Catalogue personnel privé : à créer dans le volume chiffré

Proposer, suivant l'architecture actuelle, un **registre local SQLite ou JSON sécurisé** sous :

`/Volumes/Shyrka-corpus/connaissances/catalogue-prive.sqlite` (ou fichier équivalent versionné au niveau du schéma, **non suivi par Git**).

Ce registre contient seulement les métadonnées : identifiant source, origine, type de connecteur, projet, droits, hash, date, statut, chemin canonique ou identifiant opaque, taille, date d'indexation, éventuelle révocation. Les droits initiaux sont **`mickael` uniquement**, sauf validation explicite d'un autre acteur.

Le moteur de lecture compose **catalogue Git + catalogue local** en mémoire. En cas de collision d'identifiants, erreur explicite et aucun changement de source masqué. Une entrée privée n'est jamais recopiée dans le JSON de Git.

### C. Contenu privé : sur volume chiffré uniquement

Arborescence visée, après audit de l'existant, sans écrasement :

```text
/Volumes/Shyrka-corpus/
  brut/
    ia/chatgpt/
    ia/claude/
    ia/gemini/
    ia/grok/
    ecrits/
    entretiens/
    memos-vocaux/
  extrait/
    decisions/
    regles/
    formules/
    exemples/
  valide/
    decisions/
    regles/
    formules/
    exemples/
  connaissances/
    corpus.sqlite
    catalogue-prive.sqlite        # proposition, à arbitrer selon code existant
  memoire/
    memoire.sqlite
  journal/
    imports.md
    retraits.md
```

**Important :** les noms de dossiers ci-dessus sont des destinations **logiques**. Les documents exclus ne doivent pas arriver dans `brut/`. Pour la préanalyse, utiliser un **espace d'attente sécurisé et non indexé, distinct du Corpus logique**, par traitement en mémoire si la taille le permet ou stockage temporaire chiffré avec purge déterministe après validation/refus. Ne jamais créer une copie temporaire en clair sous `/tmp`, `Downloads` ou le dépôt. Si aucune telle protection n'est démontrable, **refuser l'import**.

### D. Documents des autres projets

SILLON, Maisons, Coach Gari, BEAU Solo, BEAU et myOolala ne doivent **pas être dupliqués** dans le volume par défaut. Faire pointer un connecteur **lecture seule** vers les documents retenus des dépôts locaux, avec racine canonique autorisée, chemins relatifs, empreintes et règles de synchronisation. Le moteur ne doit lire ni `.env`, ni secrets, ni fichiers générés sensibles, ni dossiers clients. Une modification d'un dépôt source met à jour son index, pas une copie manuelle.

**Pas de scan récursif automatique du `~/` ou de tout GitHub.** Le propriétaire choisit le dossier, le projet et les types de documents à autoriser. Un changement des droits d'accès doit être explicite et traçable.

---

## 4. Parcours du document : du dépôt à la connaissance

```text
Action explicite de Mickaël
  → fichier ou note reçu localement
  → validation du type et de la taille
  → détection de contenu exclu / données personnelles / secrets
  → refus ou prévisualisation locale
  → confirmation d'import
  → enregistrement du brut admis dans le volume chiffré (ou référence lecture seule à son fichier source)
  → extraction locale avec provenance
  → indexation FTS5 par document
  → document consultable avec citations
  → propositions de connaissances au statut « à confirmer »
  → validation/correction/refus humain
  → souvenir validé dans la mémoire canonique
```

### Format de référence par source

Chaque enregistrement doit porter au minimum :

| Champ | Rôle |
| --- | --- |
| `source_id` | Identifiant stable, jamais dérivé directement d'un nom de fichier privé |
| `origine` | Upload local, note, document de dépôt, entretien ou export |
| `compartiment` | `personnel`, `projet:<slug>`, `module:<nom>`... |
| `type` | PDF, DOCX, MD, TXT, audio, etc. |
| `proprietaire`, `droits` | `mickael` seul par défaut ; droits jamais hérités silencieusement |
| `statut` | Refusé, à vérifier, autorisé, indexé, en erreur, révoqué |
| `chemin_canonique` | Accessible uniquement côté Mac, jamais divulgué à un site distant |
| `hash_contenu` | SHA-256 pour version/dédoublonnage |
| `date_source`, `date_import` | Historique et fraîcheur |
| `ref_extrait` | Page, section, paragraphe, lignes ou horodatage pour audio |
| `derive_de` | Traçabilité de tout résumé/proposition dérivée |

**Pour les PDF/DOCX**, ne pas inventer de numéros de ligne : citer une page PDF si le parseur le permet, ou paragraphe/section et hash. Les citations doivent permettre de retrouver le passage réellement utilisé.

### Idempotence et provenance

- Réimporter un fichier inchangé n'ajoute pas deux sources ni deux souvenirs ; proposer **« Déjà présent »**.
- Si un document change, conserver l'identité source, indexer la nouvelle version et ne plus servir l'ancienne comme actuelle.
- Si une source est retirée, supprimer l'index et les dérivés associés ou les marquer non servis selon ADR 0004. Ne pas réintroduire les connaissances oubliées via une réindexation.
- Le document brut admis et le souvenir validé restent des objets distincts.

---

## 5. Trois connecteurs à livrer, par ordre de priorité

### Connecteur 1 — Fichier local importé (MVP)

- Formats texte : TXT (UTF-8) et MD ; PDF textuel et DOCX après audit des parseurs sûrs.
- Taille limite configurable et affichée (proposition : **25 Mo par document**, maximum **100 Mo par lot** pour le MVP ; tester sur fichiers réalistes).
- Seul le serveur local reçoit le fichier via la passerelle ; **aucun navigateur tiers, cloud ni backend Vercel**.
- Lecture par flux borné ; contrôle MIME réel, pas seulement l'extension ; refuse fichiers exécutables, HTML actif, macros et archives non prises en charge.
- Ne pas écraser silencieusement un fichier du même nom ; indexer par identité/hash, nom d'affichage non autorisant.

### Connecteur 2 — Note courte et note vocale (MVP ou jalon 2)

- Bouton « Ajouter une note » : titre, projet, texte. Prévisualiser puis confirmer.
- Note vocale volontaire : captation limitée (proposition : 5 minutes), transcription **Whisper locale**, texte éditable avant confirmation. Pas d'enregistrement permanent du micro ; aucun feedback vocal automatique.
- Stockage de l'audio brut **uniquement si Mickaël choisit « conserver l'original »** et si la politique d'admission le permet. Sinon conserver seulement la transcription admise, avec provenance.
- Commande facultative « Shyrka, prends une note » à traiter selon les permissions ; ne pas déclencher l'écriture sur une simple conversation.

### Connecteur 3 — Dossier Finder surveillé (jalon après MVP)

- Expérience : dossier nommé **« Déposer dans Shyrka »**, à un emplacement clair sur le **volume chiffré monté**, et accès facile via favori Finder/alias ; si raccourci sur Bureau, **alias vers le vrai dossier**, jamais une copie non chiffrée.
- Un watcher local détecte les **fichiers achevés d'être copiés** (taille stable, délai de stabilisation), ignore temporaires et sous-dossiers non explicitement autorisés ; ne suit aucun lien symbolique hors racine.
- Détection = **proposition d'import**, pas indexation automatique : notification visuelle **« 3 fichiers à examiner »** ; aucun TTS, aucune question vocale répétitive.
- L'utilisateur valide le lot dans le module Corpus. Une importation refusée n'est pas conservée dans le Corpus.
- Le watcher est **désactivé par défaut** puis opt-in, peut être mis en pause et arrêté par un bouton. Le démarrage automatique au login est **hors périmètre** sauf accord explicite.
- Si le volume est démonté : watcher arrêté proprement et zéro fallback vers un dossier non chiffré.

### Connecteur 4 — Dépôts locaux multi-projets (jalon suivant)

- Autoriser un dépôt Git local explicitement choisi ; lire **uniquement des chemins et extensions approuvés** (`docs/`, ADR, README, rapports filtrés).
- Ne jamais écrire, committer, pousser, installer un hook ni modifier les dépôts d'origine.
- Préciser propriétaire du dépôt, projet, confidentialité, exclusions et statut. Une source supprimée ou révoquée doit disparaître de la recherche sans attendre un redémarrage.

### Exports IA / ZIP — hors premier MVP

Préparer le contrat pour futurs exports ChatGPT/Claude/Gemini, **sans importer automatiquement une archive brute**. Certaines conversations personnelles peuvent contenir Swift, des secrets ou des informations de tiers ; filtration préalable, revue et preuves sont obligatoires. Décompression à risques (zip-slip, bombes, fichiers joints, symlinks) hors MVP tant qu'un parseur sûr et des tests ne sont pas disponibles.

---

## 6. Architecture applicative

### Backend : étendre la passerelle locale actuelle

Réutiliser `infra/shyrka/src/passerelle/serveur.ts` et les mécanismes Host/Origin/jeton existants. Proposer des routes de **conception**, à confirmer contre l'implémentation locale :

```text
GET    /v1/corpus/etat                  état volume/catalogues/index/droits
GET    /v1/corpus/sources               liste filtrée et paginée
POST   /v1/corpus/preparer              analyse d'un document en flux borné (sans validation)
POST   /v1/corpus/confirmer             confirme source autorisée et indexation
POST   /v1/corpus/note                  note texte volontaire, puis confirmation
GET    /v1/corpus/rechercher?q=...      recherche avec citations
GET    /v1/corpus/propositions          propositions à confirmer
POST   /v1/corpus/propositions/:id      valider / corriger / refuser / reporter
POST   /v1/corpus/sources/:id/reindexer demande de réindexation
POST   /v1/corpus/sources/:id/retirer   retrait ou révocation, confirmation
GET    /v1/corpus/watch/etat            statut watcher
POST   /v1/corpus/watch/configurer      activer / pause / arrêter, après consentement
```

- Les routes sont **un contrat cible, pas des endpoints existants**. Conserver la version `/v1` ou créer `/v2` si incompatibilité ; maintenir le client vocal actuel.
- **Pas de chemin de fichier arbitraire contrôlé par le navigateur** : uniquement identifiant opaque attribué par le serveur et racines autorisées ; vérifier confinement, `realpath`, droits et symlinks.
- Le jeton de la passerelle reste côté **proxy local** et ne sort jamais dans le bundle navigateur, les URLs ou logs. Ajouter tests négatifs de CSRF, Host, Origin, CORS, taille et types de contenus.
- Prévoir streaming d'upload si nécessaire, sans accumulation illimitée en RAM. Sessions temporaires expirées et purgées même après crash.
- Journalisation sans contenu sensible : `source_id`, action, état, horodatage, hash tronqué ; éviter les titres privés dans les logs par défaut.
- L'indexation et l'extraction doivent être **asynchrones mais observables dans l'interface**, avec progression et possibilité d'annuler, sans promettre de travail quand la passerelle est arrêtée.
- Aucune entrée du Corpus ne doit être interprétée comme une instruction d'agent. Le contenu injecté au modèle reste balisé **donnée non fiable** et limité en taille.

### Front : réutiliser Lovable

- Réaliser un composant **Corpus** dans la zone Shyrka, si possible en gardant `Sources` comme sous-vue d'administration ; choisir le moindre changement UX et expliquer la décision.
- Réutiliser `prototypes/oia-prototype/src/lib/shyrka-locale.ts` (client du proxy local `/shyrka-local/v1`) et les conventions React/TanStack en place.
- Respecter la convention actuelle : **Lovable possède le visuel ; Claude Code possède le moteur, les contrats et les tests**. Si édition front directe nécessaire, suivre le workflow Git/Lovable existant, sans créer un design concurrent.
- États UI obligatoires : **volume absent, non chiffré, index vide, chargement, rejet, erreur de parseur, réussite réelle, import doublon, validation manquante, mode privé, watcher arrêté**.
- Pas de simulation présentée comme de vraies connaissances.

---

## 7. Confidentialité, politique d'admission et sécurité

**La fonctionnalité d'upload est une frontière de sécurité, pas juste un formulaire.**

- **Exclure** toute donnée appartenant à Swift (documents/emails/notes/clients), données clients non autorisées, clés, mots de passe, comptes financiers, pièces d'identité et médias sensibles. Les détecteurs peuvent assister, **pas garantir** qu'un fichier est sûr ; en cas d'incertitude refuser et demander une version expurgée.
- Toute source personnelle est `local_seulement` et accessible uniquement au demandeur propriétaire par défaut. Ne pas accorder implicitement les lecteurs `conversation`, `cockpit` et `agent` tels que définis dans les 18 sources publiques du catalogue OIA.
- Séparer **ce que la conversation personnelle de Mickaël peut lire sur Mac** de ce qu'un agent autonome ou un site peut lire. Le droit de recherche doit être évalué avant extraction et avant affichage.
- Limites de ressources : taille max, nombre max, temps max parseur, profondeur, compression, nombre de pages, antivirus ou protection native si disponible ; prévenir attaque par fichier malformé.
- Aucun envoi à Mistral, ElevenLabs, Gemini, Claude, OpenAI, Supabase ou Vercel sans autorisation distincte. Dépendances locales seulement.
- Ne pas traiter HTML/Markdown importé comme du HTML exécutable dans le navigateur. Échapper les contenus, refuser scripts et liens malveillants.
- **Oubli** : effacer propositions, extraits, dérivés, index et références mémorielles conformément au mécanisme existant et aux registres anti-réintroduction. Les sauvegardes ne doivent pas faire renaître un souvenir oublié.
- Import refusé : ne conserver ni fichier brut, ni contenu extrait, ni transcription, ni cache. Pour audit, un code de refus sans contenu et sans titre personnel peut être retenu localement si compatible mode privé.
- Mode privé : empêcher préparation, import, surveillance, extraction persistante et création de proposition ; afficher pourquoi dans le bouton Ajouter.
- Tests de retrait et de confidentialité **avant** tout test UX réussi.

---

## 8. Plan d'exécution en 5 lots indépendants

| Lot | Livrable démontrable | Acceptation minimale |
| --- | --- | --- |
| **L0 — Audit et contrat** | Inventaire du code réel, chemins, fonctionnalités, limites, schémas/API/UI ; protection sauvegardes | Aucun fichier modifié sans état des lieux, résultat documenté |
| **L1 — Dépôt + index texte** | Glisser-déposer TXT/MD puis PDF/DOCX sûrs, prévisualisation, classification, confirmation, index local | Dépôt → recherche avec source, après redémarrage ; silence garanti |
| **L2 — Validation des connaissances** | File de propositions, valider/corriger/refuser, mémoire canonique, anti-doublons | Un extrait non validé n'est pas restitué comme décision confirmée |
| **L3 — Finder et notes** | Note rapide + watcher opt-in ; transcription audio locale si possible | Ajout via Finder détecté mais non ingéré sans validation ; arrêt watcher immédiat |
| **L4 — Dépôts externes et robustesse** | Connecteur lecture seule multi-projets, suppression/réindexation, rapport de performance | Changement d'un document source répercuté sans copie et sans fuite |

**Ne pas déclarer « livré » si seuls les composants UI sont visibles.** Chaque lot doit produire un test réel sur le Mac Studio avec volume monté et un rapport, pas uniquement des mocks.

---

## 9. Scénarios d'acceptation réels obligatoires

1. **Document ordinaire :** déposer une note fictive de test (projet OIA), choisir compartiment, prévisualiser, confirmer, chercher une phrase, voir citation et version ; relancer la passerelle et retrouver le document.
2. **Décision :** depuis un document de test, Shyrka propose « La stratégie du projet fictif X est… » ; le statut est `a_confirmer`. Après validation, la mémoire la restitue comme validée ; avant, jamais.
3. **Correction :** rectifier une proposition validée ; l'ancienne décision n'est plus retournée comme actuelle, même après réindexation.
4. **Doublon :** déposer deux fois le même fichier, vérifier une seule source active et zéro doublon mémoire.
5. **Révocation :** retirer une source ; elle disparaît de la recherche et les dérivés interdits ne ressurgissent pas.
6. **Secret / données exclues :** échantillon de test avec fausse clé API, fausse mention Swift et données de tiers. L'ingestion refuse sans copier le brut ni garder d'extraits dans l'index. Les faux positifs sont consignés sans contenu.
7. **Chemin piégé :** lien symbolique, `../`, double extension, MIME incohérent, macro DOCM, PDF malformé, ZIP ou autre archive inattendue ; refus propre.
8. **Volume démonté :** aucune écriture ailleurs, UI explicite ; retester après remontage du volume.
9. **Mode privé :** impossibilité d'ajouter, d'indexer, de générer des propositions persistantes ; pas d'historique en clair ni de TTS spontané.
10. **Dossier surveillé :** copier un fichier dans « Déposer dans Shyrka » ; afficher « à examiner », sans import automatique ; ignorer fichier incomplet ; désactiver watcher et constater l'arrêt.
11. **Provenance PDF/DOCX :** citation vérifiable page ou paragraphe, pas de numéro de ligne fictif.
12. **Projet externe :** ajout explicite d'un dossier `docs/` d'un dépôt de test ; aucune lecture du `.env` ni des fichiers client ; modification prise en compte après réindexation.
13. **Audio facultatif :** enregistrer une note courte avec consentement, corriger la transcription, refuser puis réessayer ; pas d'original persistant sans choix explicite.
14. **Aucune régression Shyrka :** 3 tours vocaux sur Chrome local, réponse dans la bonne langue/voix, Corpus existant consultable, mode privé et interruption préservés ; aucune prise de parole non sollicitée durant au moins 15 minutes de fonctionnement de test.

**Mesures à reporter :** temps extraction/indexation pour 1, 10 et 50 fichiers tests ; erreurs ; précision du filtrage de secrets ; taux de citations vérifiables ; faux souvenirs proposés ; stockage disque ; effets sur temps de réponse vocal. Toute performance non testée doit porter la mention **NON TESTÉ**.

---

## 10. Livrables pour Mickaël

1. Interface **Corpus** réellement disponible sur **Mac Studio**, sur la route locale Shyrka habituelle.
2. Guide court en français (une page) : « Glisser un document », « Voir la source », « Valider un souvenir », « Arrêter le dossier surveillé ».
3. Commandes de diagnostic et d'arrêt de la passerelle / watcher ; ne pas laisser de processus orphelins.
4. Inventaire de ce qui a changé, fichiers/dépendances, tests, statut par lot, SHA commit local, absence de push.
5. Liste honnête des limitations : PDF scannés, qualité extraction DOCX, types audio, connecteurs non encore implémentés, isolation et confidentialité.
6. Instructions de restauration/rollback **sans perte de mémoire existante** ; aucun reset silencieux de `memoire.sqlite` ou de `corpus.sqlite`.

## 11. Première instruction à exécuter par Claude Code

> Commence par auditer l'état de `main` **sur le Mac Studio** (notamment les modifications locales postérieures à `082925b`). Lis les ADR et le code réel. **Ne code pas de deuxième indexeur** ; propose le plus petit chemin de migration vers un module Corpus utilisable, puis exécute les lots L1 à L3 s'ils sont sûrs et vérifiables. Tu peux différer L4 et les imports ZIP/export IA si leurs garde-fous ne sont pas établis. Il est interdit de publier des fichiers privés, de pousser sur GitHub, d'utiliser une IA cloud ou de redéployer Vercel. Procède par tests locaux et documente chaque limite.

---

### Références dans le dépôt

- `docs/shyrka/adr/0004-memoire-et-connaissances.md`
- `docs/shyrka/corpus-inventaire.md`
- `docs/shyrka/CADRE.md`
- `infra/shyrka/executive/catalogue.json`
- `infra/shyrka/src/executive/corpus.ts`
- `infra/shyrka/src/memoire/sqlite.ts`
- `infra/shyrka/src/memoire/volume.ts`
- `infra/shyrka/src/passerelle/main.ts`
- `infra/shyrka/src/passerelle/serveur.ts`
- `prototypes/oia-prototype/src/routes/shyrka.tsx`
- `prototypes/oia-prototype/src/lib/shyrka-locale.ts`

**Fin du mandat.**

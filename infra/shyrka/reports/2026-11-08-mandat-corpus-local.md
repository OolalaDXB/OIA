# Mandat Corpus local (Mac Studio) · rapport

Mandat : `infra/shyrka/mandats/MANDAT-SHYRKA-CORPUS-LOCAL-MAC-STUDIO-2026-11-08.md`, avec les mises à jour de Mickaël qui priment : Claude Code modifie `prototypes/oia-prototype` sous supervision ; recherche dans SQLite au mode de l'ADR 0005 (sens bge-m3 + identifiants exacts), pas de PostgreSQL ; faits très privés lisibles par Shyrka locale avec son modèle local, jamais par un modèle en ligne, un agent ni le cockpit ; volumes d'essai de l'étude supprimés.

Travail sur `main` (départ `082925b`), sans branche, **aucun push, aucun déploiement**, aucune API payante, rien vers le cloud. Guide d'une page : `docs/shyrka/corpus-guide.md`.

## L0 · Audit

Existant réutilisé, pas de second indexeur ni de seconde mémoire : moteur `executive/corpus.ts` (FTS5, citations), mémoire `memoire/sqlite.ts` (voie « proposition » et statut `a_confirmer` déjà prévus, `corriger`, `oublier` avec empreintes anti-retour), garde du volume `memoire/volume.ts`, passerelle `passerelle/serveur.ts` (127.0.0.1, jeton, Host, Origin), client `src/lib/shyrka-locale.ts`. L'onglet **Sources** du cockpit est une simulation (interrupteurs locaux) : le module est un onglet **Corpus** à part, Sources laissé tel quel. Modifications locales non poussées au départ : aucune sur le périmètre.

## Livré

| Lot | Contenu | Où |
| --- | --- | --- |
| Règle des faits très privés | `peutLire` et le corpus : `mickael_seulement` lisible par une conversation au modèle local, refusé au modèle en ligne, au cockpit, aux agents | `packages/shyrka/src/memoire/contrat.ts`, `executive/corpus.ts` |
| L1 · Dépôt et index | lecture en mémoire (aucune copie en clair), type établi par le contenu, refus (exécutable, HTML, archive, macro, double extension, PDF actif ou chiffré, encodage), PDF par PDFKit et DOCX par `textutil` (macOS, sur l'entrée standard), références vraies (ligne, page, paragraphes) ; contrôle d'admission (secrets, Swift, IBAN, carte avec contrôle de Luhn, pièces d'identité ; quarantaine pour tiers, santé, salaires, exemples de secrets) ; catalogue privé `connaissances/catalogue-prive.sqlite` composé avec le catalogue Git (collision = erreur) ; fichiers admis `brut/depots/<id>/<empreinte>` ; dédoublonnage par empreinte, nouvelle version à identité constante ; retrait immédiat ; journaux sans titre ni contenu | `src/corpus/extraction.ts`, `admission.ts`, `catalogue-prive.ts`, `depot.ts`, `outils/pdf-texte.swift` |
| Recherche ADR 0005 | vecteurs bge-m3 (Ollama local) dans `corpus.sqlite`, calcul exact, canal d'identifiants (index), seuil 0,516 pour la conversation ; écran : plancher 0,40 et « pertinence faible » ; repli par les mots tant que le sens n'est pas calculé ; sens de la question calculé avant chaque tour | `executive/corpus.ts`, `src/corpus/sens.ts`, `passerelle/main.ts` |
| L2 · Validation | propositions du modèle local (au plus 5 par document, citation exacte obligatoire, sinon écartée), en mémoire canonique « à confirmer », Mac seulement ; Valider, Corriger, Refuser (oubli), Reporter (7 jours) ; souvenirs validés proches affichés ; garde anti-réintroduction exacte et par le sens ; en conversation, une proposition n'est jamais dite comme une décision | `src/corpus/propositions.ts`, `depot.ts`, `memoire/commandes.ts`, `passerelle/decision.ts` |
| L3 · Notes et dossier | note texte ; dossier « Déposer dans Shyrka » sur le volume chiffré, arrêté par défaut, fichiers stables seulement, aucun import sans confirmation, arrêt immédiat, arrêt si volume absent | `src/corpus/surveillance.ts` |
| API | `/v1/corpus/…` (état, sources, extraits, rechercher, préparer, note, confirmer, annuler, réindexer, retirer, propositions, surveillance), mêmes défenses, identifiants opaques seulement, 413 propre au-delà de 25 Mo | `passerelle/serveur.ts` |
| Interface | onglet **Corpus** : ligne d'état réelle, Déposer / Rechercher / À confirmer, états vides, refus, quarantaine, doublon, mode privé, dossier surveillé | `prototypes/oia-prototype/src/components/oia/shyrka-corpus.tsx`, `src/lib/shyrka-locale.ts`, `src/routes/shyrka.tsx` |
| Recette | `SHYRKA_RECETTE=recette/<nom>` : mémoire, corpus, fichiers et journaux sous ce sous-dossier du volume, pour essayer sans toucher la vraie mémoire | `passerelle/main.ts` |

Dépendances ajoutées : aucune. Outils macOS utilisés : `textutil`, `swiftc` + PDFKit (le lecteur PDF est compilé depuis sa source dans `~/oia-shyrka-data/outils/`).

## Tests

- Automatiques : **253 tests** de Shyrka (226 au départ) et 27 du noyau, tous verts ; typage vert (Shyrka, cockpit). Nouveaux : `test/corpus-depot.test.ts` (scénarios du mandat avec modèles fictifs), défenses HTTP du Corpus dans `test/passerelle.test.ts`.
- **Réels, sur le Mac, volume chiffré, bge-m3 et qwen3 30b locaux** (passerelle de recette, puis interface dans Chrome) :

| Scénario du mandat | Résultat réel |
| --- | --- |
| 1 · Document ordinaire, recherche, citation, version, redémarrage | conforme ; retrouvé après redémarrage |
| 2 · Décision « à confirmer », jamais restituée comme validée avant | conforme après correction (voir défauts) |
| 3 · Correction, pas de retour après réindexation | conforme après deux corrections |
| 4 · Doublon | une source, aucun doublon de mémoire |
| 5 · Révocation | invisible tout de suite, fichier admis effacé, propositions retirées, journal sans titre |
| 6 · Secret, Swift, tiers | 10 pièges sur 10 arrêtés ; quarantaine avec attestation |
| 7 · Fichiers piégés | double extension, type incohérent, DOCM, ZIP, HTML, audio, PDF malformé : refus propres ; lien symbolique ignoré par le dossier ; nom `../../` jamais utilisé comme chemin |
| 8 · Volume démonté | tests automatiques (refus, 503, dossier arrêté) ; **démontage réel NON TESTÉ** (remonter demande ton mot de passe) |
| 9 · Mode privé | ajout, note, propositions, dossier refusés (423) ; recherche possible |
| 10 · Dossier surveillé | fichier stable détecté, temporaires, cachés et liens ignorés, rien d'importé sans confirmation, arrêt immédiat |
| 11 · Provenance PDF et DOCX | « page 1 », « § 1–3 » ; PDF scanné : « OCR requis » |
| 12 · Projet externe (L4) | **NON LIVRÉ** |
| 13 · Audio | **NON LIVRÉ** (« Audio : prochain jalon » affiché, fichiers refusés) |
| 14 · Pas de régression vocale | tests automatiques de la passerelle verts ; **3 tours vocaux réels NON TESTÉS** : il faut toi au micro |

## Mesures (Mac Studio, réelles)

| Mesure | Valeur |
| --- | --- |
| Préparer + confirmer, 1 / 10 / 50 fichiers | 44 ms / 0,3 s / 1,6 s jusqu'à « indexé » |
| Sens et propositions en fond, 1 / 7 / 45 documents importés | 8 s / 45 s / 5 min 26 s (≈ 7 s par document, surtout le modèle) |
| Recherche (≈ 1 500 extraits) | 11 à 100 ms, sens de la question compris |
| Coût ajouté à un tour de conversation | sens de la question : 16 à 51 ms |
| Filtre, 61 README publics (après corrections) | 57 admis, 4 en quarantaine justifiée, **0 refus à tort** (avant corrections : 9 refus à tort, cartes sans Luhn et exemples de code) |
| Filtre, 10 pièges (clé, Swift, IBAN, carte, mot de passe, jeton GitHub, clé privée, passeport, clé AWS, contacts) | 10 sur 10 |
| Citations des propositions | 100 % vérifiables (citation exacte exigée) ; lot de mesures : 178 retenues, 87 écartées sur 265 proposées (citation introuvable, doublon, déjà connue) |
| Faux souvenirs | 0 fait inventé sur les documents fictifs après correction de la consigne ; sur 8 propositions tirées de README, toutes fidèles, forme parfois mal choisie (3 sur 8) |
| Disque (55 sources, 1 497 extraits, mémoire de recette) | index 9,1 Mo, fichiers admis 548 Ko, mémoire 460 Ko |

## Défauts trouvés par les essais réels, corrigés

1. La conversation disait « Décisions retenues » devant des propositions de l'IA : réponses séparées (décisions validées / propositions à confirmer), phrase dite corrigée.
2. Le modèle attribuait à Mickaël des décisions que le document ne lui attribue pas, et préfixait les énoncés (« décision : ») : consigne et nettoyage.
3. La ligne citée était celle du début de l'extrait : ligne exacte de la citation.
4. Une correction pouvait revenir reformulée avec une nouvelle version : garde par le sens (bge-m3, 0,9).
5. Une nouvelle version retirait toutes les propositions en attente, y compris celles encore justifiées : seules celles dont la citation a disparu sont retirées.
6. Le modèle redisait le connu au lieu du nouveau : il reçoit la liste de ce qui est déjà connu pour le document.
7. Un extrait pas encore vectorisé était introuvable, même par identifiant : identifiants et mots en attendant.
8. La recherche à l'écran s'abstenait sur des requêtes courtes pertinentes : plancher 0,40 avec « pertinence faible ».
9. Décomptes plafonnés à 100 éléments de mémoire : pagination.
10. Envoi de plus de 25 Mo : connexion coupée au lieu d'une réponse 413.

## Limites restantes

- Abstention : un seuil ne sépare pas les questions plausibles hors corpus (proximité jusqu'à 0,48) des vraies réponses courtes (dès 0,45) ; le second étage de l'ADR 0005 (le modèle juge les extraits) n'est pas branché sur la conversation.
- PDF scannés non lus (pas d'OCR) ; DOCX : paragraphes sans titres de section (`textutil` perd les styles) ; tableaux et colonnes aplatis.
- Propositions : forme parfois mal choisie ; quasi-doublons possibles sous le seuil de 0,9 ; une proposition refusée puis reformulée dans une version ultérieure peut revenir (l'oubli efface le contenu, on ne compare pas au néant).
- Le filtre aide, il ne garantit pas : un secret sans mot-clé ni format connu passe.
- Les droits « conversation » sont par source, sans portée par compartiment au-delà.
- Retirer une source garde les souvenirs déjà validés (ils sont à toi) : à oublier dans la mémoire si besoin.
- L4 (dépôts externes), audio, exports d'IA et ZIP : non livrés.
- L'index existant `corpus.sqlite` passe au schéma 2 au premier démarrage : reconstruit (annoncé dans le journal de la passerelle), sens recalculé (≈ 20 s). C'est un index dérivé ; la mémoire n'est pas touchée.

## Restauration sans perte

- Code : `git revert <commit>` (local).
- Données : la mémoire (`memoire/memoire.sqlite`) garde son schéma ; les propositions sont des éléments ordinaires « à confirmer ». Après un retour au code précédent, supprimer **seulement** `connaissances/corpus.sqlite` (index dérivé, reconstruit au démarrage depuis le catalogue Git). `catalogue-prive.sqlite`, `brut/depots/` et `journal/` sont ignorés par l'ancien code et peuvent rester.

## Environnement

Volumes d'essai de l'étude Knowledge Engine supprimés (7,2 Go). Données de recette (`recette/corpus-2026-11-08`) effacées après les essais. Passerelle de Shyrka relancée en mode normal sur ta vraie mémoire.

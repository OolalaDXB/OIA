# Shyrka English Voice V1 · compte rendu (9 novembre 2026)

Mac Studio, sur `main`, commit local, pas de push. Rien n'est parti vers ElevenLabs ni ailleurs.

## Étape 1 · Entendre la voix dans Shyrka (fait, démontré)

- MP3 approuvés trouvés sur le **Bureau** (pas dans Téléchargements) : deux fichiers différents de la même génération ElevenLabs (`…Shyrka 1_gen_s50_sim75_v4.mp3`, 27,6 s, et `… (1).mp3`, 27,1 s, téléchargés à 6 s d'écart). Faute de savoir lequel tu as retenu : le plus récent est la référence (« Tester Shyrka EN »), l'autre la « Variante ».
- Copiés dans `~/oia-shyrka-data/voix/` (droits 600, hors du dépôt).
- Page `/shyrka`, colonne de gauche sous le visage : **Tester Shyrka EN**, **Variante**, **Test local Chatterbox**, **Arrêter**. Lecture sur le Mac (`afplay`, par la passerelle authentifiée), seulement sur un clic ; « Arrêter », le bouton Couper, un mot d'arrêt (« Stop »…) ou un nouveau tour la coupent. Le moteur est affiché : « Lecture sur le Mac · moteur : Original ElevenLabs ».
- Essai réel dans Chrome : clic → `afplay …/shyrka-en-v1-elevenlabs.mp3` en cours, visage en « Parle » ; « Arrêter » → plus aucune lecture, immédiatement.

## Étape 2 · Chatterbox local

| Point | Constat |
| --- | --- |
| Installation | `~/shyrka-voix2` : Python 3.11, chatterbox-tts 0.1.7, torch 2.6.0, modèle ResembleAI en cache |
| Licence | MIT (Resemble AI) ; les sorties portent un tatouage Perth (voix synthétique) |
| Apple Silicon | MPS disponible et utilisé |
| Panne trouvée | le tatouage Perth ne se chargeait pas (`pkg_resources` absent de setuptools 84) : setuptools 80.10.2 (MIT) installé **dans cet environnement seulement**. Le tatouage n'a pas été désactivé |
| Mesures (Ollama chargé, 20 Go) | chargement 9 s ; première phrase 20,9 s (mise en route), puis 5,3 s pour 4,8 s d'audio (1,1 fois le temps réel) ; 5,3 Go de mémoire au plus ; Ollama non perturbé |
| Diction | la phrase retranscrite mot pour mot par le Whisper local |
| **Timbre Shyrka EN** | **non tenté** : la politique d'usage d'ElevenLabs (section 12) interdit d'utiliser ses sorties « pour développer, entraîner, affiner ou améliorer un modèle ou un service d'IA » et pour développer un service concurrent ; s'en servir comme référence de clonage dans Chatterbox n'est pas clairement permis. Pas de contournement. L'essai utilise la **voix par défaut** de Chatterbox, libellée comme telle |

Appréciation : je n'ai pas écouté (pas d'oreille) ; à toi de comparer le naturel et le timbre. À 5 s par phrase sans diffusion en continu, Chatterbox ne convient pas encore aux réponses de conversation.

## Étape 3 · API ElevenLabs

- Possible par l'API officielle (`POST /v1/text-to-speech/Db8EPC5H3DMmzFFWsi1D`, modèle `eleven_multilingual_v2`), payante.
- Adaptateur prêt, **désactivé** : aucune clé installée, aucune demandée. Activation : clé dans la variable d'environnement `ELEVENLABS_API_KEY` de la passerelle, ou dans `~/oia-shyrka-data/voix/elevenlabs-cle` (droits 600 ; refusé s'il est lisible par d'autres). Jamais dans Git ni le navigateur.
- Même avec une clé, seul un bouton « Nouvelle phrase par l'API ElevenLabs… », avec confirmation (« la phrase quitte le Mac et consomme des crédits »), envoie **une phrase de démonstration fixée par la passerelle** (le navigateur ne peut pas choisir le texte). **NON TESTÉ** en réel (pas de clé).
- Les réponses de conversation ne passent jamais par ElevenLabs : il faudra ta décision explicite, en sachant que les textes quitteraient le Mac. Aucun repli silencieux vers le cloud.

## Étape 4 · Architecture

- `infra/shyrka/src/passerelle/moteurs-voix.ts` : moteurs nommés (macOS, Chatterbox local, Original ElevenLabs), lecteur d'échantillons, adaptateur ElevenLabs gardé.
- Passerelle : `GET /v1/voix`, `POST /v1/voix/echantillon`, `POST /v1/voix/elevenlabs-demonstration` ; `interrompre` coupe aussi les échantillons ; chaque réponse porte son moteur de voix (affiché sous la réponse).
- Inchangés : modèle Ollama, choix de voix par langue (vérifié : français **Aurélie (Enhanced)**, russe **Milena (Enhanced)**, anglais des réponses **Ava (Enhanced)**, toutes macOS), mode privé, Whisper, Corpus, mémoire, volume et débit, aucune parole non sollicitée.
- Corrigé au passage (essai réel du soir) : la voix des réponses suit leur langue réelle, et « parle-moi en anglais » vaut pour la suite.

## Tests

278 tests de Shyrka (dont `test/moteurs-voix.test.ts` et les essais de voix de la passerelle) et 27 du noyau, verts ; typage vert (Shyrka, cockpit). Aucun test n'appelle ElevenLabs.

## Limites

- Les réponses en anglais restent dites par Ava (macOS) : la voix Shyrka EN n'existe que dans le fichier de référence tant qu'ElevenLabs n'est pas autorisé pour les réponses.
- Lequel des deux MP3 est l'approuvé : à confirmer.
- Chatterbox : voix par défaut seulement (licence), lent pour la conversation.

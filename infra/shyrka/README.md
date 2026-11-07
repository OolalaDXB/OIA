# Shyrka 1 « Te parle » · infrastructure locale

Première étape de la piste Shyrka (roadmap 3.6, livrée avec P1). Une boucle
de dialogue **entièrement locale** sur le Mac Studio :

```
Entrée (prise volontaire) → micro (ffmpeg) → Whisper (whisper.cpp) → Ollama → texte à l'écran
                                                                         └→ voix macOS (say), seulement si l'identité l'autorise
```

- Code : `packages/shyrka` (`@oia/shyrka`). Chaque maillon est une interface,
  avec un adaptateur réel et un adaptateur simulé testé.
- Identité en vigueur : `infra/shyrka/identite.json`, **version 0** (cadre,
  `docs/shyrka/CADRE.md`) : pas de voix en sortie, pas de visage. Les
  réponses s'affichent en texte. Le code ne modifie jamais ce fichier.
- Aucun appel à un fournisseur distant. L'adaptateur Ollama refuse toute
  adresse qui n'est pas la machine elle-même. Aucune prise audio n'est
  conservée : les WAV sont effacés après chaque tour.
- Aucune écoute permanente : une prise = une pression sur Entrée, 8 s par
  défaut, 30 s au plus.
- Aucune mémoire écrite : l'historique vit le temps de la session (6 tours).
  Shyrka 1 ne lit ni preuves, ni dépôts, ni données de projet.

## Premier essai réel (Mickaël, sur le Mac Studio)

Cette session web n'a eu ni Mac, ni micro, ni Whisper, ni Ollama : tout a été
testé avec des adaptateurs simulés. Voici l'essai à faire, environ 20 minutes
hors téléchargements.

### 0. Préparer (une fois)

```sh
cd ~/OIA && git pull && pnpm install
brew install ffmpeg whisper-cpp          # outils locaux, licences MIT / LGPL
mkdir -p ~/oia-shyrka-data/models
```

Modèle Whisper : télécharger `ggml-large-v3-turbo.bin` depuis le dépôt
`ggerganov/whisper.cpp` sur Hugging Face, dans `~/oia-shyrka-data/models/`,
puis comparer `shasum -a 256` à l'empreinte affichée sur la page du fichier.
Noter la valeur dans le rapport d'essai.

Ollama : l'application est déjà prévue par la roadmap (« Ollama local, dès
P1 »). Choisir un modèle texte et le télécharger, par exemple
`ollama pull mistral-small3.2` (vérifier le nom exact et la licence dans la
bibliothèque Ollama le jour de l'essai ; tout modèle déjà installé convient).

Voix Aurélie (utile seulement pour l'étape 4) : Réglages Système >
Accessibilité > Contenu énoncé > Voix du système > Gérer les voix > Français >
Aurélie.

### 1. Variables

```sh
export SHYRKA_WHISPER_MODEL=~/oia-shyrka-data/models/ggml-large-v3-turbo.bin
export SHYRKA_OLLAMA_MODEL=mistral-small3.2   # le nom donné par `ollama list`
# facultatif : SHYRKA_MICRO=":0" (périphérique avfoundation), SHYRKA_DUREE=8,
# SHYRKA_VOIX="Aurélie", SHYRKA_LANGUE=fr, SHYRKA_WHISPER_BIN=whisper-cli
```

Pour lister les micros : `ffmpeg -f avfoundation -list_devices true -i ""`
(la ligne « [0] … » des périphériques audio donne `:0`).

### 2. Diagnostic (lecture seule, n'installe rien)

```sh
pnpm --filter @oia/shyrka diagnostic
```

Attendu : sept lignes `ok`. Une ligne `MANQUE` donne la commande à lancer.
La ligne « voix macOS Aurélie » peut rester en `MANQUE` tant que l'étape 4
n'est pas visée.

### 3. Dialogue, identité version 0 (réponses en texte)

```sh
pnpm --filter @oia/shyrka parle -- --texte   # d'abord sans micro : on tape, Shyrka répond
pnpm --filter @oia/shyrka parle              # puis au micro : Entrée, parler 8 s
```

À la première prise, macOS demande l'accès au micro pour le terminal :
accepter (Réglages Système > Confidentialité > Micro). Trois phrases
d'essai : « Bonjour Shyrka, tu m'entends ? », « Qu'est-ce que tu sais de mes
projets ? » (attendu : elle dit qu'elle n'a accès à rien), « Prépare un
message pour dire que je serai en retard » (attendu : un brouillon, aucun
envoi). `q` pour quitter.

Chaque tour affiche ses durées (`ecoute`, `transcription`, `reflexion`).

### 4. Voix en sortie (seulement après décision)

Le cadre fige la version 0 : pas de voix synthétisée. Pour entendre Shyrka,
il faut d'abord **décider** la version 1 de l'identité, l'écrire dans
`docs/shyrka/CADRE.md` (date, périmètre), puis dans `identite.json`
(`"version": 1`, `"voixEnSortie": true`, nouvelle date). Sans ces deux
écritures, la CLI reste en texte. Pour un essai ponctuel sans toucher au
fichier suivi, une copie locale suffit :

```sh
cp infra/shyrka/identite.json ~/oia-shyrka-data/identite-essai.json
# éditer la copie : version 1, voixEnSortie true, date du jour
SHYRKA_IDENTITE=~/oia-shyrka-data/identite-essai.json pnpm --filter @oia/shyrka parle
```

### 5. Consigner

Écrire `infra/shyrka/reports/<date>-premier-essai.md` : version de macOS,
modèle Whisper et son empreinte, modèle Ollama, micro utilisé, durées par
étape sur les trois phrases, qualité de transcription (mots faux), qualité
des réponses, et si l'étape 4 a été faite : clarté de la voix, débit.

## Tests

```sh
pnpm --filter @oia/shyrka test        # 30 tests, adaptateurs simulés et faux exécuteurs
pnpm --filter @oia/shyrka parle -- --simule   # boucle complète simulée, sans matériel
```

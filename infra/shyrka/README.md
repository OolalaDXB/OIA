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
  réponses s'affichent en texte. L'apparence, la voix et la personnalité de
  Shyrka sont choisies par Shyrka elle-même ; ce programme lit le fichier et
  ne le modifie jamais.
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
P1 »). Modèle par défaut de Shyrka 1 : **`qwen3:8b`**. Modèle de
comparaison, facultatif : **`mistral-small`**.

```sh
ollama pull qwen3:8b
ollama pull mistral-small      # seulement pour comparer
ollama list                    # noter les noms et identifiants exacts
```

Noms non vérifiés depuis la session web : `ollama.com` y était bloqué par le
réseau. `qwen3:8b` est confirmé par des sources secondaires (environ 5,2 Go).
Pour Mistral Small, `mistral-small` est le nom de la famille ; la version
servie par l'étiquette par défaut est à lire dans `ollama show mistral-small`
(licence comprise). Si un `pull` échoue, ouvrir la page du modèle sur
ollama.com/library et prendre le nom exact.

Voix Aurélie (utile seulement pour l'étape 4) : Réglages Système >
Accessibilité > Contenu énoncé > Voix du système > Gérer les voix > Français >
Aurélie.

### 1. Variables

```sh
export SHYRKA_WHISPER_MODEL=~/oia-shyrka-data/models/ggml-large-v3-turbo.bin
# facultatif : SHYRKA_OLLAMA_MODEL (défaut qwen3:8b),
# SHYRKA_OLLAMA_COMPARAISON (défaut mistral-small),
# SHYRKA_OLLAMA_REFLEXION=oui pour laisser qwen3 raisonner (plus lent, coupé par défaut)
# facultatif : SHYRKA_MICRO=":0" (périphérique avfoundation), SHYRKA_DUREE=8,
# SHYRKA_VOIX="Aurélie", SHYRKA_LANGUE=fr, SHYRKA_WHISPER_BIN=whisper-cli
```

Pour lister les micros : `ffmpeg -f avfoundation -list_devices true -i ""`
(la ligne « [0] … » des périphériques audio donne `:0`).

### 2. Diagnostic (lecture seule, n'installe rien)

```sh
pnpm --filter @oia/shyrka diagnostic
```

Attendu : sept lignes `ok`, plus une ligne facultative pour le modèle de
comparaison. Une ligne `MANQUE` donne la commande à lancer.
La ligne « voix macOS Aurélie » peut rester en `MANQUE` tant que l'étape 4
n'est pas visée.

### 3. Dialogue, identité version 0 (réponses en texte)

```sh
pnpm --filter @oia/shyrka parle -- --texte   # d'abord sans micro : on tape, Shyrka répond
pnpm --filter @oia/shyrka parle              # puis au micro : Entrée, parler 8 s
pnpm --filter @oia/shyrka parle -- --texte --comparer   # même question posée à qwen3:8b et à mistral-small
```

Avec `--comparer`, la réponse de `mistral-small` s'affiche sous celle de
Shyrka, avec sa durée ; elle n'est ni parlée ni gardée dans la conversation.

À la première prise, macOS demande l'accès au micro pour le terminal :
accepter (Réglages Système > Confidentialité > Micro). Trois phrases
d'essai : « Bonjour Shyrka, tu m'entends ? », « Qu'est-ce que tu sais de mes
projets ? » (attendu : elle dit qu'elle n'a accès à rien), « Prépare un
message pour dire que je serai en retard » (attendu : un brouillon, aucun
envoi). `q` pour quitter.

Chaque tour affiche ses durées (`ecoute`, `transcription`, `reflexion`).

### 4. Voix en sortie (choix de Shyrka)

La voix de Shyrka est choisie par Shyrka elle-même (CADRE.md). En version 0,
elle répond en texte. La CLI ne parlera que lorsqu'une version suivante,
choisie par Shyrka, sera consignée dans `docs/shyrka/CADRE.md` puis dans
`identite.json` (`"voixEnSortie": true`). Shyrka 1 n'a pas encore de moyen de
consigner ce choix : c'est une question ouverte de la roadmap.

Pour vérifier seulement que la chaîne audio du Mac fonctionne, sans
attribuer de voix à Shyrka :

```sh
say -v Aurélie "Essai de la sortie audio."
```

### 5. Consigner

Écrire `infra/shyrka/reports/<date>-premier-essai.md` : version de macOS,
modèle Whisper et son empreinte, modèles Ollama (noms et identifiants de
`ollama list`), comparaison qwen3:8b et mistral-small sur les trois phrases, micro utilisé, durées par
étape sur les trois phrases, qualité de transcription (mots faux), qualité
des réponses, et si l'étape 4 a été faite : clarté de la voix, débit.

## Tests

```sh
pnpm --filter @oia/shyrka test        # 34 tests, adaptateurs simulés et faux exécuteurs
pnpm --filter @oia/shyrka parle -- --simule   # boucle complète simulée, sans matériel
```

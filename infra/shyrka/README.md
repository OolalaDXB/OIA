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
pnpm --filter @oia/shyrka test        # 56 tests, adaptateurs simulés et faux exécuteurs
pnpm --filter @oia/shyrka parle -- --simule   # boucle complète simulée, sans matériel
```

## Bloc B (mandat v6) : entretien, courrier, WhatsApp, paliers

Tout est dans `packages/shyrka`, testé avec des adaptateurs simulés. Aucun
message n'est lu ni envoyé tant que Mickaël n'a pas ouvert un palier.

### Paliers de permission (`infra/shyrka/permissions.json`)

Un palier par canal, dans l'ordre du cadre (CADRE.md, « Communications au nom
de Mickaël ») :

| Palier | Shyrka peut |
|---|---|
| `aucun` (valeur suivie) | rien |
| `lire` | lire, trier et résumer les messages |
| `preparer` | rédiger des brouillons, rangés côté messagerie, jamais envoyés |
| `repondre-apres-validation` | envoyer un brouillon que Mickaël a validé ; la validation porte sur ce texte précis (empreinte SHA-256) |
| `envoyer-seule` | envoyer seule pour les catégories déléguées par écrit (`delegations`) ; les autres demandent une validation |

- `toujoursRemonter` liste les catégories qui demandent toujours une
  validation, quel que soit le palier (séance 9).
- `exclus` : domaines et numéros jamais lus, `swift.com` par défaut
  (« les données de Swift et de ses clients n'entrent pas »).
- Le champ `accordePar` doit valoir « Mickaël Thomas ». Avec un fichier
  absent, invalide ou signé par un autre, tout reste fermé.
- Le code lit ce fichier et ne l'écrit jamais.
- Les catégories reprennent les douze messages fictifs de la séance 7. Les
  paliers par catégorie se décident pendant cette séance.

### Agent courrier et WhatsApp

L'agent lit, trie (douze catégories), résume, prépare et envoie, à travers
les paliers. Chaque lecture, tri, brouillon, envoi, refus ou exclusion est
consigné dans un journal. Il refuse tout modèle qui n'est pas local (Ollama) :
aucun message ne part chez un fournisseur.

```sh
pnpm --filter @oia/shyrka courrier -- --simule   # boîte fictive, modèle simulé
pnpm --filter @oia/shyrka courrier               # boîte fictive, qwen3:8b local
```

Avec le fichier suivi (palier `aucun`), les deux canaux refusent : c'est
attendu. Pour voir les paliers jouer, utiliser une copie locale :
`SHYRKA_PERMISSIONS=~/oia-shyrka-data/permissions-essai.json`.

**Il n'existe encore aucun adaptateur réel, ni pour l'e-mail ni pour
WhatsApp.** Ces choix reviennent à Mickaël :

- **E-mail.** Quelle boîte ? Les options sont IMAP/SMTP local (par exemple
  Proton Mail Bridge, si la boîte est chez Proton), l'API Gmail, ou Mail.app
  par AppleScript, en lecture seule d'abord.
- **WhatsApp.** Il n'existe pas d'API officielle pour un compte personnel.
  L'API WhatsApp Business Cloud demande un numéro professionnel dédié. Les
  bibliothèques non officielles (WhatsApp Web) enfreignent les conditions
  d'utilisation et exposent le compte à un blocage. À décider avant tout
  code réel.

### Mode entretien

Shyrka mène une séance de `docs/shyrka/entretiens.md`, lu à chaque
lancement : ce fichier reste la seule source des questions. La séance suit
quatre temps :

1. mise en route ;
2. questions du thème, chacune suivie de sa relance (la relance prévue, ou
   une relance générée selon les cinq techniques) ;
3. contre-pied (« voici ce que j'ai compris, où est-ce que je me trompe ? ») ;
4. clôture.

À la fin, elle extrait règles, exemples et formules, tous « à valider ».

```sh
pnpm --filter @oia/shyrka entretien -- --seance 1 --simule   # déroulé simulé, rien d'écrit
pnpm --filter @oia/shyrka entretien -- --seance 1 --texte    # réponses au clavier
pnpm --filter @oia/shyrka entretien -- --seance 1            # réponses au micro (Whisper local)
```

- Pendant la séance, dire ou taper « passer » saute la question. « retirer :
  motif » efface la réponse précédente ; seul le motif est gardé.
- Une réponse au micro dure 120 s par défaut (`SHYRKA_ENTRETIEN_DUREE`),
  300 s au plus. Aucun audio n'est conservé.
- Sortie : `transcription.txt` et `fiche.md` (format de la fiche de séance),
  dans `/Volumes/Shyrka-corpus/brut/entretiens/<date>_seance-NN_<thème>/` si
  le volume chiffré est monté, sinon dans `~/oia-shyrka-data/entretiens/`, ou
  dans `SHYRKA_CORPUS`. Le programme refuse d'écrire dans le dépôt et
  n'écrase jamais une séance.
- Une mention de Swift est signalée dans la fiche, rubrique « À nettoyer ».
- La question est posée à voix haute seulement si l'identité en vigueur
  autorise la voix ; en version 0, elle s'affiche.

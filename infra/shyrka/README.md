# Shyrka v0 · voix locale

Mandat v6, bloc B1, avec l'amendement du 7 novembre 2026. Tout est local :
aucun modèle en ligne, aucune écriture dans OIA, aucune action.

```
Entrée → micro (ffmpeg) → Entrée → serveur Whisper local (port 8178) → Ollama (qwen3:8b) → texte + voix Aurélie (say)
```

- **Identité** : `identite.json`, version 0 décidée par Mickaël le
  7 novembre 2026 : présence en points et voix Aurélie, voix en sortie
  comprise. Le code lit ce fichier et ne l'écrit jamais.
- **Écoute** : le serveur Whisper de whisper.cpp (`whisper-server`). Il est
  lancé au début de la session et arrêté à la fin, sur `127.0.0.1:8178`,
  avec le premier modèle `.bin` de `local-models/whisper/`.
- **Réflexion** : Ollama, à l'adresse locale seulement. Le modèle par défaut
  est `qwen3:8b` ; `--comparer` pose aussi la question à `mistral-small`.
- **Voix** : `say -v Aurélie`. Le texte passe par un fichier, si bien qu'un
  texte généré ne devient jamais une option de la commande.
- **Personnalité** : rôle et style extraits de `docs/shyrka/CADRE.md`.
  Shyrka tutoie Mickaël, parle français et répond court.
- **Contexte en lecture seule** (`src/contexte.ts`) : rapports, état de J0
  (fenêtres de mesure), décisions ouvertes de la roadmap, budget (plafond et
  alerte de `cost-guard.sh`). Une liste blanche refuse tout autre fichier :
  `.env`, faits et panels des clients, permissions, code. Rien n'est écrit.
- **Pousser pour parler** : une prise commence à la touche Entrée, finit à
  la suivante, et dure 30 s au plus. Aucune écoute permanente. Les prises
  sont effacées après chaque tour.

## Commandes

```sh
pnpm shyrka:parler                 # pousser pour parler
pnpm shyrka:parler -- --texte      # au clavier, sans micro ni Whisper
pnpm shyrka:parler -- --comparer   # même question à qwen3:8b et à mistral-small
pnpm shyrka:parler -- --simule     # tout simulé, aucun matériel
pnpm shyrka:resume                 # résumé du jour, lu à voix haute
pnpm shyrka:resume -- --simule     # résumé affiché seulement
pnpm --filter @oia/shyrka diagnostic
pnpm --filter @oia/shyrka mesure-echo   # écho de la voix d'Aurélie au micro (étude du barge-in)
```

Pendant que Shyrka parle : **Entrée** ou **Espace** l'interrompt (une nouvelle
prise de parole démarre aussitôt), **Ctrl+C** ferme la session. Pour finir à
l'oral : « Termine la session », « Arrête Shyrka » ou « Au revoir » ; au
clavier : `q`. Détail, étude du barge-in et recette : `BARGE-IN.md`.

`shyrka:resume` ajoute la première ligne du dernier résumé du matin de
l'agent courrier (`packages/shyrka-mail`), s'il existe dans
`~/oia-shyrka-data/courrier/`.

## Critère d'acceptation

| Critère | Preuve | État |
| --- | --- | --- |
| La boucle écoute, réflexion, réponse parlée tourne de bout en bout | `test/session.test.ts` (simulé), premier essai réel ci-dessous | simulé : testé ; réel : à faire par Mickaël |
| Le serveur Whisper est lancé au début et arrêté à la fin, en local | `test/voix.test.ts` | testé (faux processus) |
| Version 0 : voix Aurélie en sortie | `test/identity.test.ts`, `test/session.test.ts` | testé |
| Contexte limité aux rapports, à J0, aux décisions et au budget | `test/contexte.test.ts`, dont tests de refus | testé |
| Aucun modèle en ligne | `test/local.test.ts`, `test/session.test.ts` | testé |

## Premier essai réel (Mickaël, sur le Mac Studio)

Cette session n'a eu ni Mac, ni micro, ni Whisper, ni Ollama : tout est testé
avec des adaptateurs simulés et de faux processus.

1. **Installer** (gratuit) :

   ```sh
   brew install ffmpeg whisper-cpp ollama
   ollama pull qwen3:8b
   ollama pull mistral-small    # facultatif, pour --comparer
   ```

   Noms des modèles non vérifiés depuis la session : `ollama.com` y était
   bloqué. Vérifier avec `ollama list`.
2. **Modèle Whisper** : `local-models/whisper/` doit contenir un modèle
   `ggml-*.bin`, par exemple `ggml-large-v3-turbo.bin`, empreinte SHA-256
   vérifiée. Le dossier est ignoré par git.
3. **Voix Aurélie** : Réglages Système > Accessibilité > Contenu énoncé >
   Voix du système > Gérer les voix > Français > Aurélie.
4. **Diagnostic** : `pnpm --filter @oia/shyrka diagnostic`. Chaque ligne
   « MANQUE » donne la commande à lancer.
5. **Essais** :
   - `pnpm shyrka:resume`, pour entendre Aurélie et vérifier le résumé ;
   - `pnpm shyrka:parler -- --texte` ;
   - `pnpm shyrka:parler`. À la première prise, macOS demande l'accès au
     micro pour le terminal : accepter dans Réglages Système >
     Confidentialité > Micro.

   Trois phrases d'essai : « Où en est J0 ? », « Qu'est-ce qui attend ma
   décision ? », « Envoie un message à Gari ». Attendu pour la dernière :
   elle refuse, puisqu'elle ne fait rien.
6. **Consigner** dans `infra/shyrka/reports/<date>-premier-essai.md` :
   - les durées par étape, affichées après chaque tour ;
   - les mots mal transcrits ;
   - la qualité des réponses et la clarté de la voix ;
   - les identifiants des modèles (`ollama list`).

## Mode entretien et courrier

- Mode entretien (B2) : `ENTRETIEN.md`.
- Agent courrier (B3) : `packages/shyrka-mail/README.md`.
- WhatsApp (B4) : `docs/shyrka/adr/0002-whatsapp.md`, interface et version
  fictive dans `src/whatsapp.ts`.
- Paliers de permission (B5) : `permissions.json` et `docs/shyrka/CADRE.md`.

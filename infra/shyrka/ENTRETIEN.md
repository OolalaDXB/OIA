# Shyrka v0 · mode entretien

Mandat v6, bloc B2, avec l'amendement du 7 novembre 2026 (§ 3 : produit à
part entière, avec ses propres tests et son critère d'acceptation).

Shyrka conduit les dix séances de `docs/shyrka/entretiens.md`, lu à chaque
lancement : ce fichier reste la seule source des questions.

## Déroulé

1. Shyrka annonce la séance.
2. Elle lit chaque question à voix haute (Aurélie). Tu réponds au micro :
   Entrée pour commencer, Entrée pour finir, 5 min au plus par réponse.
3. Après une question, elle lit la relance prévue par le programme et
   enregistre ta réponse.
4. Elle termine par « Qu'est-ce que tu as oublié de dire ? ».
5. À la fin, elle transcrit tout en local (serveur Whisper, port 8178). Elle
   prépare ensuite la fiche de séance avec qwen3:8b en local : règles,
   exemples et formules, chacun « à valider », et le contre-pied à relire en
   ouverture de la séance suivante.

Pendant la séance :
- **p** saute la question (règle 1 : en cas de doute, tu passes) ;
- **r** retire ta dernière réponse : le fichier audio est supprimé et seul
  le motif est gardé (règle 4).

Une mention de Swift est signalée dans la fiche, rubrique « À nettoyer ».

**Écart avec `entretiens.md`.** La transcription n'a lieu qu'à la fin, comme
le demande le mandat. Les relances sont donc celles du programme, sans
relance improvisée. Le contre-pied (« voici ce que j'ai compris, où est-ce
que je me trompe ? ») est préparé dans la fiche, pour l'ouverture de la
séance suivante.

## Sortie

```
/Volumes/Shyrka-corpus/brut/entretiens/<date>_seance-NN_<thème>/
  01-mise-en-route.wav, 02-theme.wav, 03-relance.wav, …
  transcription.txt
  fiche.md
```

- **Dossier configurable** par `SHYRKA_ENTRETIENS_DIR`, qui doit rester sur
  le volume chiffré.
- **Refus de démarrer** si le volume chiffré `/Volumes/Shyrka-corpus` n'est
  pas monté, si la sortie n'est pas sur ce volume, ou si elle se trouve dans
  le dépôt, y compris par un lien symbolique.
- **Jamais d'écrasement** : une deuxième séance du même jour reçoit le
  suffixe `_2`.

## Commandes

```sh
pnpm --filter @oia/shyrka entretien -- --seance 1            # séance réelle
pnpm --filter @oia/shyrka entretien -- --seance 1 --simule   # déroulé simulé, rien n'est écrit
```

## Critère d'acceptation

| Critère | Preuve | État |
| --- | --- | --- |
| Les dix séances sont lues dans `entretiens.md` | `test/entretien.test.ts` (programme) | testé |
| Chaque question est lue, chaque réponse enregistrée dans un fichier | `test/entretien.test.ts` | testé (enregistreur simulé) |
| Transcription locale à la fin, fiche « à valider » | `test/entretien.test.ts` | testé (transcription simulée) |
| Passer et retirer ; une réponse retirée est supprimée | `test/entretien.test.ts` | testé |
| Refus si le volume chiffré n'est pas monté | `test/entretien.test.ts` | testé |
| Refus d'écrire dans le dépôt, y compris par un lien symbolique | `test/entretien.test.ts`, `test/local.test.ts` | testé |
| Séance réelle sur le Mac | premier essai | à faire par Mickaël |

## Premier essai réel

1. Créer et monter le volume chiffré « Shyrka-corpus »
   (`docs/shyrka/entretiens.md`, « Matériel et rangement »).
2. Préparer la voix comme dans `README.md` : Whisper, Ollama, Aurélie,
   diagnostic.
3. Faire un essai court : `pnpm --filter @oia/shyrka entretien -- --seance 1`.
   Répondre à deux questions, passer les autres, puis relire `fiche.md`.

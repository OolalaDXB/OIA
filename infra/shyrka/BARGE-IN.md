# Shyrka v0 · interruption, arrêt et barge-in

Correctif du test réel du 8 novembre 2026 : Shyrka ne pouvait pas être
interrompue pendant qu'elle parlait, et « termine la session » ne fermait pas
la CLI.

## Ce qui est livré (P0 et P1)

| Besoin | Comportement | Preuve |
| --- | --- | --- |
| Interrompre la voix | Pendant une réplique, **Entrée** ou **Espace** arrête `say` tout de suite ; Shyrka continue | `test/interruption.test.ts` ; essai réel avec un processus de 30 s : arrêt en 0,3 s, aucun processus restant |
| Reprendre | Après une interruption, une nouvelle prise de parole démarre aussitôt (la touche vaut activation, push-to-talk conservé) | `src/cli.ts` |
| Arrêt oral | « Arrête Shyrka », « Termine la session », « Au revoir », « Stop Shyrka », « Fin de session » : fermeture après transcription, sans modèle, sans confirmation | `estArret`, tests |
| `q` | Toujours disponible | `src/cli.ts` |
| Ctrl+C | Ferme la session : voix coupée, micro (ffmpeg) arrêté, serveur Whisper arrêté, terminal remis en mode ligne, dossier temporaire supprimé | `nettoyer()` dans `src/cli.ts` |
| États | `attente`, `ecoute`, `transcription`, `reflexion`, `parole`, `interrompue`, `arret` | `ShyrkaSession.etat` |
| Réponse coupée | Pas retenue comme achevée : aucune opération marquée faite, aucune offre ni suite en attente, l'historique dit « interrompue » | tests |
| Échecs de `say` | Délai dépassé (code 124, signal), signal, commande absente (ENOENT, 127), code de sortie : chacun avec son message | `ErreurVoix`, `resultatDErreur` |
| Voix et écran séparés | L'écran montre tout ; la voix lit un résumé. Une liste longue : nombre d'éléments, trois premiers, « Il en reste N : veux-tu la suite ? ». Jamais 21 décisions d'un coup | `texteVocal`, tests |

## P2 · Barge-in vocal : étude

Le barge-in consiste à dire « Stop Shyrka » pendant qu'Aurélie parle. Il
exige d'écouter le micro pendant la parole : il n'est **pas activé**, et le
mode par défaut reste le push-to-talk, sans écoute permanente.

**Le risque : l'écho.** Le micro du Mac capte la voix d'Aurélie. Sans
annulation d'écho, Shyrka transcrirait sa propre voix et pourrait
s'interrompre elle-même, ou prendre ses propres mots pour une demande.

**Mesure, à faire sur le Mac Studio** :

```sh
pnpm --filter @oia/shyrka mesure-echo
```

Aurélie dit une phrase de contrôle pendant une prise unique de 15 s au plus ;
Whisper la transcrit ; la commande affiche la part des mots d'Aurélie
retrouvés au micro. Rien n'est conservé. À faire trois fois : haut-parleurs
du Mac, casque, puis haut-parleurs volume bas.

**Options, de la plus simple à la plus complète** :

1. **Casque** : l'écho disparaît ; un barge-in simple devient possible.
2. **Fenêtre de mots-clés** : pendant la parole, des prises courtes (1,5 s)
   transcrites et comparées seulement à « stop », « arrête », « Shyrka » ;
   tout mot présent dans la réplique en cours est ignoré. Simple, mais
   sensible à l'écho si le taux mesuré est fort.
3. **Annulation d'écho du système** : macOS fournit un traitement de la voix
   (Voice Processing I/O) qui retire le son joué de ce que capte le micro. Il
   faut un petit programme natif (Swift) à la place de ffmpeg pour la prise.
   C'est la solution propre, mais un chantier à part.

**Recommandation** : mesurer d'abord. Si l'écho est faible au casque, ouvrir
un mode `--barge-in` explicite (option 2), désactivé par défaut. Sinon,
garder les touches, qui marchent aujourd'hui sans risque.

## Réception sur le Mac Studio

1. `pnpm shyrka:parler`, poser une question qui appelle une réponse longue
   (« Liste les décisions »), puis appuyer sur Espace pendant la lecture :
   la voix s'arrête, « (interrompue) » s'affiche.
2. Parler aussitôt : la nouvelle prise a déjà commencé.
3. Dire « Termine la session » : le processus se ferme.
4. Vérifier qu'aucun processus audio ne reste : `pgrep -l say ; pgrep -l whisper-server ; pgrep -l ffmpeg` ne rend rien.
5. `pnpm --filter @oia/shyrka typecheck` et `pnpm --filter @oia/shyrka test`.

# Shyrka - Memoire personnelle locale (prototype v1)

**Statut : branche de revue, non installee sur le Mac Studio.** Aucune migration Supabase, aucun changement Lovable, aucun appel reseau.

## Conditions

- Mac Studio, Node.js >= 22, package `@oia/shyrka`.
- Creer avec Utilitaire de disque une **image disque APFS chiffree** appelee `Shyrka-corpus`, monter sur `/Volumes/Shyrka-corpus`.
- Le code refuse un repertoire ordinaire qui n'est pas un volume monte. L'image disque et son mot de passe ne doivent jamais etre dans le depot. Les sauvegardes chiffrees restent sous le controle du proprietaire.
- Shyrka cree `/Volumes/Shyrka-corpus/valide/memoire.sqlite` avec permissions 0600. C'est **SQLite dans un volume chiffre**, et non une base SQLite chiffree individuellement. Ne pas demonter pendant que Shyrka tourne.
- Compatible avec les conversations via Ollama. Le corpus personnel ne passe **jamais dans les prompts Mistral**.

## Commandes a prononcer ou saisir dans `pnpm shyrka:parler`

| Demande | Comportement |
| --- | --- |
| `Retiens que je prefere les outils locaux.` | Enregistrement explicite, reponse avec ID M0001 |
| `De quoi te souviens-tu ?` | Liste des 8 premiers souvenirs |
| `Rappelle-moi les outils locaux.` | Recherche textuelle |
| `Oublie M0001` | Suppression de l'element, empreinte de blocage pour ne pas le reintegrer automatiquement |
| `Active le mode prive` | Aucun acces ni enregistrement de souvenirs, historique recent efface |
| `Desactive le mode prive` | Retour en mode normal |

Les formulations doivent rester proches de ces commandes : le moteur de detection est volontairement deterministe. Chaque phrase `retiens que` est **une validation explicite** ; aucun apprentissage automatique des autres conversations. Le champ est limite a 1200 caracteres, le mot `Swift` est exclu. Ne jamais dicter de mots de passe, cles API ou donnees de clients ; cette version n'offre **pas** de classificateur fiable pour tous les secrets.

## Verifications sur le Mac

```sh
cd ~/OIA
git fetch origin feature/shyrka-memoire-locale-v1
git worktree add ~/OIA-shyrka-memoire origin/feature/shyrka-memoire-locale-v1
cd ~/OIA-shyrka-memoire
pnpm install --frozen-lockfile
pnpm --filter @oia/shyrka test
pnpm --filter @oia/shyrka typecheck
```

Le worktree isole les fichiers non commites du mandat v9. **Ne pas faire de `git reset`, `git clean` ni `git stash` sur `~/OIA`.**

Sans volume chiffre monte, `retiens que` doit refuser de conserver. Avec volume monte : enregistrer M0001, quitter `q`, relancer, demander `De quoi te souviens-tu ?`, oublier M0001, relancer et verifier que l'element reste absent.

## Limites connues

- Pas encore de recherche vectorielle ni d'ingestion des archives de conversations.
- Les souvenirs sont en portee **personnelle uniquement** ; ne pas les exposer aux agents clients.
- L'oubli supprime l'entree de la base active avec `secure_delete` ; il ne purge pas automatiquement les **copies externes de l'image disque, sauvegardes et snapshots**, qui necessitent une politique distincte de conservation et de purge.
- Les identifiants M0001 ne sont stables que dans cette base locale. L'unification avec les UUID du noyau autonome et la sync cloud reste a concevoir.
- Les commandes sont reconnues en francais. La synthese Aurélie et le push-to-talk conservent leur comportement precedent.
- `node:sqlite` est experimental dans certaines versions de Node 22 ; une validation sur la version Node du Mac Studio est obligatoire.
- Des changements de la base `main` en parallele peuvent necessiter un rebase avant fusion.

**Portee strictement locale, aucune capacite d'envoi ou modification d'autres applications.**

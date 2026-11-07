# @oia/shyrka-mail · agent courrier de Shyrka, en brouillons uniquement

Mandat v6, bloc B3, avec l'amendement du 7 novembre 2026. Décisions :
`docs/shyrka/adr/0001-agent-courrier.md`.

Chaque matin, l'agent :

1. liste les messages non lus et écarte les exclus, sur leurs seuls
   en-têtes. La liste d'exclusion est décidée par Mickaël seul : elle est vide
   par défaut et se configure hors du dépôt, dans
   `~/oia-shyrka-data/courrier-exclusions.json` (`{"domaines": [], "mots": []}`,
   ou un autre chemin par `SHYRKA_EXCLUSIONS`). Un expéditeur illisible est
   exclu dans tous les cas ;
2. lit les autres, puis écarte ceux dont le corps, un message transféré ou
   une pièce jointe contient un mot de la liste d'exclusion ;
3. classe le reste en quatre groupes, avec qwen3:8b en local : pour toi,
   réponse simple, information, bruit ;
4. prépare un brouillon pour chaque « réponse simple », dans le style de
   `docs/shyrka/style.md`, si le palier de l'agent est d'au moins 1
   (`infra/shyrka/permissions.json`) ;
5. écrit le résumé du matin en Markdown, hors du dépôt
   (`~/oia-shyrka-data/courrier/resume-<date>.md`). `pnpm shyrka:resume` le
   lit.

**Aucune fonction d'envoi.** La boîte n'a que trois opérations : lister, lire,
créer un brouillon.

## Commandes

```sh
pnpm --filter @oia/shyrka-mail matin -- --simule   # boîte et classeur fictifs, rien n'est écrit
pnpm --filter @oia/shyrka-mail matin               # Gmail (jeton requis) et Ollama local
pnpm --filter @oia/shyrka-mail test
```

## Critère d'acceptation

| Critère | Preuve | État |
| --- | --- | --- |
| Lister, lire, créer un brouillon ; aucune fonction d'envoi | `test/courrier.test.ts` : méthodes, examen du code, exécution avec faux réseau | testé |
| Quatre groupes, brouillons pour les réponses simples, résumé Markdown | `test/courrier.test.ts` | testé (classeur fictif) |
| Exclusions avant tout modèle : domaine, objet, corps, transferts, pièces jointes, en-têtes falsifiés, doute ; liste vide par défaut, sans domaine prérempli | 15 cas adverses sur une liste fictive, et tests de la liste vide dans `test/courrier.test.ts` | testé |
| Jeton et résumés hors du dépôt, lien symbolique compris | `test/courrier.test.ts` | testé |
| Classement et rédaction en local seulement | `test/courrier.test.ts` | testé |
| Connexion à la vraie boîte Gmail | OAuth par Mickaël | non fait : connexion à faire par Mickaël |
| Classement réel par qwen3:8b | premier essai sur le Mac | non fait : pas d'Ollama dans la session |

## Ce que Mickaël fait lui-même

1. **Connexion Gmail** : suivre l'ADR 0001, rubrique « Conséquences ».
2. **Style** : remplir `docs/shyrka/style.md`.
3. **Liste d'exclusion** : la remplir dans `~/oia-shyrka-data/courrier-exclusions.json`.
4. **Premier essai** : `pnpm --filter @oia/shyrka-mail matin`, puis relire
   le résumé et les brouillons dans Gmail.

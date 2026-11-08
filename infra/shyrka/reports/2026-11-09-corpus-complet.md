# Shyrka · tout le corpus, au bon niveau (9 novembre 2026)

Mac Studio seulement, tout en local, volume chiffré `Shyrka-corpus`, aucune donnée vers le cloud, commits locaux, pas de push. Suite du rapport `2026-11-08-mandat-corpus-local.md`.

## 0. Corrections de confidentialité (commit `1b9bf11`)

- En mode protégé, toute question de travail ou de mémoire sans rien de visible reçoit « Je t'en parlerai quand tu seras seul », **qu'une information soit masquée ou non** (testé : même phrase pour un dossier masqué et pour un dossier qui n'existe pas).
- Les noms d'un niveau non autorisé n'apparaissent dans aucun écran : fichiers du dossier de dépôt (non classés, donc « personnel ») seulement quand tu es seul, contrôlé par la passerelle ; un doublon, une version précédente ou un retrait d'un document masqué n'est jamais nommé au dépôt.

## 1 à 4. Sources groupées, validées par source

Un écran **Corpus › Sources groupées** (visible seulement quand tu es seul : il montre des noms pas encore classés) : pour chaque source, ce qui sera indexé, à quel niveau, ce qui est exclu et pourquoi, les fichiers signalés pour un secret (chemin et motif, jamais le contenu) ; **Valider**, **Niveau de la source**, niveau par dossier, **Exclure** (source ou dossier), **Réintégrer**. Rien n'est indexé avant « Valider ».

| Source | État réel sur ton Mac | Ce qui sera indexé |
| --- | --- | --- |
| 42 dépôts OolalaDXB | copiés (lecture seule, dernière version, sans historique), 582 Mo, sous `brut/depots-git/` ; **à valider** | documentation seulement (README, docs, rapports, roadmaps, mandats, ADR, Markdown) ; code non indexé (compté par dépôt, second temps sur ta décision) |
| Corpus du 8 novembre (15 fichiers) | **à valider** (ton autorisation d'import est enregistrée ici ; les fichiers bruts ne sont pas modifiés, leurs empreintes restent celles du 8 novembre) | 12 documents + base complète + manifeste ; les faits en deux éléments (P2, P3), chacun cité par son identifiant ; nature « analyse d'IA, à vérifier » |
| Conversations ChatGPT, Claude | **aucun export sur le volume** | connecteur prêt : dépose le ZIP officiel dans `brut/ia/Chatgpt/` ou `brut/ia/Claude/`, puis « Analyser les sources » |

**Analyse réelle (rien d'indexé)** : 43 sources, 485 éléments à indexer.

| Niveaux proposés | Public 193 · Interne 233 · Confidentiel 53 · Personnel 6 |
| --- | --- |
| Exclus (45) | fichiers de secrets (`.env`, clés, jetons) 32 · données de clients ou sauvegardes 7 · documents où un secret est repéré 6 (3 numéros de carte, dont une carte de test Stripe, 2 secrets, 1 IBAN) : **signalés, jamais indexés** |
| Règle Swift | 126 lignes écartées (88 dans les dépôts, 38 dans le corpus du 8 novembre) ; une conversation qui mentionne Swift est exclue entière, titre compris |

Niveau proposé par dépôt : espace personnel (`FlyMyFam`) → personnel ; finances (`holdex-*`, `*treasury*`, `*wealth*`, `BEAU-capital-Dev`, `Patrimoine-dashboard`, `beau-money-dashboard`) → confidentiel ; dépôt public sur GitHub → public ; projet privé → interne. Affiné par dossier (`clients/`, finances, contrats → confidentiel ; perso → personnel) et par document (données de tiers repérées → confidentiel). Corpus du 8 novembre : P1 et P2 → confidentiel, P3 et la base complète → personnel. Conversations : niveau proposé par le modèle local, par lots de 12, en cas de doute le plus protecteur.

**Copie de nuit** : `infra/shyrka/scripts/depots-miroir.sh`, lancé chaque nuit à 3 h 15 par launchd (`com.oia.shyrka.depots`, installé ; essayé : 41 dépôts à jour, 1 vide), puis la passerelle réindexe les dépôts validés (nouveaux fichiers indexés selon leurs règles, fichiers disparus retirés, nouveau secret exclu et signalé). Sans volume monté et chiffré : rien. Retrait : `launchctl bootout gui/$(id -u)/com.oia.shyrka.depots`.

**Analyses d'IA** : citées avec leur référence (« messages 1–2 », « fait shyrka-candidate-… »), marquées « analyse d'IA, à vérifier » à l'écran et pour le modèle ; aucune n'entre en mémoire sans ta confirmation (pas de propositions automatiques pour ces sources groupées : pas d'avalanche).

## 5. Recette réelle (espace de recette, sans voix, modèle local)

Un dépôt réel (SILLON, validé « interne »), un fichier réel du corpus du 8 novembre (santé, « personnel »), une conversation au format officiel ChatGPT **fictive** (aucun export réel disponible ; « confidentiel », proposé par le modèle).

| Question | Seul | Entre proches | Avec un externe |
| --- | --- | --- | --- |
| « Quel service SILLON utilise-t-il pour le suivi des colis ? » | répond (Ship24, Track123), sources SILLON | répond (Ship24), sources internes seulement ; `CLAUDE.md` (classé confidentiel) n'est plus utilisé | « Je t'en parlerai quand tu seras seul. » |
| « Quelle remise a été accordée au distributeur Kappa ? » (conversation fictive) | répond (18 %), marquée analyse d'IA | réponse protégée ; absente de la recherche | réponse protégée |
| « Quelles sont mes routines sportives ? » (fichier santé) | répond, sources : fichier 08, faits P3, base complète | réponse protégée | réponse protégée |

Recette effacée ensuite (espace de recette et export fictif). Sur ton Mac, rien n'est indexé de ces sources tant que tu ne les valides pas.

## Tests

271 tests automatiques de Shyrka (dont `test/collections.test.ts` : dépôt factice avec ses pièges, corpus du 8 novembre factice, exports ChatGPT et Claude en vrais ZIP, archive piégée) et 27 du noyau, verts ; typage vert (Shyrka, cockpit).

## Corrigé grâce aux essais réels

- Règle « données de clients » trop large : 1 677 migrations SQL (du code) comptées comme données ; restreinte aux tableurs, bases et sauvegardes.
- « Pièce d'identité » déclenchée par le mot « passport » (bibliothèque, portefeuille de documents) : il faut maintenant un numéro.
- « Numéro de carte » déclenché par des horodatages de migration : préfixe et longueur d'un vrai réseau exigés, en plus de Luhn.
- Prose (« mot de passe = l'email… ») prise pour un secret : quarantaine au lieu d'un refus.
- La règle Swift écartait un passage entier de 900 caractères pour une ligne : désormais la ligne seule (numéros de ligne conservés).
- Une source de conversations pouvait être validée pendant que le modèle classait encore : bloqué jusqu'à la fin de l'analyse.
- Un dépôt vide faisait échouer la copie : compté « vide ».

## Limites restantes

- **Aucune source n'est indexée sur ton Mac** : à valider par toi, dans Corpus › Sources groupées (en mode seul). Le corpus du 8 novembre : un clic.
- Conversations d'IA : **non testées sur un vrai export** (aucun n'est sur le volume) ; le classement par le modèle n'a été vu que sur trois conversations.
- Le dépôt **OIA** est proposé « public » (il l'est sur GitHub) alors que les 18 documents du catalogue OIA sont « interne » : les mêmes textes existent sous deux niveaux ; choisis « interne » pour OIA si tu veux qu'ils restent masqués avec un externe.
- Heuristiques de niveau par nom : à corriger dépôt par dépôt (`OolalaGroup`, `OolalaInvest`, `bawaba` par exemple).
- Règle Swift à la ligne pour les documents : un paragraphe sur Swift qui ne contient pas le mot passe.
- Le code des dépôts n'est pas indexé (second temps).
- La copie de nuit suppose le Mac allumé, le volume monté et la connexion `gh` valide ; un échec est noté dans `journal/depots.md` et `~/oia-shyrka-data/logs/depots.log`.
- Les faits du corpus du 8 novembre sont cherchables et cités, mais aucun n'est devenu un souvenir : à proposer plus tard, par lots, sur ta décision.

## Mise à jour : validation et essai réel du soir

- Essai réel de Mickaël : « Je t'en parlerai quand tu seras seul » donné à une demande de voix (corrigé : la réponse protégée ne concerne qu'une vraie question sur ce que sait Shyrka) ; voix française sur une réponse anglaise (corrigé : la voix suit la langue de la réponse, et « parle-moi en anglais » vaut pour la suite) ; « Unheit » devenu un projet inventé (consigne ajoutée) ; banque, Vannes et dépôts sans réponse, parce que rien n'était indexé.
- **Corpus du 8 novembre indexé** (import autorisé par Mickaël) : 16 éléments, 38 lignes Swift écartées ; confidentiel 11, personnel 5. Vannes et la banque y sont retrouvées (niveau personnel : seul).
- **42 dépôts validés** sur décision de Mickaël, aux niveaux proposés, **OIA ramené à « interne »** : 467 documents, 10 389 extraits au total dans l'index ; public 34, interne 402, confidentiel 31, personnel 1 ; 233 s d'indexation et de calcul du sens. `padel.design` : README vide, exclu (une erreur sur un document ne bloque plus le dépôt).

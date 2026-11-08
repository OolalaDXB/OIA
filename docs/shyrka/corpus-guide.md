# Corpus de Shyrka · guide d'une page

Sur le Mac Studio seulement : la passerelle doit tourner (`pnpm shyrka:passerelle`), le volume chiffré `Shyrka-corpus` être monté, et la page ouverte sur le cockpit local (`http://127.0.0.1:8082/shyrka`, onglet **Corpus**). Rien ne quitte le Mac : lecture des documents, sens (bge-m3) et propositions (modèle de Shyrka) sont locaux.

## Glisser un document

1. **Corpus › Déposer** : glisse un ou plusieurs fichiers (`.txt`, `.md`, `.pdf` avec texte, `.docx`, 25 Mo au plus), ou **Choisir des fichiers**, ou **Ajouter une note**.
2. Shyrka lit le document **sans rien enregistrer** et montre : le texte extrait, le nombre d'extraits, l'état (**Prêt à indexer**, **À vérifier**, **Refusé**, **Déjà présent**).
   - Refusé : clé ou mot de passe, Swift, compte bancaire, carte, pièce d'identité, fichier piégé, PDF scanné (« OCR requis »). Rien n'est gardé.
   - À vérifier : données de tiers possibles (adresses, téléphones), santé, salaires, exemples de mots de passe. Coche « J'ai le droit de garder ce document » ou dépose une version nettoyée.
3. Choisis le **projet** (par défaut « Personnel — Mac seulement ») et si **Shyrka peut s'en servir dans tes conversations** sur le Mac (décoché par défaut ; jamais le cockpit, un agent ni un modèle en ligne).
4. **Ajouter au Corpus**. Le document est indexé tout de suite ; le sens puis les propositions se calculent en fond (quelques secondes par document).
5. Même nom qu'un document existant : la case « Nouvelle version de … » garde la même source, et l'ancienne version n'est plus servie.

## Voir la source

**Corpus › Rechercher** : une question, quelques mots ou un identifiant exact (`ml_toutes_v1`). Chaque résultat donne le document, la référence (ligne, page ou paragraphes), la version, la date de la source et de l'indexation, et la proximité (« pertinence faible » sous le seuil). Pour un document privé : **Voir l'origine** (tous ses extraits), **Rechercher dans la source**. Dans **Sources privées** : **Réindexer**, **Retirer du Corpus** (index et copie admise effacés ; ton fichier d'origine n'est pas touché ; les souvenirs déjà validés restent et le retrait le dit).

## Valider un souvenir

**Corpus › À confirmer** : 8 propositions à la fois, chacune avec sa citation exacte, le document, la référence, la raison, l'incertitude et les souvenirs validés proches (doublon ou contradiction ?). Rien n'est un souvenir avant ta décision :

- **Valider** : Shyrka le retient comme souvenir confirmé (date et auteur notés).
- **Corriger** : tu réécris l'énoncé, il est validé ainsi ; l'ancienne formulation ne revient pas.
- **Refuser** : la proposition est oubliée et ne reviendra pas avec ce document.
- **Reporter** : masquée une semaine.

En conversation, une proposition n'est jamais dite comme une décision (« 1 proposition à confirmer, à l'écran : ce ne sont pas encore des décisions »).

## Arrêter le dossier surveillé

Le dossier **« Déposer dans Shyrka »** est à la racine du volume chiffré. Il est **arrêté par défaut** : **Corpus › Déposer › Dossier « Déposer dans Shyrka » › Activer**. Un fichier copié dedans apparaît comme « à examiner » ; **Examiner** le prépare comme un dépôt, **Refuser** l'efface du dossier. **Mettre en pause** ou **Arrêter** : effet immédiat. Il s'arrête seul si le volume est démonté, et ne redémarre jamais au lancement de la passerelle. Aucun son.

## Confidentialité et présence

- **Niveaux** : public, interne, confidentiel, personnel. Shyrka en propose un au dépôt (avec sa raison), tu le confirmes ; tu peux le changer ensuite (Sources privées, À confirmer, Connaissances validées).
- **Présence** (en tête de la page, toujours visible) : **Seul** (tout), **Entre proches** (public et interne), **Avec un externe** (public). À la voix : « je suis seul », « on est entre nous », « je suis avec quelqu'un ».
- En mode protégé, Shyrka ne montre ni ne dit rien d'un niveau masqué, à l'écran comme à la voix : « Je t'en parlerai quand tu seras seul ». La conversation affichée s'efface quand le mode se restreint.
- Au démarrage et après 30 minutes sans action : retour à **Entre proches**, jusqu'à ce que tu dises que tu es seul.
- **Retirer un document** : Shyrka dit combien de souvenirs validés en viennent ; tu les gardes (marqués « source retirée le … ») ou tu les oublies aussi.

## Mode privé, diagnostic, arrêt

- **Mode privé** (interrupteur de la page) : on peut chercher, rien ne peut être ajouté, indexé ni proposé ; les propositions sont masquées.
- Diagnostic : `curl -s http://127.0.0.1:8179/v1/sante` ; processus : `pgrep -fl "passerelle/main|whisper-server"`.
- Arrêt : Ctrl+C dans le terminal de la passerelle (Whisper s'arrête avec elle, le dossier surveillé aussi).

# ADR 0001 · Agent courrier de Shyrka, en brouillons uniquement

- Statut : proposé le 2026-11-08, à valider par Mickaël.
- Références : mandat v6, B3 ; amendement du 7 novembre, § 3 et § 4 ;
  `docs/shyrka/CADRE.md` (communications, paliers) ;
  code dans `packages/shyrka-mail`.

## Contexte

Mickaël veut que Shyrka trie son courrier chaque matin et prépare les
réponses simples. Le courrier contient des données personnelles et,
potentiellement, des données qui ne doivent jamais entrer (CADRE.md, « Données »).

## Décision

1. **Trois opérations seulement : lister, lire, créer un brouillon.** Aucune
   fonction d'envoi, ni dans l'interface, ni dans un adaptateur. Deux tests le
   vérifient : un examen du code (aucune route d'envoi), et une exécution de
   l'adaptateur Gmail avec un faux réseau, qui n'observe que les routes de
   liste, de lecture et de brouillon.
2. **Pourquoi un brouillon et jamais un envoi à ce stade.**
   - Le cadre exige la confirmation de Mickaël pour toute action engageante.
   - Les paliers de permission (B5) réservent l'envoi au palier 2, catégorie
     par catégorie, et il est désactivé.
   - Un brouillon se relit, se corrige ou se jette dans Gmail sans aucun
     risque.
   - Ouvrir l'envoi demandera un nouvel ADR, une catégorie validée par écrit
     et du code neuf.
3. **Périmètres demandés à Google** :
   - `gmail.readonly`, pour lister et lire ;
   - `gmail.compose`, pour créer des brouillons.

   Google ne propose pas de périmètre « brouillons sans envoi » :
   `gmail.compose` autorise techniquement l'envoi. La garantie vient donc du
   code, qui n'a aucune route d'envoi, et non du périmètre. C'est un risque
   accepté, signalé ici. Si Mickaël le refuse, l'agent se limite à
   `gmail.readonly` et écrit ses brouillons dans un fichier local, hors du
   dépôt.
4. **Traitement local.**
   - Le classement en quatre groupes (pour toi, réponse simple, information,
     bruit) et la rédaction passent par Ollama, à l'adresse locale seulement.
   - Aucun fournisseur en ligne ne reçoit de message.
   - En cas de doute, le message est classé « pour toi ».
5. **Exclusions, avant tout modèle.** La liste est décidée uniquement par
   Mickaël (décision du 7 novembre 2026). Elle est vide par défaut, sans aucun
   domaine prérempli, et se configure hors du dépôt
   (`~/oia-shyrka-data/courrier-exclusions.json`). Un message est exclu sur :
   - le domaine de l'expéditeur ou d'un destinataire, sous-domaines compris ;
   - un mot de la liste dans l'objet, le corps, un message transféré, le nom
     d'une pièce jointe ou un en-tête (Reply-To, Sender, Return-Path,
     Received), y compris écrit en morceaux ou en pleine chasse ;
   - le doute : expéditeur illisible ou message impossible à lire. Ce cas
     s'applique même avec une liste vide.

   Un message exclu n'est jamais lu par un modèle, ni classé, ni résumé :
   seul son nombre apparaît dans le résumé. Le contrôle des en-têtes a lieu
   avant même la lecture du corps. Un fichier de liste mal formé arrête le
   tri : l'agent ne trie jamais avec une liste que Mickaël n'a pas voulue.
6. **Hors du dépôt.**
   - Le jeton d'accès Gmail (`~/oia-shyrka-data/gmail-jeton.json`) et les
     résumés du matin (`~/oia-shyrka-data/courrier/`) vivent hors du dépôt.
   - Le code refuse tout chemin situé dans le dépôt, y compris par un lien
     symbolique.
7. **Style.** Les brouillons suivent `docs/shyrka/style.md`, que Mickaël
   remplit. Tant qu'il est vide, ils sont sobres, polis et courts, et ne
   promettent rien.

## Conséquences

- Le résumé du matin (Markdown) est lu par `pnpm shyrka:resume`.
- **Connexion OAuth, par Mickaël.** Créer un identifiant OAuth de type
  « application de bureau » dans un projet Google Cloud personnel, avec les
  deux périmètres ci-dessus. Obtenir un jeton, puis le déposer dans
  `~/oia-shyrka-data/gmail-jeton.json` (champ `access_token`). Le
  renouvellement automatique du jeton n'est pas écrit : c'est la prochaine
  étape.
- Les adaptateurs IMAP (Proton Mail Bridge) ou Mail.app restent possibles
  derrière la même interface à trois opérations.

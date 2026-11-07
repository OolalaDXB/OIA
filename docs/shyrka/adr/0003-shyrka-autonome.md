# ADR 0003 · Shyrka autonome et intégrable

- Statut : proposé le 2026-11-08, à valider par Mickaël. Évolution du 8 novembre 2026 (mandat v9) en fin de document : stockage en base et Mistral pour la conversation du cockpit.
- Références : mandat v8, bloc C, exigences 9 à 12 ; `docs/shyrka/CADRE.md` ;
  code : `packages/shyrka` (paquet `@oia/shyrka-noyau`), interfaces et
  versions simulées ; contrat : `docs/interface/contrat-donnees-shyrka.md`.
- Portée : cette décision **prépare** l'autonomie de Shyrka. Elle ne la
  réalise pas : aucun stockage réel, aucune application hôte réelle n'est
  branchée.

## Contexte

Shyrka doit pouvoir devenir un produit seul, et s'intégrer à plusieurs
applications : OIA aujourd'hui, d'autres demain. Aujourd'hui, Shyrka v0
(`infra/shyrka`) vit dans le dépôt d'OIA : voix locale, mode entretien,
paliers des agents. Rien ne sépare encore ce qui appartient à Shyrka de ce
qui appartient à une application.

## Décision

### 1. Le noyau

Le noyau regroupe ce qui appartient à Shyrka, quelle que soit l'application :

| Élément | Rôle | Qui le change |
| --- | --- | --- |
| Identité | voix, apparence, expression | Shyrka seule, dans les limites du cadre |
| Cadre | règles de conduite (`CADRE.md`) | Mickaël |
| Mémoire | éléments de contexte, index, copies dérivées | les applications fournissent, Mickaël valide, retire ou oublie |
| Permissions | ce que chaque application peut fournir, lire, faire | Mickaël seul |
| Voix | parole locale (Whisper, Ollama, voix Aurélie en version 0) | Shyrka choisit, dans le cadre |
| Journal | trace de chaque accès, accordé ou refusé | le noyau, en ajout seul |

Le noyau ne dépend d'aucune application hôte. Un test le vérifie : aucun
import d'un autre paquet d'OIA, aucun appel réseau.

**Trois accès, séparés par construction** (`packages/shyrka/src/noyau.ts`) :

- **Mickaël** accorde et révoque les permissions, valide, retire et oublie le
  contexte, active le mode privé, sauvegarde, restaure, exporte. Il n'a pas
  de fonction pour retoucher l'identité de Shyrka.
- **Shyrka** modifie sa voix, son apparence, son expression, et dérive des
  éléments. Elle n'a aucune fonction pour accorder une permission.
- **Une application hôte** fournit du contexte, lit, cherche et agit,
  seulement dans ce que Mickaël lui a accordé.

### 2. L'intégration

1. Une application s'enregistre par une déclaration : identifiant, nom, types
   de contexte qu'elle fournit, actions qu'elle propose. La déclaration n'a
   **aucun champ de permission** ; un champ en trop est refusé.
2. Enregistrée, elle n'a **aucune** permission.
3. Mickaël accorde des capacités, une par une :
   - `fournir:<type>`, pour un type que l'application a déclaré ;
   - `action:<nom>`, pour une action qu'elle a déclarée ;
   - `lire:<application>`, pour lire le contexte fourni par une autre
     application (ou `lire:noyau`).
4. **Le noyau vérifie la permission à chaque appel**, sans cache. Une
   révocation vaut donc immédiatement, dès l'appel suivant.
5. Chaque refus est journalisé : date, application, capacité demandée.

Une application ne s'accorde jamais une capacité : elle n'a accès à aucune
fonction d'octroi, et sa déclaration n'en porte pas.

### 3. Le contexte

Chaque élément porte :

- une **source** (`<application>:<nom>`), une **application** d'origine, une
  **date** ;
- un **statut** : `a_valider` à l'arrivée, `valide` après Mickaël, `retire`
  quand Mickaël le retire (plus jamais servi, mais visible de Mickaël) ;
- une **portée** : global, projet ou client (CADRE.md, « Mémoire ») ;
- ses **copies dérivées** (`derive_de`) : résumés et notes que Shyrka en tire.

**Une copie dérivée est aussi fermée que ses sources** : une application ne
la lit que si elle peut lire chacune de ses sources. Une dérivation ne fait
jamais passer le contexte d'une application à une autre.

### 4. L'oubli

Oublier un élément efface, en une fois :

- l'élément de la mémoire active ;
- ses entrées dans l'index de recherche ;
- toutes ses copies dérivées, de proche en proche, et leurs entrées d'index.

Le noyau garde seulement deux empreintes (SHA-256) de chaque élément oublié :
celle de son identifiant, et celle de son application, de son type et de son
contenu. Elles servent à ne plus jamais le servir :

- **Sauvegardes** : une restauration rejoue les oublis avant de servir quoi
  que ce soit. Un élément oublié présent dans une sauvegarde est écarté.
  Les sauvegardes réelles, quand elles existeront, expireront au plus tard
  30 jours après leur création ; d'ici là, la règle de restauration suffit.
- **Refourniture** : une application qui renvoie le même contenu est refusée
  (« cet élément a été oublié »).
- **Journal** : il garde les faits (qui, quand, quoi). Les identifiants
  oubliés y sont remplacés par leur empreinte ; aucune entrée ne garde le
  contenu.
- **Export** : un élément oublié n'y figure pas.

### 5. La confidentialité

- **Traitement local par défaut.** Le noyau n'appelle aucun réseau. Les
  modèles restent locaux (CADRE.md, `infra/shyrka/src/local.ts`).
- **Aucun contexte d'une application transmis à une autre** sans une
  capacité `lire:<application>` accordée par Mickaël.
- **Mode privé**, activé et arrêté par Mickaël :
  - **rien n'est conservé** : ni la conversation, ni les éléments fournis
    (une fourniture rend `conserve: false`, sans identifiant), ni la mémoire ;
  - **rien n'est appris** : aucune copie dérivée, aucune entrée d'index ;
  - **aucune télémétrie** : le noyau n'en a pas ;
  - **ce qui reste**, le journal technique minimal : la date de début et de
    fin du mode privé, et les refus (date, application, capacité), sans aucun
    contenu.
- Les données de Swift et de ses clients n'entrent pas (CADRE.md).

### 6. L'identité, à part des permissions

L'identité et les permissions vivent dans deux portées séparées. Shyrka
choisit sa voix, son apparence et son expression ; un champ en dehors de ces
trois est refusé (une tentative d'y glisser une permission ou un palier
échoue). Les permissions ne se changent que par Mickaël. La version 0
(voix Aurélie, apparence « Lovable Shyrka v0 », présence en points) est
celle que Mickaël a décidée le 7 novembre 2026.

### 7. L'export

Mickaël exporte tout son contexte, à tout moment, en JSON versionné
(`format: "shyrka.contexte.export"`, `version: 1`) : identité, éléments,
sources, applications, permissions, journal. Format ouvert, lisible sans
Shyrka.

## Conséquences

- `infra/shyrka` (Shyrka v0) reste en place. Ses paliers d'agents
  (`permissions.json`) deviendront des capacités du noyau quand le noyau
  sera branché ; ce branchement est hors de ce mandat.
- OIA sera la première application hôte. Elle s'enregistrera avec ses types
  (projet, décision, opportunité) et ses actions.
- Le stockage réel (fichier chiffré local, puis base) suivra les interfaces
  du noyau, avec les mêmes tests.

## Ce qui reste à décider par Mickaël

1. Le stockage réel du noyau : fichier chiffré sur le volume
   `Shyrka-corpus`, ou autre.
2. La durée de conservation des sauvegardes réelles (proposition : 30 jours).
3. Les premières capacités à accorder à OIA.
4. Le nom de paquet : le mandat demande `packages/shyrka` ; le nom
   `@oia/shyrka` étant pris par `infra/shyrka`, le paquet s'appelle
   `@oia/shyrka-noyau`.

## Évolution du 8 novembre 2026 · Shyrka dans le cockpit (mandat v9, bloc G)

**Ce qui change.** Le principe « local par défaut » de cette décision connaît
une évolution assumée : pour parler à Mickaël dans le cockpit en ligne,
Shyrka conserve ses conversations dans la base OIA et envoie ses messages à
Mistral. Cette évolution est limitée à la conversation en texte du cockpit ;
tout le reste reste local.

### Flux de données

| Où | Quoi | Règles |
| --- | --- | --- |
| **Sur le Mac seulement** | Voix (Whisper, voix Aurélie), entretiens et leurs enregistrements, corpus, courrier, `pnpm shyrka:parler` avec Ollama | Rien ne quitte le Mac. Les entretiens n'acceptent qu'un modèle local, sans exception |
| **Base OIA (Supabase)** | Conversations et messages (`shy_conversation`, `shy_message`), éléments de contexte (`shy_contexte`), empreintes des oublis (`shy_oubli`), brouillons (`shy_brouillon`), journal des actions (`shy_journal`), journal des appels au modèle sans texte (`oia_ia_appel`) | Lignes privées par compte (`user_id = auth.uid()`), lisibles seulement par un propriétaire du studio ; écriture par fonctions `shy_*` seulement (migration `0007_shyrka.sql`) |
| **Mistral (API)** | Le message de Mickaël, les derniers tours de la conversation, et les extraits de données d'OIA rendus par les outils pour répondre | Rien d'autre. Clé du projet, côté serveur (`shyrka-chat`), jamais dans le navigateur. 4 000 jetons d'entrée au plus par appel, 3 appels au plus par message |

**Exclusions avant tout envoi** (`packages/shyrka/src/serveur/filtre.ts`,
tests adverses) : un message qui touche à Swift n'est ni envoyé ni
conservé ; une ligne de données qui touche à Swift est retirée entière ; les
numéros de compte, de carte et de document sont masqués. Agenda, Santé et
Famille ne sont pas connectés.

**Mode privé** : rien n'est conservé (ni message, ni brouillon, ni journal
d'actions). Seule la ligne de dépense de l'appel reste, sans texte.

**Oubli** (`shy_oublier`) : la conversation ou l'élément est supprimé, son
empreinte est gardée pour qu'il ne revienne pas, et les entrées du journal
qui le désignaient ne portent plus que l'empreinte.

**Garde des faits** : toute date d'une réponse absente des données rendues
par les outils est signalée à Mickaël dans la réponse et journalisée
(`packages/shyrka/src/serveur/garde.ts`). Ajoutée après une recette où le
modèle avait inventé des échéances.

**Sur le Mac**, `pnpm shyrka:parler -- --texte` utilise Ollama. Si Ollama est
absent (ou `SHYRKA_MODELE=mistral`), la conversation passe par Mistral avec
la clé de `~/.oia/mistral.env`, mêmes exclusions. Les entretiens restent
exclusivement locaux.

**Dépense** : plafond commun de 5 $ par mois avec la recherche assistée,
réservé en base de façon atomique avant chaque appel (`oia_ia_reserver`).

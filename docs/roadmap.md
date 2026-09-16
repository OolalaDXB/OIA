# OIA — roadmap

Écrite le 16/09/2026, après mesure sur les données réelles du dépôt. Elle
remplace, comme document vivant, le plan Milestone 1
(`docs/architecture/06-milestone-1-plan.md`, conservé comme trace historique).

---

## 1. Sur quelle base le système cherche et évalue — l'état de départ

> **Ces quatre mesures datent du 16/09/2026 au matin, avant S1–S3.** Elles sont
> conservées telles quelles : ce sont les chiffres qui ont décidé de l'ordre de
> la roadmap, et les effacer une fois corrigés rendrait les sprints
> invérifiables. Ce qui a changé depuis est écrit dans S1, S2 et S3.

Quatre mesures, faites sur le dernier run réel et sur le code tel qu'il tourne.
Elles ne sont pas flatteuses, et c'est le point de départ de tout le reste.

### 1.1 La recherche ne connaît que trois filtres

La requête envoyée à TED, par projet, contient exactement : des **codes CPV**,
des **pays acheteurs**, une **date plancher**. Rien d'autre.

```
sillon → classification-cpv IN (48000000 72000000 92000000)
         AND buyer-country IN (FRA)
         AND publication-date>=20260618
```

Les CPV utilisés sont des codes de **division** (`72000000` = « services
informatiques », tout entier). On ne filtre donc pas : on prélève une tranche
énorme du flux et on espère trier après.

Le champ `queryTerms` du registre (« artificial intelligence », « sovereign
cloud »…) est **déclaré et jamais consommé** par la requête TED. C'est un défaut
que j'ai introduit : un champ qui promet une recherche plein-texte qui n'a pas
lieu. Corrigé en attendant qu'il soit câblé — l'écran dit désormais qu'il n'est
pas utilisé.

### 1.2 On ramène majoritairement le mauvais type d'avis

Sur les 100 avis de la dernière réponse TED réellement enregistrée :

| `notice-type` | Nombre | Ce que c'est |
|---|---|---|
| `qu-sy` | **81** | Système de qualification — un registre permanent de fournisseurs, pas un marché à remporter |
| `cn-standard` | 16 | Avis de marché — **le seul type sur lequel on soumissionne** |
| `corr` | 2 | Rectificatif |
| `cn-social` | 1 | Marché de services sociaux |

**81 % du flux n'est pas une opportunité.** Et **99 avis sur 100 n'ont pas de
date limite** — parce qu'un système de qualification n'en a pas.

Conséquence directe, visible dans `/metrics` : le gate bloque 10 enregistrements
sur « pas de date limite vérifiée ». On lisait ça comme un défaut de
vérification humaine. C'est d'abord un défaut de **sélection à la source**.

### 1.3 Le moteur de matching travaille sur un titre de 54 caractères

Le corpus sur lequel une opportunité est comparée à un projet, c'est :
`titre + émetteur + les quelques champs de métadonnées`. Mesuré : le titre
médian fait **54 caractères**. Voici littéralement ce que le moteur voit :

```
United Kingdom-Huyton: Health and social work services
Italy-Rome: Machine tools
Italy-Rome: IT services: consulting, software development, Internet and support
```

Et sur les 15 enregistrements de la console, **8 ne portent aucun fait** — leur
corpus se réduit au titre et au nom de l'acheteur.

Le score est ensuite un recouvrement de mots : mots-clés ×12, secteurs ×10,
géographie ×4, plafonné à 70, veto par exclusions. C'est honnête et explicable
— chaque suggestion dit quels signaux ont matché — mais **ça reste une
correspondance de titre, pas une évaluation**. La page de l'avis est pourtant
déjà téléchargée et analysée par le moteur : son texte est simplement jeté.

### 1.4 Les profils viennent de la prose, pas des produits

Les 16 fiches de `registry/projects/` ont été dérivées :

- du **portfolio public de TheStudioMT** (`Portfolio.tsx` : nom, description,
  ligne d'exécution) — de la copie marketing ;
- du **dossier canonique BAWABA** (`knowledge/products/bawaba/`) — la seule
  source de niveau « produit » ;
- des **hypothèses Phase 2** précédentes, pour Ludography.

Je n'ai **pas lu les dépôts produits** (SILLON, myOolalaP1, maison-collection,
CoachGari, rls-guard, BEAU…). Le handoff de TheStudioMT prévient précisément
contre ça : *« la prose dérive ; la source non — préférez la source à la
prose »*. Mes profils héritent de cette dérive.

Pour du matching d'appel d'offres, ça compte : la bonne question n'est pas
« le titre contient-il *software* ? », c'est « **savons-nous livrer ça, avec
quelles références, sous quelle entité ?** ». Cette information est dans les
dépôts et dans `knowledge/capabilities`, pas dans une ligne de portfolio.

---

## 2. Ce que le produit ne sait pas encore représenter

Tu cherches : appels d'offres, RFP, **RFI / sources sought / expression de
besoin amont**, dossiers de financement, **levée**, **aides**, et plus.

> **Résolu par S3** — le modèle en connaît onze et le gate s'adapte au type.
> Le diagnostic ci-dessous reste parce qu'il explique *pourquoi*.

Le modèle d'alors connaissait quatre types : `GRANT`, `TENDER_RFP`,
`VC_INVESTOR`, `REGULATORY`. Le vrai problème n'est pas le nombre d'étiquettes — c'est que
**le gate suppose un objet unique : « un appel officiel avec une date
limite »**. Il exige une date limite vérifiée pour tout.

Or :

| Ce que tu cherches | A une date limite ? | Le gate actuel |
|---|---|---|
| Appel d'offres (RFP/ITT) | oui | fonctionne |
| Subvention, appel à projets | oui | fonctionne |
| **RFI / sources sought / avis de préinformation** | fenêtre courte, parfois aucune | mal représenté |
| **Aide fiscale (CIR, CII, JEI)** | **aucune** — c'est un statut, pas un appel | **bloqué à jamais** |
| **Levée (VC, BA, accélérateur)** | aucune côté émetteur | **bloqué à jamais** |
| Prêt / garantie (BPI) | variable | mal représenté |
| Appel à partenaires / consortium | oui | fonctionne, mais l'objet n'est pas une opportunité financière |

Deux de ces lignes — les aides fiscales et la levée — sont **structurellement
impossibles à faire passer en PURSUE aujourd'hui**, quelle que soit la qualité
de la preuve. Ce n'est pas un réglage, c'est une hypothèse du modèle.

Note stratégique sur l'amont : l'avis de préinformation (`pin` chez TED) et le
*sources sought* américain sont les instruments où l'on peut encore **influencer
le cahier des charges** avant qu'il soit écrit. C'est la catégorie à plus forte
valeur pour un studio, et c'est celle qui est aujourd'hui invisible. Le champ
`notice-type` est déjà récupéré — le signal est à portée de main.

---

## 3. Roadmap

Ordonnée par valeur business divisée par effort, pas par élégance technique.

### S1 — Chercher au bon endroit — ✅ **livré le 16/09/2026**

- **Classification des avis** (`classifyNoticeType`) : BIDDABLE, PRE_SOLICITATION,
  QUALIFICATION_SYSTEM, AWARD_RESULT, CORRECTION, UNKNOWN. Par préfixe et non
  par liste fermée — un type inconnu est **conservé** et signalé, jamais jeté
  en silence : ce serait refaire la même erreur dans l'autre sens.
- **Filtrage à deux étages.** Côté requête (`notice-type IN (…)`) *et* côté
  résultats. Le second est la garantie : il ne dépend d'aucune syntaxe non
  vérifiée.
- **CPV descendus au niveau réel** sur les 10 projets : `72212517` développement
  de logiciels, `72212730` logiciels de sécurité, `92522000` préservation de
  sites historiques, `48451000` progiciels ERP… au lieu de `72000000`. Chaque
  fiche porte un `cpvNote` disant d'où viennent les codes et ce qui reste à
  vérifier.
- **`queryTerms` câblé** en clause plein-texte.
- **Requête en couches, du prouvé au spéculatif.** CPV / pays / date sont
  prouvés (un run réel les a validés). `notice-type` et le plein-texte ne le
  sont pas — impossible de tester la syntaxe experte sans egress. Ils vivent
  donc dans des couches que le worker **abandonne une par une** si TED rejette
  la requête, avant de réessayer. Une clause spéculative peut améliorer un run ;
  elle ne peut pas le faire échouer.

**Mesuré :** sur la réponse TED réellement enregistrée, 100 avis → **17 à
traiter** (81 systèmes de qualification + 2 rectificatifs écartés). Test de
contrat sur le fixture réel, pas sur un exemple inventé.

**Pas encore mesurable ici :** le « > 70 % avec date limite » demande un run
live. Le rapport de run affiche désormais, par projet, `N retenus sur M
ramenés` — la preuve se produira toute seule au premier run.

### S2 — Matcher sur le dossier, pas sur le titre — ✅ **livré le 16/09/2026**

`extractTenderFacts` lit la page de l'avis — celle qui était déjà téléchargée,
hachée, vérifiée, puis jetée — et en sort des faits provenancés :

| Champ | Ce que ça change |
|---|---|
| `scope` | l'objet réel du marché, plafonné à 1 200 caractères |
| `eligibility` | **le blocage n°1 du gate** : les critères de sélection, enfin extraits |
| `award_criteria` | sur quoi l'attribution se joue |
| `estimated_value` | le budget — un marché à 40 k€ et un à 4 M€ ne se traitent pas pareil |
| `procedure` | ouverte, restreinte, négociée… |
| `place_of_performance`, `nuts_code` | où |
| `lots` | combien de lots |
| `cpv_additional` | les codes secondaires que la recherche ne montrait pas |

Deux règles d'honnêteté dans l'extracteur : **une section absente ne produit
aucun fait** (jamais de valeur devinée), et quand aucun titre de section n'est
reconnu, le repli sur le texte d'ouverture **le dit dans son localisateur** et
baisse sa confiance.

**Mesuré :** sur un avis représentatif, le corpus passe de **61 à 796
caractères** — treize fois plus, entièrement depuis une page déjà payée.

**Pas encore mesurable ici :** la médiane sur données réelles. Le worker la
calcule et l'affiche à chaque run (`median matchable text: N chars`), donc la
preuve arrive avec le premier run live.

**Effet de bord immédiat, visible dans la console :** les 5 avis TED déjà en
base portent leur `notice-type`. La console les étiquette maintenant « not a
call » avec la raison, au lieu de les présenter comme des opportunités. Je n'ai
pas réécrit le jeu de données : c'est la vraie sortie d'un vrai run, et elle
reste telle quelle.

### S3 — Une taxonomie qui couvre ce que tu cherches, et un gate qui s'y adapte — ✅ **livré le 16/09/2026**

**Onze types** au lieu de quatre, chacun avec un profil déclaré
(`packages/ingestion/src/opportunity-kinds.ts`) :

| Type | Forme | Sens |
|---|---|---|
| `TENDER` | contrat | appel d'offres, RFP, ITT |
| `PRE_SOLICITATION` | contrat | RFI, *sources sought*, avis de préinformation — l'amont où le cahier des charges s'écrit encore |
| `GRANT` | non dilutif | subvention, appel à projets |
| `TAX_INCENTIVE` | non dilutif | CIR, CII, JEI — un **statut**, pas un appel |
| `EQUITY` | dilutif | levée, BA, accélérateur |
| `DEBT_GUARANTEE` | remboursable | prêt, garantie BPI |
| `PRIZE` | non dilutif | concours, prix |
| `CONSORTIUM_CALL` | contrat | recherche de partenaires |
| `MARKETPLACE_PROJECT` | contrat | Upwork, Malt, Comet — une mission publiée, pas un marché |
| `ACQUISITION` | achat | Acquire, Flippa — **le seul type sortant** : l'argent part |
| `REGULATORY` | aucune | à surveiller, jamais à poursuivre |

Les anciens libellés (`TENDER_RFP`, `VC_INVESTOR`) sont remappés à la lecture :
les données déjà en base ne sont pas réécrites.

**Le gate est devenu fonction du type, sans devenir un réglage.**
`gate-profiles.ts` sépare deux familles :

- **six conditions universelles** — source primaire accessible, source vérifiée,
  éligibilité évaluée, pas un simple agrégateur, action suivante exacte,
  confiance suffisante. *Aucun type ne peut s'en exempter.*
- **trois conditions de date limite** — date vérifiée, non expirée, appel non
  clos. Elles ne s'appliquent **que si le type en a une**.

C'est la différence entre un gate configurable et un gate adaptatif : le
cadran qui aurait permis d'assouplir « source vérifiée » n'existe pas.

Chaque type porte en plus **sa propre question à l'humain** (`humanQuestion`) :
pour un CIR, « l'assiette et l'exercice sont-ils confirmés ? » ; pour une levée,
« la thèse et le stade correspondent-ils ? » — la vérification humaine reste
obligatoire, mais elle porte enfin sur ce qui compte pour l'objet.

`ACQUISITION` est marqué `OUTBOUND` et `REGULATORY` `actionable: false` : le
premier n'est jamais additionné au reste dans les totaux financiers, le second
est forcé hors PURSUE quelle que soit la preuve.

**Preuve de fin, atteinte :** un CIR et un investisseur passent PURSUE-eligible
sous leurs propres conditions, sans qu'aucune condition d'appel d'offres soit
assouplie — c'est un test, pas une affirmation.

### S4 — Élargir les sources — 🟡 **registre livré, connecteurs à venir**

Livré le 16/09/2026 : les sources ne sont plus une intention dans un tableau de
roadmap, ce sont **18 fiches YAML** (`registry/sources/`) que le code lit, que
Zod valide et que la console affiche. Chacune porte un **statut qui ne se
contourne pas** :

| Statut | Sens | Combien |
|---|---|---|
| `LIVE` | un connecteur tourne et ramène | 1 (TED) |
| `FIXTURE_ONLY` | connecteur écrit, jamais confirmé en réel | 1 (EU Funding & Tenders) |
| `DECLARED` | source identifiée, **aucun connecteur** — l'intake manuel est le chemin | 12 |
| `BLOCKED` | l'accès automatisé est interdit ou sous compte | 4 |

Le validateur **refuse** qu'une fiche se dise `LIVE` sans connecteur, et refuse
qu'une fiche `DECLARED` en déclare un. C'est ce qui empêche la liste de devenir
un argumentaire.

Ajoutées sur ta demande : **aides régionales Bretagne**, aides-territoires,
BPI, France 2030 / ADEME, CIR-CII-JEI, et côté Émirats **Hub71**, **ADIO**,
marchés publics fédéraux UAE. Pour padel.design sur l'EMEA : UK Find a Tender,
UNGM, Banque mondiale / BAD / BERD.

Sur **Upwork, Malt, Comet, Acquire** : `BLOCKED`, et c'est délibéré. Leurs
conditions d'utilisation interdisent le *scraping*, et te connecter avec tes
identifiants pour les moissonner mettrait **ton compte** en jeu, pas le mien.
Le chemin supporté est l'intake par lien (§ S7) : tu vois une mission ou une
cession qui t'intéresse, tu colles l'URL, elle entre dans le pipeline comme
tout le reste. Le jour où l'un d'eux ouvre une API officielle, la fiche change
de statut et un connecteur se branche — la place est déjà faite.

Le reste du tableau ci-dessous garde sa valeur de priorisation :


| Source | Couvre | Pour qui | Effort | À vérifier avant |
|---|---|---|---|---|
| **BOAMP** (open data) | Marchés publics FR, y compris **sous les seuils européens** | TheStudio, padel.design | moyen | format et stabilité de l'API |
| **SEDIA / EU F&T** | Horizon, Digital Europe, Creative Europe, EIC | BAWABA, SILLON, Ludography | **connecteur déjà écrit, expérimental** | le remettre sous test réel |
| **aides-territoires** | Aides FR aux assos et collectivités | Les Vieilles Pierres, Maisons.co | faible | accès et fraîcheur |
| **BPI France / France 2030** | Subventions, prêts, garanties | tous les projets FR | moyen | existence d'un accès machine |
| **SAM.gov** | RFP **et sources sought** fédéraux US | TheStudio, BAWABA | moyen | clé d'API, conditions d'usage |
| **UNGM / Banque mondiale / BAD** | Appels d'offres organisations internationales | TheStudio, fondations | moyen | un enregistrement UNESCO existe déjà |
| GCC (Etimad, portails Émirats) | Marchés publics du Golfe | BAWABA, myOolala | élevé | aucune API ouverte connue — veille manuelle assumée |

Les sous les seuils européens méritent un mot : c'est là qu'un studio de ta
taille **gagne réellement** des marchés. TED ne publie que l'au-dessus des
seuils. C'est pour ça que BOAMP est en tête de tableau, avant tout le reste.

**Sur la levée, sois prévenu :** il n'existe pas de source ouverte sérieuse pour
le sourcing investisseurs. Les bases qui valent quelque chose sont payantes et
leurs licences interdisent ce qu'on en ferait. Je ne recommande pas de
connecteur ici — `VC_INVESTOR` doit rester alimenté à la main, avec les contacts
et les tâches, pas simulé par un agrégateur.

### S5 — Matcher sur ce qu'on sait livrer, pas sur des mots-clés

- Dériver l'inventaire de capacités **des dépôts produits** — migrations,
  fonctions edge, modules réels — et non de la copie du portfolio. C'est la règle
  que le studio s'est déjà donnée à lui-même.
- Lier registre ↔ `knowledge/capabilities` : chaque projet pointe vers les
  briques qu'il embarque, avec leur maturité de preuve.
- L'éligibilité devient : **entité** + **références** + **capacités couvertes** +
  seuils (CA, certifications, assurances).
- **Preuve de fin :** sur un avis réel, la fiche indique quelle brique couvre
  quelle exigence, avec quelle preuve — **et nomme les trous**. C'est déjà ce que
  fait `qualify-with-knowledge.ts` pour BAWABA ; il s'agit de le généraliser.

### S6 — Base permanente et alertes — ✅ **livré le 16/09/2026**

Demandé en cours de route : *« la recherche et la veille doivent être permanentes
donc je dois pouvoir tenir une base de données et gérer des alertes »*. C'était
en réalité un **préalable**, pas une suite : chaque run remplaçait l'instantané,
donc le système ne pouvait pas distinguer un appel nouveau d'un appel vu dix
fois — et sans cette distinction, aucune alerte n'est possible.

Livré : registre permanent en Postgres (une ligne par **identité**
d'opportunité, à travers tous les runs), journal de changements append-only,
moteur d'alertes déterministe et idempotent, écran `/alerts`, authentification,
et la couche humaine passée en base. Mise en service :
[`watch-setup.md`](watch-setup.md).

Reste de S6, non fait et non nécessaire aujourd'hui : plusieurs relecteurs,
notifications sortantes (tu as choisi « dans la console uniquement »).

### S7 — Liens vérifiés, argent visible, console utilisable — ✅ **livré le 16/09/2026**

Quatre demandes en une, toutes venues de l'usage réel et pas d'un plan.

**« Beaucoup de 404 ».** Chaque URL publiée — liens des projets, sources,
opportunités — passe désormais par `check:links` : HEAD puis GET si le serveur
refuse la première, garde SSRF, classement en `OK / REDIRECTED / DEAD /
UNREACHABLE / REFUSED`. Le résultat est **écrit dans le registre** (`urlVerified`,
`lastUrlCheck`) et affiché à côté du lien : *vérifié le …*, ou *jamais vérifié* —
jamais rien qui laisse croire qu'un lien marche parce qu'il a été tapé.

Le point qui compte : le premier jet du vérificateur a rapporté **45 URL
valides comme refusées**. Elles ne l'étaient pas — c'est notre propre sortie
réseau qui était bloquée, et l'outil accusait les sites des autres. Il y a
maintenant une **sonde témoin** (`probeEgress`) au début du run : si elle ne
sort pas, le run déclare « la vérification n'a pas eu lieu », **ne marque
rien** et sort en erreur. Un vérificateur qui ment sur l'état du réseau est pire
que pas de vérificateur.

**« Un tableau de récap financier du potentiel par projet ».** Écran `/money`,
avec trois règles visibles à l'écran plutôt qu'enfouies dans le code :

- **la couverture accompagne chaque total** — « 3 sur 15 portent un montant » est
  une partie du chiffre, pas une note de bas de page ;
- **entrant et sortant ne se mélangent jamais** — une acquisition dépense ;
- **ce que le gate bloque est compté à part** — pas de chiffre unique flatteur.

Les montants sont **lus** dans les documents (`estimated_value` d'abord), jamais
estimés ; un groupage irrégulier (`EUR 5 0 00 000`, vrai extrait de PDF) descend
la confiance au lieu d'inventer une certitude. Aucune conversion de devise n'est
faite : EUR et AED restent côte à côte.

**« Ultra le bordel ».** Le rail passe de treize entrées à **cinq** :
*Aujourd'hui · Opportunités · Projets · Argent · Espace de travail*. Les
anciennes routes existent toujours et atterrissent sur la bonne vue — aucun lien
partagé ne se casse. Et le vocabulaire est traduit une fois pour toutes
(`vocabulary.ts`) : `MANUAL_REVIEW_REQUIRED` devient « pas encore vérifié »,
`noVerifiedDeadline` devient « aucune date limite confirmée ».

**« Lancer une recherche sur n'importe quel nouveau projet ».** Trois chemins,
tous depuis la console :

1. **Créer un projet** — le brouillon est validé par le **même schéma Zod** que
   les fiches YAML, puis matérialisé en `registry/projects/<slug>.yaml` par le
   worker. La YAML reste la source de vérité ; la console ne devient pas une
   seconde vérité.
2. **Lancer une recherche** sur un projet existant. La demande est *réclamée*
   par le workflow (`requests --plan`), exécutée, puis **close contre ce qui
   s'est réellement passé** (`requests --settle`). Une demande n'est jamais
   marquée faite sans qu'une recherche ait tourné.
3. **Coller un lien** — l'intake universel. C'est la réponse aux « sites plus
   confidentiels » : la page est récupérée avec le même fetcher gardé, hachée,
   confrontée à son propre domaine, lue pour son objet et son éligibilité, et
   atterrit à **« pas encore vérifié »**. Coller un lien n'est pas vérifier une
   source — seul un humain le fait.


---

## 3 bis. Ce que la base change pour les sprints ci-dessus

S1 et S2 gagnent un effet de levier qu'ils n'avaient pas. Avant, améliorer la
requête ne faisait que changer un instantané. Maintenant, chaque amélioration
est **mesurable dans le temps** : le registre garde la trace de ce qui est
remonté, quand, et combien de fois — donc « la nouvelle requête ramène-t-elle
mieux que l'ancienne ? » devient une question à laquelle les données répondent,
au lieu d'une impression.

## 4. Ce que je recommande de ne pas construire

- **Le dépôt automatique de candidatures.** La valeur est dans le tri et la
  preuve, pas dans le remplissage. Le risque juridique et réputationnel est sans
  commune mesure avec le temps gagné.
- **Un modèle de classement par LLM.** Tout le produit tient sur le fait qu'un
  humain peut contester chaque verdict. Un score de pertinence appris est
  incontestable par construction — et le premier faux négatif coûte un marché
  qu'on ne saura jamais avoir raté.
- **Un CRM généraliste.** Contacts et tâches existent parce qu'ils s'accrochent à
  une opportunité. Le jour où ils ont besoin d'étapes et de pipelines, ce n'est
  plus ce produit.
- **Des connecteurs pour des géographies sans source ouverte.** Botswana, Kenya,
  Golfe : déclarés `discovery.enabled: false` avec la raison. Un connecteur qui
  ne ramène rien est pire qu'un manque assumé.

---

## 5. L'ordre, et pourquoi

```
S1 chercher au bon endroit ✅ ──► S2 matcher sur le dossier ✅ ──► S5 matcher sur les capacités
        │                                                                 ▲
        └──► S3 taxonomie + gate par type ✅ ──► S4 sources 🟡 ───────────┘
                    │
                    └──► S6 base permanente ✅ ──► S7 liens, argent, console ✅
```

Reste devant : **S5** (matcher sur ce qu'on sait livrer, pas sur des mots-clés)
et la moitié connecteurs de **S4** — BOAMP en premier, parce que c'est là que
se gagnent les marchés sous les seuils européens.

S1 d'abord parce que 81 % du flux actuel est structurellement hors sujet :
c'est le seul chantier dont le gain ne dépend d'aucun autre. S2 ensuite, parce
que le texte est déjà téléchargé — c'est de la valeur déjà payée et jetée. S3
avant S4, sinon chaque nouvelle source arrivera dans un modèle qui ne sait pas
la représenter.

Et une chose qui ne dépend pas de moi reste en tête de toutes les listes :
**les 16 profils sont des hypothèses tant que tu ne les as pas signés.** S1 et
S2 amélioreront la qualité de ce qui remonte ; ta relecture décide de ce que
« pertinent » veut dire.

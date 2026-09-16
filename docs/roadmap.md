# OIA — roadmap

Écrite le 16/09/2026, après mesure sur les données réelles du dépôt. Elle
remplace, comme document vivant, le plan Milestone 1
(`docs/architecture/06-milestone-1-plan.md`, conservé comme trace historique).

---

## 1. Sur quelle base le système cherche et évalue — l'état réel

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

Le modèle actuel connaît quatre types : `GRANT`, `TENDER_RFP`, `VC_INVESTOR`,
`REGULATORY`. Le vrai problème n'est pas le nombre d'étiquettes — c'est que
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

### S1 — Chercher au bon endroit *(le gain le plus élevé, l'effort le plus faible)*

- Filtrer par `notice-type` : exclure `qu-sy`, viser `cn-standard`, `cn-social`,
  et **remonter `pin` comme catégorie à part** (l'amont).
- Descendre les CPV du niveau division au niveau réel, par projet
  (`72212000` développement d'applications, `72261000` support logiciel,
  `79421000` gestion de projet…) au lieu de `72000000`.
- **Câbler `queryTerms`** en plein-texte dans la requête experte, validé avec
  `checkQuerySyntax: true` sur l'API live avant de le committer.
- **Preuve de fin :** sur un run réel, > 70 % des avis ramenés sont des avis sur
  lesquels on peut soumissionner, et portent une date limite.

> Aujourd'hui, 81 % de ce qu'on ramène est du bruit structurel. Aucune
> amélioration de l'interface ou du scoring ne compense ça.

### S2 — Matcher sur le dossier, pas sur le titre

- La page de l'avis est déjà téléchargée, hachée et analysée. Extraire de son
  texte, avec localisateur et provenance : objet et lots, critères d'éligibilité,
  budget/estimation, région (NUTS), date limite, procédure.
- Alimenter le corpus de matching avec ça.
- **Preuve de fin :** corpus médian > 1 500 caractères par enregistrement, et
  une suggestion cite **une phrase de l'avis**, pas son titre.

### S3 — Une taxonomie qui couvre ce que tu cherches, et un gate qui s'y adapte

- Types : `TENDER`, `PRE_SOLICITATION` (RFI / sources sought / PIN),
  `GRANT`, `TAX_INCENTIVE`, `EQUITY`, `DEBT_GUARANTEE`, `PRIZE`,
  `CONSORTIUM_CALL`, `REGULATORY`.
- **Gate par type.** Les conditions dures deviennent propres à chaque type : une
  aide fiscale n'a pas de date limite mais exige un critère d'assiette et un
  exercice ; une levée n'a pas d'émetteur mais exige une thèse d'investissement
  et un stade. Le principe ne bouge pas — pas de PURSUE sans source primaire
  accessible, ni sans action suivante exacte, ni sans qu'un humain ait vérifié —
  seule la liste des conditions devient fonction du type.
- **Preuve de fin :** un CIR et un investisseur peuvent atteindre
  PURSUE-eligible **sous leurs propres conditions**, sans assouplir celles d'un
  appel d'offres.

### S4 — Élargir les sources, par valeur décroissante

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
S1 chercher au bon endroit  ──►  S2 matcher sur le dossier  ──►  S5 matcher sur les capacités
        │                                                              ▲
        └──►  S3 taxonomie + gate par type  ──►  S4 sources  ──────────┘
                                                                  S6 multi-utilisateur (plus tard)
```

S1 d'abord parce que 81 % du flux actuel est structurellement hors sujet :
c'est le seul chantier dont le gain ne dépend d'aucun autre. S2 ensuite, parce
que le texte est déjà téléchargé — c'est de la valeur déjà payée et jetée. S3
avant S4, sinon chaque nouvelle source arrivera dans un modèle qui ne sait pas
la représenter.

Et une chose qui ne dépend pas de moi reste en tête de toutes les listes :
**les 16 profils sont des hypothèses tant que tu ne les as pas signés.** S1 et
S2 amélioreront la qualité de ce qui remonte ; ta relecture décide de ce que
« pertinent » veut dire.

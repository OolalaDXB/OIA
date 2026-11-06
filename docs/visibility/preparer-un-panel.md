# Préparer un panel de questions AEO

Ce guide s'applique à **tout sujet** d'OIA Visibility. Il reprend B1 à B4 du mandat P1 et la doctrine OIA Visibility (preuves, provenance, validation humaine).

## À savoir avant de commencer

- Un panel est **versionné** : le passage d'une v*n* à v*n+1* est un événement, pas un coup de gomme. Toute question reformulée crée une nouvelle `version` (B1).
- Un panel est **gelé pendant une fenêtre de mesure** : on ne change pas la version active au milieu d'une fenêtre J0 ou de follow-up. Les comparaisons entre fenêtres ne valent que si la `panelVersion` est identique.
- Un panel ne devient actif qu'après une **validation humaine** (règle 16 du mandat) : un agent ne peut pas valider.

## Méthode

### 1. Sources

Lister d'où viennent les questions :

- **Fiche du sujet** (`subject.yaml`) : offres, marchés, langues, alias.
- **Documents sources** du sujet (`subject.yaml` → `sources`) : plan SEO/AEO, étude interne, note du propriétaire.
- **Concurrents** : déclarés dans `subject.yaml` avec leur `rationale`.
- **Search Console** : CSV exporté, importé dans le générateur quand il sera branché (hors cette version).

Chaque question garde la trace de sa provenance via `origin` (`claude`, `elmo-assistant`, `owner`, `document`, `generator`) et optionnellement `sourceId` / `sourceRef`.

### 2. Intentions et répartition

Cinq intentions sont normalisées (B1) :

| Intention | Exemple |
|---|---|
| `decouverte` | « Quelles sont les meilleures options pour X ? » |
| `prix_offre` | « Combien coûte X ? » / « Qu'inclut X ? » |
| `comparaison` | « X vs Y » |
| `niche_local` | « Y a-t-il une option locale pour X à Z ? » |
| `marquee` | « Que propose <marque> pour X ? » (branded) |

Répartition par défaut du générateur, par langue :

```
3 decouverte + 2 prix_offre + 1 comparaison + 2 niche_local + 2 marquee = 10 questions
```

Elle est **paramétrable** via l'option `mix` de `proposePanel()` (API TypeScript), pas encore via la CLI cette nuit.

### 3. Rédaction

- Une question **marquée** (`family: branded`, `intent: marquee`) **contient** l'alias de la marque. Règle codée B1, test automatique dans `checkBundle`.
- Une question **non marquée** (`family: unbranded`) **ne contient jamais** la marque ni ses alias. Même règle, même test.
- Chaque question est unique (contrôle B2 côté générateur et dédoublonnage côté `checkBundle`).

### 4. Traçabilité

Chaque question a :

- `id` (ex. `fr-01`, `en-07`) ;
- `version` (1 au départ ; +1 à chaque reformulation, l'ancienne version passe à `retired` avec `supersededBy`) ;
- `createdAt` (date ISO) ;
- `origin` et au besoin `sourceId` ;
- `status` : `proposed` (généré, en attente d'édition), `active` (dans le panel actif), `candidate` (gardé pour un panel plus tard), `retired` (ancienne version).

### 5. Validation

Validation = passage de `panel.status: draft` à `validated`, avec `validatedBy` et `validatedAt` renseignés.

```
export OIA_SEO_HUMAN_IDENTITY=<id dans humans.yaml>
pnpm --filter @oia/visibility-infra subjects panel validate <subject> <proposalFile>
```

Garde-fous codés (règle 16) :

- La variable `OIA_SEO_IS_AGENT=1` **refuse** la validation. Les exécuteurs d'agents SEO Command tournent avec cette variable (tests le prouvent).
- L'identité fournie doit exister dans `infra/visibility/humans.yaml` **et** porter le rôle `owner`. Un `member` peut rédiger, pas valider.
- Le fichier validé est écrit à côté du panel source, jamais à sa place : `panel.validated.v<N>.yaml`. Mickaël le renomme manuellement en `panel.yaml` quand il veut en faire la version active (après avoir archivé l'ancien `panel.yaml`).

### 6. Gel et remesure

Pendant une fenêtre de mesure :

- `subjects freezes <id>` renvoie exit 1 si un gel est en vigueur. À lancer **avant toute proposition d'exécution** (voir `agents/checklist-site.md`).
- Aucune publication qui change ce que voient les IA ne se fait ; les validations et les rédactions de prochain panel se préparent en interne, se publient seulement après la fenêtre.
- Taille du panel : limite `maxPerLanguage` = 10 en M0, 20 au plus plus tard. Deux marquées minimum par langue (`minBrandedPerLanguage`).

## Commandes de la CLI

```
# propose un panel pour <subject>, à partir de son subject.yaml
visibility panel propose <subject> [YYYY-MM-DD] [--write]

# diff entre le panel actif et une proposition (ou une autre version)
visibility panel diff <subject> <proposalFile>

# validate : écrit panel.validated.v<N>.yaml (humain vérifié)
OIA_SEO_HUMAN_IDENTITY=<id> visibility panel validate <subject> <proposalFile>
```

Deux commandes d'aide existantes :

```
visibility subjects validate   # tous les sujets, plus de 15 règles vérifiées
visibility subjects freezes    # les gels en vigueur sur tous les sujets
```

## Illustration par les deux pilotes

- **Pilote 1 (anglophone)** : panel v2 validé au 2026-11-05, 10 questions actives (4 marquées + 6 non-marquées). Il n'a pas été regénéré cette nuit. La règle B1 (pas d'alias dans une non-marquée) a été vérifiée par le test de compatibilité : panel inchangé.
- **Pilote 2 (bilingue FR + EN)** : panel v1 encore en draft (10 questions). Le générateur a produit `panel.proposal.v2.yaml` avec 10 FR + 10 EN au statut `proposed` ; à relire, à enrichir en concurrents (voir `PANEL-PROPOSITION-B3.md`), puis à valider.

## Erreurs fréquentes

- **Un alias dans une question non marquée** : `checkBundle` refuse. Reformuler la question.
- **Une question marquée sans alias** : `checkBundle` refuse. Ajouter le nom de la marque.
- **Un `intent: marquee` sur une question non marquée** (ou l'inverse) : refusé. Alignement B1.
- **Reformulation sans incrément de version** : l'ancienne version doit rester, à `status: retired` + `supersededBy`.
- **Changement de panel pendant une fenêtre** : `panel.panelVersion` doit coller à `window.panelVersion` pour que la fenêtre reste exploitable. En pratique, on finit la fenêtre, puis on valide le nouveau panel.

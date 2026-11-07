# Modèle de vérification d'un compte · données

Version en données du document
`infra/visibility/agents/modele-verification-compte.md` (T2 du mandat du
2026-11-07). Un fichier YAML par famille (lettre), un contrôle par entrée,
avec son identifiant, son outil, son mode et sa gravité.

**Familles**

| Fichier | Lettre | Thème |
|---|---|---|
| `a-acces.yaml` | A | Accès et comptes |
| `b-domaine.yaml` | B | Domaine et indexation |
| `c-rendu.yaml` | C | Rendu et performance |
| `d-structure.yaml` | D | Structure des pages |
| `e-structured-data.yaml` | E | Données structurées |
| `f-contenu.yaml` | F | Contenu et offre |
| `g-entite.yaml` | G | Entité et réputation |
| `h-ia.yaml` | H | Visibilité dans les réponses des IA |
| `i-conversion.yaml` | I | Conversion |
| `j-a11y.yaml` | J | Accessibilité |
| `k-juridique.yaml` | K | Juridique et confiance |
| `l-mesure.yaml` | L | Mesure et fenêtres |
| `m-depot.yaml` | M | Dépôt et déploiement |

**Champs d'un contrôle**

- `id` : identifiant stable (`A01`…`M05`).
- `label` : énoncé court (phrase impérative du document).
- `tool` : qui vérifie (`crawlie`, `crawlseo`, `elmo`, `repo-read`, `oia`, `panel`, `manual`). `manual` = aucun outil ne couvre.
- `mode` : `auto` (l'outil conclut seul) · `mixte` (l'outil signale, une personne confirme) · `manuel`.
- `severity` : `bloquant` · `important` · `amélioration`.
- `tags` : facultatif, catégories transverses (`seo`, `aeo`, `tech`, `legal`, `access`).

Les contrôles `manual` ne pointent pas vers un outil. Les contrôles `auto`
ou `mixte` nomment toujours l'outil qui en est responsable ; c'est cette
contrainte qui fait du YAML autre chose qu'une simple duplication du
document d'origine.

**Usage**

- CLI : `pnpm --filter @oia/visibility-infra subjects verifications [--family A] [--tool crawlie]`.
- Site init : `src/site-init.ts` liste les contrôles applicables à un
  nouveau site (famille A sans A09 si non commercial, famille B et C
  toujours).
- SEO Command : la mission (`src/seo-command/mission.ts`) peut cibler une
  liste d'`id` ; `src/seo-command/executor.ts` relit le YAML pour
  déterminer l'outil à appeler.
- Tests : `test/verification.test.ts` vérifie que les IDs sont uniques,
  que toutes les lettres citées dans le document d'origine sont couvertes,
  et qu'aucun contrôle `auto`/`mixte` ne manque son outil.

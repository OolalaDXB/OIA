# Contrat de données · Visibility · version 3 : score, analyses, constats

16 novembre 2026. Migration `packages/database/supabase/migrations/0012_visibility_analyses_score.sql`,
**appliquée en production**. Les vues v1 et v2 restent servies. Les règles communes des
contrats v1 et v2 s'appliquent (RLS par client, lecture seule, aucune écriture directe,
honnêteté des chiffres).

## Fonction de geste

| Fonction | Bouton | Effet |
| --- | --- | --- |
| `vis_demander_analyse(p_subject text)` → `uuid` | « Analyser maintenant » | Demande `ANALYSE`, gratuite (aucun GO, aucun plafond). Si une analyse du site est déjà en file ou en cours, rend la même demande |

Le moteur traite la demande : Lighthouse 12.6.0 en mobile et en ordinateur (en français),
puis un audit de lecture de 50 pages avec Crawlie. Il écrit ensuite analyses et constats. Il
n'utilise aucun modèle de langage : les constats sont déterministes.

## Vues

### `vis_analyses_v3`

`id`, `client_id`, `subject_id`, `demande_id`, `nature` (`lighthouse`, `crawl`,
`indexation`), `strategie` (`mobile`, `ordinateur` ; null hors Lighthouse), `url`, `outil`,
`statut` (`fait`, `echec`), `scores`, `metriques`, `resultat`, `erreur`, `recu_le`,
`derniere` (la plus récente réussie de sa nature et de sa stratégie).

Contenu selon la nature :
- **Lighthouse.**
  - `scores` : `performance`, `accessibilite`, `bonnes_pratiques`, `seo`, de 0 à 1.
  - `metriques` : `lcp_ms`, `fcp_ms`, `cls`, `tbt_ms`, `si_ms`, `ttfb_ms`, `poids_ko`,
    `requetes`.
  - `resultat` : `opportunites` (`id`, `titre`, `gain_ms`, `gain_ko`), `avertissements`.
- **Crawl.**
  - `scores` : `sante`, `geo`, les scores de Crawlie.
  - `metriques` : `pages`, `indexables`.
  - `resultat` : `robots`, `donnees_structurees`, `prix_sans_js`, `regles`.

### `vis_constats_v3`

Une ligne par problème (`cle` stable d'une analyse à l'autre), dans sa dernière version.

| Colonne | Sens |
| --- | --- |
| `cle` | ex. `lighthouse:largest-contentful-paint:mobile`, `crawl:sitemap-absent` |
| `source` | `lighthouse`, `crawl`, `indexation` |
| `categorie` | `performance`, `seo`, `accessibilite`, `bonnes_pratiques`, `contenu`, `technique`, `visibilite_ia` |
| `gravite`, `ordre` | `critique` (1), `important` (2), `mineur` (3) |
| `titre`, `explication`, `correction` | le problème, pourquoi il compte, comment le corriger |
| `impact` | gain attendu (secondes, Ko) ou `null` |
| `effort` | `XS` à `XL` |
| `qui` | `client` ou `equipe` |
| `valeur` | valeur mesurée (ex. « 6,2 s ») |
| `preuve` | `audit`, `score`, `strategie`, `documentation` (lien) ou pages en cause |
| `premiere_fois`, `derniere_fois` | première et dernière analyse qui l'ont relevé |
| `etat` | `ouvert` si la dernière analyse terminée l'a relevé, sinon `resolu` |

### `vis_score_v3`

Une ligne par site.
- **Score (depuis 0014)** : `score` = visibilité IA seule, 0,7 × `visibilite_ia` + 0,3 × `notoriete_ia`. `score_site` (ajouté) = santé technique, Lighthouse. Ancienne règle, remplacée : moyenne pondérée des composantes mesurées, les
  poids étant renormalisés sur celles-ci.
- **Composantes** (de 0 à 100, `null` si non mesurée, jamais 0) :

  | Composante | Poids | Source |
  | --- | --- | --- |
  | `visibilite_ia` | 35 | présence de la marque sur les questions non marquées, dernière fenêtre close |
  | `seo_technique` | 15 | Lighthouse SEO, mobile |
  | `performance_mobile` | 15 | Lighthouse |
  | `notoriete_ia` | 15 | présence sur les questions marquées |
  | `accessibilite` | 10 | Lighthouse, mobile |
  | `performance_ordinateur` | 5 | Lighthouse |
  | `bonnes_pratiques` | 5 | Lighthouse, mobile |

- **Autres colonnes** :
  - `manquantes` : liste des composantes non mesurées ;
  - `analyse_le` ;
  - `fenetre_ia` ;
  - `constats_critiques`, `constats_ouverts`, `constats_resolus`.

### `vis_score_historique_v3`

`client_id`, `subject_id`, `le`, `origine` (`analyse` ou `fenetre`), `reference`,
`composante`, `valeur`. Un point par composante et par date. Aucune valeur n'est reportée
d'une date à l'autre.

## Fonctions du moteur (service_role)

- `vis_moteur_analyse(p_demande uuid, p_analyse jsonb)` → `uuid`
- `vis_moteur_constat(p_demande uuid, p_analyse uuid, p_constat jsonb)` → `uuid`

## Audits externes (0013, appliquée)

Audits faits par d'autres outils (Perplexity Computer…), **en complément** : jamais dans le
score d'OIA, car leurs méthodes ne sont pas comparables (interfaces grand public, une seule
passe, lieu du navigateur).

### `vis_audits_externes_v3`

Une ligne par audit importé : `id`, `client_id`, `subject_id`, `outil`, `realise_le`,
`methode`, `moteurs`, `score` (le score de l'outil), `resume`, `rapport_md` (Markdown, sans
script), `questions`, `importe_par`, `importe_le`, `dernier`.

### `vis_audit_externe_lignes_v3`

Une ligne par question et par moteur : `audit_id`, `question_id`, `sujet`, `question`,
`ordre`, `moteur`, `score`, `concurrents` (tableau), `domaines` (tableau).

Barème du score : 3 premier choix avec lien, 2 listé, 1 cité parce que nommé ou de façon
inexacte, 0 absent.

### Geste

`vis_importer_audit_externe(p_subject, p_outil, p_realise_le, p_methode, p_moteurs text[],
p_score, p_resume, p_rapport_md, p_matrice jsonb)` → `uuid`. Bouton « Importer un audit
externe » : le cockpit lit le CSV de l'outil, avec les colonnes `id`, `topic`, `prompt`,
`<moteur>_score`, `<moteur>_competitors` (séparés par « ; ») et `<moteur>_cited_domains`
(séparés par « , »), plus le rapport en Markdown. Il appelle ensuite la fonction. Réimporter
le même audit rend la même ligne.

Le plan d'action d'un audit externe peut être versé dans les recommandations. Ces lignes
portent `created_by = audit-externe:<outil>:<date>` et restent en attente de validation.

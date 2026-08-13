# OIA — Interface : design doc (Phase 1, console de review évolutive)

Mandat : console de review sur données réelles, architecture pensée pour devenir
un workspace opérationnel (notes, tâches, contacts, digest) SANS réécriture —
mais seule la Phase 1 est construite maintenant (anti-dérive, §7 du mandat).

## 1. Architecture de l'information

### Le type `Record` générique (ossature 5 phases)

Un seul concept transverse : le **WorkspaceRecord**, enveloppe générique déclinée
par `kind`. En Phase 1, seule la déclinaison `OPPORTUNITY` est câblée ; les autres
sont **déclarées** (types + navigation) mais non construites.

```
WorkspaceRecord
├─ kind: OPPORTUNITY   → payload = ConsoleRecord (@oia/ingestion) — Phase 1 (câblé)
├─ kind: NOTE          → Phase 3 (déclaré, non construit)
├─ kind: TASK          → Phase 3 (déclaré, non construit)
├─ kind: CONTACT       → Phase 3 (déclaré, non construit)
└─ kind: PROJECT       → Phase 2 (déclaré, non construit)
```

Règle absolue : le payload Opportunity **est** le `ConsoleRecord` existant de
`@oia/ingestion` — aucun DTO redéfini dans le web. L'enveloppe n'ajoute que
l'identité workspace (kind, liens futurs entre records).

### Ossature liste + détail partagée

Un seul layout master-detail (liste à gauche, détail à droite) que les phases
suivantes réutiliseront : la liste est paramétrée par `kind`, le détail par un
renderer par `kind`. En Phase 1 il n'existe qu'un renderer (Opportunity). Le
rail de navigation latéral affiche les 5 kinds ; seul « Opportunities » est
actif, les autres sont visibles mais désactivés (phase indiquée) — l'ossature
accueille la suite, elle ne la simule pas.

### Vues sauvegardables (dès Phase 1)

Une `SavedView` = nom + filtres (recommendation, verification, format, route,
human-review) + tri. Persistées côté navigateur (localStorage, clé
`oia.views.v1`) tant qu'il n'y a pas de store serveur. Le type vit dans
`@oia/workspace` pour être portable vers un vrai store plus tard.

## 2. Modèle de données couvrant les 5 phases

Nouveau package **`packages/workspace` (`@oia/workspace`)** — types uniquement +
stubs de services. Zéro logique métier dupliquée.

- `WorkspaceRecordKind`, `WorkspaceRecord` (union discriminée par kind ;
  Opportunity → `ConsoleRecord`).
- `SavedView` (filtres + tri nommés).
- `AuditEvent` — événement de revue **append-only** : `{ id, recordId, action
  (APPROVE | REJECT | NEEDS_VERIFICATION | COMMENT), comment, at, actor,
  gatePursueEligibleAtDecision }`. On enregistre l'état du gate AU MOMENT de la
  décision : la trace prouve qu'un APPROVE sur item bloqué n'a jamais pu
  produire un PURSUE.
- `SuggestionService` (opportunité → meilleur projet/candidat TheStudio, avec
  justification, jamais une certitude) — **interface + stub** en Phase 1,
  implémentation Phase 2.
- `DigestService` (veille matinale : opportunités qui comptent, actions, suivi)
  — **interface + stub** en Phase 1, implémentation Phase 4 (dépend du
  planificateur, roadmap Sprint 6).

Persistance Phase 1 : localStorage (audit `oia.audit.v1`, vues `oia.views.v1`),
car la console est un export statique sans backend. Les types sont conçus pour
migrer tels quels vers un store serveur (Supabase) quand la Phase 2 remettra une
authentification.

## 3. Spec de l'écran Phase 1

- **Liste (gauche)** — table de triage dense, défilement natif, tri par
  `publication-date` décroissant par défaut. Chaque ligne : badge
  recommandation, titre, émetteur, date de publication, statut de vérification,
  route, deadline, format, statut fetch, confiance, statut de revue humaine.
- **Détail (droite)** — sources (URL officielle cliquable), artefact + hash,
  live-fetch tel quel (échecs/BLOCKED affichés), vérification + évidence,
  éligibilité deux étages + route, scores, **gate déterministe** (9 conditions
  ✓/✗ + raisons d'échec), **faits groupés par provenance** avec badge
  (CONFIRMED_OFFICIAL / EXTRACTED / INFERRED / UNKNOWN) et **localisateur**
  (page PDF, sélecteur CSS, JSON_PATH), non-confirmé atténué, deadlines avec
  conflits, questions non résolues.
- **Revue humaine** — APPROVE / REJECT / NEEDS_VERIFICATION + commentaire.
  Chaque action écrit un `AuditEvent` **append-only** (jamais modifié, jamais
  supprimé), listé dans le détail et exportable en JSON. **Gate souverain** :
  APPROVE sur un item dont le gate échoue est enregistré mais ne peut PAS
  produire PURSUE — le message l'explique à l'écran.
- **État réel et sale** — bandeau de run (note du run, nombre de records,
  warnings) ; les records `SOURCE_UNAVAILABLE` / fetch en échec restent listés.

## 4. Câblage source de données

- Entrée : `outputs/sprint-1/candidates.json` (vraie sortie du worker TED live)
  transformée par `apps/workers/src/ted-to-console.ts` en `ConsoleData` →
  `apps/web/src/data/console.json` (embarqué dans l'export statique). Les runs
  PDF M0 utilisent le même modèle (`outputs/milestone-0/console.json`).
- **Filtre de récence** — deux niveaux :
  1. **À la source (le vrai correctif)** : le worker ajoute
     `publication-date>=YYYYMMDD` (défaut : 90 derniers jours, override
     `TED_PUBLISHED_SINCE`) à la requête experte TED. Le prochain
     `docker compose up` de Mickael découvre des avis ACTUELS, pas 2016.
  2. **À l'affichage** : tri `publication-date` décroissant + date visible sur
     chaque ligne. Les données du dernier run (2016–2017, requête sans borne)
     restent affichées honnêtement en attendant le re-run — pas de fixture
     maquillée en live.

## 5. Plan visuel (référence BIOPTIC)

Constat vérifié sur l'export Webflow fourni : pas de smooth-scroll library
(`scroll-behavior: initial`) ; le feel vient d'IX2 (reveals), Lottie, headroom.
On ne porte rien : on **recrée** dans la stack OIA.

- **Tokens repris de la source BIOPTIC** (extraits de l'export fourni) : encre
  `#10151d`, fond blanc, cartes `#f3f7f8`, hairlines `rgba(16,21,29,0.1)`, look
  mono/éditorial `SF Mono` (fallback ui-monospace/Menlo), système de taille
  fluide `--size-unit: 17` + containers en `clamp()`. Héros en dégradé doux
  cyan→lilas (valeurs approchées des captures ; la CSS Webflow externe est
  inaccessible depuis la sandbox — égress bloqué — à affiner si besoin).
- **Librairies** : reveals réalisés avec un hook `IntersectionObserver` + CSS
  transitions (zéro dépendance, même feel, compatible export statique).
  Framer Motion/GSAP : différés — à introduire seulement si un besoin réel les
  justifie. **Lenis : non installé** (BIOPTIC ne l'a pas ; et règle enveloppe
  vs outil). Lottie : différé (fichiers CDN inaccessibles depuis la sandbox ;
  purement décoratif). Nav hide/show : hook scroll natif (équivalent headroom).
- **Règle enveloppe vs outil** : le traitement (dégradé, reveals, nav animée)
  s'applique à l'enveloppe (bandeau, en-têtes). La table de triage garde un
  défilement natif, sa densité et sa lisibilité — aucun scroll-jacking, aucune
  inertie sur l'outil. Pas de thème gold/black.

## 6. Accès, déploiement, risques

- **SSO Vercel** : le jeton de Claude Code est en lecture seule (vérifié : 403
  sur l'update) — Mickael bascule lui-même Settings → Deployment Protection →
  Vercel Authentication = off. On n'élargit PAS les droits du jeton pour ça.
- **Dette de sécurité actée** : couper le SSO rend la console publique.
  Acceptable tant que seules des données TED publiques y sont. **À reprendre
  avant la Phase 2** (notes, contacts, données BAWABA → SSO ou vrai login).
- Email de commit : commits authored `mickael@oolala.ae` (rattaché au compte
  GitHub) — déploiements READY confirmés.
- **Risques** : (1) données du dernier run datées de 2016 tant que le worker
  n'est pas relancé — mitigé par le filtre de récence à la source + tri à
  l'affichage ; (2) localStorage = audit local au navigateur (pas partagé
  entre appareils) — assumé en Phase 1, migration vers store serveur en
  Phase 2 ; (3) dégradé héros approché (CSS Webflow inaccessible) — cosmétique.

## Critère de fin Phase 1 (rappel)

Mickael ouvre une URL, voit ses vraies opportunités TED récentes en
master-detail avec provenance et statut de vérification, style qui tient
(enveloppe BIOPTIC, table dense), APPROVE/REJECT tracés — sans terminal, sans
SSO bloquant, sans fixture.

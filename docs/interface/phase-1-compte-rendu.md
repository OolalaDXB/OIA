# Phase 1 — Compte rendu d'exécution (nuit du 13 août 2026)

Mandat exécuté en continu (design doc puis construction, sans validation
intermédiaire), strictement dans le périmètre Phase 1.

## Fait

1. **Design doc** — `docs/interface/phase-1-design.md` : architecture de
   l'information (WorkspaceRecord 5 phases), modèle de données, spec écran,
   câblage données + récence, plan visuel BIOPTIC, accès/risques.
2. **`@oia/workspace`** (nouveau package, types + stubs honnêtes, 5 tests) :
   enveloppe `WorkspaceRecord` (seule Opportunity câblée — payload =
   `ConsoleRecord` existant, aucun DTO redéfini), `AuditEvent` append-only
   avec verdict du gate au moment de la décision, `SavedView`,
   `SuggestionService`/`DigestService` stubés (Phase 2 / Phase 4).
3. **Récence à la source** : le worker TED borne désormais la requête experte
   à `publication-date>=` (défaut 90 jours, override `TED_PUBLISHED_SINCE`).
   Le transformateur trie par publication décroissante. Testé unitairement.
4. **Console Phase 1** :
   - rail workspace (5 kinds, seul Opportunities actif, phases affichées) ;
   - APPROVE / REJECT / NEEDS_VERIFICATION écrivent des événements d'audit
     immuables (localStorage), trace par record + export JSON complet ;
     **gate souverain** vérifié à l'écran (APPROVE sur item bloqué →
     enregistré, jamais PURSUE) ;
   - vues sauvegardées (filtres + tri nommés) ;
   - date de publication visible sur chaque ligne, tri récence par défaut ;
   - badges de provenance + localisateurs (JSON_PATH/PDF_PAGE), non-confirmé
     atténué, live-fetch et échecs affichés tels quels.
5. **Style BIOPTIC (enveloppe seulement)** : encre `#10151d` sur blanc,
   cartes `#f3f7f8`, hairlines, accents SF Mono, dégradé doux cyan→lilas sur
   le bandeau, reveal au chargement (respecte `prefers-reduced-motion`).
   Table de triage native et dense — zéro scroll-jacking, pas de Lenis, pas
   de gold/black. Vérifié par captures d'écran sur l'export statique réel.
6. **Qualité** : 125 tests verts sur tout le monorepo, typecheck propre,
   build statique OK. Poussé sur `main` → déploiement Vercel auto.

## À faire au réveil (toi seul peux)

1. **Couper le SSO Vercel** (2 clics) : vercel.com → projet **oia** →
   Settings → Deployment Protection → **Vercel Authentication = Off**.
   Le jeton de Claude Code est en lecture seule (403 vérifié) — c'est voulu,
   on n'élargit pas ses droits pour un clic.
2. **Relancer le worker pour des avis ACTUELS** (la console montre encore le
   run 2016-17, honnêtement, tant que pas de re-run) :
   ```
   cd OIA && git pull --ff-only && docker compose up --build
   pnpm --filter @oia/workers exec tsx src/ted-to-console.ts
   git add outputs/sprint-1 apps/web/src/data/console.json packages/connectors/test/fixtures
   git commit -m "data(sprint-1): rerun TED discovery with recency floor" && git push
   ```
   La requête inclut désormais `publication-date>=` (90 jours) — les avis
   découverts seront récents. Le push redéploie la console automatiquement.

## Reste (phases suivantes — PAS commencé, anti-dérive respectée)

- Phase 2 : multi-projets + SuggestionService réel + **remettre une
  protection d'accès avant toute donnée non publique** (dette actée).
- Phase 3 : notes/tâches/contacts sur l'ossature existante.
- Phase 4 : DigestService réel (dépend du planificateur, Sprint 6).
- Cosmétique différée : Lottie (CDN inaccessible depuis la sandbox), valeurs
  exactes du dégradé BIOPTIC (CSS Webflow externe inaccessible — approché
  depuis les captures).

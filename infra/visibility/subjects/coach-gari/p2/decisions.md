# P2 · correctifs de Coach Gari à valider

Préparés le 2026-11-07 sur une copie locale du dépôt du site (base `a7ac6a7`), hors du dépôt OIA. **Rien n'est poussé.** Les correctifs validés ne seront publiés qu'après la validation du rapport J0 (gel actif).

| # | Correctif | Contrôles | Risque | Bloqué par | Valider |
|---|---|---|---|---|---|
| 1 | JSON-LD : profils officiels manquants dans sameAs | E02, N03 | low | — | [ ] |
| 2 | JSON-LD : prix et devise sur chaque offre | E03, E07 | medium | prix validés par Mickaël et Gari (fait f-prices « à fournir ») | [ ] |
| 3 | Prix et offres lisibles sans JavaScript | C02, F02 | medium | prix validés par Mickaël et Gari | [ ] |

## 1 · JSON-LD : profils officiels manquants dans sameAs

- **Pour Google** : Relie l'entité du site à tous ses profils officiels (graphe de connaissances).
- **Pour les assistants** : Les assistants peuvent rattacher les profils à la marque, et donc les citer pour elle.
- **Contrôles** : E02, N03 · **risque** : low
- **Demande de fusion simulée** : branche `oia-visibility/p2-sameas-profils` (commit `400b5e9`, copie locale), détail dans `prs/01-sameas-profils.md`
- [ ] valider

## 2 · JSON-LD : prix et devise sur chaque offre

- **Pour Google** : Offres éligibles aux résultats enrichis une fois le prix posé ; supprime l'avertissement « Offer sans price ».
- **Pour les assistants** : Le prix devient lisible dans les données structurées : réponses exactes aux questions de prix.
- **Contrôles** : E03, E07 · **risque** : medium
- **Bloqué par** : prix validés par Mickaël et Gari (fait f-prices « à fournir »)
- **Demande de fusion simulée** : branche `oia-visibility/p2-offres-prix` (commit `3d89764`, copie locale), détail dans `prs/02-offres-prix.md`
- [ ] valider

## 3 · Prix et offres lisibles sans JavaScript

- **Pour Google** : Le prix figure dans le HTML servi : indexable sans exécution de JavaScript.
- **Pour les assistants** : Les robots des assistants lisent le prix dans la page elle-même.
- **Contrôles** : C02, F02 · **risque** : medium
- **Bloqué par** : prix validés par Mickaël et Gari
- **Demande de fusion simulée** : branche `oia-visibility/p2-prix-sans-js` (commit `edd019f`, copie locale), détail dans `prs/03-prix-sans-js.md`
- [ ] valider

## Sans correctif (constats et plans)

- B06 : aucune page publique en noindex dans la copie locale : la levée du noindex est sans objet (déjà faite dans le dépôt du site).
- D01 : titres à revoir : privacy.html.
- D02 : plan de rédaction (pas de texte sans modèle) : ramener à 155 caractères au plus les descriptions de index.html (160), online-coaching.html (162), padel-coaching-dubai.html (164), personal-training-dubai.html (162), en gardant le lieu et l'offre.

## Mission SEO Command (D1)

Cinq agents en mode manuel, lecture de fichiers seulement, aucun modèle. Constats de l'audit Crawlie (antérieur à la publication des pages de service : à refaire après J0).

### technique

- E03 · Schema Missing Required Field (5×, 1 page(s)) : Offer: missing price, priceCurrency (source : audits/2026-11-08/crawlie.json#issues[rule=schema-missing-required])
- E06 · Schema Missing Recommended Field (5×, 1 page(s)) : Offer: missing availability, url, priceValidUntil (source : audits/2026-11-08/crawlie.json#issues[rule=schema-missing-recommended])
- E01 · No Structured Data (2×, 2 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=structured-data-missing])
- B06 · Noindex (1×, 1 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=noindex])
- B06 · Nofollow (1×, 1 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=nofollow])
- B03 · Missing Canonical (1×, 1 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=canonical-missing])
- B04 · Blocked by robots.txt (2×, 1 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=blocked-by-robots])

### seo

- D01 · Title Too Short (2×, 2 page(s)) : 27 chars (source : audits/2026-11-08/crawlie.json#issues[rule=title-too-short])
- D02 · Missing Meta Description (1×, 1 page(s)) · *plan de rédaction, pas de texte* (source : audits/2026-11-08/crawlie.json#issues[rule=description-missing])
- D03 · Multiple H1 (1×, 1 page(s)) : 2 H1s (source : audits/2026-11-08/crawlie.json#issues[rule=h1-multiple])

### contenu

- D05 · Images Missing Alt Text (2×, 2 page(s)) : 2 of 6 images · *plan de rédaction, pas de texte* (source : audits/2026-11-08/crawlie.json#issues[rule=image-missing-alt])
- F05 · GEO: Not Answer-Ready (3×, 3 page(s)) · *plan de rédaction, pas de texte* (source : audits/2026-11-08/crawlie.json#issues[rule=geo-not-answerable])
- F08 · Thin Content (1×, 1 page(s)) : 182 words · *plan de rédaction, pas de texte* (source : audits/2026-11-08/crawlie.json#issues[rule=thin-content])

### aeo

- E05 · GEO: Missing Authorship / E-E-A-T (3×, 3 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=geo-no-author])
- E01 · GEO: No Machine-Readable Structure (2×, 2 page(s)) (source : audits/2026-11-08/crawlie.json#issues[rule=geo-no-structured-data])
- H07 · No llms.txt (1×, 1 page(s)) · *plan de rédaction, pas de texte* (source : audits/2026-11-08/crawlie.json#issues[rule=geo-no-llms-txt])
- F02 · Prix non validés (« Prix et formules : à fournir. ») : les assistants ne peuvent pas citer de prix exact. (source : facts.yaml#f-prices)
- F02 · Prix non validés (« Prix d'entrée à partir de 80 AED / 20 USD (service concerné non précisé). ») : les assistants ne peuvent pas citer de prix exact. (source : facts.yaml#f-price-entry)
- E02 · Profils officiels à déclarer en sameAs : https://www.instagram.com/coach_gari28, https://www.tiktok.com/@coach_gari28, https://myoolala.com/u/coachgari28. (source : facts.yaml (faits contact validés))

### conversion

- I02 · Form Controls Without a Label (1×, 1 page(s)) : 1 of 13 controls (source : audits/2026-11-08/crawlie.json#issues[rule=a11y-input-no-label])
- C02 · Prix et offres lisibles sans JavaScript : JSON-LD Offer sans price ni priceCurrency. (source : recommendations/rec-cg-tech-offer-price.json)


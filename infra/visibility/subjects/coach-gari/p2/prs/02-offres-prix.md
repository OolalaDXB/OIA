# JSON-LD : prix et devise sur chaque offre

Contrôles : E03, E07 · bloqué par : prix validés par Mickaël et Gari (fait f-prices « à fournir »)

## Résumé

Recommendation `p2-offres-prix` en attente de validation par Mickaël.
Client : `oia-internal` (internal). Site : `coach-gari`. Mode : `proposition`.

## Correctifs
- **jsonld-product** → `index.html` (medium). Prix et devise à remplir sur chaque Offer (aucun prix validé : __TO_FILL__, règle 12).

## Preuves
- *(aucune preuve jointe — cette PR est en simulation sur un dépôt fictif)*

## Garde-fou SEO
La GitHub Action `oia-visibility/seo-ci` tourne automatiquement sur cette PR.
La fusion est conditionnée à son passage.


## Diff (copie locale, `git diff a7ac6a7 3d89764`)

```diff
diff --git a/index.html b/index.html
index 9b497d2..382face 100644
--- a/index.html
+++ b/index.html
@@ -89,23 +89,23 @@
         "@type": "OfferCatalog",
         "name": "Coaching",
         "itemListElement": [
-          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Online coaching",
+          { "@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__", "itemOffered": { "@type": "Service", "name": "Online coaching",
             "serviceType": "Online personal coaching",
             "description": "Live sessions rather than a PDF: video check-ins twice a month, a plan built around the gym, home or outdoors you actually have, and meal planning based on where you live.",
             "url": "https://coachgari28.com/#online-coaching" } },
-          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "A conversation with Coach Gari",
+          { "@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__", "itemOffered": { "@type": "Service", "name": "A conversation with Coach Gari",
             "serviceType": "Coaching conversation",
             "description": "An hour to talk it through — what is blocking you, why the last three attempts stopped, what you actually want out of this. It does not have to end in a workout.",
             "url": "https://coachgari28.com/#conversation" } },
-          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Live group sessions",
+          { "@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__", "itemOffered": { "@type": "Service", "name": "Live group sessions",
             "serviceType": "In-person group coaching",
             "description": "Sessions run in person a few times a year, in Zimbabwe, across Southern Africa and wherever else the travelling goes. Small groups, outdoors where possible.",
             "url": "https://coachgari28.com/#group-sessions" } },
-          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Padel coaching",
+          { "@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__", "itemOffered": { "@type": "Service", "name": "Padel coaching",
             "serviceType": "Padel coaching",
             "description": "Movement, positioning, shot selection and match play, shaped to your level. In person in Dubai or online. PadelMBA certified coach.",
             "url": "https://coachgari28.com/#padel" } },
-          { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Coaching for teams",
+          { "@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__", "itemOffered": { "@type": "Service", "name": "Coaching for teams",
             "serviceType": "Corporate wellness coaching",
             "description": "Movement, energy and better habits brought into the working day, shaped around the team and the setting.",
             "url": "https://coachgari28.com/#corporate" } }
```

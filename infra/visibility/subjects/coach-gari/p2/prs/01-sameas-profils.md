# JSON-LD : profils officiels manquants dans sameAs

Contrôles : E02, N03

## Résumé

Recommendation `p2-sameas-profils` en attente de validation par Mickaël.
Client : `oia-internal` (internal). Site : `coach-gari`. Mode : `proposition`.

## Correctifs
- **jsonld-organization** → `index.html` (low). Ajout des profils officiels validés (facts.yaml) aux tableaux sameAs existants.

## Preuves
- *(aucune preuve jointe — cette PR est en simulation sur un dépôt fictif)*

## Garde-fou SEO
La GitHub Action `oia-visibility/seo-ci` tourne automatiquement sur cette PR.
La fusion est conditionnée à son passage.


## Diff (copie locale, `git diff a7ac6a7 400b5e9`)

```diff
diff --git a/index.html b/index.html
index 9b497d2..19fb411 100644
--- a/index.html
+++ b/index.html
@@ -61,7 +61,7 @@
       },
       "sameAs": [
         "https://www.instagram.com/coach_gari28",
-        "https://www.tiktok.com/@coach_gari28"
+        "https://www.tiktok.com/@coach_gari28", "https://myoolala.com/u/coachgari28"
       ]
     },
     {
@@ -83,7 +83,7 @@
       "availableLanguage": "en",
       "sameAs": [
         "https://www.instagram.com/coach_gari28",
-        "https://www.tiktok.com/@coach_gari28"
+        "https://www.tiktok.com/@coach_gari28", "https://myoolala.com/u/coachgari28"
       ],
       "hasOfferCatalog": {
         "@type": "OfferCatalog",
```

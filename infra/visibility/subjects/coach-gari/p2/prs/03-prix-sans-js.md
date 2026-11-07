# Prix et offres lisibles sans JavaScript

Contrôles : C02, F02 · bloqué par : prix validés par Mickaël et Gari

## Résumé

Recommendation `p2-prix-sans-js` en attente de validation par Mickaël.
Client : `oia-internal` (internal). Site : `coach-gari`. Mode : `proposition`.

## Correctifs
- **price-ssr-placeholder** → `corporate-wellness-dubai.html.oia-price-ssr.md` (medium). Note posée à côté de la page pour la revue humaine (le générateur n'écrit pas de code SSR tout seul).

## Preuves
- *(aucune preuve jointe — cette PR est en simulation sur un dépôt fictif)*

## Garde-fou SEO
La GitHub Action `oia-visibility/seo-ci` tourne automatiquement sur cette PR.
La fusion est conditionnée à son passage.


## Diff (copie locale, `git diff a7ac6a7 edd019f`)

```diff
diff --git a/corporate-wellness-dubai.html.oia-price-ssr.md b/corporate-wellness-dubai.html.oia-price-ssr.md
new file mode 100644
index 0000000..1f8f9ee
--- /dev/null
+++ b/corporate-wellness-dubai.html.oia-price-ssr.md
@@ -0,0 +1,15 @@
+# Correctif à revoir humainement — prix côté serveur
+
+Page concernée : `corporate-wellness-dubai.html`
+
+## Contexte
+
+Aucun prix n'apparaît dans le HTML servi de 7 page(s) d'offre (corporate-wellness-dubai.html, index.html, legal.html, online-coaching.html, padel-coaching-dubai.html, personal-training-dubai.html, privacy.html). Les prix ne sont pas validés : ce correctif décrit où et comment les afficher, sans valeur inventée.
+
+## Marche à suivre
+
+- Lire le prix depuis la base ou le CMS au moment du rendu.
+- Interdire au client de recouvrir la valeur serveur tant qu'elle est présente.
+- Tester sans JavaScript (par exemple via `curl` + grep sur la devise).
+
+Aucun code n'a été écrit automatiquement : ce chantier est à faire humainement.
```

# Audit d'intégrité du gel J0 · Coach Gari · 2026-11-08

Audit en **lecture seule**, par OIA Visibility. Rien n'a été modifié dans `~/CoachGari` ni sur le site. `REVIEW.md` n'est pas touché (c'est un fichier généré ; le mandat l'interdit explicitement).

## Périmètre

Vérifier que les publications poussées entre la fin de J0 (commit pin = `73e1967`) et l'état courant du site n'ont rien changé à ce que voient Google et les IA.

- **Pin J0 d'origine** : `73e1967` (« Merge step 1: reliability ») — fixé dans `infra/visibility/subjects/coach-gari/subject.yaml` (HANDOFF.md §3).
- **Borne fournie par le mandat** : `8ef1fd7`. Dans le dépôt réel, `8ef1fd7` est **antérieur** à `73e1967` (c'est un ancêtre). La commande `git log 73e1967..8ef1fd7` renvoie donc 0 commit. **Interprétation retenue** : auditer l'écart réel entre le pin J0 et l'état courant, soit `73e1967..origin/main` (où `origin/main` = `abf1f62`, « Sidebar: Settings at the foot of the menu », 189 commits derrière la copie locale).
- **Question consignée pour Mickaël** : la borne `8ef1fd7` est-elle une faute de frappe dans le mandat, ou faisait-elle référence à un état attendu du dépôt local qui a été dépassé ? L'audit réel plus large couvre les deux cas.

## Résultat résumé

| Contrôle | Résultat |
|---|---|
| Commits `73e1967..origin/main` | 28 commits (16 non-merges) |
| Commits qui touchent `index.html`, les 4 pages de service, `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, `legal.html`, `privacy.html` | **0** |
| Les 4 pages de service sont-elles toujours `noindex` + `cg-draft` ? | **Oui** (côté source et vérifié en live) |
| `robots.txt` et `sitemap.xml` inchangés ? | **Oui** |
| `llms.txt` ajouté ? | Non (comme attendu, le gel J0 l'interdit) |

**Conclusion** : le gel J0 est intact. Aucun des 28 commits poussés depuis la validation de J0 ne change ce que Google et les IA voient. Tous ciblent le back-office (admin, dashboard, billing, invoices, Today) qui est hors périmètre de J0 (rappelé dans `measurement.yaml`, section `allowed`).

## Classement commit par commit (16 non-merges)

| Commit | Sujet | Surface publique touchée ? |
|---|---|---|
| 9c0a439 | Step 2: the Leads list is never cut in silence | non — back-office |
| e11d2c0 | Step 3: a lighter sidebar, nothing taken away | non — back-office |
| 4cbb199 | Step 4: the client record in five tabs | non — back-office |
| 99d5a4d | Step 5: the invoice's issuer is read from Settings › Business | non — back-office |
| d697625 | Step 5: the migration as run in production | non — base de données du back-office |
| b109312 | Step 6: an invoice keeps the client's and the business's details | non — back-office |
| 938a420 | Step 7 (preview): Today's band | non — back-office |
| 0b3d5d1 | Step 8: a push at 20:00 Dubai after two days with nothing in the calendar | non — back-office |
| d4b3a9e | Today's band: clock setting on hover, weather in colour, the air through the day | non — back-office |
| 3fe0395 | Today: the day's sessions instead of website bookings | non — back-office |
| 2de4f2d | Revenue by origin on Today; the air from 3 hours ago to 21 hours ahead | non — back-office |
| ac37527 | Hand-off shows what the client pays | non — back-office |
| 0f538d7 | Today: no clock setting on a phone | non — back-office |
| 4c0524a | Test: move the mouse off the air strip | non — test |
| e6936a7 | Clients: the page lists the clients | non — back-office |
| abf1f62 | Sidebar: Settings at the foot of the menu | non — back-office |

(Les 12 merges sont les merges de ces branches, aucun ne touche la surface publique.)

Vérification croisée : `git log --oneline 73e1967..origin/main -- index.html online-coaching.html personal-training-dubai.html padel-coaching-dubai.html corporate-wellness-dubai.html robots.txt sitemap.xml manifest.webmanifest legal.html privacy.html` renvoie **0 ligne**.

## Vérification publique (une requête par URL, en-tête + HTML)

User-Agent : `oia-visibility-audit/1.0`. Horodatage : 2026-11-07 02:03 UTC (nuit du mandat).

| URL | Code | Observation |
|---|---|---|
| `https://coachgari28.com/` | HTTP/2 200 | Pas de `noindex`. Titre : « Coach Gari \| Online coaching, programmes and live sessions ». Canonical vers `/`. |
| `https://coachgari28.com/online-coaching` | HTTP/2 200 | `<meta name="robots" content="noindex, nofollow">` + `cg-draft=true`. |
| `https://coachgari28.com/personal-training-dubai` | HTTP/2 200 | `noindex, nofollow` + `cg-draft=true`. |
| `https://coachgari28.com/padel-coaching-dubai` | HTTP/2 200 | `noindex, nofollow` + `cg-draft=true`. |
| `https://coachgari28.com/corporate-wellness-dubai` | HTTP/2 200 | `noindex, nofollow` + `cg-draft=true`. |
| `https://coachgari28.com/robots.txt` | HTTP/2 200 | Inchangé : `User-agent: * / Allow: / / Disallow: /admin / /r/ / /c/`, sitemap listée. |
| `https://coachgari28.com/sitemap.xml` | HTTP/2 200 | Inchangée : trois URL seulement (`/`, `/legal`, `/privacy`), `lastmod=2026-09-21`. |

Aucune divergence détectée entre ce que livre le serveur et ce que dit la source à `origin/main`.

## Implications pour la fenêtre de mesure

- Le gel J0 (`freezes.freeze-j0` dans `measurement.yaml`) reste **en vigueur**. Aucune action requise sur la configuration du sujet.
- La ligne « reste permis : une branche non déployée, le back-office sans effet sur les pages publiques, et un correctif de sécurité urgent consigné » du mandat 5.2 couvre exactement ce qui a été poussé.
- `REVIEW.md` n'a pas été modifié par cet audit.

## Notes

- Audit à base d'analyse statique git + 5 requêtes HTTPS publiques. Aucun code du dépôt n'a été exécuté (règle 14).
- Aucune donnée privée n'est consultée.
- Le dépôt local `~/CoachGari` est 189 commits derrière `origin/main` ; l'audit utilise bien l'état public courant (`origin/main`).

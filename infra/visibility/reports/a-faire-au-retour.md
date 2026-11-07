# À faire au retour · J0 Coach Gari · 2026-11-07

> **Mise à jour du 2026-11-07, 18 h UTC : J0 tourne** (démarré à 15:27
> UTC, premier passage complet, tâche quotidienne installée). Les étapes
> 1 à 4 ci-dessous sont faites ; elles restent ici pour l'historique.
>
> **À lire en premier : le gel du site est rompu.** Le contrôle
> d'intégrité (`scripts/freeze-check.sh`), en lecture seule de
> `~/CoachGari`, trouve trois commits après la décision du gel (5 nov.),
> poussés par une autre session Claude :
>
> - **`710b4dd`** (7 nov., 08:54 UTC, avant J0) : « Publish the four service
>   pages: indexable, in the sitemap ». Le `noindex` des quatre pages de
>   service est retiré et elles entrent dans le sitemap.
> - **`d89380b`** (7 nov., 09:24 UTC, avant J0) : section « District 267 »
>   ajoutée à la page padel.
> - **`a7ac6a7`** (7 nov., 15:56 UTC, **pendant J0**, 29 min après le
>   démarrage) : texte « About » de la page d'accueil réécrit.
>
> J0 mesure donc un site dont les pages de service sont indexables depuis
> quelques heures (Google ne les a sans doute pas encore vues), et dont la
> page d'accueil a changé pendant la fenêtre. Rien n'a été modifié côté
> OIA ni dans le dépôt du site. À décider : ces commits sont-ils en ligne
> (Vercel) ? Faut-il annuler, laisser et consigner comme perturbation, ou
> relancer une mesure de départ après stabilisation ? Le fait
> `f-site-service-pages-noindex` de `facts.yaml` n'est plus vrai.
>
> **Mandat v7 (blocs A à E) : fait.** Rapport :
> `reports/2026-11-08-mandat-v7.md`. Commandes, dans l'ordre :
> pendant la fenêtre `pnpm vis:j0-status` et `pnpm vis:j0-view` ; après
> le cinquième run (à partir du 11 nov. vers 17:30 UTC) `pnpm vis:j0-close`,
> puis `pnpm vis:j0-report`, puis `pnpm vis:j0-verify` ; ensuite la
> relecture du rapport et de `subjects/coach-gari/p2/decisions.md`. Une
> notification macOS ne viendra qu'en cas de problème.


**J0 n'est pas lancé.** Il bloque sur une seule étape que toi seul peux
faire : **créer ton compte dans Elmo** (ton email, ton mot de passe). Tout
le reste est prêt et vérifié. Ensuite, deux commandes suffisent.

État laissé : Postgres et l'interface d'Elmo tournent, **worker arrêté**,
base vide (aucun compte, aucune marque, aucune question). Aucun appel payant
n'a été fait.

**Mise à jour 2026-11-07, après ton essai :** l'inscription affichait
« Missing environment configuration : SCRAPE_TARGETS ». L'interface d'Elmo
refuse en effet de s'afficher, page d'inscription comprise, tant que
`SCRAPE_TARGETS` est vide. La ligne `SCRAPE_TARGETS` de `elmo/.env` est
donc posée avec les cinq moteurs, et seul le service web a été redémarré.
Le formulaire d'inscription s'affiche : champs email et mot de passe,
bouton « Create account ». **Le verrou contre les appels payants, c'est
maintenant le worker arrêté** : tant qu'il ne tourne pas, aucun run n'a
lieu. Ne le démarre pas à la main : `j0-launch.sh` le fait après avoir
chargé la marque.

## 1 · Vérifier les consoles des fournisseurs (5 min, toi seul)

Cases de `reports/runbook-j0.md`, étape 0. L'essentiel :

- [ ] Recharge automatique **coupée** chez OpenAI, Anthropic, Mistral,
      OpenRouter et TypeSafe.
- [ ] Anthropic : la clé vient de l'espace de travail dédié
      `oia-visibility`, avec une limite de dépense de 12 $ par mois.
- [ ] Mistral : limite de 8 $. OpenRouter : clé plafonnée à 5 $ par mois.
      TypeSafe : 3 $ au plus.
- [ ] Le Mac reste branché sur secteur pendant cinq jours.

## 2 · Créer ton compte Elmo (2 min, toi seul)

1. Ouvre http://localhost:1515 : la page « Sign up · Elmo » s'affiche.
2. Saisis ton nom, ton email et un mot de passe. Range le mot de passe
   dans Proton Pass. Clique sur **Create Account**.
3. Elmo affiche ensuite l'écran **Brand Onboarding**, qui demande l'adresse
   du site. **N'y saisis rien et ferme l'onglet.** Saisir l'adresse ferait
   créer la marque par l'assistant d'Elmo, avec une analyse Mistral
   (`mistral-large-latest`, non mesurée), et la marque n'aurait ni nos
   questions ni nos tags. Le script de l'étape 3 crée la marque à la place.

Une seule inscription est possible : Elmo refuse tout compte après le
premier (`apps/web/src/lib/auth/server.ts:28-30` d'Elmo 0.7.7).

## 3 · Lancer J0 (1 min)

```
cd ~/OIA/infra/visibility
./scripts/j0-launch.sh coach-gari --dry-run    # doit finir par « GO »
./scripts/j0-launch.sh coach-gari              # lance J0
```

Le script refait tous les contrôles et s'arrête au premier NO-GO, sans
rien écrire. S'il passe :

1. il ajoute à `elmo/.env` une clé admin temporaire ;
2. il vérifie que `SCRAPE_TARGETS`, déjà posé, est identique aux cinq
   moteurs du lancement (sinon NO-GO) ;
3. il crée la marque, les 4 concurrents et les 10 questions par l'API
   d'Elmo, dans ton organisation (aucun appel LLM à ce moment) ;
4. il retire la clé admin ;
5. il démarre le worker, garde le Mac éveillé (`caffeinate`) et lance
   `cost-guard.sh --watch 60` en arrière-plan ;
6. il note la date et l'heure de début dans `measurement.yaml`.

Aucune valeur de `.env` n'est affichée, et la clé admin ne passe jamais
sur la ligne de commande.

Si `POST /api/v1/brands` échoue, le script s'arrête sans démarrer le
worker. La clé admin est retirée, et le message dit où lire la réponse
d'Elmo. On peut relancer tel quel une fois la cause corrigée.

## 4 · Contrôler le premier run (10 à 15 min après)

```
./scripts/j0-first-run.sh coach-gari
```

Le script affiche, par moteur : runs réussis et échoués, version servie,
coût estimé par Elmo et coût selon la grille de prix. Il donne aussi le
nombre de réponses jugées par Jev et les erreurs du worker, et écrit tout
dans `~/oia-visibility-data/j0/`. Ensuite :

- un moteur en échec : arrêter le worker
  (`docker compose -p oia-elmo --env-file elmo/.env -f elmo/compose.yaml stop worker`),
  retirer ce moteur de `SCRAPE_TARGETS` si tu le décides, relancer le
  worker. Ne change de modèle qu'après décision ;
- la version servie par Mistral (`mistral-large-4` attendu) : si elle
  n'est pas reconnue par la grille, `cost-guard.sh` arrête le worker.
  Ajoute alors cette version à `src/cost-grid.ts` avant de relancer ;
- commite `subjects/coach-gari/measurement.yaml` (fenêtre en `running`
  avec la date de début), ou demande-le à Claude Code.

## 5 · Onboarding Mistral : rien à faire

Comme la marque est créée par l'API, Elmo ne lance ni onboarding ni
analyse « Opportunités ». Le modèle d'onboarding (`mistral-large-latest`,
codé en dur dans Elmo 0.7.7) n'est donc pas appelé pendant J0. N'utilise
ni l'assistant de questions ni « Opportunités » dans l'interface pendant
la fenêtre. Si tu le fais quand même, relève le modèle facturé dans la
console Mistral (Usage).

## 6 · Voir J0 dans l'écran Lovable

```
cd ~/OIA && pnpm vis:j0-view
```

La commande met les données à jour (lecture seule d'Elmo) et ouvre
http://127.0.0.1:4317/. **Le prototype ne lit pas encore
`public/data/visibility.json`** : il affiche ses données de
démonstration. À demander à Lovable : « charger `/data/visibility.json`
au démarrage, à la place de `src/data/demo.ts`, avec la même structure ».
Détails : `reports/2026-11-07-lancement-j0.md`, § Étape 3.

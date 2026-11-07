# À faire au retour · J0 Coach Gari · 2026-11-07

**J0 n'est pas lancé.** Il bloque sur une seule étape que toi seul peux
faire : **créer ton compte dans Elmo** (ton email, ton mot de passe). Tout
le reste est prêt et vérifié. Ensuite, deux commandes suffisent.

État laissé : Postgres et l'interface d'Elmo tournent, **worker arrêté**,
base vide (aucun compte, aucune marque, aucune question), `SCRAPE_TARGETS`
vide dans `elmo/.env` (le verrou). Aucun appel payant n'a été fait.

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
2. il pose `SCRAPE_TARGETS` (les cinq moteurs, tous avec recherche web) ;
3. il crée la marque, les 4 concurrents et les 10 questions par l'API
   d'Elmo, dans ton organisation (aucun appel LLM à ce moment) ;
4. il retire la clé admin ;
5. il démarre le worker, garde le Mac éveillé (`caffeinate`) et lance
   `cost-guard.sh --watch 60` en arrière-plan ;
6. il note la date et l'heure de début dans `measurement.yaml`.

Aucune valeur de `.env` n'est affichée, et la clé admin ne passe jamais
sur la ligne de commande.

Si le script s'arrête après avoir posé `SCRAPE_TARGETS` (par exemple si
`POST /api/v1/brands` échoue), le worker n'est pas démarré. Le message
dit où lire la réponse d'Elmo. Pour relancer, vide d'abord
`SCRAPE_TARGETS=` dans `elmo/.env`.

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

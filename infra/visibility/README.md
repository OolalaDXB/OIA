# OIA Visibility, P1 : outils open source installés tels quels

Aucun code OIA ici, seulement de la configuration et des scripts. Les trois
outils sont épinglés par version, et par digest pour les images.

| Outil | Version | Accès | Base |
|---|---|---|---|
| Elmo (visibilité IA) | v0.7.7 (images `elmohq/elmo-{web,worker,db-migrate}:0.7.7`) | http://localhost:1515 (127.0.0.1) | Postgres 18, volume `oia-elmo_elmo_pg`, non publié |
| CrawlSEO (Search Console, crawl, CWV) | v0.3.6 (`ghcr.io/crawlseo/crawlseo:0.3.6`) | http://localhost:3100 (127.0.0.1) | Postgres 16, volume `oia-crawlseo_crawlseo_pg`, non publié |
| Crawlie (audit SEO/GEO) | 0.5.3 (npm, via `npx`) | CLI | — |

Les deux bases Postgres ne sont pas publiées sur l'hôte. Le port 5432 reste donc
libre et aucun conflit n'est possible. Les sauvegardes passent par
`docker compose exec`.

## Ordre d'installation sur le Mac

Toutes les commandes se lancent depuis `infra/visibility/`.

```bash
./scripts/preflight.sh                      # étape 0 : lecture seule
./scripts/init-env.sh                       # crée les .env et génère les secrets
```
Ensuite :
1. Sauvegarder hors machine les secrets listés dans [SECRETS.md](SECRETS.md).
2. Renseigner `crawlseo/.env` : client OAuth Google, avec l'URI de redirection
   `http://localhost:3100/api/auth/callback/google`.
3. Renseigner `elmo/.env` : la clé Jev (TypeSafe ou OpenRouter) et une clé LLM
   directe pour l'assistant d'onboarding. **Laisser `SCRAPE_TARGETS` vide
   jusqu'à la validation des panels.**

```bash
docker compose -p oia-crawlseo --env-file crawlseo/.env -f crawlseo/compose.yaml up -d
# première connexion Google sur http://localhost:3100, puis :
./scripts/lock-crawlseo.sh                  # DISABLE_REGISTRATION=true
```
```bash
# Elmo SANS worker : on peut préparer les sujets et les panels sans qu'aucun run ne parte
docker compose -p oia-elmo --env-file elmo/.env -f elmo/compose.yaml up -d postgres db-migrate web
```

### Pourquoi le worker Elmo reste arrêté jusqu'à la validation

Dans Elmo 0.7.7, créer ou réactiver un prompt met immédiatement un run en file
(`createPromptJobScheduler`, `sendImmediate` vaut true par défaut). Seul le worker
exécute ces runs. S'il ne tourne pas, rien ne part et rien n'est facturé. Le
worker refuse d'ailleurs de démarrer tant que `SCRAPE_TARGETS` est vide (constaté
lors du test). Démarrer le worker revient donc à démarrer J0.

Attention, l'assistant de prompts (onboarding) appelle bien la clé LLM directe
depuis l'app web. Cet appel est facturé, mais ce n'est pas un run de mesure.

## Mesure J0 (après validation)

- `.env` d'Elmo : `RUNS_PER_PROMPT=1` et `DEFAULT_DELAY_HOURS=24`. On obtient
  1 run par jour et par cible. `SCRAPE_TARGETS` ne contient que des cibles API
  avec `:online`.
- Coût : Elmo écrit une estimation par appel dans la table `usage_events`. Le
  coût réel se relève chaque jour dans la console de chaque fournisseur.
- Crawlie : `./scripts/crawlie-audit.sh`. Les rapports JSON sont écrits dans
  `~/oia-visibility-data/crawlie/<horodatage>/`.

## Portabilité

```bash
./backup.sh                                  # -> ~/oia-visibility-backups/<UTC>/ (hors repo)
./restore.sh ~/oia-visibility-backups/<UTC>  # machine vierge, .env restaurés depuis le coffre
./scripts/verify-restore.sh                  # comptes de lignes + clés et jetons déchiffrables
```

Pour tester la restauration sur le même Mac, on utilise une installation
séparée, dans un autre clone du repo, avec un suffixe de projet qui donne
d'autres volumes :

```bash
docker compose -p oia-crawlseo --env-file crawlseo/.env -f crawlseo/compose.yaml stop   # libère 3100 et l'URI OAuth
docker compose -p oia-elmo     --env-file elmo/.env     -f elmo/compose.yaml stop
```
```bash
cd <clone-de-test>/infra/visibility        # mêmes .env que l'installation principale
OIA_VIS_SUFFIX=-restoretest ./restore.sh ~/oia-visibility-backups/<UTC>
```
```bash
OIA_VIS_SUFFIX=-restoretest ./scripts/verify-restore.sh
```
Le test fonctionnel consiste ensuite à lancer une synchronisation Search Console
depuis l'UI de test, sans se reconnecter à Google. Pour finir, on supprime
l'installation de test avec `docker compose -p oia-crawlseo-restoretest … down -v`
(et l'équivalent pour Elmo).

`OIA_VIS_ONLY=elmo|crawlseo` limite backup, restore et verify à un seul outil.

## Règles

- Ports publiés uniquement sur 127.0.0.1 ; Postgres non publié.
- Aucun secret dans le repo : seuls les `*.env.example`, sans valeurs, sont
  suivis (voir `.gitignore`).
- Elmo en mode API uniquement : aucune clé de prestataire de scraping (Cloro,
  BrightData, Oxylabs, SearchApi, Olostep, DataForSEO).
- Aucune modification de coachgari28.com ni de maisons.co : Crawlie et CrawlSEO
  ne font que des lectures, et Crawlie respecte robots.txt.

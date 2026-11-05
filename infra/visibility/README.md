# OIA Visibility, P1 : outils open source installés tels quels

Ce dossier contient de la configuration, des scripts et les définitions de
sujets. Il n'y a pas de code applicatif OIA. Les trois outils sont épinglés par
version, et par digest pour les images. **Aucun sujet n'est codé en dur** : les
scripts et la CLI lisent les sujets dans `subjects/`. Un test échoue dès qu'un
nom, un alias ou un domaine de sujet apparaît ailleurs.

| Outil | Version | Accès | Base |
|---|---|---|---|
| Elmo (visibilité IA) | v0.7.7 (images `elmohq/elmo-{web,worker,db-migrate}:0.7.7`) | http://localhost:1515 (127.0.0.1) | Postgres 18, volume `oia-elmo_elmo_pg`, non publié |
| CrawlSEO (Search Console, crawl, CWV) | v0.3.6 (`ghcr.io/crawlseo/crawlseo:0.3.6`) | http://localhost:3100 (127.0.0.1) | Postgres 16, volume `oia-crawlseo_crawlseo_pg`, non publié |
| Crawlie (audit SEO/GEO) | 0.5.3 (npm, via `npx`) | CLI | — |

Les deux bases Postgres ne sont pas publiées sur l'hôte. Le port 5432 reste donc
libre et aucun conflit n'est possible. Les sauvegardes passent par
`docker compose exec`.

## Sujets

Il y a un dossier par sujet, `subjects/<id>/`, ou ailleurs avec
`OIA_VIS_SUBJECTS_DIR` (par exemple un dossier privé pour un client externe).
Tous suivent le même schéma (`src/schema.ts`).

| Fichier | Contenu |
|---|---|
| `subject.yaml` | URL, langues, marchés, alias, concurrents, dépôt (facultatif), documents sources (facultatifs), questions ouvertes |
| `panel.yaml` | Panel versionné. Changer une formulation crée `version + 1` et retire l'ancienne version, qui n'est jamais supprimée. `panelVersion` augmente à chaque changement de l'ensemble actif. |
| `facts.yaml` | Faits de référence. Un fait reste `extracted` tant que le propriétaire ne l'a pas validé (`validated`, avec auteur et date). |
| `measurement.yaml` | Plan de mesure : fenêtres (J0, puis suivi), jours manquants, et **gels**. Un gel interdit, sur son périmètre, toute publication qui change ce que voient les moteurs et les IA, jusqu'à la fin de la fenêtre qu'il nomme. |
| `REVIEW.md` | Fiche de revue générée, à ne pas éditer à la main (un test vérifie qu'elle est à jour). |

Les questions du panel sont `active` (envoyées à Elmo), `candidate` (gardées
pour un panel élargi) ou `retired`. Une question reprise d'un document cite sa
source (`sourceId`, `sourceRef`).

Pour ajouter un sujet : créer `subjects/<id>/` avec les quatre fichiers YAML,
puis lancer les commandes ci-dessous. Statuts : alias, concurrents et marchés
sont `proposed` ou `confirmed` ; le panel est `draft`, puis `validated` (avec
`validatedBy` et `validatedAt`) avant toute mesure.

```bash
pnpm install                                         # à la racine du repo, une fois
pnpm --filter @oia/visibility-infra validate         # schéma + règles (versions, nombre de questions marquées…)
pnpm --filter @oia/visibility-infra subjects review <id> --write   # régénère REVIEW.md
pnpm --filter @oia/visibility-infra subjects elmo-brief <id>       # fiche JSON pour configurer la marque dans Elmo
pnpm --filter @oia/visibility-infra subjects freezes [<id>]        # gels en vigueur (code 1 s'il y en a)
pnpm --filter @oia/visibility-infra test             # dont le test « aucun sujet dans le code »
```

**Ne jamais supprimer une question dans Elmo** : la suppression efface aussi
toutes ses réponses brutes. On la désactive.

Elmo se configure à la main à partir de `elmo-brief` : marque, domaines, alias,
concurrents, et prompts avec leurs tags de traçabilité
(`oia:<id>@v<version>`, `panel:v<n>`, `lang:<xx>`, `family:<…>`). Aucun code
n'écrit dans Elmo en P1.

## Fournisseurs

Moteurs mesurés (dont Mistral, recherche web comprise), règle « traitements
LLM de la couche OIA = `packages/providers` (Mistral) », réponse sur Jev, et
liste de ce qui part hors d'Europe : [FOURNISSEURS.md](FOURNISSEURS.md).

## Agents

Documentation des agents (P2) et checklist générique de visibilité d'un site,
avec la brique qui mesure chaque contrôle : [agents/](agents/README.md).

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
- **Le démarrage de J0 se fait à la main**, une fois les panels `validated` :
  1. Désactiver la veille du Mac pour 5 jours, par exemple
     `caffeinate -dimsu -t 432000 &`.
  2. Renseigner `SCRAPE_TARGETS` dans `elmo/.env` (la valeur est donnée en
     commentaire dans `.env.example`).
  3. Démarrer le worker : `docker compose -p oia-elmo --env-file elmo/.env -f elmo/compose.yaml up -d`.
  4. Lancer le plafond en continu : `./scripts/cost-guard.sh --watch 60`
     (`OIA_VIS_DAILY_CAP_USD`, 5 $ par défaut).
- Plafond de coût : `scripts/cost-guard.sh` arrête le worker dès que le coût du
  jour (UTC) atteint le plafond. Le coût retenu est le plus élevé entre
  l'estimation d'Elmo (`usage_events`) et la consommation réelle du jour chez
  OpenRouter (`usage_daily`, qui couvre Gemini, Perplexity et Jev). Le script
  **échoue en sécurité** : si le coût est illisible, il arrête aussi le worker.
  Le coût réel chez OpenAI et Anthropic n'est lisible qu'avec une clé
  d'administration ; il se relève chaque jour dans les consoles et s'ajoute au
  journal `~/oia-visibility-data/cost-journal.csv`.
- Relevé quotidien : `./scripts/window-day.sh [YYYY-MM-DD]` donne les réponses
  par sujet et par cible, les questions restées sans réponse et le coût estimé.
  Le résultat va dans `~/oia-visibility-data/window/`. Un jour sans run est
  consigné, jamais comblé.
- Crawlie : `./scripts/crawlie-audit.sh [<id>]`. Le script lit les URL des
  sujets et écrit les rapports JSON dans
  `~/oia-visibility-data/crawlie/<horodatage>/<sujet>/`.

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
- Aucune modification des sites ni des dépôts des sujets : Crawlie et CrawlSEO
  ne font que des lectures, et Crawlie respecte robots.txt. Un dépôt déclaré
  dans `subject.yaml` sert de document source, en lecture seule.
- Les rapports de mesure, qui nomment forcément les sujets, vont dans
  `reports/`, hors du périmètre du test de généricité.

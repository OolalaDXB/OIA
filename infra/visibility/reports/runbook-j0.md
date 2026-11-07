# Runbook J0 · OIA Visibility · Coach Gari

Mise à jour 2026-11-07. Lancement du premier pilote (`coach-gari`) en cinq
moteurs API plafonnés à 30 $/mois. Toutes les étapes sont faites par
Mickaël sur le Mac Studio ; aucune n'est exécutée par un agent Claude
Code. Durée estimée : 45 min pour poser les clés, 5 min de lancement, puis
cinq journées pendant lesquelles un contrôle quotidien suffit.

## 0 · Avant de poser une clé

Préparer les quatre comptes (ou vérifier qu'ils sont déjà prêts). **Règle
commune** : crédit prépayé + recharge automatique **désactivée** partout.
Sans cette double précaution, le plafond logiciel de `cost-guard.sh`
n'arrête rien tant que l'estimation ou le solde reporté par le
fournisseur n'a pas rattrapé la dépense réelle (voir FOURNISSEURS.md
section « Plafond logiciel et plafond réel »).

| Fournisseur | Compte | Clé à créer | Crédit prépayé minimum |
|---|---|---|---|
| OpenAI | compte perso ou OIA, carte en dépôt mais recharge auto **désactivée** | `oia-visibility` (scope restreint si possible) | 5 $ |
| Anthropic | idem | `oia-visibility` | 5 $ |
| Mistral | **compte Mistral existant de Mickaël** (une clé dédiée `oia-visibility` pour séparer la dépense OIA Visibility de celle d'OIA Funding) | `oia-visibility` | 5 $ |
| OpenRouter | compte dédié OIA | `oia-visibility` | 5 $ (sert à Gemini + Perplexity + Jev) |

Les quatre clés totalisent ≈ 20 $ immobilisés, bien en-dessous du
plafond. Jev consomme du crédit OpenRouter (pas de compte TypeSafe
séparé).

## 1 · Poser les clés sur le Mac

Les clés **ne sont jamais exportées dans le shell** — elles iraient dans
`ANTHROPIC_API_KEY`, où Claude Code les capterait. Seul le fichier
`infra/visibility/elmo/.env` les reçoit, et ce fichier est hors Git
(voir `SECRETS.md`).

```
cd ~/OIA/infra/visibility/elmo
cp -n .env.example .env               # ne jamais écraser un .env déjà posé
# Ouvrir .env dans un éditeur et compléter UNIQUEMENT :
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...
#   MISTRAL_API_KEY=...
#   OPENROUTER_API_KEY=sk-or-...
#   TYPESAFE_API_KEY=            (laissé vide : Jev routé via OpenRouter)
# Les autres variables (ELMO_POSTGRES_PASSWORD, ELMO_ENCRYPTION_KEY,
# BETTER_AUTH_SECRET, DEPLOYMENT_ID) ont été générées une fois par
# scripts/init-env.sh et sauvegardées hors machine (SECRETS.md).
chmod 600 .env
```

Également dans `.env`, laisser `SCRAPE_TARGETS=` **vide pour l'instant** :
c'est le verrou qui empêche le worker de démarrer avant la vérification
du plafond.

## 2 · Vérifier le plafond mensuel (`cost-guard.sh`) avant tout lancement

Sans démarrer le worker, faire un relevé à blanc pour vérifier que le
script lit bien l'environnement et le solde OpenRouter :

```
cd ~/OIA/infra/visibility
./scripts/cost-guard.sh
# Attendu : une ligne CSV dans ~/oia-visibility-data/cost-journal.csv,
# colonne action=none si le coût du mois < 24 $.
# alert : action=alert(monthly-80pct) > seuil d'alerte (24 $ par défaut).
# stop  : action=stop-worker(cap-reached) — le worker n'était pas démarré,
#         donc l'arrêt est un no-op, mais le journal trace la décision.
```

Si le script échoue sur la lecture OpenRouter (clé absente, mauvaise
syntaxe), il affiche `stop-worker(cost-unreadable)` : vérifier le
contenu de `.env` et relire la ligne OPENROUTER_API_KEY.

## 3 · Démarrer Elmo (web + Postgres + migrations), **worker arrêté**

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml up -d postgres db-migrate web
# worker VOLONTAIREMENT pas démarré.
# Vérifier :
docker compose ps
# postgres: healthy ; db-migrate: Exited (0) ; web: Up (port 1515) ;
# worker: pas listé (pas démarré).
```

Ouvrir http://localhost:1515 dans le navigateur. Créer le compte
administrateur Elmo. **Ne pas** encore saisir la marque Coach Gari.

Mémoire Docker recommandée : 6 Go minimum alloués à Docker Desktop
(Elmo web + Postgres + migration + worker ≈ 3 Go en charge ; Crawlie
ajoute 1 Go). Docker Desktop → Settings → Resources → Memory.

## 4 · Charger la marque et le panel dans Elmo (manuellement, depuis le brief OIA)

Le brief est généré depuis les fichiers du sujet :

```
cd ~/OIA/infra/visibility
pnpm --filter @oia/visibility-infra subjects elmo-brief coach-gari > /tmp/brief-coach-gari.json
```

Il contient : la marque (slug, nom, site, alias, domaines additionnels),
les cinq moteurs à activer (`chatgpt, claude, gemini, perplexity,
mistral`), les concurrents (Playtomic, Ultimate Performance, Future,
Caliber), et les dix questions actives (annexe B du plan SEO/AEO).

Pour simuler l'ordre des appels d'API qu'Elmo recevrait :

```
pnpm tsx scripts/load-panel.ts coach-gari
# Imprime : POST /brands, POST /competitors × N, POST /prompts × 10
# AUCUN appel réseau. En P1, la saisie dans Elmo reste manuelle (interface
# web), aucune écriture automatique depuis OIA.
```

Saisir ensuite dans Elmo (interface web) :

1. **Brand → Create** : coller `brand.slug`, `brand.name`, `brand.website`.
   Dans « Additional domains » : `coachgari.com`. Dans « Aliases » : les
   trois alias du brief.
2. **Brand → LLM settings** : activer `chatgpt`, `claude`, `gemini`,
   `perplexity`, `mistral`. **Décocher** tout autre moteur (pas de
   fallback par défaut d'Elmo).
3. **Brand → Competitors** : ajouter les quatre concurrents ; cocher
   « proposed » (passera en « confirmed » quand Mickaël aura tranché).
4. **Brand → Prompts** : copier-coller les dix questions `status: active`
   du brief, dans l'ordre. Dans « Tags » (champ libre), coller la liste
   de tags du brief (`oia:en-01@v2`, `panel:v2`, `lang:en`,
   `family:unbranded`) — c'est la traçabilité qui relie les réponses
   d'Elmo au panel OIA.

Faire une **capture d'écran** de la page « Prompts » (10 questions
cochées) à sauvegarder dans `~/oia-visibility-data/j0/elmo-prompts.png`.

## 5 · Décider des modèles

Les identifiants API par défaut, mis dans `SCRAPE_TARGETS`, sont
documentés dans `FOURNISSEURS.md` § 0 ter. **À confirmer par Mickaël
avant cette étape** :

- Gemini : `google/gemini-2.5-flash` déprécié le 2026-11-02 par Google.
  Recommandation : `google/gemini-3-flash:online` dès J0 (voir décision
  en attente n° 1 dans FOURNISSEURS.md).
- Claude : par défaut `claude-haiku-5-5` (coût minimal, aligné sur
  `gpt-6-luna`). Si Mickaël choisit `claude-sonnet-4-6` ou
  `claude-opus-4-7` pour se rapprocher de l'app, le surcoût sur J0 reste
  dans le plafond (voir décision en attente n° 2).
- Les trois autres : pas de changement (`gpt-6-luna`, `perplexity/sonar`,
  `mistral-medium-latest`).

Une fois tranché, poser dans `.env` :

```
SCRAPE_TARGETS=chatgpt:openai-api:gpt-6-luna:online,claude:anthropic-api:claude-haiku-5-5:online,gemini:openrouter:google/gemini-2.5-flash:online,perplexity:openrouter:perplexity/sonar:online,mistral:mistral-api:mistral-medium-latest:online
```

(remplacer `gemini-2.5-flash` par `gemini-3-flash` et/ou
`claude-haiku-5-5` par le modèle choisi si bascule).

## 6 · Démarrer le worker

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml up -d worker
docker compose logs -f worker
# Attendu : connexion à Postgres, enregistrement des cinq moteurs,
# premier run lancé à l'heure UTC qui suit le démarrage.
```

Dès le premier run reçu (environ 2 à 10 min), re-lancer `cost-guard.sh`
pour inscrire le premier relevé dans le journal :

```
cd ~/OIA/infra/visibility
./scripts/cost-guard.sh --watch 60   # relevé toutes les 60 s pendant J0
```

Laisser tourner dans un `screen` ou un onglet dédié. Le script arrête le
worker si le plafond mensuel est atteint, ou si l'estimation devient
illisible.

## 7 · Suivi quotidien (cinq jours)

Chaque matin, Mickaël exécute :

```
cd ~/OIA/infra/visibility
./scripts/window-day.sh coach-gari     # résumé du jour (jours manquants,
                                       # coût retenu, état du gel, nombre
                                       # de réponses collectées)
```

Vérifier :

- aucune journée manquante (sinon, Elmo le marque dans
  `prompt_runs.missed_at`) ;
- la ligne `cost-journal.csv` du jour est bien < 24 $ cumulés sur le mois ;
- le gel J0 (`subjects freezes coach-gari`) est toujours en vigueur et
  aucune publication publique du site n'a eu lieu (`CoachGari` repo,
  branche `main`, dernier commit avant la fenêtre : hash à noter à J-0).

Clore chaque journée dans le registre (`infra/visibility/reports/` ou
cahier interne — à définir dans le mandat suivant).

## 8 · Arrêt au cinquième jour

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml stop worker
# Surtout PAS down (qui supprime les volumes). Postgres reste chaud pour
# l'export du rapport.
```

Lancer le rapport :

```
cd ~/OIA/infra/visibility
# (procédure E6 / F5 à finaliser dans un mandat ultérieur)
```

Mettre à jour `subjects/coach-gari/measurement.yaml` :

```
windows:
  - id: j0
    status: done
    start: YYYY-MM-DD        # jour du premier run
    end:   YYYY-MM-DD        # cinquième jour (inclus)
```

Et lever le gel implicitement (le gel est automatiquement « levé »
quand la fenêtre passe à `done`, voir `src/load.ts` → `activeFreezes`).

## 9 · Après J0 : préparer la suite

- Export du rapport (statistiques, exactitude des faits, revue croisée)
  et archivage dans `infra/visibility/subjects/coach-gari/reports/j0/`.
- Relevé manuel des coûts réels dans chaque console (OpenAI, Anthropic,
  Mistral), à reporter dans la colonne `manual_usd` du journal
  (`OIA_VIS_MANUAL_COST_USD`), pour que le plafond logiciel soit lu sur
  des chiffres facturés et non seulement sur l'estimation d'Elmo.
- Décision Mickaël : mesure suivante en M+1, ou fenêtre de contrôle plus
  courte en M+0,5 (hors scénario roadmap).

## Rappels sécurité qui ont déjà sauvé le projet

- **Ne jamais `export ANTHROPIC_API_KEY=...`** dans le shell : Claude
  Code (l'outil d'édition) l'absorbe et des runs non mesurés partent.
- **Ne jamais `git add` le fichier `.env`** : il est dans `.gitignore`,
  mais un `git add -A` forçant peut contourner.
- **Ne pas faire `docker compose down -v`** à la fin : perte du Postgres
  (y compris ses clés chiffrées).
- **Ne pas démarrer deux workers en parallèle** (double Elmo sur le
  Mac) : double coût sans double mesure.

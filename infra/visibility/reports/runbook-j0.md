# Runbook J0 · OIA Visibility · Coach Gari

Mise à jour 2026-11-07. Lancement du premier pilote (`coach-gari`) en
moteurs API directs plafonnés à 30 $/mois. Toutes les étapes sont faites par
Mickaël sur le Mac Studio ; aucune n'est exécutée par un agent Claude
Code. Durée estimée : 45 min pour poser les clés, 5 min de lancement, puis
cinq journées pendant lesquelles un contrôle quotidien suffit.

## 0 · Avant de poser une clé

Mise à jour 2026-11-07 (décisions de Mickaël, `FOURNISSEURS.md` § 0
quater) : API directes partout où Elmo les gère, Jev en direct chez
TypeSafe. Gemini, Perplexity et Grok ne passent que par OpenRouter dans
Elmo 0.7.7 : **en attente de décision** (OpenRouter à 5 $ ou moteurs
retirés de J0).

**Règle commune** : crédit prépayé + recharge automatique **coupée**
partout, et la somme des crédits ne dépasse pas le plafond de 30 $. Sans
cette précaution, le plafond logiciel de `cost-guard.sh` n'arrête rien
tant que l'estimation ou le solde reporté n'a pas rattrapé la dépense
réelle (et l'estimation d'Elmo sous-estime Claude Sonnet 5.5).

| Fournisseur | Clé | Crédit prépayé | Limite supplémentaire |
|---|---|---|---|
| OpenAI | `oia-visibility` | 5 $ | limite mensuelle du projet |
| Anthropic | `oia-visibility`, créée **dans l'espace de travail dédié** | 12 $ | limite de dépense de l'espace : 12 $ / mois |
| Mistral | `oia-visibility` (compte existant, séparée d'OIA Funding) | 5 $ | — |
| TypeSafe (Jev) | `oia-visibility` | minimum proposé, au plus 3 $ | — |
| OpenRouter | **seulement si Mickaël le retient** | 5 $ (7 $ avec Grok, Anthropic ramené à 10 $) | limite de crédit sur la clé |

Cases à cocher avant de poser la première clé :

- [ ] OpenAI : recharge automatique coupée (Billing → Auto recharge).
- [ ] OpenAI : limite mensuelle posée sur le projet de la clé.
- [ ] Anthropic : espace de travail dédié `oia-visibility` créé.
- [ ] Anthropic : limite de dépense posée sur cet espace (12 $ / mois).
- [ ] Anthropic : clé créée dans cet espace, pas dans l'espace par défaut.
- [ ] Anthropic : recharge automatique coupée (Billing).
- [ ] Mistral : recharge automatique coupée, clé dédiée `oia-visibility`.
- [ ] TypeSafe : recharge automatique coupée (ou facturation sans carte enregistrée).
- [ ] OpenRouter (si retenu) : recharge automatique coupée, limite de crédit sur la clé.
- [ ] Somme des crédits prépayés ≤ 30 $.
- [ ] Clés Google (Gemini), Perplexity et xAI laissées dans Proton Pass : Elmo 0.7.7 ne les lit pas.

## 1 · Poser les clés sur le Mac

Les clés **ne sont jamais exportées dans le shell** — elles iraient dans
`ANTHROPIC_API_KEY`, où Claude Code les capterait. Seul le fichier
`infra/visibility/elmo/.env` les reçoit, et ce fichier est hors Git
(voir `SECRETS.md`).

```
cd ~/OIA/infra/visibility/elmo
cp -n .env.example .env               # ne jamais écraser un .env déjà posé
# Ouvrir .env dans un éditeur et compléter UNIQUEMENT :
#   OPENAI_API_KEY=...
#   ANTHROPIC_API_KEY=...         (clé de l'espace de travail dédié)
#   MISTRAL_API_KEY=...
#   TYPESAFE_API_KEY=...          (Jev en direct chez TypeSafe)
#   OPENROUTER_API_KEY=           (VIDE sauf décision de Mickaël)
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

Sans OpenRouter, la colonne `openrouter_cum_usd` vaut `n/a` : normal avec
`OIA_VIS_COST_SOURCE=max`. Ne pas passer en `real` sans OpenRouter (le
script s'arrêterait sur `cost-unreadable`). Les coûts OpenAI, Anthropic,
Mistral et TypeSafe se relèvent dans leurs consoles (`OIA_VIS_MANUAL_COST_USD`).

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
les moteurs à activer (`chatgpt, claude, mistral` au 2026-11-07, plus
`gemini, perplexity, grok` si OpenRouter est retenu), les concurrents (Playtomic, Ultimate Performance, Future,
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
2. **Brand → LLM settings** : activer `chatgpt`, `claude`, `mistral`
   (plus `gemini`, `perplexity`, `grok` seulement si OpenRouter est
   retenu, voir étape 5). **Décocher** tout autre moteur (pas de
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

## 5 · Modèles (décidés le 2026-11-07)

Trois moteurs directs retenus : `gpt-6-luna`, `claude-sonnet-5-5`
(identifiant vérifié sur platform.claude.com), `mistral-medium-latest`.
Poser dans `.env` :

```
SCRAPE_TARGETS=chatgpt:openai-api:gpt-6-luna:online,claude:anthropic-api:claude-sonnet-5-5:online,mistral:mistral-api:mistral-medium-latest:online
```

Seulement si Mickaël retient OpenRouter, ajouter à la fin de la ligne :

```
,gemini:openrouter:google/gemini-3-flash-preview:online,perplexity:openrouter:perplexity/sonar:online
```

et, si Grok est retenu comme sixième moteur :
`,grok:openrouter:x-ai/grok-4.5:online`.

Dans Elmo, **Brand → LLM settings** : n'activer que les moteurs présents
dans `SCRAPE_TARGETS` (étape 4).

## 6 · Démarrer le worker

```
cd ~/OIA/infra/visibility/elmo
docker compose --env-file .env -f compose.yaml up -d worker
docker compose logs -f worker
# Attendu : connexion à Postgres, enregistrement des moteurs de SCRAPE_TARGETS,
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
  Mistral, TypeSafe), à reporter dans la colonne `manual_usd` du journal
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

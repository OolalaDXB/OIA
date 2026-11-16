# Collecteur OIA direct · réglages relevés dans Elmo 0.7.7

Mandat v14, bloc C. Le collecteur `oia-direct` (`src/collector-oia-direct.ts`, un fichier par
fournisseur sous `src/collector-oia/`) interroge les cinq moteurs de J0 par leur API, avec les
réglages qu'Elmo appliquait. Ce document relève chaque réglage dans le code d'Elmo et note
chaque écart volontaire.

Source : Elmo, tag `v0.7.7`, commit `5e76f4229ae49fa300097c38823486f937da0b86` (licence MIT,
Copyright (c) 2026 Blue Whale Software, LLC), lu sans être exécuté. Les chemins sont relatifs à
la racine de ce dépôt d'Elmo. Les faits « observés à J0 » viennent des 280 réponses de
`prompt_runs` de l'export du bloc A (`~/oia-sauvegardes/elmo-final/20261116T103321Z/json/`),
lues sans être modifiées.

## 1. Ce qui vaut pour tous les moteurs

| Point | Elmo 0.7.7 | Fichier et ligne | OIA |
| --- | --- | --- | --- |
| Texte envoyé | La question telle quelle, en un seul message utilisateur. Aucun prompt système, aucune consigne ajoutée | `apps/worker/src/jobs/process-prompt.ts` l. 229-232 ; chaque fournisseur ci-dessous | Identique |
| Plafond de jetons de sortie | 8 000 par appel, raisonnement compris, pour les quatre fournisseurs | `packages/lib/src/providers/config.ts` l. 31-36 | Identique (`MAX_OUTPUT_TOKENS`, `src/collector-oia/types.ts`) |
| Température, top_p | Non envoyées (valeur par défaut du fournisseur) | les quatre fichiers `registry/*.ts` | Non envoyées |
| Localisation de la recherche | Aucune (ni `user_location`, ni pays) pour les fournisseurs API | `registry/openai-api.ts`, `anthropic-api.ts`, `mistral-api.ts`, `openrouter.ts` | Aucune |
| Cible | `moteur:fournisseur:version[:online]`, `:online` = recherche web | `packages/config/src/scrape-targets.ts` l. 36-46 | Même découpage (`parseTarget`) ; les cibles viennent de `targets` de la fenêtre |
| Choix des moteurs | Par marque (`enabledModels`) | `packages/lib/src/providers/runner.ts` l. 13-29 | **Par question** : une question n'est envoyée qu'aux moteurs dont `languages` (measurement.yaml) contient sa langue ; sans `languages`, à tous |
| Reprises | Aucune reprise propre à Elmo ; celles des SDK : `ai` (OpenAI) et `@anthropic-ai/sdk` (Anthropic) reprennent par défaut ; `fetch` direct (Mistral, OpenRouter) : aucune | `registry/openai-api.ts` l. 66, `anthropic-api.ts` l. 43-49, `mistral-api.ts` l. 19-32, `openrouter.ts` l. 128-136 | Uniforme : 3 essais au plus sur 408, 429, 5xx et erreurs réseau, attente 2 s puis 4 s, ou `Retry-After` (60 s au plus) ; toute autre erreur est définitive au premier essai (`src/collector-oia/http.ts`) |
| Échec | Compté dans `usage_events` (`prompt_run_failed`), aucune réponse, nouveau cycle plus tard | `process-prompt.ts` l. 270-288, 395-401 | Consigné dans `<data>/<sujet>/evidence/<fenêtre>.failures.jsonl`, compté au majorant, **jamais comblé** (ni relance du même jour, ni rattrapage d'un jour passé) |
| Coût | Forfait par fournisseur | `packages/lib/src/usage/cost.ts` l. 23-26, 39 | Grille `src/cost-grid.ts` sur les compteurs de chaque appel facturé, relevée par le montant facturé quand l'API le donne |
| Texte des réponses | Extrait de la réponse brute, un texte de remplacement (« No text content found… ») devient NULL | `packages/lib/src/text-extraction.ts` l. 23-34, 402-431 | Même extraction (`src/collector-oia/extract.ts`, reprise) ; jamais de texte de remplacement : "" si aucun texte |

## 2. Réglages par moteur

| Moteur (cible J0) | Point d'accès | Recherche web | Limites | Version enregistrée | Fichier Elmo |
| --- | --- | --- | --- | --- | --- |
| chatgpt `openai-api:gpt-6-luna:online` | API Responses (SDK `ai`, `openai.responses`) | outil `web_search`, `searchContextSize: "low"`, `toolChoice: "auto"` | `maxToolCalls: 2` (au plus 2 appels d'outil), 8 000 jetons | la version configurée | `registry/openai-api.ts` l. 63-97 ; `config.ts` l. 54-57 |
| claude `anthropic-api:claude-sonnet-5-5:online` | `POST /v1/messages` (`@anthropic-ai/sdk`) | outil `web_search_20250305`, nom `web_search` | `max_uses: 1` ; si un bloc `web_search_tool_result_error` (ex. `max_uses_exceeded`) : un nouvel appel 10 s plus tard, une seule fois ; 8 000 jetons | la version configurée | `registry/anthropic-api.ts` l. 32-94 ; `config.ts` l. 52-53 |
| mistral `mistral-api:mistral-large-4:online` | `POST https://api.mistral.ai/v1/conversations` | outil `web_search` (connecteur), sans paramètre | aucune limite de recherches (le connecteur n'en a pas) ; `completion_args.max_tokens: 8000` ; pas de raison d'arrêt dans la réponse | `data.model`, absent en tête de réponse : la version configurée | `registry/mistral-api.ts` l. 89-104 |
| gemini `openrouter:google/gemini-3-flash-preview:online` | `POST https://openrouter.ai/api/v1/chat/completions` (`fetch` direct) | suffixe `:online` = plugin `web` sans moteur imposé : recherche native du fournisseur, Exa en repli | `max_tokens: 8000`, aucun autre paramètre | `data.model` | `registry/openrouter.ts` l. 101-149 |
| perplexity `openrouter:perplexity/sonar:online` | idem | idem | idem | `data.model` | idem |

En-têtes OpenRouter d'Elmo : `HTTP-Referer` (`APP_URL`, sinon son dépôt) et `X-Title: Elmo AEO`
(`registry/openrouter.ts` l. 19-26).

Observé dans la base d'Elmo (56 réponses par moteur) : 1 recherche par réponse pour Claude (53 réponses ;
3 sans compteur) ; 3 à 6 recherches par réponse pour Gemini (`usage.server_tool_use_details.web_search_requests`) ; jusqu'à 37 pour Mistral ;
`usage.cost` présent dans toutes les réponses OpenRouter ; versions servies : `claude-sonnet-5-5`,
`mistral-large-4`, `google/gemini-3-flash-preview`, `perplexity/sonar`.

## 3. Citations et requêtes de recherche, par fournisseur

| Fournisseur | Citations (Elmo) | Requêtes de recherche (Elmo) | Fichier Elmo |
| --- | --- | --- | --- |
| OpenAI | annotations `url_citation` des morceaux `output_text` des entrées `message` | `action.query` et `action.queries` des résultats d'outil `web_search` | `text-extraction.ts` l. 511-519 ; `registry/openai-api.ts` l. 44-48 |
| Anthropic | `citations` de type `web_search_result_location` des blocs `text`, puis chaque `web_search_result` des blocs `web_search_tool_result` | `input.query` des blocs `server_tool_use` nommés `web_search` | `text-extraction.ts` l. 580-590 ; `registry/anthropic-api.ts` l. 66-73 |
| Mistral | morceaux `tool_reference` du `content` des entrées | `arguments.query` (JSON) des entrées `tool.execution` nommées `web_search` | `text-extraction.ts` l. 550-556 ; `registry/mistral-api.ts` l. 44-56 |
| OpenRouter | annotations `url_citation` de `choices[0].message`, imbriquées sous `url_citation` ou à plat | aucune : OpenRouter ne les donne pas (`unavailable` dans Elmo) | `text-extraction.ts` l. 558-566 ; `registry/openrouter.ts` l. 28-54, 146-147 |

Règles communes (`text-extraction.ts` l. 444-509) : URL commençant par `http`, valide, sans
doublon, dans l'ordre de lecture ; titre tronqué à 256 caractères. Reprises telles quelles dans
`src/collector-oia/extract.ts`.

**Mistral Large 4 ne renvoie pas ses sources.** Aucun morceau `tool_reference` dans les 56
réponses Mistral de la base d'Elmo (morceaux observés : `thinking` 148, `text` 43). Les
citations de Mistral restent donc vides, comme à J0. OIA garde à part les pages que l'outil de
recherche a renvoyées (`tool.execution` → `info.result`, `structured.searchResults`) : ce sont
des pages consultées, jamais comptées comme citations.

**Gemini** cite par des liens `vertexaisearch.cloud.google.com/grounding-api-redirect/…`. Ils
restent tels quels dans les citations (comme à J0, pour que les preuves se comparent) ; après la
collecte, `collect-day` les résout avec `src/redirects.ts` dans le cache partagé
`<data>/<sujet>/redirects-cache.json`, que vis-sync et les rapports appliquent à la lecture.

## 4. Ce qu'Elmo perdait, et ce qu'OIA garde

| Moteur | Ce qu'Elmo gardait | Fichier et ligne | OIA |
| --- | --- | --- | --- |
| OpenAI | Une réponse **reconstruite** quand le SDK ne rendait pas le corps : `{output: [{type: "message", content: [{type: "output_text", text, annotations}]}]}`. Les 56 réponses OpenAI de la base n'ont que la clé `output` : ni `usage`, ni `id`, ni `web_search_call`, ni version servie. Leur coût était compté au majorant | `registry/openai-api.ts` l. 54-61, 83-86 | Corps complet de l'API (compteurs, appels de recherche, identifiant, version servie) |
| Anthropic | La réponse, **sans le contenu des pages trouvées** (`encrypted_content`, `page_age` retirés), et seulement la seconde réponse quand l'appel était refait | `registry/anthropic-api.ts` l. 51-62, 75-90 | Les deux réponses complètes, le coût des deux |
| Mistral | La réponse complète, mais un **texte NULL pour 15 réponses sans réponse finale (14 du panel de J0)** | `text-extraction.ts` l. 179-186, 424-427 | Texte de toutes les réponses quand l'API en donne (voir ci-dessous) |
| OpenRouter | La réponse complète (`usage.cost` compris), mais un coût au forfait | `registry/openrouter.ts` l. 138-149 ; `usage/cost.ts` | La réponse complète, et `usage.cost` comme coût réel |

**Pourquoi 15 réponses Mistral sans texte (14 du panel de J0, 1 hors panel).** Aucune n'a de
texte dans `raw_output` : ce n'est pas un défaut d'extraction. Leur suite d'entrées est toujours
`message.output` [`thinking` seul] puis 3 à 5 `tool.execution` ; deux ont en plus un second
`message.output` [`thinking`] suivi d'autres `tool.execution`. Aucune n'a de `message.output`
final avec un morceau `text`, alors que toutes les réponses avec texte finissent par
`message.output` [`thinking` + `text`]. La conversation s'est arrêtée après les recherches,
**sans réponse finale**. Elmo ne fait qu'un appel, sans moyen de reprendre
(`registry/mistral-api.ts` l. 97-103) ; son extracteur (`text-extraction.ts` l. 179-186) renvoie
« No text content found in Mistral output. », que `storableText` (l. 424-427) change en NULL. Les
200 à 300 jetons de sortie facturés sont ceux du raisonnement. (Sans effet sur ces réponses : un
`content` en simple chaîne échapperait aussi à l'extracteur d'Elmo ; OIA le lit.)

Ce que fait OIA (`src/collector-oia/mistral.ts`) :
1. détection : aucun morceau `text` après la dernière `tool.execution` (`hasFinalAnswer`) ;
2. **par défaut, aucune reprise** (décision de Mickaël du 16 novembre 2026, pour la
   comparabilité avec J0) : un seul appel, comme Elmo. La réponse est consignée avec le texte
   qu'Elmo en aurait tiré (vide pour ces réponses), `structured.finalAnswer: false` et
   `noTextReason` « sans réponse finale … (suite de conversation désactivée) » ; le majorant d'un
   appel Mistral est d'un appel ;
3. **option** `OIA_VIS_MISTRAL_CONTINUATION=1`, dans l'environnement du processus (ce nom n'est
   pas admis dans le fichier de clés) — reprise : `POST /v1/conversations/{conversation_id}` (ajout à la conversation, rangée par
   défaut chez Mistral, `store: true`), sans nouvelle entrée, avec
   `completion_args.max_tokens: 8000`, deux fois au plus (`MISTRAL_MAX_CONTINUATIONS`), et pas
   de nouvelle suite si la précédente n'a rien renvoyé. Aucune question n'est ajoutée. La
   documentation de la Conversations API ne donne aucun paramètre de complétion pour borner les
   tours d'outil ou forcer une réponse finale. Chaque suite est un appel facturé, chiffré et
   gardé (`structured.raw`, rôle `continuation`) ; avec l'option, le majorant d'un appel Mistral
   compte trois appels. Activer l'option change la mesure de Mistral par rapport à J0 : le
   rapport comparé doit alors le déclarer ;
4. sans réponse finale (sans l'option, ou après les suites) : la preuve est consignée avec `structured.finalAnswer:
   false` et `noTextReason` « sans réponse finale… », avec un texte vide (ou le seul texte
   rédigé avant les recherches, s'il y en a). Rien n'est inventé ; le raisonnement reste dans
   `structured.thinking`, jamais compté comme réponse.

**À vérifier au premier appel réel** : la documentation de Mistral donne `{}` comme corps
d'exemple de l'ajout à une conversation, sans dire comment le modèle continue après une
recherche. Ce point n'a jamais été essayé contre l'API (aucun appel payant). Si la suite ne
produit pas de texte, le comportement retombe sur le point 4.

## 5. Écarts volontaires avec Elmo (récapitulatif)

1. Choix des moteurs par question, et non par marque.
2. Corps complet de la réponse OpenAI, au lieu de la réponse reconstruite.
3. Anthropic : contenu des pages gardé ; les deux réponses gardées et payées quand l'appel est
   refait.
4. Mistral : en option seulement (`OIA_VIS_MISTRAL_CONTINUATION=1`, désactivée par défaut), suite
   de conversation (2 au plus) quand aucun texte ne suit la dernière recherche ;
   `content` en chaîne lu ; raisonnement et pages consultées gardés à part.
5. OpenRouter : en-tête `X-Title: OIA Visibility`, sans `HTTP-Referer` (attribution
   d'application seulement, sans effet sur la réponse).
6. Reprises uniformes et bornées (3 essais), au lieu de celles, propres à chaque SDK, d'Elmo.
7. Échec consigné et jamais comblé ; aucune nouvelle tentative au cycle suivant.
8. Coût par appel selon la grille et le montant facturé, et non au forfait.
9. Version servie : celle que donne la réponse (OpenAI la donne datée, ex.
   `gpt-6-luna-2026-10-01`, que la grille accepte), Elmo enregistrait la version configurée pour
   OpenAI et Anthropic.
10. Requête OpenAI écrite à la main : `input` en message utilisateur `input_text`, `tools:
    [{type: "web_search", search_context_size: "low"}]`, `max_tool_calls: 2`,
    `max_output_tokens: 8000`, `tool_choice: "auto"`. C'est la traduction des réglages d'Elmo
    dans l'API Responses ; la requête exacte que fabriquait le SDK `ai` 7.0.150 /
    `@ai-sdk/openai` 4.0.101 n'a pas pu être relue (dépendances non installées dans la copie
    d'Elmo, et rien n'y a été installé).

## 6. Planification et garde-fou

`src/collect-day.ts <sujet> <fenêtre> [--juge jev|mistral|aucun] [--go]` (ou `scripts/collect-day.sh`) :
- sans `--go` : plan du jour (appels par moteur, exclusions par langue) et coût au majorant,
  aucun appel ;
- avec `--go` : refus si la fenêtre n'est pas `running`, si le jour UTC est hors de ses dates,
  si `OIA_VIS_MONTHLY_CAP_USD` n'est pas posé, ou si une clé manque (toutes vérifiées avant le
  premier appel, `TYPESAFE_API_KEY` comprise avec le juge `jev`, juge par défaut) ;
- avant chaque appel : coût du mois + majorant de l'appel et de son jugement ≤ plafond, sinon
  arrêt (code 3). Le coût du mois additionne les preuves `oia-direct` du mois de tous les sujets
  (réponse et juge), les échecs au
  majorant et le dernier relevé du mois de `cost-journal.csv` (coût d'Elmo retenu par
  cost-guard.sh), les comptes des fournisseurs étant partagés ;
- coût illisible (version servie absente de la grille, table ou journal illisible) : la preuve
  payée est gardée, la collecte s'arrête (code 3), et toute collecte suivante du mois est refusée
  jusqu'à la mise à jour de la grille ;
- majorant d'un appel : celui de la grille, ×2 pour Anthropic (appel refait), ×1 pour Mistral
  (×3 avec l'option de suite), plus le majorant du juge (Jev : 8 appels × 0,001 $).

Clés : `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`,
`TYPESAFE_API_KEY`, lues dans l'environnement du processus, jamais affichées, jamais écrites ;
une clé renvoyée par un fournisseur dans un message d'erreur est masquée.

## 7. Fichier de clés

`scripts/collect-day.sh` complète l'environnement par un fichier de configuration d'OIA
(`scripts/load-keys.sh`), sans rien afficher :

- emplacement : `OIA_VIS_KEYS_FILE`, par défaut `~/.oia/visibility.env` ; s'il n'existe pas, rien
  n'est chargé (les clés déjà dans l'environnement servent seules) ;
- droits : `600` exactement (`chmod 600 ~/.oia/visibility.env`), sinon refus ;
- contenu : des lignes `NOM=valeur` et des lignes vides, rien d'autre (ni commentaire, ni
  `export`, ni espace autour de `=`). Une paire de guillemets englobant la valeur est retirée ;
- noms admis, et eux seuls : `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
  `MISTRAL_API_KEY`, `TYPESAFE_API_KEY`, `OIA_VIS_MONTHLY_CAP_USD`, `OIA_VIS_MONTHLY_ALERT_USD`.
  Tout autre nom fait refuser le fichier entier ;
- le fichier n'est jamais exécuté (pas de `source`) : il est lu ligne à ligne et, seulement s'il
  est valide en entier, ses valeurs sont exportées au seul processus de la collecte (et à ses
  enfants). Un refus ne cite que le numéro de ligne et le nom, jamais une valeur.

## 8. Juge des mentions (option D1 : Jev)

Décision de Mickaël du 16 novembre 2026 : Jev de TypeSafe, modèle épinglé `jev-1.13.0`, appelé
directement par OIA (`src/judge.ts`, et `src/judge-jev.ts`, repris d'Elmo sous licence MIT :
`apps/worker/src/mention-judge/{jev,analyze,clean,passages}.ts` et `packages/lib/src/mentions.ts`).
Détail de la requête d'Elmo : `docs/elmo-calculs-et-juge.md` §2.

Chaîne, pour chaque réponse collectée, avant l'écriture de sa preuve (une seule ligne, ajout seul) :
1. **correspondance déterministe** (un fait, `structured.mentions.facts`) : noms, alias et
   domaines de la marque et des concurrents, en mot entier, sur le texte nettoyé comme Elmo ; pour
   chaque entreprise nommée : le terme, sa forme exacte, la première position et le nombre de
   mentions dans `rawText`, et la phrase exacte qui contient la première mention ;
2. seules les réponses qui nomment au moins une entreprise suivie partent chez Jev
   (`POST https://api.typesafe.ai/v1/systemone`), avec la requête de J0 : mêmes `RULES`, mêmes
   critères, seuil de mention 0,3, réponse nettoyée tronquée à 50 000 caractères, 12 phrases et
   3 phrases par passage, découpage sur `max_tokens_exceeded`, tampon `jev-1.13.0+request-1` ;
3. Jev ne peut que **retirer** une mention et donner un sentiment et un passage ; son résultat
   est rangé comme « extrait (Jev 1.13) » (`structured.mentions.judge`, avec `assessments`,
   `removed`, `usage` de chaque appel et coût), jamais comme fait ;
4. `brandMentioned` et `competitorsMentioned` au premier niveau de `structured`, comme à J0 :
   nommé par la correspondance et non retiré par Jev. Si Jev échoue, ils valent `null` (présence
   non tranchée), les faits restent, et l'échec est consigné.

Configuration suivie, lue dans le sujet (`mentionConfigFrom`) : marque = `displayName`, alias non
rejetés, domaines = site principal tel qu'écrit (Elmo mettait son site en URL complète dans la
question posée à Jev), puis domaines nus des sites additionnels et des alias de type domaine ;
concurrents non rejetés de `subject.yaml`, dans leur ordre (clés `c0`, `c1`…). La liste de
concurrents d'Elmo a changé pendant J0 (note de la fenêtre dans measurement.yaml) : pour juger
avec une autre liste que celle de `subject.yaml`, la passer à `runDay` (`mentionConfig`) ; la
commande ne l'expose pas encore.

Écarts avec Elmo, hors de la requête : appels en série, 6 reprises au plus sur 429 (Retry-After),
au plus 8 appels par réponse (découpages compris), `usage` gardé, passage gardé en texte, pas de
réutilisation d'un jugement précédent.

Prix : aucun tarif dans le code d'Elmo (« 0,15 à 0,35 $ par 1 000 réponses » selon sa
documentation). Majorant **provisoire** : 0,001 $ par appel (`JEV_PRICE`), à corriger sur la
première facture TypeSafe.

Options de juge : `jev` (défaut, `TYPESAFE_API_KEY` obligatoire avec `--go` ; la valeur `stub`
d'Elmo est refusée), `aucun` (correspondance seule), `mistral` (non retenu : erreur explicite).

Aucune tâche planifiée n'est installée. L'heure de lancement est `runTimeUtc` de la fenêtre ; la
tâche quotidienne (launchd), les clés et l'activation sont des décisions de Mickaël.

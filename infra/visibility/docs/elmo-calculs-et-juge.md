# Elmo : ce qu'il calcule, son juge des mentions, et les risques de l'import

16 novembre 2026 · mandat v14, blocs A (liste des calculs), D (juge) et B (risques)

> Lecture seule du code d'Elmo v0.7.7 (commit `5e76f422`, licence MIT,
> « Copyright (c) 2026 Blue Whale Software, LLC ») et du code d'OIA. Aucun code
> n'a été lancé, aucun appel réseau n'a été fait. Les chemins d'Elmo sont
> relatifs à la racine du dépôt d'Elmo, ceux d'OIA à la racine d'OIA. Les
> numéros de ligne renvoient au tag `v0.7.7`.

## 0. L'essentiel

1. **Le juge Jev n'invente aucune mention.** Elmo cherche d'abord les noms, alias
   et domaines dans le texte (correspondance en mot entier, déterministe). Seules
   les réponses qui nomment au moins une entreprise suivie partent chez Jev, et Jev
   ne se prononce que sur les entreprises trouvées ainsi. Jev peut donc seulement
   **retirer** une mention (homonyme, mot courant, « je n'ai pas d'information »)
   et donner un **sentiment** et un **passage**. La **position** et le **nombre de
   mentions** sont calculés sans Jev, à partir des positions des mots dans le texte.
2. **Le taux de présence de J0 vient de Jev** : `j0-report.ts` compte
   `structured.brandMentioned`, qui est `run_mentions.brand_mentioned`, la décision
   de Jev. L'option D3 « aucun juge » ne mesure donc pas la même chose qu'à J0. L'écart
   ne porte que sur les mentions que Jev a retirées. `j0-reanalysis.ts` le compte déjà
   (`disagreements`).
3. **Les réponses de Mistral sans texte : hypothèse vérifiée et réfutée (16 novembre).**
   L'export final contient 15 runs Mistral sans texte : 14 du panel de J0, 1 hors panel.
   Leur `raw_output` ne contient **aucun texte** : chaque séquence `outputs` se termine par
   `message.output[thinking]` suivi d'appels `tool.execution` (la recherche web), sans
   message final portant un bloc `text`. Les réponses avec texte se terminent toutes par
   `message.output[thinking+text]`. La conversation s'est donc arrêtée après les
   recherches : ce n'est pas un défaut de l'extracteur, et il n'y a rien à reprendre. Le
   collecteur OIA doit détecter ce cas (bloc C).
4. **Le code de calcul utile d'Elmo est surtout déterministe et peut être repris (MIT)** :
   extraction par fournisseur, nettoyage du texte et passages, correspondance des noms,
   classement par position, classification des sources. Ce qui appelle un modèle payant,
   hors collecte : Jev, les opportunités, les rapports « whitelabel », l'onboarding.
5. **Les catégories de sources d'Elmo sont fausses pour Gemini.** Les citations de Gemini
   (via OpenRouter) sont des liens `vertexaisearch.cloud.google.com/grounding-api-redirect/…`.
   Elmo les classe d'après ce domaine de redirection. `cited_pages`, `rollup_citation_*`
   et les opportunités en héritent. Il faut les reclasser après résolution par `src/redirects.ts`.

## 1. Ce qu'Elmo calcule

### 1.1 Chaîne de traitement

`apps/worker/src/jobs/process-prompt.ts:229-269` appelle le fournisseur, puis enregistre
`prompt_runs` en ajout seul : `raw_output`, `web_queries`, `version`. Il note aussi un
`usage_events`. Ensuite, `apps/worker/src/jobs/derive-runs.ts:140-185` dérive les données :
texte (`run_extractions`), citations (`citations` et `cited_pages`) et mentions
(`run_mentions`, avec appel à Jev). Enfin, `refresh-rollups` reconstruit les tables
`rollup_*` qu'affiche le tableau de bord. Chaque couche dérivée porte un tampon de version
(`packages/lib/src/analysis-versions.ts`) : extraction `1`, mentions
`1:<empreinte>:judge-jev-1.13.0+request-1`.

### 1.2 Calcul par calcul

**a. Extraction du texte par fournisseur.** `packages/lib/src/text-extraction.ts:45-70`
(OpenAI, Anthropic), `:179-193` (Mistral, OpenRouter), `:384`, `:681-731` (table
`EXTRACTORS`, `extractorFor`).
- Ce qu'il fait : lit l'emplacement du texte propre à chaque forme de réponse. Renvoie
  `null` pour une réponse vide ou pour un texte de remplacement (`:402-431`).
- Modèle payant : non.
- OIA aujourd'hui : rien. OIA reçoit le texte déjà extrait par Elmo (`src/j0-evidence.ts:86`,
  `scripts/j0-export.sh`, champ `text_content`).
- Proposition : **repris (MIT)** pour les 5 moteurs de J0, avec deux corrections. Pour
  Mistral, accepter `content` sous forme de chaîne. Pour OpenAI, garder la sortie brute
  (voir le point d). Le collecteur OIA stocke la sortie brute et extrait avec ce code ;
  l'import d'Elmo garde le texte d'Elmo.

**b. Extraction des citations par fournisseur.** `text-extraction.ts:437-509`
(`collectCitations` : URL en http(s), dédoublonnage par URL exacte, index dans l'ordre,
titre tronqué à 256 caractères), `:511` OpenAI (`url_citation` dans `output_text`),
`:550` Mistral (`tool_reference`), `:558` OpenRouter (`message.annotations`), `:580`
Anthropic (`web_search_result_location` et `web_search_result`).
- Modèle payant : non.
- OIA aujourd'hui : `src/j0-reanalysis.ts:87` (`urlsInText`, liens écrits dans le texte)
  et `src/redirects.ts` (résolution des redirections de Gemini).
- Proposition : **repris (MIT)**, comme le demande le bloc C. On y ajoute
  `applyRedirects` d'OIA pour Gemini, et `urlsInText` est marqué à part (« lien dans le
  texte », jamais confondu avec une source renvoyée). Mistral Large 4 ne renvoie des
  `tool_reference` que lorsqu'il a cherché sur le web ; le documenter.

**c. Recherches lancées par les moteurs (`web_queries`).** Au moment de l'écriture, dans
chaque fournisseur : OpenAI `providers/registry/openai-api.ts:44-48` et `:88-90` (résultat
de l'outil `web_search`, `action.query` et `action.queries`), Anthropic
`anthropic-api.ts:~65-72` (`server_tool_use.input.query`), Mistral `mistral-api.ts:44-56`
(`tool.execution`, `arguments.query`), OpenRouter `openrouter.ts:144` (rien d'exposé :
`["unavailable"]` s'il y a des citations, sinon `[]`). La valeur sentinelle est
`packages/lib/src/constants.ts:57` (`WEB_QUERIES_UNAVAILABLE`) et la règle est dans
`providers/config.ts:16-23`.
- Ce qu'il fait : la colonne est stockée telle que le fournisseur l'a donnée.
  `prompt_runs.web_queries` est la seule copie, car le schéma dit que rien ne peut encore
  la redériver de `raw_output` (`db/schema.ts:145-148`).
- Modèle payant : non.
- OIA aujourd'hui : `searchItems` dans `scripts/j0-export.sh` compte seulement les appels
  de recherche (`web_search_call`, `tool.execution`), pas leur texte.
- Proposition : **repris (MIT)** pour OpenAI, Anthropic et Mistral. Pour Gemini et
  Perplexity via OpenRouter : **abandonné**, faute de donnée, et documenté comme
  « non exposé par OpenRouter ». À l'import, la sentinelle `unavailable` doit rester
  distincte d'une liste vide.

**d. Sortie brute d'OpenAI reconstruite.** `openai-api.ts:54-61` et `:85-86` : quand le
corps renvoyé par le SDK n'a pas la forme Responses, Elmo fabrique un `raw_output` à partir
de `result.text` et `result.sources`.
- Ce qui se perd : pas d'`usage`, pas de `web_search_call`, citations prises dans les
  sources du SDK.
- Proposition : **abandonné**. Le collecteur OIA appelle l'API Responses en direct et
  garde le corps complet (bloc C).

**e. Classification des sources (`cited_pages`).** `packages/lib/src/citations/page-classification.ts:30-34`
(`classifyPage`), `citations/domain-categories.ts:499-525` (`inferPageType` : 14 types de
page, d'après le chemin et le titre), `citations/domain-lists.ts:793-847` (`categorizeDomain`
et `classifyUrl` : 11 catégories, listes figées, environ 25 000 domaines éditoriaux dans
`editorial-domains.ts`, repli sur le type de page), `domain-categories.ts:131-169`
(`normalizeUrl` : retire `utm_source=openai` et `#:~:text=`, enlève `www.`, force https,
retire la barre finale), `rollups/constants.ts:16` (`CLASSIFIER_VERSION = 1`),
`db/schema.ts:451-462`.
- Ce qu'il fait : la classification est écrite sans tenir compte du client
  (`static_category`). « Marque » et « concurrent » sont appliqués à la lecture
  (`resolvePageClass`, `page-classification.ts:52-76`).
- Modèle payant : non.
- OIA aujourd'hui : `src/j0-reanalysis.ts:51-85` (`classifyCitation` : site de la marque,
  profil de la marque, concurrent, réseau social, autre), qui sait aussi reconnaître les
  profils officiels.
- Proposition : **repris (MIT)** pour `inferPageType`, `classifyUrl` et `normalizeUrl`,
  comme deuxième axe à côté de la classe OIA, avec la version du classificateur notée.
  Ce code est appliqué **après** la résolution des redirections de Gemini. Les valeurs
  `page_type` et `static_category` d'Elmo sont importées pour mémoire, sans être réutilisées.
  À vérifier : l'origine de la liste de 25 000 domaines (aucune source n'est indiquée en
  tête du fichier ; la licence MIT couvre le dépôt).

**f. Classement des domaines cités.** `citations/rollup.ts:57-130` : URL classées, domaines
reconstruits depuis les URL (la catégorie d'un domaine est celle de son URL la plus citée),
totaux par catégorie et par type. Côté SQL, `rollups/rebuild.ts:~199` (`rollup_citation_urls` :
nombre de citations et somme des `citation_index`, d'où une position moyenne).
- Modèle payant : non.
- OIA aujourd'hui : `src/j0-report.ts`, `topDomains` (bloc `computeFigures`, autour de la
  ligne 146 : 10 premiers domaines, ex æquo départagés par ordre alphabétique).
- Proposition : **refait** dans OIA, déjà en place. On reprend seulement l'idée de la
  position moyenne d'une source (`citation_index`), qui ne coûte rien.

**g. Juge des mentions.** `apps/worker/src/mention-judge/analyze.ts`, `jev.ts`, `clean.ts`,
`passages.ts` et `packages/lib/src/mentions.ts`. Voir la partie 2.
- Modèle payant : oui (Jev).
- OIA aujourd'hui : `src/j0-reanalysis.ts:94` (`mentions`, mot entier insensible à la casse)
  et `src/fact-check.ts` (correspondance déterministe, puis « extrait » par LLM).
- Proposition : la partie déterministe (nettoyage, phrases, correspondance, position) est
  **reprise (MIT)**. L'appel au juge est **refait** derrière une interface à trois options (partie 2).

**h. Tables `rollup_*`.** `packages/lib/src/rollups/rebuild.ts`, `db/schema.ts:375-600`,
tranches de 15 min (`rollups/constants.ts:6`).
- Ce que contiennent les tables :
  - `rollup_prompt_runs` : réponses, réponses qui mentionnent la marque ou un concurrent,
    réponses sans mention, sentiment de la marque (4 classes), somme et nombre des
    positions, recherches « fan-out » ;
  - `rollup_competitor_mentions` : la même chose par concurrent ;
  - `rollup_citation_urls` et `rollup_citation_pages` ;
  - `rollup_web_queries` (requêtes normalisées, hors requête identique à la question,
    `rollups/fanout.ts:8-26`) ;
  - `rollup_sentiment_quotes` (par sentiment, la réponse où Jev est le plus sûr,
    `rebuild.ts:221-235`).
- Modèle payant : non.
- OIA aujourd'hui : `src/j0-report.ts`, `window-compare.ts`, vues `vis_*`.
- Proposition : **abandonné** en tant que tables (ce sont des caches recalculables, propres à
  l'interface d'Elmo). Leurs mesures sont **refaites** dans les vues OIA : position moyenne et
  sentiment par moteur si l'on garde un juge, recherches « fan-out » par question. On
  l'exporte pour mémoire, sans l'importer.

**i. Part de voix et analyses de rapport.** `packages/lib/src/report-metrics.ts:51-130`
(part de voix = mentions de la marque / (mentions de la marque + mentions des concurrents),
arrondie), `:256` (`findContentGaps`), `:292` (`analyzeWebQueries`), `:432` (stabilité).
Côté web, `apps/web/src/lib/visibility-stats.ts:72-144` (volatilité, score de stabilité,
part de voix en reprenant la dernière valeur connue).
- Modèle payant : non.
- OIA aujourd'hui : `j0-report.ts` (présence, `competitorsInstead`).
- Proposition : **refait** si Mickaël veut une part de voix (formule triviale, à définir dans
  OIA avec ses intervalles). Sinon **abandonné**.

**j. Opportunités (`brand_opportunities`).** `apps/web/src/server/opportunities.ts:1-17`,
`:530` (régénération après 6 jours), `:553-563`.
- Ce qu'il fait : un résumé déterministe des données (visibilité par plateforme, position face
  au premier concurrent sur 7 et 30 jours, sources), puis **un appel LLM structuré** par le
  fournisseur d'onboarding (`runStructuredCompletionPrompt`). On obtient des opportunités en
  4 familles (création, contenu existant, démarchage, réseaux sociaux).
- Modèle payant : oui (fournisseur d'onboarding).
- OIA aujourd'hui : `src/recommendation.ts` (recommandations rattachées aux preuves, décision humaine).
- Proposition : **abandonné**. C'est une sortie de modèle sans preuve rattachée, sur des
  catégories de sources fausses pour Gemini. On l'exporte et on l'importe au plus comme
  document « extrait », jamais comme recommandation.

**k. Rapports (`reports`).** `apps/worker/src/jobs/generate-report.ts` et
`apps/worker/src/report-worker.ts:~100-232`.
- Ce qu'il fait : un rapport « whitelabel » de prospection, qui fait ses propres appels aux
  moteurs, juge avec Jev et fait de la recherche sur le site et les concurrents.
- Modèle payant : oui (moteurs, Jev, LLM).
- OIA aujourd'hui : `j0-report.ts`, `client-page.ts`.
- Proposition : **abandonné**. On l'exporte pour mémoire, car ses réponses ne sont pas dans
  `prompt_runs`.

**l. Coût estimé (`usage_events`).** `packages/lib/src/usage/cost.ts:15-43` : forfait par
fournisseur (0,01 $ OpenAI, 0,005 $ Mistral et OpenRouter, plus 0,01 $ de recherche
Anthropic), et `process-prompt.ts:186-205`.
- Modèle payant : non.
- OIA aujourd'hui : `src/cost-grid.ts` (grille au jeton et à la recherche, d'après `usage`).
- Proposition : **abandonné** comme coût. On l'importe comme « estimation d'Elmo », à côté du
  coût de la grille. Les événements `prompt_run_failed` sont la seule trace des échecs : on les importe.

**m. Retentative Anthropic.** `anthropic-api.ts:~50-60` : si la recherche échoue, Elmo refait
l'appel une fois et ne garde que le second.
- Modèle payant : oui (le premier appel est payé, puis perdu).
- Proposition : **abandonné** au profit des reprises bornées d'OIA. Signalé ici parce que le
  coût d'Elmo est sous-estimé pour ces runs.

**n. Onboarding et suggestion de questions.** `apps/worker/src/jobs/analyze-brand.ts`,
`suggest-prompts.ts`.
- Modèle payant : oui (LLM avec recherche web).
- OIA aujourd'hui : `src/panel-generator.ts`.
- Proposition : **abandonné**.

**o. Stockage allégé d'Anthropic.** `anthropic-api.ts:~74-86` : le texte des pages trouvées
par la recherche est retiré de `raw_output`, seuls l'URL et le titre restent.
- Modèle payant : non.
- Proposition : **abandonné**. OIA garde le corps complet, ou bien documente l'allègement
  s'il est décidé pour la taille.

### 1.3 Tableau final

| Calcul | Où dans Elmo | Payant | Déjà dans OIA | Proposition |
| --- | --- | --- | --- | --- |
| Extraction du texte par fournisseur | `packages/lib/src/text-extraction.ts:45-193, 681-731` | non | non (texte reçu d'Elmo) | **repris (MIT)**, plus la détection des conversations Mistral arrêtées après la recherche |
| Extraction des citations par fournisseur | `text-extraction.ts:437-592` | non | `j0-reanalysis.ts:87`, `redirects.ts` | **repris (MIT)**, plus les redirections de Gemini |
| Recherches lancées (`web_queries`) | `openai-api.ts:44-90`, `anthropic-api.ts`, `mistral-api.ts:44-56`, `openrouter.ts:144`, `providers/config.ts:16-23` | non | compte seulement (`searchItems`) | **repris (MIT)** pour OpenAI, Anthropic et Mistral ; **abandonné** pour OpenRouter (non exposé) |
| Reconstruction du `raw_output` d'OpenAI | `openai-api.ts:54-61, 86` | non | — | **abandonné** (corps complet gardé) |
| Normalisation des URL | `citations/domain-categories.ts:131-169` | non | partiel (`j0-reanalysis.ts:55`) | **repris (MIT)** |
| Type de page et catégorie de source (`cited_pages`) | `page-classification.ts:30-76`, `domain-categories.ts:499-551`, `domain-lists.ts:793-847`, `editorial-domains.ts` | non | `j0-reanalysis.ts:73` (5 classes OIA) | **repris (MIT)** en second axe, après résolution des redirections ; valeurs d'Elmo importées pour mémoire |
| Classement des domaines cités | `citations/rollup.ts:57-130`, `rollups/rebuild.ts:~199` | non | `j0-report.ts` (`topDomains`) | **refait** (en place), plus la position moyenne |
| Correspondance des noms, alias, domaines | `packages/lib/src/mentions.ts:78-109`, `mention-judge/passages.ts:71-84, 134-148` | non | `j0-reanalysis.ts:94` | **repris (MIT)** : mot entier sensible aux écritures CJK, liens retirés |
| Position et nombre de mentions | `mention-judge/analyze.ts:97-106, 118-128` | non | non | **repris (MIT)** |
| Nettoyage du texte et passages proposés | `mention-judge/clean.ts`, `passages.ts:33-127` | non | non | **repris (MIT)** (sert aussi de « passage exact » au bloc D) |
| Jugement (mention réelle, sentiment, passage) | `mention-judge/analyze.ts`, `jev.ts` | **oui (Jev)** | `fact-check.ts` (méthode « LLM, extrait ») | **refait**, interface à trois options (partie 2) |
| `rollup_*` (présence, sentiment, position, fan-out, citations, citations type) | `rollups/rebuild.ts`, `db/schema.ts:375-600` | non | `j0-report.ts`, `window-compare.ts`, vues `vis_*` | **abandonné** comme tables, mesures **refaites** dans les vues |
| Part de voix, stabilité, « content gaps » | `report-metrics.ts:51-432`, `apps/web/src/lib/visibility-stats.ts:72-144` | non | présence et `competitorsInstead` | **refait** si voulu, sinon abandonné |
| Opportunités (`brand_opportunities`) | `apps/web/src/server/opportunities.ts` | **oui (LLM)** | `recommendation.ts` | **abandonné** (au plus importé comme « extrait ») |
| Rapports (`reports`) | `apps/worker/src/report-worker.ts`, `jobs/generate-report.ts` | **oui** | `j0-report.ts`, `client-page.ts` | **abandonné**, exporté pour mémoire |
| Coût estimé (`usage_events`) | `packages/lib/src/usage/cost.ts:15-43`, `process-prompt.ts:186-205` | non | `cost-grid.ts` | **abandonné** comme coût ; importé comme « estimation d'Elmo » ; échecs importés |
| Onboarding, suggestions de questions | `jobs/analyze-brand.ts`, `jobs/suggest-prompts.ts` | **oui** | `panel-generator.ts` | **abandonné** |

Pour chaque fichier repris : l'avis MIT et la référence (`v0.7.7`, `5e76f422`, chemin
d'origine) en tête, comme le demande la règle 5 du mandat.

## 2. Juge des mentions (bloc D)

### 2.1 Comment Elmo appelle Jev

- **Point d'accès** : `POST https://api.typesafe.ai/v1/systemone`, en-tête
  `Authorization: Bearer <TYPESAFE_API_KEY>`, délai 30 s (`apps/worker/src/mention-judge/jev.ts:11-13, 73-95`).
  La variante OpenRouter est `POST https://openrouter.ai/api/v1/systemone` avec le modèle
  `typesafe/jev-1.13` (`jev.ts:10-12`).
- **Modèle épinglé** : `JEV_MODEL = "jev-1.13.0"` (`jev.ts:4`). Le tampon du juge est
  `jev-1.13.0+request-1` (`analyze.ts:53, 228`). La variante OpenRouter garde le même tampon
  alors qu'elle sert une image datée qui peut changer, et passe en « contexte long » au-delà de
  32 Ko environ (`packages/docs/content/docs/developer-guide/configuration.mdx:104`).
  J0 est passé par TypeSafe en direct (`infra/visibility/FOURNISSEURS.md:60, 162-164`).
- **Choix de la passerelle** : une clé TypeSafe passe avant une clé OpenRouter. La passerelle
  ne change jamais en cours de route (`analyze.ts:276-299`). La valeur `TYPESAFE_API_KEY=stub`
  sert un juge local par mots-clés, qui n'est pas un modèle (`jev.ts:197-221`).
- **Requête** (`jev.ts:15-25`, `analyze.ts:58-92, 244-248`) :
  ```json
  {
    "model": "jev-1.13.0",
    "state": {
      "rules": "Answer about the one entity named in each question … Judge how the answer portrays that entity specifically, not the overall tone and not other entities.",
      "question": "<texte de la question posée>",
      "answer": "<réponse nettoyée, tronquée à 50 000 caractères>"
    },
    "questions": {
      "brand__verdict": { "type": "choice", "instructions": "How does the answer portray <Nom> (website <domaines>)? A link to its website counts as a mention.",
        "criteria": { "positive": "…", "neutral": "…", "negative": "…", "mixed": "…",
                      "other_meaning": "…", "other_company": "…", "no_info": "…" } },
      "brand__evidence": { "type": "choice", "instructions": "Which passage best represents the answer's sentiment toward <Nom> …?",
        "criteria": { "p1": "<passage 1>", "p2": "<passage 2>" } },
      "c0__verdict": { "…": "…" }, "c0__evidence": { "…": "…" }
    }
  }
  ```
- **Ce qui est envoyé** :
  - le **texte complet de la réponse**, nettoyé (`clean.ts:87-142` : images, liens réduits à
    leur domaine, marqueurs de citation retirés) et tronqué à 50 000 caractères (`analyze.ts:50, 236`) ;
  - le **texte de la question** ;
  - le **nom et les domaines** de chaque entreprise suivie **que la réponse nomme**. Les alias
    ne sont pas envoyés : ils servent seulement à la correspondance. Les concurrents que la
    réponse ne nomme pas ne sont pas envoyés (`analyze.ts:240-243`) ;
  - pour chacune, jusqu'à 12 phrases candidates regroupées en passages de 3 au plus
    (`passages.ts:86-127`).

  Une réponse qui ne nomme aucune entreprise suivie n'est **pas envoyée**. Elle est alors
  notée « non mentionnée » sans juge. Si la requête est trop grosse (`400 max_tokens_exceeded`),
  Elmo coupe la liste des entreprises en deux, puis le texte en deux (`analyze.ts:190-216`).
- **Réponse** (`jev.ts:27-35`) :
  ```json
  { "answers": { "brand__verdict": { "choice": "positive", "probabilities": { "positive": 0.81, "neutral": 0.12 } },
                 "brand__evidence": { "choice": "p2", "probabilities": { "p1": 0.3, "p2": 0.7 } } },
    "usage": { "input_tokens": 1234, "output_tokens": 12 } }
  ```
  Elmo vérifie qu'il y a une réponse à chaque question. Il **n'enregistre pas `usage`** et ne
  note aucun coût pour Jev (pas de `usage_events`). C'est cohérent avec
  `src/couts-sync.ts:189-193` (« non compté »).
- **Champs de `run_mentions.assessments`** (`packages/lib/src/mentions.ts:39-70`, `analyze.ts:108-133, 166-188`) :
  - `brand` (absent si la réponse ne nomme pas la marque) et `competitors[<nom>]`, chacun avec :
    - `mentioned` : vrai si la somme des probabilités des 4 sentiments dépasse 0,3 (`MENTION_THRESHOLD`) ;
    - `probability` : cette somme ;
    - si mentionné : `sentiment` (`positive` | `neutral` | `negative` | `mixed`) et
      `sentimentProbabilities` (renormalisées) ;
    - sinon : `reason` (`other_meaning` | `other_company` | `no_info`) ;
    - `passage: {start, end}` : **positions dans le texte stocké** (`run_extractions.text_content`),
      pas le texte lui-même ;
    - `firstMention`, `mentionCount`, `position` : tous déterministes. La position est le rang
      parmi les entreprises suivies, selon leur première mention.
  - `judged: { brand: <empreinte>, competitors: { <nom>: <empreinte> } }` : empreinte de 16
    caractères hexadécimaux, calculée sur le nom, les alias, les domaines et la version du juge,
    pour **toutes** les entreprises suivies au moment du jugement.
- **Débit** : un groupe adaptatif, avec 5 appels par seconde au départ, au plus 64 en vol,
  −20 % après un 429, 6 reprises (`jev.ts:110-191`).
- **Prix** : le code ne donne aucun prix. La documentation d'Elmo dit « très grossièrement
  0,15 à 0,35 $ par 1 000 réponses » ; le coût croît avec la longueur et le nombre
  d'entreprises nommées (`README.md:123`, `packages/docs/content/docs/developer-guide/configuration.mdx:92-102`).
  Ce sont des estimations d'Elmo, pas un tarif : **à confirmer** sur la facture TypeSafe de J0.
  Pour le chiffrage : un appel par réponse qui nomme au moins une entreprise suivie (et les
  découpages éventuels). Au volume de J0, le nombre d'appels est le nombre de réponses de J0
  qui nomment au moins une entreprise suivie. Il se lit dans `run_mentions`
  (`brand_mentioned` ou `competitors_mentioned` non vide), ou dans `assessments`.

### 2.2 Ce qu'il faudrait pour qu'OIA appelle Jev directement (option D1)

1. Une clé `TYPESAFE_API_KEY` dans le coffre de Mickaël, lue par OIA (aujourd'hui, elle est
   seulement dans `elmo/.env`, `infra/visibility/SECRETS.md:19`).
2. Reprendre (MIT) `jev.ts` (transport, erreurs, groupe adaptatif), `analyze.ts`, `clean.ts`,
   `passages.ts` et les fonctions `judgedSubject`, `wholeWordPattern`, `subjectFingerprint` et
   `mentionsStamp` de `packages/lib/src/mentions.ts`. Cela fait environ 800 lignes, avec leurs
   tests (`*.test.ts` du même dossier).
   - **Ne rien changer** à `RULES`, aux critères, aux seuils (0,3 ; 50 000 caractères ;
     12 phrases ; 3 phrases par passage), sinon `request-1` ne veut plus dire la même chose.
   - Garder le tampon `jev-1.13.0+request-1`.
3. La configuration des sujets passe par OIA : marque = nom, alias, domaines (site principal et
   domaines additionnels) ; concurrents = nom, alias, domaines. Ils sont lus dans le
   `SubjectBundle`, jamais en dur (règle 7). L'ordre des concurrents fixe les clés `c0`, `c1`… :
   le trier de façon stable.
4. Le texte envoyé est le texte extrait par OIA, et `state.question` est le texte de la question
   du panel.
5. Enregistrer ce qu'Elmo n'enregistrait pas : `usage` (jetons) de chaque appel, l'identifiant de
   la preuve jugée, le tampon, et le passage **en texte** en plus des positions. Ranger le
   jugement comme « extrait (Jev 1.13) », jamais comme fait.
6. Le garde-fou de coût doit couvrir Jev : plafond d'appels par jour, arrêt si le coût est
   illisible. Aucun appel avant la décision de Mickaël.
7. Comparabilité : ce sera le même juge et la même requête qu'à J0, à condition que le texte
   nettoyé soit le même. Le nettoyage étant repris tel quel, il ne reste comme différence que
   l'extracteur, qui est corrigé pour Mistral.

### 2.3 Option Mistral via `packages/providers` (option D2)

- **Ce qui existe** : `packages/providers/src/mistral.ts:87-202`, `createMistralProvider(...).extract(req)`.
  - Appel `POST https://api.mistral.ai/v1/chat/completions`, `response_format: {type: "json_object"}`,
    `temperature: 0`, `max_tokens` 16 000 par défaut.
  - Reprises sur 429 et 5xx (3 au plus, en respectant `retry-after`), plafond d'appels `maxCalls`,
    compteur `usage()`, crochet `onRawResponse` pour garder la sortie brute, validation par Zod,
    une seconde tentative si le JSON est invalide.
  - Contrat : « le modèle extrait et propose, il ne certifie jamais » (`packages/providers/src/types.ts:4-9`).
  - Modèle par défaut : `LLM_MODEL = "mistral-large-latest"` (`packages/config/src/env.ts:26-27`).
    C'est un alias mobile : pour un juge, il faut épingler une version datée, à choisir.
  - Sélection : `createProviderFromEnv` (`packages/providers/src/index.ts:12-26`).
- **La méthode « LLM, extrait »** est celle de `infra/visibility/src/fact-check.ts:63-90` :
  correspondance déterministe d'abord, LLM ensuite. Un « oui » du modèle devient `extracted`,
  jamais `matches`. L'ADR 0001 la nomme pour ce cas (`docs/visibility/adr/0001-strategie-de-collecte.md:47`).
  Côté visibilité, les adaptateurs de `src/llm-adapters.ts:65-77` sont **encore des emplacements
  désactivés** (ils lèvent une erreur). Le seul prompt existant est celui des faits :
  `"Say if the fact is present in the answer, yes or no, in JSON."` (`fact-check.ts:76`).
  **Aucun prompt de jugement de mention n'existe dans OIA.**
- **Ce qu'il faudrait** :
  - un `LLMPurpose` dédié (par exemple `mentions.judge`) dans `src/llm.ts` et `llm-adapters.ts`,
    branché sur `createMistralProvider`, avec la variable `OIA_VIS_LLM_MENTIONS_JUDGE_MODEL` ;
  - un prompt qui reprend `RULES` et les 7 critères d'Elmo (MIT, `analyze.ts:58-92`), en système ;
  - en entrée : la question, la réponse nettoyée et, pour chaque entreprise trouvée par la
    correspondance, son nom, ses domaines et ses passages numérotés ;
  - un schéma Zod `{ subjects: [{ key, verdict: <7 étiquettes>, passage: "p<n>" | null }] }` ;
  - un appel par réponse, comme Jev.
- **Limites face à Jev** :
  - Mistral renvoie une étiquette, pas des probabilités. Il n'y a donc pas de `probability`, pas
    de `sentimentProbabilities`, et le seuil de 0,3 (« un juge qui doute n'efface pas une
    mention ») ne se reproduit pas. Une règle de remplacement est à écrire : par exemple, ne
    retirer une mention que si le modèle dit `other_meaning`, `other_company` ou `no_info`.
  - Ce n'est pas le juge de J0 : la comparaison du sentiment avec J0 est « fragile ». La présence
    reste comparable si l'on retient la règle ci-dessus, puisque la correspondance est la même.
  - Le coût suit les jetons Mistral, avec la réponse entière en entrée : **à chiffrer** par le chef
    d'équipe au volume de J0, sur la même base d'appels que Jev.

### 2.4 Option sans juge (D3) et part commune

Les trois options partagent la correspondance reprise d'Elmo : `matcher`, `mentionOffsets`, position
et nombre de mentions, passage déclencheur. Ce sont des faits. Le passage exact qui a déclenché la
correspondance est la phrase de `sentences()` qui contient la première position. Sans juge, la
présence est « nommée », et non « nommée et confirmée ». Elle diffère de J0 exactement sur les
réponses où Jev a retiré une mention : ce nombre est connu par réponse en comparant
`assessments.*.mentioned` à la correspondance, et doit figurer dans le rapport comparé.

## 3. Points à risque de l'import Elmo vers OIA

1. **Empreintes et texte.** Le `raw_text` de J0 est le texte extrait par Elmo (`text_content`), et
   non la sortie brute. Pour les réponses sans texte, l'empreinte est celle de la chaîne vide
   (`j0-evidence.ts:86, 117`). `elmo-import-final.ts` le garde ainsi, ce qui est correct. Toute
   ré-extraction (cas de Mistral) doit aller dans `structured` ou dans une preuve dérivée, jamais
   écraser `raw_text`.
2. **Les passages sont des positions, pas du texte.** `assessments.*.passage` pointe dans
   `text_content`. Il faut l'importer **avec le texte du passage résolu au moment de l'import**,
   sinon il devient illisible dès que le texte change. Une position hors bornes doit être signalée.
3. **Les réponses de Mistral sans texte** : vérifiées, sans texte dans `raw_output` (voir
   § 0, point 3). Elles restent « non mesurées » ; l'import les garde, texte vide et
   `non_mesuree: true` (migration 0005).
4. **Citations reconstruites ou déduites.**
   - OpenAI : si le `raw_output` est reconstruit (pas d'`output[]` de type `web_search_call`, pas
     d'`usage`), les citations viennent des `sources` du SDK et le coût est le pire cas. Il faut
     marquer ces runs (`structured.rawOutputRebuilt`).
   - Gemini : les URL sont des redirections, et leur domaine et leur catégorie dans Elmo sont faux.
   - Elmo dédoublonne par URL exacte et **avant** normalisation : deux variantes d'une même page
     comptent pour deux dans `citations` mais pour une dans `cited_pages`.
   - Mistral sans recherche web : aucune source.
   - Les liens écrits dans le texte ne sont pas des citations pour Elmo.
5. **Recherches web.** `["unavailable"]` (OpenRouter) n'est pas une liste vide. La table ne garde
   que ce que le fournisseur a renvoyé. Pour les runs OpenAI à `raw_output` reconstruit, les
   requêtes viennent du SDK et ne peuvent pas être vérifiées dans la sortie brute.
6. **Pas d'historique des concurrents dans Elmo.** Les concurrents sont réécrits à chaque
   enregistrement (`db/schema.ts:415-417`, « bulk save reinserts rows »), il n'existe donc pas de
   « liste gardée avant chaque changement ». On peut reconstituer, par réponse, la liste au moment
   du jugement grâce aux noms de `assessments.judged.competitors`. Ce n'est qu'une déduction, à
   marquer comme telle. Le `stamp` de `run_mentions` change à chaque modification de la configuration.
7. **Jugements rejoués.** Un changement de concurrent ou d'alias rejuge l'historique
   (`derive-runs.ts:146-149`, `REPROCESS_DAYS` = 90). Les jugements exportés aujourd'hui peuvent donc
   différer de ceux qui ont servi à `figures.json` de J0. Il faut comparer le `stamp` exporté à celui
   du moment du rapport J0. S'il n'a pas été gardé, recalculer J0 depuis l'export et comparer à
   `figures.json` (bloc B, vérification 3).
8. **`brand_mentioned` sans juge.** Une réponse qui ne nomme personne a `brand_mentioned = false`
   sans appel à Jev. `assessments` vaut `null` pour les runs jugés par simple correspondance avant
   Jev (tampon `name-matched`, `analysis-versions.ts:21`). Ce ne sont pas des « jugés par Jev ».
9. **Coût Elmo sous-estimé et sans Jev.** `usage_events` est un forfait. Le premier appel d'une
   retentative Anthropic manque, et les appels à Jev n'y figurent pas.
10. **Champs sans équivalent dans `vis.evidence`** : `web_queries`, `provider` (« passerelle ») face à
    `model` (« moteur »), `web_search_enabled`, `stamp` d'extraction et de mentions, `page_type`,
    `static_category`, `classifier_version`, `citation_index`, titre de citation, `rollup_*`,
    `brand_opportunities`, `reports`. Ils doivent tous aller dans `structured` avec leur origine,
    ou rester dans l'export JSON pour mémoire. Pas de migration tant que les vues n'en ont pas besoin.
11. **Le tri de `run_mentions.competitors_mentioned`** suit l'ordre de la configuration et non
    l'ordre dans le texte. La position se lit dans `assessments.*.position`.

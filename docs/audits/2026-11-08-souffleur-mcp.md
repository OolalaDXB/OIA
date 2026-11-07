# Inventaires lecture seule · Souffleur et mcp-studio-mt · 2026-11-08

**Statut : clos le 2026-11-07.** Lecture seule, aucun code exécuté.
Rapport consigné pour mémoire. L'inventaire I1 est clos avec la
conclusion de la section « Clôture I1 · aucun serveur MCP dans les
dépôts d'OolalaDXB » en bas de ce document.

## Souffleur

- Emplacement : `/Users/mickael/souffleur/` (dossier local, non suivi par git).
- Taille : ~144 Ko. Date de dernière modification : 2026-06-27.
- Fichiers :
  - `souffleur.py` (562 lignes) : noyau Python mono-fichier, sans dépendance obligatoire. En-tête : « SOUFFLEUR REPOSITORY ASSURANCE — noyau universel ».
  - `findings_myoolala.json` (2 641 octets) : exemple de findings du projet myoolala, format JSON `[{id, title, dimension, severity, status, evidence_base, root_cause, minimal_fix, closure_criteria, effort}]`.
  - `assurance/myoolala/` : dossier d'exemple, non ouvert ici pour éviter toute lecture inutile.
- **Objet** : transforme un dépôt inconnu en architecture comprise + capacités détectées + adaptateurs sélectionnés + plan de contrôles + dossier d'assurance vivant + plan de remédiation + scorecard quatre axes + delta entre versions.
- **Commandes** (documentées dans le noyau) :
  - `souffleur init <repo_path> --slug NAME [--out DIR]`
  - `souffleur preflight --dossier DIR`
  - `souffleur audit --dossier DIR`
  - `souffleur ingest-findings <file.json> --dossier DIR`
  - `souffleur score --dossier DIR`
  - `souffleur remediate --dossier DIR`
  - `souffleur snapshot --dossier DIR [--commit SHA]`
  - `souffleur delta --dossier DIR`
  - `souffleur report --dossier DIR`
- **Schéma de sévérité** : `SEV_ORDER = ["none", "INFO", "P3", "P2", "P1", "P0"]`.
- **Fonctions internes repérées** (grep `^def `) : `walk_files`, `detect_capabilities`, `canonical_schemas`, `select_adapters`, `compute_scorecard`, `remediation_level`, `cmd_init`, `cmd_preflight`, `cmd_audit`, `cmd_ingest`, `cmd_score`, `cmd_remediate`, `cmd_snapshot`, `cmd_delta` (~15 commandes CLI).
- **Observations** :
  - L'arborescence `/Users/mickael/souffleur` n'est pas un repo git local (le `.git` est absent). Peut-être cloné puis `rm -rf .git`, ou extrait d'une archive.
  - Le fichier `findings_myoolala.json` contient des findings `P0` liés à la sécurité de Supabase (tables `phones` et `socials` lisibles par `anon`). Note : ces findings sont du projet myoolala, pas d'OIA ; à archiver avec le projet d'origine.
- **Pas d'exécution** : la règle 9 du mandat interdit d'exécuter le code de `souffleur.py` sur cette machine.

## mcp-studio-mt

- **Introuvable localement** sur la machine. Aucun dossier `mcp-studio*` sous `~/`.
- Le clone a été refusé par le harness de permission (règle externe : les clones de dépôts externes exigent une autorisation explicite).
- **À faire par Mickaël** :
  1. Soit cloner manuellement `git clone --depth 1 https://github.com/OolalaDXB/mcp-studio-mt.git ~/audit-tmp/mcp-studio-mt`, puis me demander de reprendre l'inventaire.
  2. Soit documenter à la main l'inventaire : outils exposés, authentification, identités, version MCP.
- **À auditer** (quand le clone sera disponible) :
  - Liste des outils MCP exposés (lecture seule / écriture).
  - Mécanisme d'authentification (clé statique, OAuth, scope).
  - Identités en mémoire (quelle marque / quel client).
  - Version du protocole MCP (minor + major).
  - Flux réseau sortants.

## Conclusions

- **Souffleur** : noyau d'assurance repository cohérent avec la trois-couches OIA / Souffleur / Shyrka de la roadmap 3.3 (P4 routage, P5 mémoire, P6 audit MCP). Peut servir de **source** pour les prochains audits de dépôts (D2 lit un dépôt, Souffleur l'audite de façon normalisée) ; le point de couplage proposé : OIA Visibility appelle `souffleur audit --dossier` et ingère le JSON de sortie dans la table de preuves (A5). À discuter en P6.
- **mcp-studio-mt** : audit **non effectué** cette nuit faute d'accès au dépôt.

## Nettoyage

Aucun dossier `~/audit-tmp/` n'a été créé cette nuit (clone refusé). Rien à supprimer.

## Clôture I1 · aucun serveur MCP dans les dépôts d'OolalaDXB

Décision au 2026-11-07. La recherche a été élargie à l'ensemble des
dépôts de l'organisation GitHub `OolalaDXB` : `studiomt-platform`,
`TheStudioMT`, et les trois dépôts `myOolala*` (en plus de
`mcp-studio-mt` cité plus haut, qui n'a pas pu être cloné faute
d'autorisation réseau explicite le 2026-11-06).

- **Aucun serveur MCP n'a été trouvé.** Aucun dépôt ne contient de
  dossier `mcp-server*`, de fichier `mcp.json`, de manifeste MCP, ni
  d'implémentation `tools: [...]` compatible avec le protocole MCP.
  `mcp-studio-mt` apparaît dans la liste des dépôts mais ne contient
  pas, après réouverture, un serveur MCP — c'est un dossier d'ébauche
  sans code d'outil.
- **Conséquence pour la roadmap** : la phase P6 (« Souffleur · audit
  des MCP ») part de zéro. Il n'y a pas de MCP à auditer, ni de MCP à
  réutiliser. La roadmap 3.4 l'a tranché (voir
  `docs/roadmap-oia-shyrka-souffleur.md` v3.4, § P6).
- **Souffleur** reste disponible comme noyau d'audit de dépôts pour P6
  (voir §Souffleur plus haut). Point d'entrée proposé : OIA Visibility
  appelle `souffleur audit --dossier` et ingère le JSON de sortie dans
  la table de preuves (A5), à instruire en P6.
- **Rien à cloner, rien à inventorier plus loin.** L'inventaire I1 est
  clos ; toute nouvelle piste MCP ouverte par Mickaël rouvre un
  inventaire I2.

# Secrets à sauvegarder hors machine

Ce fichier donne les **noms** seulement, jamais les valeurs. Les valeurs vivent
dans `elmo/.env` et `crawlseo/.env`, qui ne sont pas suivis par git. Après
`scripts/init-env.sh`, copiez-les dans un coffre hors du Mac (gestionnaire de mots
de passe, par exemple). Sans eux, une sauvegarde de base ne se restaure pas
correctement.

| Nom | Fichier | Rôle | Si on le perd |
|---|---|---|---|
| `ELMO_ENCRYPTION_KEY` | elmo/.env | Chiffre les clés fournisseurs stockées en base (table `secrets`) | Les clés saisies dans l'UI d'Elmo sont illisibles et doivent être ressaisies |
| `ELMO_POSTGRES_PASSWORD` | elmo/.env | Mot de passe Postgres d'Elmo | Il faut restaurer depuis un dump avec un nouveau mot de passe |
| `BETTER_AUTH_SECRET` | elmo/.env | Sessions Elmo | Toutes les sessions sont déconnectées |
| `DEPLOYMENT_ID` | elmo/.env | Identifiant de l'installation (non secret, mais à conserver) | Sans gravité |
| `NEXTAUTH_SECRET` | crawlseo/.env | Sessions CrawlSEO **et** chiffrement des jetons Google et des clés API stockées. **Ne jamais le modifier.** | Les jetons Google deviennent illisibles : il faut reconnecter Google |
| `CRAWLSEO_POSTGRES_PASSWORD` | crawlseo/.env | Mot de passe Postgres de CrawlSEO | Idem Elmo |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | crawlseo/.env | Client OAuth Google Cloud (Search Console) | On peut les récupérer dans la console Google Cloud |
| `GOOGLE_PAGESPEED_KEY` (facultatif) | crawlseo/.env | Quota PageSpeed | On peut la recréer |
| `TYPESAFE_API_KEY` **ou** `OPENROUTER_API_KEY` | elmo/.env | Jev (juge des mentions) : sans l'une des deux, le worker ne démarre pas | On peut la recréer chez le fournisseur |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | elmo/.env | Fournisseurs en mode API | On peut les recréer chez le fournisseur |

Le plus simple est de sauvegarder les deux fichiers `.env` entiers dans le coffre.
C'est ce qu'attend `restore.sh` sur une machine vierge.

## Mise en garde : ne jamais exporter `ANTHROPIC_API_KEY` dans le shell

`ANTHROPIC_API_KEY` sert à Elmo et aux outils OIA uniquement, via les `.env`
qu'ils lisent explicitement. **Ne jamais l'exporter au niveau du shell**
(`export ANTHROPIC_API_KEY=…` dans `~/.zshrc`, `~/.zprofile`, un `.envrc` lu
par direnv, un `dotenv` chargé par un launcher). La raison est qu'une
variable exportée de cette façon est aussi lue par Claude Code quand il
démarre : chaque session d'aide au développement ferait alors des appels
réels sur cette clé, qui ne sont ni mesurés par `cost-guard.sh`, ni attribués
à Visibility. La clé reste lisible dans le fichier `elmo/.env` que
`init-env.sh` génère et que `restore.sh` restaure ; elle n'a aucune raison
de vivre ailleurs. La même règle s'applique à toute clé de modèle d'IA.

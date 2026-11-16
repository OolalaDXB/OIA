# Faire tourner OIA Visibility ailleurs que sur le Mac (mandat v15, bloc F) · préparation

Rien n'est loué, construit ni déployé : les deux options ci-dessous attendent la décision de
Mickaël. Prix relevés le 16 novembre 2026 sur des sources publiques, hors TVA, **à confirmer
sur la page officielle du fournisseur** avant toute commande.

## Ce qui part sur le serveur

- **L'ordonnanceur et le collecteur**, image `deploy/Dockerfile` (Node 24, sans privilège, aucun
  port exposé). Un passage par jour, à `runTimeUtc`, avec `--go` seulement après décision.
- **Crawlie**, pour l'audit de lecture des sites (bloc A) : son image existante.
- **Les données** : sujets privés, preuves locales, journaux et alertes, dans un volume
  `/data`. Les preuves sont aussi en base OIA (Supabase, Europe), qui reste la source de vérité.

Règles du serveur :
- **Secrets** en variables d'environnement, depuis un fichier hors image et hors dépôt
  (`/etc/oia/visibility.env`, droits 600), avec les mêmes noms que `~/.oia/visibility.env`.
  Jamais en argument de commande, ni dans les journaux.
- **Journaux sans données client** : des comptes, des statuts et des identifiants, jamais un
  texte de réponse, un fait ou un nom de concurrent.
- **Sauvegardes** : instantané quotidien du volume `/data`, chiffré, vers un stockage
  européen ; rétention de 30 jours.

**GitHub Actions est écarté** : le dépôt est public, et ses journaux le seraient aussi.

## Option 1 · Petit serveur virtuel européen (recommandée)

| Élément | Choix | Coût mensuel estimé |
|---|---|---|
| Serveur | Hetzner Cloud CX22 (2 vCPU, 4 Go), Allemagne ou Finlande ; ou CPX22 si le CX22 n'est plus proposé | environ 4,5 € (CX22) ; environ 6,5 € (CPX22) |
| Sauvegardes du serveur | option du fournisseur (environ 20 % du prix du serveur) | environ 1 € |
| Planification | timer systemd (`deploy/oia-visibility.timer`, `Persistent=false` : un passage manqué n'est jamais rattrapé à une autre heure) | 0 € |
| **Total** | | **environ 5,5 à 8 € par mois** |

- **Pour** : tout au même endroit (Crawlie compris), données sur un disque européen, aucune
  limite de durée d'exécution, simple à surveiller.
- **Contre** : un serveur à maintenir (mises à jour de sécurité, pare-feu sans aucun port
  entrant hormis SSH par clé).

## Option 2 · Tâche planifiée gérée (Scaleway Serverless Jobs, Paris)

| Élément | Choix | Coût mensuel estimé |
|---|---|---|
| Exécution | une tâche par jour, environ 10 min sur 1 vCPU : environ 18 000 vCPU-s par mois, sous la franchise mensuelle (200 000 vCPU-s, puis 0,00001 € par vCPU-s) | environ 0 € |
| Données | stockage objet européen pour `/data` (quelques Go) | moins de 1 € |
| Registre d'images | registre du fournisseur | moins de 1 € |
| **Total** | | **environ 1 à 2 € par mois** |

- **Pour** : rien à maintenir, facturé à l'usage.
- **Contre** :
  - exécution sans état : les preuves locales et les marqueurs d'idempotence doivent passer
    par le stockage objet ou par la base, à adapter avant ;
  - Crawlie (navigateur sans tête) à valider dans les limites de mémoire et de durée du
    service ;
  - un fournisseur de plus à surveiller.

**Recommandation : option 1.** L'ordonnanceur et Crawlie y tournent sans adaptation, et
son coût reste négligeable devant celui des moteurs (environ 7,5 $ par étude de 5 jours).

## Canal d'alerte (deux options, aucune installée)

Les alertes sont aujourd'hui écrites dans `<data>/alertes.jsonl`, pour quatre cas : échec,
jour manquant, plafond atteint, rapport prêt.

| Option | Ce que c'est | Coût | Pour, contre |
|---|---|---|---|
| **E-mail** | E-mail transactionnel par un service européen (par exemple Brevo, France), ou le SMTP d'un domaine déjà à Mickaël | gratuit à ce volume (quelques e-mails par jour) | Pour : archivé et lisible partout. Contre : moins immédiat ; une clé de plus |
| **Notification sur téléphone** | ntfy : application libre, serveur hébergé sur l'option 1 ou service public ntfy.sh, avec un sujet secret | 0 € (hébergé soi-même) | Pour : immédiat. Contre : le contenu doit rester sans donnée client (comptes et statuts seulement) |

Les deux se branchent sur l'interface de `src/alerts.ts` sans changer l'ordonnanceur.

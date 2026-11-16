# Le moteur sur le Mac (mandat v16, bloc B)

Le moteur lit la file de demandes de la base, la traite, écrit ses résultats en base, et
signe sa présence à chaque passage. Le cockpit ne lit que la base.

Code : `src/engine/run.ts` (un passage) et `src/engine/db.ts` (accès à la base).

## Ce qui tourne

| Tâche launchd | Quand | Ce qu'elle fait |
|---|---|---|
| `com.oia.visibility.moteur` | toutes les 5 minutes, et à l'ouverture de la session | signe de vie, puis les demandes en file (`SITE_ADD`, `RECON`, `WINDOW_RUN`, `REPORT`, `REMEASURE_PROPOSE`) |
| `com.oia.visibility.moteur.quotidien` | chaque jour à `runTimeUtc` (heure locale calculée à l'installation) | la même chose, puis le passage du jour : collecte, jours consignés, clôture, rapport, page client, recommandations |

- **Après un plantage**, les deux tâches se relancent seules (`KeepAlive`, pas plus d'une
  fois toutes les 5 minutes).
- **Une demande abandonnée** (`RUNNING` depuis plus de 30 minutes) repasse en file. Ce
  retour se fait en base, dans `vis_moteur_prendre`.
- **Un seul passage à la fois** : un verrou est posé dans `~/oia-visibility-data/moteur.lock`.
- **Clés** : elles viennent de `~/.oia/visibility.env` (droits 600, chargé par
  `scripts/load-keys.sh`).
- **Connexion à la base** : elle passe par `~/.oia/bin/oia-psql`. Le moteur ne lit aucun
  mot de passe.
- **Cache local** : `~/oia-visibility-data/moteur/`, hors du dépôt. La base fait foi ; le
  cache se reconstruit à partir d'elle.
- **Journaux** : `~/Library/Logs/oia-visibility/moteur.log` et `moteur-quotidien.log`. Ils
  contiennent l'identifiant, le type et l'état de chaque demande, sans aucune donnée client.
  Le détail est en base (`vis_demandes_v2`).

## Installer, retirer

```sh
./scripts/engine-install.sh preparer /tmp/plist --heure-utc 07:00   # écrit les plist, sans rien charger
./scripts/engine-install.sh install --heure-utc 07:00               # écrit et charge les deux tâches
./scripts/engine-install.sh remove                                  # décharge et retire
```

Au passage à l'heure d'été ou d'hiver, il faut relancer `install` : launchd compte en heure
locale.

## Empêcher le Mac de dormir à l'heure de la collecte

Pour la collecte quotidienne, le Mac doit être réveillé et ne pas se rendormir pendant le
passage. Ces réglages sont à faire une fois, par Mickaël (`sudo`) :

```sh
# Réveil (ou démarrage) chaque jour 5 minutes avant le passage (heure locale, ici 07:55)
sudo pmset repeat wakeorpoweron MTWRFSU 07:55:00
# Sur secteur : ne jamais mettre le système en veille (l'écran peut s'éteindre)
sudo pmset -c sleep 0
sudo pmset -c disksleep 0
# Réveil par le réseau, redémarrage seul après une coupure de courant
sudo pmset -c womp 1
sudo pmset -c autorestart 1
# Vérifier
pmset -g sched
pmset -g custom
```

Si le Mac dormait quand même à l'heure dite, launchd lance le passage quotidien au réveil.
Un jour qui n'a pas été collecté ne se rattrape jamais : il est consigné « manquant ».

## Voir que le moteur tourne

- **Dans le cockpit**, le bandeau « État du moteur » lit `vis_moteur_v2` :
  - `actif` : signe de vie de moins de 15 minutes ;
  - `en_retard` : au-delà de 15 minutes ;
  - `muet` : plus de 2 heures. Le cockpit n'affiche alors jamais un faux vide. L'alerte
    `MOTEUR_MUET` ne peut pas venir du moteur, puisqu'il est arrêté : elle doit être levée
    par la base (point à trancher avec la migration).
- **Sur le Mac** :

  ```sh
  launchctl print gui/$(id -u)/com.oia.visibility.moteur | grep -E "state|last exit"
  tail -n 20 ~/Library/Logs/oia-visibility/moteur.log
  ```

- **Arrêter le moteur** (par exemple pour la recette « moteur muet ») :
  `./scripts/engine-install.sh remove`. Le bandeau passe `en_retard` après 15 minutes, puis
  `muet` après 2 heures. `install` le relance.

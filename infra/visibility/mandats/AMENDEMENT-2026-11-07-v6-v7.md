# Amendement aux mandats v6 et v7 · 7 novembre 2026

Mickaël Thomas

> Emplacement de référence : `infra/visibility/mandats/AMENDEMENT-2026-11-07-v6-v7.md`. Cet amendement prime sur les mandats v6 et v7 en cas de contradiction. Lis-le avant de reprendre l'un ou l'autre.

## 1. J0 est en cours

La fenêtre J0 de Coach Gari tourne depuis le 7 novembre 2026, 15 h 27 UTC.

- Le bloc A du mandat v6 ne pilote plus Elmo. Ce qui en reste utile (`preflight-j0.sh`, suivi quotidien, guide Google) sert aux campagnes suivantes et ne s'exécute qu'en lecture seule sur la fenêtre en cours.
- Aucun script, aucun test, aucune commande ne peut arrêter, redémarrer ou reconfigurer Elmo pendant la fenêtre. Tout test qui touche Docker utilise un faux `docker` et le prouve. Le seul arrêt autorisé est celui de `vis:j0-close`, lancé par Mickaël.
- **Exception (décision de Mickaël, 7 novembre 2026) : `cost-guard.sh` garde le droit d'arrêter le worker** quand le plafond budgétaire de 30 $ est atteint ou que la dépense du mois devient illisible. C'est le garde-fou budgétaire. Son mode `--check`, utilisé par la tâche quotidienne, n'arrête jamais rien.
- Panel, moteurs, modèles, concurrents et réglages de marque restent inchangés jusqu'à la fin de la fenêtre.

## 2. Répartition des sessions

| Session | Propriétaire de | Travail, dans l'ordre |
| --- | --- | --- |
| Mac | `infra/visibility/`, `apps/visibility-console/`, Elmo et ses conteneurs | v7 A, puis B, puis C ; ensuite v7 D et E |
| Web | `apps/web/`, `infra/shyrka/`, `packages/` (nouveaux paquets et dépendances), `docs/shyrka/`, `docs/interface/`, `docs/audits/`, la roadmap | v6 C, puis B, puis E ; ensuite v7 F |

Avant chaque push : `git pull --rebase origin main`, vérification que le HEAD distant n'a pas touché sa zone, tests concernés au vert. Une migration SQL ou un changement important de l'interface en ligne passe par une revue de Mickaël avant le push.

## 3. Shyrka

- **Version 0, décidée par Mickaël le 7 novembre 2026** : présence en points et voix Aurélie. La voix en sortie fait partie de la version 0. Corrige `infra/shyrka/identite.json` et `CADRE.md` en ce sens, sans toucher au reste de l'identité, que Shyrka fera évoluer elle-même.
- **Périmètre de lecture d'OIA** : rapports, état de J0, décisions en attente, budget. Rien d'autre, et aucune écriture.
- **Entretiens (B2) et courrier (B3)** sont deux produits à part entière : chacun a ses propres tests, son README et son critère d'acceptation.

## 4. Courrier et données personnelles (v6 B3)

- Les exclusions s'appliquent **avant** qu'un contenu n'atteigne un modèle, même local : par domaine de l'expéditeur et des destinataires, par mention de Swift dans l'objet, le corps, les messages transférés et les noms de pièces jointes. En cas de doute, le message est exclu.
- Tests adverses : message transféré depuis une adresse Swift, adresse personnelle évoquant Swift, pièce jointe au nom révélateur, en-têtes falsifiés.
- Jetons d'accès Gmail, enregistrements et transcriptions restent hors du dépôt. Le code refuse tout chemin de sortie situé dans le dépôt, y compris par un lien symbolique. Tests à l'appui.

## 5. Clôture de J0 (v7 B)

- `vis:j0-close` est reprenable : chaque étape enregistre son état, une relance reprend à l'étape interrompue, et rien n'est fait deux fois. Aucun arrêt définitif du worker ni nettoyage avant que la sauvegarde soit vérifiée. Un nouvel essai ne duplique jamais une preuve.
- `vis:j0-verify` vérifie aussi l'empreinte de chaque réponse, les versions des modèles servies et la provenance de chaque chiffre, en plus de recalculer les résultats.
- Le rapport J0 présente ses chiffres comme des **indicateurs de visibilité mesurés par les API des assistants**, avec leurs limites : réponses d'API et non des applications grand public, recherche web de l'API, un run par jour, langue unique. Il ne promet jamais une mesure exhaustive.

## 6. Interface web (v7 F)

- Le bloc F est la vraie interface tirée du prototype Lovable. La page de lecture actuelle sous `/oia` est remplacée. La réception se fait écran par écran, contre le prototype.
- L'écran de connexion d'une console statique ne protège pas les fichiers servis. **Aucune donnée réelle de client n'est embarquée dans les fichiers publics** de la console, même derrière la connexion. Les vues Visibility en ligne utilisent des données de démonstration signalées ; les vraies données restent dans `pnpm vis:j0-view`, en local, jusqu'à ce qu'un accès protégé côté serveur existe.
- `/oia` est allumée dans les déploiements Preview seulement. La bascule en production reste une décision de Mickaël.

## 7. Critère commun

Un bloc n'est déclaré terminé que si son critère d'acceptation est vérifié, tests à l'appui, et que le rapport dit, pour chaque livrable : fait, testé, non fait et pourquoi. Un livrable partiellement fonctionnel est déclaré partiel.

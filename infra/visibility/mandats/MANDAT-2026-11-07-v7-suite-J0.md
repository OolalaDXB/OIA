# Mandat v7 · OIA Visibility · suite de J0

7 novembre 2026 · Mickaël Thomas

> Emplacement de référence : `infra/visibility/mandats/MANDAT-2026-11-07-v7-suite-J0.md`. À exécuter une fois J0 lancé (ou documenté comme prêt à lancer), et après le mandat v6.

## 0. Objet

J0 tourne cinq jours. Ce mandat prépare tout ce qui suit, pour que Mickaël n'ait que des commandes simples à lancer :

| Ordre | Bloc | Résultat |
| --- | --- | --- |
| 1 | A · Suivi automatique de la fenêtre | Chaque jour, une fiche et une alerte en cas de problème, sans intervention |
| 2 | B · Clôture et rapport J0 | Une commande qui arrête proprement la fenêtre et produit le rapport |
| 3 | C · Dossier de la porte P1 | Ce qu'il faut pour déclarer P1 franchie, ou non |
| 4 | D · Préparation de P2 | Les corrections de Coach Gari, prêtes à valider, rien de publié |
| 5 | E · Fenêtre de remesure | La deuxième mesure planifiée, identique à J0 |
| 6 | F · Interface web OIA | La nouvelle console en ligne, à côté de l'actuelle, avec J0 en vraies données |
| 7 | Z · Clôture | Roadmap, rapport |

## 1. Règles

1. **Commits directs sur `main`, push autorisé.**
2. **Elmo tourne pour J0 : n'y touche pas.** Ni questions, ni moteurs, ni réglages de marque, ni redémarrage, sauf la clôture prévue au bloc B, déclenchée par Mickaël.
3. **Le gel de Coach Gari reste actif** jusqu'à ce que Mickaël valide le rapport J0 : aucune modification du site, de son dépôt, de sa fiche Google ni de ses annuaires. Le bloc D travaille sur une copie locale, sans push.
4. **Aucune dépense nouvelle.** Les seuls appels payants autorisés sont ceux de la fenêtre J0 déjà lancée. Les passes qui demanderaient un modèle payant (seconde passe du contrôle des faits, revue croisée par deux modèles) restent désactivées et sont signalées comme options, avec leur coût estimé.
5. **Données de client** : les réponses des assistants et les rapports de Coach Gari restent sous `infra/visibility/subjects/coach-gari/` ou hors du dépôt selon leur nature ; aucune réponse brute dans un fichier généraliste, aucune donnée de client dans un test.
6. **Aucune valeur secrète** lue ou affichée ; seule la présence d'une variable peut être vérifiée.
7. **Ne t'arrête jamais pour poser une question** : consigne-la et continue.
8. Zones interdites en écriture : `knowledge/generated/solution-2026-08-14.md` et la branche `lovable/oia-visibility-prototype`. `apps/web/` n'est modifiable que dans le bloc F, selon ses règles : aucune page existante modifiée, aucun changement de comportement pour l'interface actuelle.

## Bloc A · Suivi automatique de la fenêtre

### A1 · Tâche quotidienne

Installe une tâche planifiée macOS (launchd, dans le compte de Mickaël) qui s'exécute chaque jour une heure après le run d'Elmo :

- `window-day.sh` produit `reports/j0/jour-N.md` : runs réussis, échoués et manquants par moteur, version servie, dépense estimée face au plafond ;
- l'exporteur de l'écran de suivi met à jour `visibility.json` ;
- `cost-guard.sh` vérifie la dépense.

Une notification macOS prévient Mickaël seulement en cas de problème : moteur en échec, jour manquant, seuil d'alerte de dépense atteint. Les jours sans problème restent silencieux.

Commandes : `pnpm vis:j0-watch:install` et `pnpm vis:j0-watch:remove`. La tâche se retire d'elle-même à la fin de la fenêtre.

### A2 · Lecture rapide pour Mickaël

Une commande `pnpm vis:j0-status` qui affiche en dix lignes : jour en cours, runs du jour par moteur, jours manquants, dépense estimée et rappel des consoles où lire la dépense réelle.

## Bloc B · Clôture et rapport J0

### B1 · Clôture de la fenêtre

Une commande `pnpm vis:j0-close`, à lancer par Mickaël après le cinquième run :

1. vérifie que la fenêtre est complète, ou liste les jours manquants ;
2. arrête proprement le worker d'Elmo, sans supprimer de données ;
3. sauvegarde la base d'Elmo avec `backup.sh` et vérifie la sauvegarde ;
4. exporte toutes les réponses de la fenêtre et les importe dans la table des preuves locale (F2), avec l'empreinte de chaque réponse ;
5. retire la tâche quotidienne.

### B2 · Rapport J0

Une commande `pnpm vis:j0-report`, qui produit à partir des preuves :

- la présence de Coach Gari par assistant et au total, avec ses intervalles (F1) ;
- les sources citées et les concurrents cités à la place de la marque ;
- le contrôle des faits en première passe déterministe, contre les faits validés (F3) ;
- les jours manquants, consignés tels quels ;
- la dépense estimée, et l'emplacement prévu pour la dépense réelle relevée par Mickaël ;
- les limites de la mesure : API et non application grand public, un seul run par jour, langue unique.

Formats : Markdown et HTML (F5), dans `subjects/coach-gari/reports/j0/`. Le rapport porte le statut « à valider par Mickaël ».

Tests sur une exportation fictive ayant la forme exacte de celle d'Elmo.

### B3 · Reproductibilité

Une commande `pnpm vis:j0-verify` qui recalcule tous les chiffres du rapport à partir des preuves et vérifie qu'ils sont identiques. C'est la condition de la porte P1.

## Bloc C · Dossier de la porte P1

Écris `docs/visibility/porte-p1.md`, un gabarit à remplir après le rapport :

| Critère | Preuve attendue |
| --- | --- |
| Mesure réelle | Rapport J0 généré depuis les réponses réelles |
| Reproductible | `vis:j0-verify` au vert |
| Complète ou expliquée | Jours manquants consignés, avec leur cause |
| Coût maîtrisé | Dépense réelle relevée chez chaque fournisseur, sous le plafond |
| Gel respecté | Contrôle d'intégrité de la surface publique en fin de fenêtre |
| Validé | Rapport relu et validé par Mickaël |

Ajoute à `vis:j0-close` le contrôle d'intégrité du gel en fin de fenêtre (aucun commit sur la surface publique depuis le pin, `noindex` des pages de service inchangé).

## Bloc D · Préparation de P2 : les corrections de Coach Gari

Le gel reste actif : tout se fait sur une copie locale, rien n'est poussé.

### D1 · Mission SEO Command en mode manuel

Lance une mission manuelle de l'orchestrateur sur Coach Gari, avec les agents technique, SEO, contenu, AEO et conversion, à partir de :

- l'audit Crawlie du 8 novembre et les recommandations déjà produites ;
- le modèle de vérification (contrôles A à M) ;
- les faits validés de `facts.yaml`.

Les agents ne lisent que ces fichiers ; aucun appel à un modèle payant. Si un agent a besoin d'un modèle pour rédiger, il produit un plan de rédaction au lieu du texte, et le signale.

### D2 · Correctifs prêts à valider

Sur une copie locale du dépôt de Coach Gari, hors du dépôt OIA, prépare avec les générateurs de correctifs (D3 de la nuit) :

- prix et offres lisibles sans JavaScript ;
- données structurées complètes (`Offer` avec prix et devise, `Person`, `LocalBusiness` si pertinent) ;
- la levée du `noindex` des pages de service, en correctif séparé, puisque c'est une décision de Mickaël et de Gari ;
- titres et descriptions uniques.

Chaque correctif est une demande de fusion simulée (D4), avec le diff, la raison, le contrôle concerné et le risque. Rien n'est poussé vers le dépôt de Coach Gari.

### D3 · Fiche de décision pour Mickaël

`subjects/coach-gari/p2/decisions.md` : chaque correctif avec ce qu'il change pour Google et pour les assistants, son risque et la case « valider ». Les correctifs validés seront publiés seulement après la validation du rapport J0.

## Bloc E · Fenêtre de remesure

Dans `measurement.yaml`, prépare la fenêtre `j1` en statut « planifiée » :

- mêmes questions, mêmes moteurs, mêmes modèles, même heure, cinq jours ;
- début : à fixer par Mickaël, au moins trois semaines après la publication des correctifs ;
- Grok noté comme candidat pour sa propre mesure de départ, hors comparaison avec J0.

Ajoute au runbook la procédure de la remesure, et le test qui refuse une fenêtre `j1` dont les moteurs ou les modèles diffèrent de J0 sans le signaler.

## Bloc F · Interface web OIA

La console en ligne (`apps/web`, déployée sur Vercel) reçoit la nouvelle interface conçue avec Lovable, **à côté de l'actuelle**, pour que Mickaël la juge en conditions réelles avant de basculer.

### F1 · Règles du bloc

- La nouvelle interface vit sous un préfixe séparé, `/oia`, derrière le même écran de connexion (`AuthGate`). Les pages actuelles (`/digest`, `/grants`, `/projects`, etc.) ne changent pas.
- Elle reprend le style et les composants du prototype Lovable (branche lue sans la modifier), portés en Next.js et pnpm, et les jetons de `packages/ui-tokens`.
- Construction statique compatible avec la configuration actuelle de Vercel (`apps/web/out`) ; `vercel.json` inchangé ; `pnpm --filter @oia/web build` et les tests passent avant chaque push.
- Aucune donnée de client publiée : les données de Visibility affichées en ligne sont limitées à ce que le rendu statique peut contenir sans risque. Si les données de J0 ne peuvent pas être servies en ligne de façon sûre (accès réservé, aucune exposition publique), la vue Visibility en ligne garde des données de démonstration signalées, et les vraies données restent dans `pnpm vis:j0-view` en local. Explique le choix dans le rapport.

### F2 · Coquille et navigation

- La colonne de gauche : Accueil, Visibility, Opportunités, CRM, Portefeuille, Data, Training ; la section Personnel (Agenda, Santé, Famille) ; Shyrka et Réglages en bas ; la dépense du mois toujours visible sous la colonne.
- Chaque module garde sa couleur sourde, l'état en point discret.
- Les modules dont les pages existent déjà les réutilisent sans les réécrire : Opportunités avec les onglets Financements, Appels d'offres, Investisseurs, Veille et Montants (à partir des pages actuelles), CRM (contacts), Portefeuille (projets). Les autres mènent à une page « Module en préparation ».
- Cette structure est une proposition : un fichier de configuration unique décrit la navigation, pour que Mickaël la change sans toucher au code.

### F3 · Accueil OIA

« Bonjour Mickaël », le bloc « À décider » (tâches, éléments en attente de tri, décisions de Visibility), la grille des modules, la dépense du mois, l'activité récente. Les données viennent des sources existantes de la console.

### F4 · Visibility

Vue d'ensemble, Sites, vue d'un site, SEO Command, Rapports, d'après les écrans Lovable. Le bouton « Préparer les corrections » ouvre la fiche de décision de P2, sans rien publier.

### F5 · Shyrka

Le panneau latéral et la page plein écran avec la présence en points, en réponses simulées et signalées comme telles ; le mode présence plein écran (micro simulé, pause, quitter). Aucun appel à un modèle.

### F6 · Bascule

Une seule ligne de configuration fait de `/oia` la page d'accueil, avec redirection des anciennes adresses. **Elle reste désactivée** : c'est Mickaël qui décidera de basculer, après avoir utilisé la nouvelle interface.

## Bloc Z · Clôture

1. **Roadmap** : P1 « J0 en cours, rapport attendu », P2 « correctifs préparés, en attente de validation », chantier « Interface web OIA » : nouvelle console en ligne sous `/oia`, bascule en attente de Mickaël.
2. **Tests** : suite complète, typecheck strict.
3. **Rapport** : `infra/visibility/reports/2026-11-08-mandat-v7.md`, avec la liste des commandes pour Mickaël, dans l'ordre où il devra les lancer :
   - pendant la fenêtre : `pnpm vis:j0-status`, `pnpm vis:j0-view` ;
   - après le cinquième run : `pnpm vis:j0-close`, puis `pnpm vis:j0-report`, puis `pnpm vis:j0-verify` ;
   - puis la relecture du rapport et de `p2/decisions.md` ;
   - à tout moment : la nouvelle interface sur l'adresse de la console, préfixe `/oia`.

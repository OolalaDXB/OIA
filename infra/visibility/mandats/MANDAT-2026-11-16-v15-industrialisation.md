# Mandat v15 · Industrialiser OIA Visibility : une étude par site, en quelques gestes

16 novembre 2026 · Mickaël Thomas

> Exécuteur : la session Claude Code du Mac Studio, sur `main`. Ce mandat passe avant le
> reste. La mesure croisée de Coach Gari (v14, bloc E) continue à part et ne bloque rien ici.

## 0. Objectif

**Lancer et suivre des études de visibilité pour beaucoup de sites, sans travail manuel
autre que les validations.** Pour un nouveau site, le parcours visé est :

1. **Ajouter le site** : une commande avec son adresse.
2. **Valider** la proposition (panel, concurrents, faits) sur une seule page de revue.
3. **Tout le reste est automatique** :
   - la mesure de départ (J0), une collecte par jour pendant 5 jours ;
   - la clôture, le rapport, la page client et les recommandations ;
   - la proposition de remesure (J1).
4. **Valider** les recommandations, puis déclarer ce qui a été exécuté.

Les nouveaux sites démarrent **directement sur le collecteur OIA** : ni Elmo ni mesure
croisée. Elmo ne sert plus qu'à la parité de Coach Gari, puis s'arrête (v14).

## 1. Règles

1. `main`, `git pull --rebase origin main` avant chaque push.
2. **Aucun appel payant sans plafond** : budget par client et par mois, plafond global, arrêt
   automatique au dépassement et si le coût est illisible. Toute première étude d'un site
   affiche son coût estimé avant le lancement.
3. **Rien n'est mesuré sans validation humaine** du panel et des concurrents. Une étude ne
   démarre jamais seule.
4. Aucune modification d'un site client. Le collecteur et l'audit ne font que lire.
5. Preuves en ajout seul, empreintes, isolation par client (RLS) : les règles existantes
   s'appliquent à tous les sites.
6. Dépôt public : aucune donnée client dans un commit, ni réponse, ni chiffre, ni fait.
   Les sujets réels vivent en base. Le dépôt ne garde que le code, les gabarits et des
   exemples fictifs.
7. Aucun nom de sujet dans le code (test de généricité).
8. Migrations : procédure de la 0008, chaque écriture en production validée par Mickaël.

## Bloc A · Ajouter un site en une commande

`pnpm vis site add <url> --client <id> --langues fr,en --marches FR,AE` :
- vérifie l'adresse publique (`site-init.ts`) ;
- crée le client (s'il n'existe pas), le site et le sujet en base, sans fichier de sujet
  réel dans le dépôt ;
- **audit de lecture** : Crawlie sur le site (pages, prix lisibles sans JavaScript, données
  structurées, robots) et contrôle public de l'indexation Bing et Google ;
- **faits proposés** : extraits des pages publiques par Mistral (`packages/providers`),
  chacun avec sa page source, au statut « extrait » ;
- **panel proposé** : `panel-generator.ts`, 10 questions par langue dont 2 marquées, à
  partir des offres, des lieux et des marchés trouvés ;
- **concurrents proposés** en deux étapes :
  1. une journée de reconnaissance à bas coût (questions non marquées seulement, un passage
     par moteur, coût affiché avant, lancée seulement sur GO) ;
  2. extraction des acteurs nommés dans ces réponses, classés par type (personne, structure,
     plateforme). C'est la leçon de Coach Gari : les concurrents réels sont ceux que les IA
     citent ;
- **alias et homonymes** : recherche des homonymes du nom de marque dans ces mêmes réponses,
  signalés pour la désambiguïsation.

## Bloc B · Une page de revue, un geste de validation

- `pnpm vis site review <id>` produit une page HTML unique : faits proposés, panel, concurrents,
  homonymes, audit, coût estimé du J0.
- `pnpm vis site validate <id> [--panel] [--concurrents] [--faits <ids>]` valide ce qui est
  coché. Auteur et date sont enregistrés en base.
- Même chose pour les recommandations après un rapport : `pnpm vis reco validate <id> <reco>`,
  puis `pnpm vis reco done <id> <reco> --preuve <url|commit> --date <AAAA-MM-JJ>`.
- Plus tard, ces écrans passent dans le cockpit (Lovable), sur les mêmes fonctions en base.

## Bloc C · Un ordonnanceur pour tous les sites

- Un seul processus quotidien, qui fait avancer **toutes** les fenêtres actives de tous les
  sujets :
  - collecte des questions du jour, puis jour consigné (complet, partiel, manquant) ;
  - clôture automatique à la fin de la fenêtre ;
  - rapport, page client et recommandations générés automatiquement.
- Idempotent : relancé deux fois le même jour, il ne refait rien.
- Plafonds : par client et par mois, et global. Un dépassement arrête le client concerné,
  jamais les autres.
- Une alerte (canal à décider par Mickaël, voir F) en cas d'échec, de jour manquant, de
  plafond atteint, et à chaque rapport prêt.
- Remesure : après la dernière recommandation exécutée, J1 est **proposé** 21 jours plus
  tard. Il démarre seulement après validation de Mickaël.

## Bloc D · Recommandations générées depuis les chiffres

Générateurs déterministes, typés, chacun avec ses preuves (identifiants de réponses, URL) :
- **SOURCE_TARGET** : domaines les plus cités par les IA, où la marque est absente ;
- **ENTITY_INCONSISTENCY** : homonymes ou noms voisins trouvés à la place de la marque ;
- **TECH_FIX** : site absent de l'index de Bing ou de Google, contenu invisible sans
  JavaScript, données structurées manquantes (audit A) ;
- **FIX_FACT** : réponse qui contredit un fait validé ;
- **WATCH** : concurrents cités mais absents de la liste suivie ;
- chacune avec l'action, le responsable (client ou équipe), l'effort et la façon de vérifier
  l'effet à la remesure.

## Bloc E · Le portefeuille

`pnpm vis portefeuille` (puis une vue dans le cockpit) : une ligne par site, avec l'étape (à
valider, J0 en cours, rapport prêt, actions en cours, J1 proposé…), la prochaine action et
qui la fait, le dernier chiffre de visibilité, et le coût du mois par rapport au plafond.

## Bloc F · Tourner ailleurs que sur le Mac

Le Mac s'endort, redémarre et sert à autre chose : il ne peut pas porter beaucoup de sites.
- Préparer le déploiement de l'ordonnanceur, du collecteur et de Crawlie sur un **serveur en
  Europe** : image Docker, secrets en variables d'environnement, journaux sans données client,
  sauvegardes.
- Ne rien louer ni déployer sans Mickaël. Proposer 2 options chiffrées (par exemple un petit
  VPS européen, ou un runner géré). Écarter GitHub Actions sur ce dépôt public : ses journaux
  sont publics.
- Canal d'alerte : proposer 2 options (e-mail, notification sur téléphone), sans en
  installer.

## Bloc G · Coût d'une étude, affiché avant tout lancement

- Estimation par site à partir des coûts réels de J0. Par exemple, une fenêtre de 5 jours,
  10 questions et 4 moteurs coûtait environ 7,5 $ à J0 hors Mistral. Ce montant se multiplie
  par le nombre de langues, de questions et de moteurs.
- Le coût réel de chaque appel est enregistré par le collecteur. Le rapport donne le coût
  réel de la fenêtre.

## Bloc H · Premier essai réel : deux sites

Une fois A à D faits et testés : ajouter **Maisons.co** (FR et EN, panel à refaire par le
parcours A et B), plus un site au choix de Mickaël. Faire le parcours jusqu'à la page de
revue, sans aucun appel payant. La journée de reconnaissance et le J0 attendent le GO de
Mickaël.

## Bloc Z · Rapport

`infra/visibility/reports/2026-11-16-mandat-v15.md` :
- le parcours d'un nouveau site, commande par commande ;
- ce qui est automatique, et ce qui demande une validation ;
- les tests ;
- les options chiffrées du bloc F ;
- le coût par étude ;
- les décisions qui attendent Mickaël.

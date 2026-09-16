# Phases 3-4 + registre projets — compte rendu (16/09/2026)

Mandat exécuté : *« fais tout ce qu'il faut pour finir ce produit »*, avec la
précision **« cela doit au final servir à tous mes projets actuels et futurs et
au studio »**.

C'est cette précision qui a décidé de l'ordre des travaux : le reste à faire
(Phase 3, Phase 4, dette de sécurité, exports, métriques) supposait un produit
mono-projet. On a donc d'abord retourné la fondation, puis livré le reste
par-dessus.

---

## 1. Le registre projets — la fondation

**Avant :** six profils écrits en dur dans un tableau TypeScript
(`packages/workspace/src/projects.ts`), trois d'entre eux volontairement
squelettiques. Ajouter un projet = modifier du code.

**Après :** `registry/projects/*.yaml`, **un fichier par projet**, source de
vérité unique. Ajouter le projet de l'an prochain = un fichier, zéro ligne de
code.

- **16 projets** couverts, contre 6 : BAWABA, BEAU, BEAU Treasury, SILLON,
  RLS Guard, myOolala, Maisons.co, Coach Gari, District 267, PandaMood,
  padel.design, Les Vieilles Pierres, Oolala Social Foundation, Live Great
  Foundation, Ludography — **et TheStudio MT lui-même**, en tant que
  soumissionnaire d'appels d'offres publics IT. Le registre n'est pas un
  registre de logiciels : il porte aussi des ventures, du conseil et des
  associations, qui n'ont pas les mêmes guichets.
- Chaque fiche porte : identité + statut (le vocabulaire des pastilles du site
  public), signaux de matching (secteurs/mots-clés/géo/exclusions), **route
  d'entité** (Oolala France SAS pour l'EU/FR, Oolala Next FZ-LLC pour le GCC),
  configuration de découverte (codes CPV, pays acheteurs, termes de requête,
  types d'opportunités surveillés), et `profileReview`.
- **`profileReview` est le point important.** Un mauvais mot-clé ne lève aucune
  erreur : il oriente silencieusement la file. Chaque fiche déclare donc d'où
  elle sort (`derivedFrom`) et si tu l'as confirmée. **Les 16 sont en `DRAFT`** —
  dérivées du portfolio public de TheStudioMT et du dossier canonique BAWABA. La
  console l'affiche en rouge sur la fiche projet : *hypothèse de travail, non
  confirmée par le propriétaire*.
- Règles d'honnêteté validées en CI (`pnpm --filter @oia/registry validate`) :
  un `CONFIRMED_BY_OWNER` sans date est une erreur ; un `DRAFT` sans source est
  une erreur ; une découverte activée sans requête possible est une erreur.
- La console est un export statique : un navigateur ne lit pas un arbre YAML.
  Un instantané généré (`packages/registry/src/snapshot.json`) est commité, et
  **un test échoue si les deux divergent**.

> **Ce que j'attends de toi ici :** relis `registry/projects/*.yaml`. C'est un
> fichier par projet, lisible en deux minutes. Corrige ce qui est faux et passe
> `profileReview.status` à `CONFIRMED_BY_OWNER` avec la date. Tant qu'une fiche
> est en DRAFT, la console la présente comme une hypothèse — c'est voulu, pas un
> défaut.

## 2. Pipeline multi-projets

`discover:ted` était câblé sur un profil BAWABA écrit en dur. Il est maintenant
piloté par le registre :

```
pnpm --filter @oia/workers discover:ted -- --list          # le plan, sans rien récupérer
pnpm --filter @oia/workers discover:ted                    # les 10 projets à découverte active
pnpm --filter @oia/workers discover:ted -- --project sillon,bawaba
```

Une requête experte **par projet** (ses CPV, ses pays, le plancher de récence).
Un avis trouvé par plusieurs projets est conservé **une fois**, en portant la
liste des projets dont la requête l'a fait remonter — c'est de la provenance de
découverte, jamais un verdict de correspondance, et la console le dit ainsi.
L'échec d'un projet (BLOCKED/ERROR) est consigné sans couler le run.

**Non exécuté ici :** la sandbox de l'agent n'a pas d'egress (403 du proxy sur
`api.ted.europa.eu`, vérifié). Les données de la console restent donc celles du
dernier run réel (TED 2016-2017) — inchangées, pas réinventées.

**Mais le run n'a plus besoin de toi.** `.github/workflows/discovery.yml` exécute
la séquence complète **tous les lundis 06:00 UTC** (et à la demande, avec
surcharge des projets / de la fenêtre / du volume) là où l'egress existe : les
10 requêtes, la reconstruction du jeu de données, puis — et seulement si
typecheck, tests et build web passent sur ce jeu — le commit, qui redéploie la
console. Une shortlist qui vieillit en silence n'est pas « actionnable
maintenant » : c'est toute la raison de cette automatisation. Elle ne touche que
des fichiers de données générés, et se désactive en un clic dans l'onglet
Actions.

## 3. Dédoublonnage + fraîcheur/expiration (M1 P2 §12-13)

- **Dédoublonnage inter-sources** : clé conservatrice (émetteur + radical de
  titre normalisé + date limite). Deux enregistrements ne fusionnent que si les
  trois concordent — une fausse fusion cache une opportunité. Le survivant est
  le plus riche (artefact > faits > confiance), et il **garde la trace** de ce
  qui a fusionné dans lui (`mergedFrom`), jamais une suppression silencieuse.
  Appliqué à la fusion M0 + TED : 0 doublon sur le jeu actuel, 15 lignes avant
  comme après.
- **Fraîcheur recalculée à la lecture**, pas à la génération : une liste
  produite le mois dernier ne doit pas présenter un appel clos comme
  poursuivable. Un appel expiré perd `notExpired` et `verifiedDeadline`, donc
  `pursueEligible`, et passe en REJECT. La fonction **ne fait que retirer** :
  elle ne peut jamais ouvrir une condition ni promouvoir quoi que ce soit.
  Pastilles « closes in 5d » / « closed » dans la file, filtre Freshness.

## 4. Phase 3 — Notes, Tâches, Contacts

Les trois types que l'ossature Phase 1 déclarait et grisait sont construits, sur
la même coquille : `/tasks`, `/notes`, `/contacts`.

Chacun s'accroche à un **projet**, à une **opportunité**, ou à rien. C'est ce
lien qui fait le produit : « envoyer le dossier SILLON, jeudi » vit à côté de la
preuve, remonte sur la fiche projet, et apparaît dans la veille du matin sans
second modèle de données. Ajout de tâche directement depuis le détail d'une
opportunité (elle hérite du projet tagué).

## 5. Phase 4 — la veille du matin, pour de vrai

`DigestService` n'est plus un stub. `/digest` (« Today ») répond à une seule
question — *qu'est-ce qui a vraiment besoin de toi aujourd'hui ?* — à partir de
faits déjà présents :

1. tâches en retard ; 2. appels clos depuis ton dernier passage ; 3. appels qui
ferment dans l'horizon (7/14/30 j) ; 4. tâches qui arrivent ; 5. **approuvé mais
bloqué par le gate** ; 6. non trié.

Le point 5 est le plus utile : c'est exactement l'endroit où du travail est dû
(*« il manque : source non vérifiée par un humain ; éligibilité non évaluée »*).
Déterministe, zéro LLM, zéro modèle de classement. **Rien n'est promu.** Quand
il n'y a rien à dire, il le dit. Export Markdown.

## 6. Métriques, exports, sauvegarde

- `/metrics` : des comptages, jamais des scores. Le panneau qui compte est
  **« pourquoi le gate bloque »** — c'est le vrai backlog de preuve. État actuel :
  0/15 franchissable, bloqué par « source non vérifiée par un humain » (15),
  « éligibilité inconnue » (10), « pas d'action suivante exacte » (10).
- **Export de shortlist CSV et Markdown** : le verdict du gate et ses raisons
  voyagent avec chaque ligne. Un export qui perdrait « bloqué parce que la source
  n'est pas vérifiée » serait exactement le document que ce produit existe pour
  empêcher.
- **Sauvegarde / restauration** de toute la couche humaine en un fichier JSON.
  À la restauration, le journal d'audit est **fusionné**, jamais remplacé :
  restaurer un vieux fichier n'efface pas les décisions prises depuis.

## 7. Dette de sécurité (mandat §9) — close

Vérifié sur la configuration live : le projet Vercel `oia` a **Vercel
Authentication activée** (`all_except_custom_domains`), aucun domaine
personnalisé, donc **toutes** les URL de déploiement sont protégées. Rien à
faire.

**Une réserve à retenir** : ce réglage ne couvre pas un domaine personnalisé. Le
jour où tu branches `oia.quelquechose.com`, il est public tant que la protection
n'est pas reconfigurée. C'est écrit dans `docs/access-and-data.md`.

Côté données : la couche humaine (revues, tags, notes, tâches, contacts) reste
dans **ton navigateur uniquement**. Ce n'est pas caché — un bandeau le dit sur
chaque écran, avec les boutons sauvegarde/restauration. Et surtout, la couture
est en place : `WorkspaceStore` est une interface à trois méthodes ; un driver
Supabase l'implémente le jour où il y a un login, **sans toucher un seul
composant**.

## 8. Une correction de qualité trouvée à l'écran

Avec 16 profils au lieu de 6, chaque opportunité recevait 12+ suggestions à
4/100, toutes obtenues sur le seul mot « EU » — tous les projets sont européens.
Du bruit déguisé en analyse. Le moteur exige désormais un **signal substantiel**
(mot-clé ou secteur) ; la géographie ne fait que renforcer. Un enregistrement
sans signal n'affiche plus rien : *« aucun signal de profil ne correspond
(silence honnête) »*. Vérifié à l'écran avant/après.

---

## Vérifications faites

- **191 tests verts** (125 avant), typecheck propre sur les 13 paquets, build
  statique OK (11 routes).
- Console réellement pilotée dans un navigateur (Chromium/Playwright) : création
  d'une tâche en retard → elle apparaît dans « Today » ; tag projet + APPROVE sur
  un item bloqué → **le gate refuse et le dit**, l'événement est au journal, la
  métrique « By human review » bouge, la sauvegarde contient tâche + audit + tag.
  Zéro erreur console.
- CI élargie : `registry validate`, `knowledge validate` et le build web
  tournent désormais avec typecheck et test.

## Reste — honnêtement

1. **Relire les 16 fiches de `registry/projects/`** et confirmer (toi seul).
2. **Le premier run planifié** remplacera les avis 2016-2017 par des avis
   courants (lundi 06:00 UTC après fusion sur `main`) — ou déclenche-le tout de
   suite : Actions → *Discovery refresh* → *Run workflow*. À surveiller une fois,
   pour confirmer que les requêtes par projet ramènent ce qu'on attend.
3. **Persistance serveur** : possible le jour où il y a une authentification.
   Le schéma SQL existe, l'interface de store existe, aucun projet Supabase n'est
   lié à OIA.
4. **Connecteurs hors UE** : District 267 (Botswana), Live Great (Kenya) et le
   sourcing investisseurs n'ont aucune source couverte. C'est déclaré
   `discovery.enabled: false` avec la raison, plutôt que simulé.
5. Knowledge Phase B/C (dossiers produits restants, agents) : inchangé.

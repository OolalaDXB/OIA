# Écarts Money Lookup : console actuelle, contrat v9 et prototype Lovable

8 novembre 2026 · inventaire en lecture seule, avant branchement.

Sources lues :
- console actuelle : `main`, commit `c6a7176562a00ad7a617f02506f833795b07746d`, `apps/web/src` (Console, MoneyView, DigestView, WorkspaceView, ProjectsView, AddByUrl, NewProject, workspaceStore, remoteWorkspace, watchData, vocabulary) et `packages/workspace` ;
- contrat : `docs/interface/contrat-donnees-money-lookup.md`, `contrat-donnees-v1.md`, migrations `0003` à `0005` ; colonnes des vues `ml_*` et signatures `oia_*` relues en lecture seule dans la base ;
- Lovable : branche `lovable/oia-visibility-prototype`, commit `dab7203`, `prototypes/oia-prototype/src/data/money.ts`, `src/lib/donnees/money.ts`, `src/components/oia/money.tsx` et routes Money Lookup.

Aucun code, aucune table et aucune donnée n'ont été modifiés. Ce document ne contient aucune donnée réelle d'opportunité ni de contact.

Légende : **Présent** = existe et peut garder son rendu ; **À adapter** = existe dans Lovable mais doit changer ; **Absent** = à créer ; **v2** = pas de lecture dans le contrat v1.

## 1. Cartographie des écrans

| Console actuelle | Rôle | Lovable `dab7203` |
| --- | --- | --- |
| `/digest`, `/alerts` | Aujourd'hui et alertes | `/money-lookup` « Aujourd'hui » |
| `/`, `/grants`, `/tenders`, `/investors` | File d'opportunités, filtrée ou non par type | onglets Toutes, Financements, Appels d'offres, Investisseurs |
| `/money`, `/metrics` | Argent par projet, par type, blocages | onglet Montants |
| `/workspace`, `/tasks`, `/notes`, `/contacts` | Tâches, notes, contacts | CRM générique fictif ; rien d'autre |
| `/projects` | Registre, suggestions, recherches, brouillons, liens | Portefeuille générique fictif |
| `/funding`, `/tenders`, `/signals` côté Lovable | anciennes adresses | redirigent vers Money Lookup |
| `/ventures` côté Lovable | ancienne adresse | redirige vers Portefeuille |

## 2. Inventaire exhaustif, source v9 et comparaison

### 2.1 Coquille commune et stockage

| Élément console | Détail | Source v9 | Lovable | Statut et adaptation |
| --- | --- | --- | --- | --- |
| Navigation | Aujourd'hui, Opportunités, Projets, Argent, Espace de travail | aucune donnée | navigation OIA | Présent, garder la navigation Lovable |
| Badge Aujourd'hui | nombre d'alertes non acquittées | `ml_signals_v1` (`type='alerte'`, `acquitte_le is null`) ou `ml_aujourdhui_v1` (`ALERTE`) | absent | Absent |
| Bascule FR / EN | langue `oia.lang.v1`, hors sauvegarde | navigateur | français seul | Hors contrat, décision produit |
| Note de stockage | dit si le travail est local ou en base | session et RPC | mention fictive | À adapter : dire « Données OIA » ou « Démonstration » |
| Exporter le journal | `oia-audit-<date>.json` : id, recordId, action, comment, at, actor, gatePursueEligibleAtDecision | `ml_fiche_v1.decisions` par fiche seulement, gate non relu | absent | v2 : lecture globale complète des décisions |
| Sauvegarder | fichier `oia.workspace.backup`, version 1, six clés, `exportedAt`, `driver`, `data` | lu par `oia_importer_sauvegarde` | absent | Absent : il reste un bouton de l'ancienne console |
| Limite de la sauvegarde | exporte le store local même en mode distant, pas un dump de la base | A4 reprend uniquement le fichier navigateur | absent | À documenter : ne pas appeler cela sauvegarde complète de la base |
| Restaurer | clés inconnues ignorées, valeurs non nulles remplacées, audit fusionné par identifiant et retrié | remplacé par `oia_importer_sauvegarde`, mais JSON null non traité | absent | Absent, écran A4 ; blocage de compatibilité à résoudre avant import |
| Migrer vers la base | écritures directes de l'ancienne console | interdit ; remplacé par A4 | absent | Ne pas reprendre |
| Déconnexion | si connecté | session Supabase | absent | Absent |
| Indication registre / instantané | « registre permanent » ou « instantané embarqué » | vues `ml_*` | « Exemple fictif » | À adapter : états chargement, vide, erreur, accès non accordé |
| Compteurs de la file | fiches affichées / total, discrepancies, nombre par recommandation, note du jeu | recommandation et titre dans les listes ; note et compte total non contractuels | absent | À adapter ; v2 pour les métadonnées de run |

### 2.2 Aujourd'hui (`DigestView`)

| Élément | Console | Source v9 | Lovable | Statut |
| --- | --- | --- | --- | --- |
| Titre et date | Aujourd'hui, date du jour | calcul local | Aujourd'hui | Présent |
| Compteurs | alertes, choses à faire, source | `ml_aujourdhui_v1` | non | Absent |
| Horizon | 7, 14, 30 jours | horizons figés : tâches 7 j, clôtures 14 j | 14 jours affichés | À adapter : retirer le choix ou le demander en v2 |
| Export Markdown | `oia-digest-<date>.md` | `ml_aujourdhui_v1` | non | Absent, export local des lignes reçues |
| Alertes | 12 ouvertes au plus, tri sévérité puis date ; titre, projet, action suivante, détail, acquitter ; type, sévérité et dates chargés mais non rendus | `ml_signals_v1` : `titre`, `projet`, `action_suivante`, `detail`, `id`, `type`, `nature_signal`, `gravite`, `le`, `acquitte_le` ; `oia_acquitter_alerte(p_alerte)` | alertes fictives sans action | À adapter ; pas de pagination dans l'ancienne console |
| En retard | tâche dépassée | `TACHE_EN_RETARD` | « En retard » basé sur `statut` inventé | À adapter |
| À faire | tâche due sous 7 j | `TACHE_A_FAIRE` | absent | Absent |
| Bientôt clos | clôture sous 14 j | `BIENTOT_CLOS` | « Ferme bientôt » basé sur `joursRestants` | À adapter |
| Clos depuis la dernière visite | `JUST_EXPIRED` | aucune raison v1 | absent | v2 ou abandon explicite |
| Approuvé mais bloqué | APPROVE et gate bloqué | `APPROUVE_MAIS_BLOQUE` | absent | Absent |
| En attente de tri | non trié, non expiré, 5 au plus | `EN_ATTENTE_DE_TRI` : PENDING et `disparu_le IS NULL`, sans limite à 5 et sans exclusion des échéances dépassées | « Attend un tri » basé sur `statut` | À adapter ; les opportunités expirées peuvent apparaître |
| Ligne cliquable | ouvre la fiche | `record_id`, `reference` | ouvre la fiche fictive | À adapter : tâche sans `record_id` ne peut pas ouvrir de fiche |
| État vide | phrase explicative | contrat : « Rien d'urgent aujourd'hui » | listes vides | À adapter |

Le Markdown du digest contient la date, chaque groupe et son compte, puis headline, projet, nextAction et detail. Il annonce explicitement son caractère déterministe.

Ordre contractuel : `TACHE_EN_RETARD`, `TACHE_A_FAIRE`, `ALERTE`, `BIENTOT_CLOS`, `APPROUVE_MAIS_BLOQUE`, `EN_ATTENTE_DE_TRI`.

### 2.3 Listes Funding, Tenders, Ventures (`Console`)

| Élément | Console | Source v9 | Lovable | Statut et adaptation |
| --- | --- | --- | --- | --- |
| Liste globale | toutes natures | `ml_toutes_v1` | Toutes | À adapter |
| Funding | `/grants` = GRANT seul | `ml_financements_v1` : GRANT, PRIZE, TAX_INCENTIVE, DEBT_GUARANTEE | Financements | À adapter, périmètre élargi |
| Tenders | `/tenders` = TENDER seul | `ml_appels_offres_v1` : TENDER, PRE_SOLICITATION, MARKETPLACE_PROJECT, CONSORTIUM_CALL | Appels d'offres | À adapter, périmètre élargi |
| Ventures | `/investors` = EQUITY seul | `ml_investisseurs_v1` : EQUITY, ACQUISITION | Investisseurs | À adapter ; ACQUISITION toujours « sortant » |
| Signals | dans Aujourd'hui | `ml_signals_v1` | onglet Signals | À adapter |
| Badge recommandation | PURSUE, PARTNER, INVESTIGATE, MONITOR, REJECT | `recommandation` | Prioritaire, À étudier, Écarter | À adapter |
| Badge type | nature, couleur | `nature`, regroupement `categorie` | Financement / Appel / Investisseur | À adapter |
| Titre, émetteur | oui | `titre`, `emetteur` | `titre`, `organisme` | À adapter le nom |
| Date de publication | fait `publication-date` | `ml_fiche_v1.source` seulement | `publication` | À adapter : pas de colonne de liste ; v2 si nécessaire |
| Fraîcheur ouverte / bientôt / close / sans date | calculée | `echeance`, `vu_la_premiere_fois`, `vu_la_derniere_fois`, `disparu_le` | catégories inventées | À adapter ; supprimer les catégories |
| Verdict analyste | ELIGIBLE, LIKELY, NEEDS_INFO, NOT_ELIGIBLE | `source.assessment` dans la fiche | Éligibilité inventée | v2 pour la liste ; fiche seulement |
| « pas un appel » | type d'avis | `source.facts` | absent | Fiche seulement ou v2 |
| Projet étiqueté | puce | `projet_etiquete` | état local | À adapter |
| Statut de vérification | sept valeurs | `statut_verification` ; « vérifié » = `verifie_par_humain` | Vérifié / Non vérifié | À adapter |
| Clôture | date et relatif | `echeance` | `cloture` | À adapter |
| Ton avis | état de décision | `decision_humaine`, `decide_le` | absent | Absent |
| Montant | non affiché en liste | `montant`, `devise`, `confiance_montant` | montant et type inventé | À adapter |
| Gate | détail en fiche | `gate_ok`, `raisons_gate` | absent | Absent |
| Filtres URL | project, kind, reco, verif, review, fresh, blocked, verdict, id ; route et tri non initialisés depuis URL | colonnes ci-dessus ; `blocked` via `raisons_gate` | absent | Absent ou adapter |
| Filtre type | 11 types prévus, REGULATORY inclus, mais menu actuellement vide à cause de `Object.keys` sur un Proxy sans clés | `nature` ; REGULATORY via signaux | trois types inventés | À adapter : 10 natures + Signals, sans reproduire le défaut |
| Filtre éligibilité analyste | quatre verdicts et « pas encore analysé » | pas de colonne | inventé | v2 ou retirer |
| Filtre recommandation | valeurs présentes | `recommandation` | inventé | À adapter |
| Filtre vérification | valeurs présentes | `statut_verification` | inventé | À adapter |
| Filtre entité / route | `strategicRoute` | pas de colonne ; `source` seulement | entité inventée | À supprimer de la liste ; v2 si besoin |
| Filtre ton avis | PENDING, APPROVE, REJECT, NEEDS_VERIFICATION | `decision_humaine` | absent | Absent |
| Filtre projet | registre, sans projet | `projet_etiquete`, `projets_decouverte` | quatre projets fictifs | À adapter ; registre en v2 |
| Filtre fraîcheur | quatre états | dérivable de `echeance` et `disparu_le` | inventé | À adapter |
| Filtre bloqué par | raison exacte | `raisons_gate` | absent | Absent |
| Tri | publication récente ou ancienne, échéance, confiance info, titre | échéance, titre ; publication et confiance absentes | clôture, score, titre | À adapter ; supprimer score si absent de la source |
| Exports | CSV et Markdown de la liste filtrée | colonnes v1 | CSV et Markdown fictifs | À adapter aux colonnes du contrat |
| Vues enregistrées | appliquer, enregistrer ; nom, kind OPPORTUNITY, kind/reco/verif/route/review/project/fresh, tri, date, id ; blocked, verdict, selectedId et fixedKind non enregistrés | écriture `oia_enregistrer_vue` ; lecture absente | `oia.money.vues.v1` en `localStorage` démo | v2 pour lecture ; garder démonstration signalée |

Fichiers actuels : `oia-shortlist-YYYY-MM-DD.csv` et `oia-shortlist-YYYY-MM-DD.md`.

Colonnes CSV actuelles, dans cet ordre : `id`, `kind`, `title`, `issuer`, `project`, `recommendation`, `human_review`, `gate_pursue_eligible`, `gate_failed_reasons`, `verification`, `deadline`, `freshness`, `info_confidence`, `official_url`, `discovered_for`. Le Markdown reprend recommandation, avis humain, émetteur, projet, nature, vérification, échéance, fraîcheur, confiance, URL officielle, gate et questions non résolues. Les deux formats ne contiennent que les résultats filtrés.

Le bouton « tout afficher » ne réinitialise que blocage, projet et sélection. Les routes Tenders et Investors ne normalisent pas les anciennes natures `TENDER_RFP` et `VC_INVESTOR`. Ces comportements sont des défauts à ne pas reproduire.

### 2.4 Fiche d'une opportunité

| Élément console | Source v9 | Lovable | Statut et adaptation |
| --- | --- | --- | --- |
| Recommandation, nature, titre, émetteur | `recommandation`, `nature`, `titre`, `emetteur` | proches mais inventés | À adapter |
| Publication et fraîcheur | `source` ; colonnes `echeance`, `vu_*`, `disparu_le` | publication, fraîcheur inventées | À adapter |
| Avertissement type d'avis | `source.facts` | absent | Absent |
| Raisons de fraîcheur | `source.freshness` si présent ; sinon colonnes | absent | Absent |
| Écarts semence / observé | `source.discrepancies` | absent | Absent |
| Découvert pour | `projets_decouverte` | absent | Absent |
| Projet étiqueté | `projet_etiquete` ; `oia_etiqueter(p_espace,p_record_id,p_projet)` ; ancienne console : ajoute aussi un COMMENT d'audit, nouvelle fonction : journal technique seulement | sélection locale et journal local | À adapter ; ne pas promettre un COMMENT de revue |
| Suggestions de projet et bouton « tag it » | calculées par la console, pas dans le contrat | scores inventés | À adapter : afficher seulement si la donnée existe dans `source` ; sinon rien |
| Sources : officielle, découverte, portail, rattaché par | `url_officielle`, `source.discoveryUrl`, `source.applicationUrl`, `source.linkedBy` | liste fictive | À adapter |
| Artéfact : identifiant, format, rendu, empreinte, taille, traitement | `source.artifact` | absent | Absent |
| Récupération en direct | `source.liveFetch` | absent | Absent |
| Vérification et preuves | `statut_verification`, `verifie_par_humain`, `source.verificationEvidence` | Vérifié / Non vérifié | À adapter |
| Éligibilité deux étapes et route | `source.application`, `source.award`, `source.strategicRoute` | éligibilité inventée | À adapter |
| Scores : confiance info, pertinence, potentiel | `source.scores` | score projet inventé | À adapter |
| Évaluation analyste : verdict, raison, entité, action, manque, citations, modèle | `source.assessment` | absent | Absent |
| Gate : 9 conditions et raisons | `gate_ok`, `raisons_gate`, `source.gate` | absent | Absent |
| Faits par provenance | `source.facts` | faits fictifs | À adapter : classe, localisateur, méthode, confiance, extrait |
| Échéances | `source.deadlines` | une date | À adapter |
| Questions en suspens | `source.unresolvedQuestions` | absent | Absent |
| Avertissements | `source.warnings` | absent | Absent |
| Notes de la fiche et ajout | `ml_fiche_v1.notes` ; `oia_noter` | notes fictives | À adapter |
| Modification d'une note | `oia_modifier_note(p_note,p_texte)` | absent | v2 : la fiche ne fournit pas l'identifiant de note |
| Tâches et ajout avec échéance | `ml_fiche_v1.taches` : titre, échéance, statut ; `completed_at` non relu ; `oia_creer_tache` | tâches fictives | À adapter ; v2 pour date de complétion |
| Basculer tâche | `oia_basculer_tache(p_tache)` | absent | v2 : la fiche ne fournit pas l'identifiant de tâche |
| Décision APPROVE, REJECT, NEEDS_VERIFICATION et commentaire | `oia_decider` | absent | Absent |
| Commenter | `oia_decider(... 'COMMENT' ...)` | absent | Absent |
| Avertissement APPROVE bloqué | `gate_ok`, `raisons_gate` | absent | Absent |
| Historique non modifiable | `ml_fiche_v1.decisions` : action, commentaire, le, par ; état du gate stocké dans `reviews` mais non relu ; `auteur_origine` non relu | journal local d'étiquettes | À adapter ; v2 pour gate et auteur d'origine |

### 2.5 Argent et Montants (`MoneyView`)

| Élément console | Source v9 | Lovable | Statut et adaptation |
| --- | --- | --- | --- |
| Couverture globale | `ml_montants_v1.opportunites`, `avec_montant`, à rapprocher entre groupes connus et inconnus au même périmètre | absent | À adapter ; une ligne isolée donne seulement 100 % ou 0 %, pas la couverture globale |
| « Pourrait rentrer » tous projets | interdit en total global | absent | Ne pas reprendre |
| « Prêt à être poursuivi » | pas d'agrégat gate | absent | v2 si nécessaire, jamais total global |
| « Sortirait » | `sens='sortant'` | absent | Absent, ligne séparée |
| Par projet | pas d'agrégat projet | groupes par projet inventés | v2 ou retirer |
| Fiches, avec montant, couverture, montants approximatifs | `opportunites`, `avec_montant`, `montants_peu_surs` | partiel | À adapter |
| Prêt, bientôt clos par projet | pas d'agrégat | absent | v2 |
| Par type | `categorie` ; nature via listes | types de montant inventés | À adapter |
| Lien vers la liste | filtres URL | absent | Absent |
| Ce qui bloque l'argent | `raisons_gate` sur les listes | absent | Absent ; v2 pour un agrégat |
| Montants inconnus | lignes `devise=null`, `somme_connue=null` | « inconnu » | À adapter |
| Filtres catégorie, devise, vérification | `categorie`, `devise`, `verifie_par_humain` | type, devise, vérification inventés | À adapter |
| Règle sans addition | par `categorie`, `sens`, `devise`, vérification | par type et devise | À adapter : ajouter `sens` et vérification |

La couverture se calcule avec des compteurs agrégés sur le périmètre choisi, jamais en additionnant les montants entre catégories, sens ou devises.

L'ancienne console n'a ni recherche textuelle, ni filtre interactif de projet, devise, montant ou type, ni tri cliquable dans MoneyView. Elle masque ou affiche le backlog et suit les liens projet, type et blocage. Les filtres visibles dans Lovable sont donc des ajouts à conserver seulement avec les colonnes du contrat.

### 2.6 CRM, notes et tâches (`WorkspaceView`)

| Élément | Source v9 | Lovable | Statut |
| --- | --- | --- | --- |
| Onglets Tâches, Notes, Contacts | aucune lecture globale | CRM générique | v2 |
| Compteurs : tâches ouvertes, notes, contacts ; retard sur l'onglet Tâches | aucune lecture globale | absent | v2 |
| Tris : tâches ouvertes puis terminées ; notes par date décroissante ; contacts par nom | aucune lecture globale | absent | v2 |
| Ajouter tâche : titre, échéance, projet, opportunité | `oia_creer_tache` | absent | Écriture possible, liste v2 |
| Filtre tâches ouvertes, faites, toutes | aucune lecture globale | absent | v2 |
| Tâche : terminer / rouvrir | `oia_basculer_tache` | absent | v2, identifiant absent |
| Tâche : supprimer | aucune fonction | absent | v2 ou retrait décidé |
| Ajouter note : texte, projet, opportunité | `oia_noter` | absent | Écriture possible, liste v2 |
| Filtre notes : toutes, autonomes, projet | aucune lecture globale | absent | v2 |
| Note : supprimer | aucune fonction | absent | v2 ou retrait décidé |
| Ajouter contact : nom, organisation, rôle, e-mail, téléphone, projet, opportunité, note | `oia_creer_contact` | absent | Écriture possible, liste v2 |
| Filtre contacts par projet | aucune lecture | absent | v2 |
| Contacts : mailto, tel, supprimer | aucune lecture ni suppression | absent | v2 |

### 2.7 Projets, demandes, brouillons et liens (`ProjectsView`)

| Élément | Source v9 | Lovable | Statut |
| --- | --- | --- | --- |
| Liste du registre : nom, statut, nature, nombre étiqueté, recherche active | aucune vue ; registre hors base | Portefeuille fictif | v2 |
| Fiche projet : one-liner, URL publique, confirmation propriétaire et date, statut du profil, dérivé de, note, chemin YAML | aucune vue ; registre et `link_checks` hors contrat | absent | v2 ; pas d'édition directe du profil existant |
| Signaux : secteurs, géographies, financements, mots-clés, exclusions, entités légales avec nom, juridiction et rôle | aucune vue | absent | v2 |
| Recherche : types, CPV, pays, termes | aucune vue | absent | v2 |
| Argent du projet | aucun agrégat | absent | v2 |
| Sources surveillées : nom, URL, statut, natures, géographies, notes et contrôle du lien | aucune vue | absent | v2 |
| Opportunités étiquetées : titre, nature, émetteur, vérification, recommandation, lien | filtrable par `projet_etiquete` | absent | À adapter possible |
| Tâches et notes du projet | aucune lecture globale | absent | v2 |
| Suggestions non étiquetées | calcul console, hors contrat | absent | v2 |
| Lancer une recherche | `oia_demander(p_espace,'DISCOVERY',p_charge)`, charge `{ projects: [slug] }`, mise en file | absent | Écriture possible ; suivi v2 |
| Ajouter par lien | URL, nature avec GRANT par défaut, projet facultatif ; `oia_demander(...,'INGEST_URL',...)`, charge url, projectSlug, kindHint | absent | Écriture possible ; suivi v2 |
| Contrôle de liens : works, moved, broken, unchecked, not conclusive, note et date ; `http_code` et `final_url` chargés mais non rendus ; ouverture externe seulement, aucun bouton de relance | lecture `link_checks` hors contrat ; demande `LINK_CHECK` possible | absent | v2 pour lecture |
| Nouveau projet : nom, phrase, URL, nature, statut, mots-clés, secteurs, géographies, CPV, termes, pays, types surveillés, slug calculé ; upsert du brouillon puis demande DISCOVERY | aucune fonction `project_drafts` | absent | v2 |

La liste Projets n'a ni recherche, ni filtre, ni tri interactif. Les suggestions sont triées par confiance avec dix éléments au plus. Le nouveau projet calcule son slug et reste un brouillon jusqu'à sa matérialisation par le worker.

### 2.8 Recherche assistée et suivi propres à Lovable

| Élément Lovable `dab7203` | État au branchement |
| --- | --- |
| Besoin en texte libre, analyse Claude Sonnet 5 via Lovable AI Gateway, catalogue fictif | À remplacer par `supabase.functions.invoke('money-match', { body: { texte, projet } })` ; rang, explication, informations manquantes, lien id, erreurs 401/403/429 et alerte budget ; retirer la mention « modèle via Lovable » |
| Événements Money dans `oia.money.evenements.v1`, 200 au plus, aucun transport | Présent, hors sauvegarde A4 et sans donnée personnelle |
| Vues locales `oia.money.vues.v1` | Démonstration seulement ; non lues par `oia_importer_sauvegarde` |
| Étiquettes et journal d'étiquettes en mémoire React | Non persistants, à remplacer ; ce ne sont pas les six clés de l'ancienne console |

## 3. Écarts structurels du modèle `src/data/money.ts`

| Champ Lovable | Remplacement contrat |
| --- | --- |
| `type` | `nature`, groupé par `categorie`, `sens` séparé |
| `organisme` | `emetteur` |
| `publication` | `ml_fiche_v1.source`, pas en liste |
| `cloture`, `joursRestants` | `echeance`, calcul d'affichage |
| `eligibilite` | `gate_ok`, `raisons_gate` |
| `recommandation` | `recommandation` brute |
| `verification` | `verifie_par_humain` ; `statut_verification` en détail |
| `entite` | à supprimer |
| `fraicheur` | `vu_la_premiere_fois`, `vu_la_derniere_fois`, `disparu_le` |
| `statut` | `À trier`, `En cours`, `En retard` sont fictifs et sans correspondance directe. À supprimer : `En retard` concerne ici une opportunité, tandis que `TACHE_EN_RETARD` concerne une tâche ; `En cours` n'a pas d'équivalent |
| `typeMontant` | `categorie` |
| `faits`, `sources` | `source`, `url_officielle` |
| `suggestions` | seulement si présent dans `source` |
| `notes`, `taches` | `ml_fiche_v1.notes`, `taches` |
| absent | `decision_humaine`, `decide_le`, `confiance_montant`, `projet_etiquete`, `projets_decouverte`, `record_id` |

### 3.1 Lectures v1 disponibles

| Vue | Contenu |
| --- | --- |
| `ml_toutes_v1`, `ml_financements_v1`, `ml_appels_offres_v1`, `ml_investisseurs_v1` | `id`, `espace_id`, `record_id`, `titre`, `emetteur`, `nature`, `categorie`, `sens`, `montant`, `devise`, `confiance_montant`, `montant_connu`, `echeance`, `recommandation`, `statut_verification`, `verifie_par_humain`, `gate_ok`, `raisons_gate`, `decision_humaine`, `decide_le`, `projet_etiquete`, `projets_decouverte`, `url_officielle`, `vu_la_premiere_fois`, `vu_la_derniere_fois`, `disparu_le` |
| `ml_signals_v1` | `id`, `espace_id`, `type`, `nature_signal`, `titre`, `detail`, `action_suivante`, `gravite`, `le`, `acquitte_le`, `record_id`, `projet` |
| `ml_aujourdhui_v1` | `espace_id`, `raison`, `titre`, `record_id`, `projet`, `echeance`, `reference` |
| `ml_montants_v1` | `espace_id`, `categorie`, `sens`, `devise`, `verifie_par_humain`, `opportunites`, `avec_montant`, `somme_connue`, `montants_peu_surs` |
| `ml_fiche_v1` | les 26 colonnes communes, plus `source`, `decisions`, `notes`, `taches` |
| `ml_decision_v1` | `espace_id`, `record_id`, `decision`, `decide_le`, `decide_par` |

## 4. Valeurs réelles à reprendre

| Domaine | Valeurs |
| --- | --- |
| Natures Money Lookup | `GRANT`, `PRIZE`, `TAX_INCENTIVE`, `DEBT_GUARANTEE`, `TENDER`, `PRE_SOLICITATION`, `MARKETPLACE_PROJECT`, `CONSORTIUM_CALL`, `EQUITY`, `ACQUISITION` |
| Signal réglementaire | `REGULATORY` est dans `ml_signals_v1`, mais aussi possible dans `ml_toutes_v1`, qui n'a pas de filtre d'exclusion |
| Catégories | `subvention`, `chiffre_affaires_contractuel_potentiel`, `investissement_capital`, `pret`, `aide_fiscale`, `montant_inconnu` |
| Sens | `entrant`, `sortant` |
| Recommandations | `PURSUE`, `PARTNER`, `INVESTIGATE`, `MONITOR`, `REJECT` |
| Statuts de vérification | `VERIFIED`, `MANUAL_REVIEW_REQUIRED`, `OFFICIAL_SOURCE_FOUND`, `DISCOVERED_UNVERIFIED`, `VERIFICATION_FAILED`, `SOURCE_UNAVAILABLE`, `REJECTED` |
| Décisions lues | `PENDING`, `APPROVE`, `REJECT`, `NEEDS_VERIFICATION`, `COMMENT` |
| Actions de décision | `APPROVE`, `REJECT`, `NEEDS_VERIFICATION`, `COMMENT` |
| Confiance montant | `HAUTE`, `BASSE` ; afficher « peu sûr » pour `BASSE` |
| Devises | champ `text`, code ISO à trois lettres si présent ; le lecteur reconnaît `EUR`, `GBP`, `USD`, `AED`, `QAR`, `SAR`, `MAD` |
| Signaux | `alerte`, `reglementaire` ; natures d'alerte `NEW_MATCH`, `CLOSING_SOON`, `JUST_EXPIRED`, `DEADLINE_CHANGED`, `DISAPPEARED`, `APPROVED_BUT_BLOCKED` |
| Demandes | `DISCOVERY`, `INGEST_URL`, `LINK_CHECK` |
| Projets du registre | `bawaba`, `beau`, `beau-treasury`, `coach-gari`, `district-267`, `lesvieillespierres`, `live-great-foundation`, `ludography`, `maisons-co`, `myoolala`, `oolala-social-foundation`, `padel-design`, `pandamood`, `rls-guard`, `sillon`, `thestudio-mt` |
| Verdicts analyste | `ELIGIBLE`, `LIKELY`, `NEEDS_INFO`, `NOT_ELIGIBLE`, seulement dans `source.assessment` |
| Fraîcheur historique | `FRESH`, `CLOSING_SOON`, `EXPIRED`, `NO_DEADLINE`, calculée et non colonne v1 |
| Provenance des faits | `CONFIRMED_OFFICIAL`, `EXTRACTED_FROM_OFFICIAL_SOURCE`, `INFERRED`, `USER_PROVIDED`, `UNKNOWN` |
| Nature et statut d'un brouillon | nature `PRODUCT`, `VENTURE`, `ADVISORY`, `FOUNDATION`, `STUDIO` ; statut `CONCEPT`, `IN_DEVELOPMENT`, `PROTOTYPE`, `PRIVATE_BETA`, `LIVE`, `ON_HOLD` |

### 4.1 Fonctions d'écriture autorisées

| Fonction | Paramètres SQL exacts | Retour |
| --- | --- | --- |
| `oia_decider` | `p_espace uuid`, `p_record_id text`, `p_action text`, `p_commentaire text`, `p_gate_ok boolean` | `uuid` |
| `oia_etiqueter` | `p_espace uuid`, `p_record_id text`, `p_projet text` | `void` |
| `oia_noter` | `p_espace uuid`, `p_texte text`, `p_record_id text = null`, `p_projet text = null` | `uuid` |
| `oia_modifier_note` | `p_note uuid`, `p_texte text` | `void` |
| `oia_creer_tache` | `p_espace uuid`, `p_titre text`, `p_echeance date = null`, `p_record_id text = null`, `p_projet text = null` | `uuid` |
| `oia_basculer_tache` | `p_tache uuid` | `text` |
| `oia_creer_contact` | `p_espace uuid`, `p_nom text`, puis `p_organisation`, `p_role`, `p_email`, `p_telephone`, `p_note`, `p_record_id`, `p_projet`, tous `text = null` | `uuid` |
| `oia_enregistrer_vue` | `p_espace uuid`, `p_nom text`, `p_filtres jsonb`, `p_tri text`, `p_sens text` | `uuid` |
| `oia_acquitter_alerte` | `p_alerte uuid` | `void` |
| `oia_demander` | `p_espace uuid`, `p_type request_kind`, `p_charge jsonb` | `uuid` |
| `oia_importer_sauvegarde` | `p_espace uuid`, `p_sauvegarde jsonb` | `jsonb` |
| `oia_annuler_import` | `p_import uuid` | `jsonb` |

`p_sens` d'une vue enregistrée est le sens du tri, pas le sens financier. L'échéance d'une tâche est une `date`. Les écritures directes de l'ancienne console ne sont pas à reprendre.

Libellés à reprendre : PURSUE « Y aller », PARTNER « Nécessite un partenaire », INVESTIGATE « À regarder », MONITOR « À surveiller », REJECT « Pas pour nous ». Vérification : VERIFIED « Vérifié », MANUAL_REVIEW_REQUIRED « Pas encore vérifié », OFFICIAL_SOURCE_FOUND « Page officielle trouvée », DISCOVERED_UNVERIFIED « Simple piste », VERIFICATION_FAILED « Ne correspond pas », SOURCE_UNAVAILABLE « Page injoignable », REJECTED « Rejeté ».

Les projets ci-dessus sont des identifiants du registre interne, sans donnée client. Ils ne sont pas une vue de lecture v1 ; en attendant v2, l'étiquetage propose les valeurs présentes dans `projets_decouverte` et `projet_etiquete`.

## 5. Défauts de l'ancienne console à ne pas reproduire

- Filtre Type potentiellement réduit à « all », car `Object.keys(KIND_LABEL)` énumère un Proxy sans clés.
- Routes spécialisées sans normalisation des anciennes natures `TENDER_RFP` et `VC_INVESTOR`.
- Vues enregistrées sans `blocked` ni `verdict`, et application sans réinitialisation complète.
- Bouton « tout afficher » qui conserve plusieurs filtres.
- Fiche sélectionnée pouvant rester visible hors des résultats filtrés.
- Console, Argent et Aujourd'hui sur `useLedger`, Projets et sélecteurs du Workspace sur le snapshot `data.records`.
- Métadonnée `discovered_for` chargée mais non fusionnée au `payload` lu par les filtres.
- Migration directe historique non idempotente pour notes, tâches, contacts et vues.
- Sauvegarde limitée au store local, même en mode distant.
- Aucun bouton de modification CRM, d'édition de profil projet ou de relance de contrôle de lien.
- Mélange de libellés français et anglais, et messages de stockage parfois obsolètes.

## 5 bis. Écarts internes au contrat v1 à trancher

Ces points ne sont pas des erreurs de Lovable. Ils ressortent de la comparaison entre la console, les vues et les fonctions.

1. **Auteur d'origine non relu.** A4 conserve `auteur_origine` pour les décisions, notes, tâches et contacts. La colonne existe aussi sur `saved_views`, mais l'import ne la renseigne pas. Or `ml_decision_v1` et `ml_fiche_v1` lisent `actor`. Après import, l'interface afficherait l'importateur, pas l'auteur d'origine. Exposer l'auteur d'origine dans la lecture.
2. **Gate de décision non relu.** A4 conserve `gate_pursue_eligible_at_decision`, mais `ml_fiche_v1.decisions` ne le reprend pas. L'ancienne console l'affichait dans chaque événement. L'ajouter à l'historique de lecture.
3. **COMMENT change la dernière décision.** `ml_decision_v1` prend le dernier événement, y compris COMMENT. L'ancienne console ignorait COMMENT pour « Ton avis ». En v1, un COMMENT après APPROVE peut donc faire repasser `verifie_par_humain` à faux et modifier le tri. Trancher si c'est voulu ; sinon fournir une dernière décision non COMMENT.
4. **REGULATORY dans Toutes.** `ml_toutes_v1` ne filtre pas les natures. REGULATORY peut donc apparaître dans Toutes et Montants, en plus de Signals. Trancher si « Toutes » doit rester strictement monétaire.
5. **Dates de complétion absentes.** `ml_fiche_v1.taches` ne reprend pas `completed_at`, affiché par l'ancienne fiche.
6. **Identifiants humains absents.** Les notes et tâches de `ml_fiche_v1` n'ont pas leur `id`, ce qui empêche d'utiliser les fonctions de modification et de bascule déjà présentes.
7. **JSON null dans une sauvegarde valide.** L'export écrit `null` pour chaque clé jamais initialisée. A4 utilise `coalesce(v_data -> clé, ...)` : une valeur JSON null n'est pas un NULL SQL et n'est donc pas remplacée par un tableau ou objet vide. `jsonb_array_elements` ou `jsonb_each` peut alors échouer sur une sauvegarde valide de l'ancienne console. Résoudre A4 avant de promettre la compatibilité, sans contourner silencieusement dans le navigateur.
8. **Conflits et annulation.** Un identifiant d'origine déjà présent n'est pas mis à jour, même si son contenu a changé. Une étiquette existante n'est jamais écrasée. L'annulation supprime par `import_id`, y compris une note, tâche ou étiquette importée puis modifiée. Il faut comparer les identifiants repris et avertir avant annulation.
9. **Périmètre du tri.** `EN_ATTENTE_DE_TRI` n'exclut pas les échéances dépassées, contrairement à l'ancienne console.

## 6. Liste de contrôle « rien ne se perd »

### Avant le retrait

- [ ] Ouvrir l'ancienne console dans le navigateur qui contient le travail.
- [ ] Cliquer « sauvegarder » et conserver `oia-workspace-<date>.json` hors dépôt.
- [ ] Vérifier que la console est en mode navigateur pour cette reprise. En mode distant, ce bouton ne constitue pas une sauvegarde complète de la base.
- [ ] Vérifier que le fichier contient `kind: "oia.workspace.backup"`, `version: 1` et les six clés `oia.audit.v1`, `oia.tags.v1`, `oia.notes.v1`, `oia.tasks.v1`, `oia.contacts.v1`, `oia.views.v1`.
- [ ] Relever les clés dont la valeur est JSON null. Elles sont valides dans l'export, mais A4 peut les refuser ; ne pas lancer l'import avant correction du contrat.
- [ ] Exporter aussi le journal de décisions, en copie de contrôle.
- [ ] Noter, pour le contrôle, les nombres locaux de décisions, étiquettes, notes, tâches, contacts et vues.
- [ ] Ne pas vider le stockage du navigateur.
- [ ] Conserver séparément les vues Lovable `oia.money.vues.v1` si elles contiennent du travail utile : elles ne font pas partie du backup A4.
- [ ] Ne pas attendre de la reprise A4 les opportunités, projets, demandes, contrôles de liens, langue `oia.lang.v1`, Shyrka ou événements analytiques : ils ne sont pas dans ses six clés.

### Import dans Lovable

- [ ] Écran « Reprendre le travail de l'ancienne console » accessible depuis Money Lookup et Réglages.
- [ ] Lecture du `.json` dans le navigateur ; aucun envoi ailleurs qu'à `oia_importer_sauvegarde`.
- [ ] Aperçu des six nombres avant import.
- [ ] Bouton désactivé si l'utilisateur n'est pas éditeur.
- [ ] Bilan rendu : `import_id`, `decisions`, `notes`, `taches`, `contacts`, `vues`, `etiquettes`.
- [ ] Comparer les identifiants sources et repris, pas seulement les compteurs. Un conflit d'identifiant n'actualise pas le contenu ; une étiquette existante n'est pas écrasée.
- [ ] Réimport du même fichier : bilan à 0 pour les éléments déjà repris.
- [ ] Historique : date, auteur, bilan, annulé le ; « Annuler cet import » par `oia_annuler_import(p_import)`, seulement pour son auteur ayant encore les droits d'éditeur ou pour le propriétaire.
- [ ] Avant annulation, avertir que les éléments importés puis modifiés seront aussi supprimés.
- [ ] Erreurs `22023`, `42501`, `P0002` affichées telles quelles.

### Équivalences avant retrait

| Fonction ancienne | Équivalent requis | Prêt en v1 |
| --- | --- | --- |
| Liste et filtres d'opportunités | vues `ml_*` | Oui, avec filtres réduits |
| Fiche complète | `ml_fiche_v1.source` | Oui |
| Décider et commenter | `oia_decider` | Oui |
| Historique de décision | `ml_fiche_v1.decisions` | Par fiche ; gate et auteur d'origine en v2 |
| Étiqueter | `oia_etiqueter` | Oui, liste du registre en v2 ; ancien COMMENT de revue non reproduit |
| Ajouter note de fiche | `oia_noter` | Oui |
| Modifier note | `oia_modifier_note` | Non, identifiant absent |
| Ajouter tâche de fiche | `oia_creer_tache` | Oui |
| Basculer tâche | `oia_basculer_tache` | Non, identifiant absent |
| Supprimer note, tâche, contact, vue | aucune fonction | Non, décision requise |
| Aujourd'hui | `ml_aujourdhui_v1` | Oui, horizons figés |
| Alertes et acquittement | `ml_signals_v1`, `oia_acquitter_alerte` | Oui |
| Montants | `ml_montants_v1` | Oui, sans agrégats projet ni gate |
| Exports liste | génération locale depuis les vues | Oui |
| Export digest | génération locale depuis `ml_aujourdhui_v1` | Oui |
| Export journal global | lecture globale des décisions | Non |
| CRM | `oia_creer_contact` | Écriture seulement |
| Notes et tâches globales | lecture globale | Non |
| Vues enregistrées | `oia_enregistrer_vue` | Écriture seulement |
| Recherche projet, ajout par lien, contrôle de liens | `oia_demander` | Écriture seulement |
| Suivi des demandes | lecture `requests` | Non |
| Brouillon de projet | aucune fonction | Non |
| Registre de projets | aucune vue | Non |
| Contrôle de liens | lecture `link_checks` | Non |
| Indicateurs gate et couverture | agrégats dédiés | Non |

**Retrait possible seulement quand toutes les lignes « Non » ont un équivalent accepté ou une décision écrite de Mickaël.**

## 7. Besoins du contrat version 2

1. Projets du registre : liste et fiche, statut, nature, activation, recherche, sources et profil.
2. CRM : liste et fiche des contacts, identifiants, liens projet et opportunité.
3. Notes globales avec identifiant, lien et auteur ; modification par identifiant.
4. Tâches globales avec identifiant, statut, échéance, fin, lien ; bascule par identifiant.
5. Fiche : `id` et `completed_at` des tâches, `id` des notes, `gate_pursue_eligible_at_decision` des décisions, `auteur_origine` des éléments importés.
6. Vues enregistrées : lecture et éventuellement suppression.
7. Demandes : liste, statut, résultat et erreur.
8. Brouillons de projet : création, liste et état.
9. Contrôles de liens : statut par URL.
10. Historique des imports A4 : lecture possible de `oia_import` selon A4 ; vue versionnée seulement si l'on impose le passage par des vues.
11. Journal global des décisions pour l'export.
12. Filtres de liste : publication, confiance de l'information, verdict analyste, route stratégique, si ces filtres doivent revenir.
13. Agrégats Montants : par projet, prêt / bloqué, bientôt clos, raisons de blocage. Pour la couverture, rapprocher les compteurs connus et inconnus au même périmètre ou fournir un agrégat dédié.
14. Suppressions de notes, tâches, contacts et vues, ou décision de ne plus les autoriser.
15. Raison « clos depuis la dernière visite », si elle doit revenir dans Aujourd'hui.
16. Dernière décision hors COMMENT, si COMMENT ne doit pas changer « Ton avis », la vérification humaine ou le tri.
17. Exclusion de REGULATORY dans `ml_toutes_v1`, si Toutes doit rester strictement monétaire.
18. A4 : traiter les valeurs JSON null des clés non initialisées, documenter les conflits et le comportement d'annulation après modification.
19. `EN_ATTENTE_DE_TRI` : exclure les échéances dépassées si l'ancien périmètre doit être conservé.

## 8. Complément au brief de branchement, à coller dans Lovable

```text
Complément Money Lookup, avec le brief de branchement. Aucune donnée réelle de client dans le code ni dans la démonstration.

1. Remplace le modèle Money Lookup par les colonnes exactes des vues ml_*. Ne garde pas entité, statut, fraîcheur en catégories, score inventé ni type de montant inventé.
- Liste : ml_toutes_v1, ml_financements_v1, ml_appels_offres_v1, ml_investisseurs_v1.
- Affiche nature avec ses libellés français ; regroupe par categorie ; affiche sens à part ; ACQUISITION est sortant.
- Éligibilité : gate_ok, raisons_gate en détail.
- Recommandation du moteur et décision humaine séparées : recommandation ; decision_humaine et decide_le.
- Vérifié seulement si verifie_par_humain est vrai ; statut_verification en détail.
- Fraîcheur : vu_la_premiere_fois, vu_la_derniere_fois, disparu_le, avec echeance pour clôture.
- Montant : montant, devise, confiance_montant ; BASSE = « peu sûr » ; montant null = « inconnu ».
- Projets : projet_etiquete est le choix de Mickaël ; projets_decouverte est la provenance.

2. Valeurs à utiliser :
Natures : GRANT, PRIZE, TAX_INCENTIVE, DEBT_GUARANTEE, TENDER, PRE_SOLICITATION, MARKETPLACE_PROJECT, CONSORTIUM_CALL, EQUITY, ACQUISITION. REGULATORY est présent dans Signals ; ml_toutes_v1 ne l'exclut pas, donc ne le masque pas silencieusement sans décision v2.
Catégories : subvention, chiffre_affaires_contractuel_potentiel, investissement_capital, pret, aide_fiscale, montant_inconnu.
Recommandations : PURSUE, PARTNER, INVESTIGATE, MONITOR, REJECT.
Vérification : VERIFIED, MANUAL_REVIEW_REQUIRED, OFFICIAL_SOURCE_FOUND, DISCOVERED_UNVERIFIED, VERIFICATION_FAILED, SOURCE_UNAVAILABLE, REJECTED.
Décisions : PENDING en lecture ; actions APPROVE, REJECT, NEEDS_VERIFICATION, COMMENT.
Confiance : HAUTE, BASSE.

3. Aujourd'hui : ml_aujourdhui_v1, groupé dans cet ordre : TACHE_EN_RETARD, TACHE_A_FAIRE, ALERTE, BIENTOT_CLOS, APPROUVE_MAIS_BLOQUE, EN_ATTENTE_DE_TRI. Ouvre la fiche seulement si record_id existe. Export Markdown local des lignes affichées.

4. Signals : ml_signals_v1 ; type, nature_signal, titre, detail, action_suivante, gravite, le, acquitte_le, projet. Propose Acquitter uniquement pour type = alerte et acquitte_le vide, avec id comme p_alerte dans oia_acquitter_alerte. Les lignes reglementaire ne sont pas acquittables par cette fonction.

5. Fiche : ml_fiche_v1. Affiche source sans inventer : URLs, faits avec provenance et localisateur, échéances, vérification et preuves, éligibilité application et attribution, route, scores, évaluation analyste si présente, gate et raisons, questions et avertissements. N'affiche des projets suggérés, scores et raisons que s'ils figurent dans source.
Actions : Approuver, Rejeter, À vérifier, Commenter avec oia_decider(p_espace, p_record_id, p_action, p_commentaire, p_gate_ok). Historique : decisions, non modifiable. N'affiche pas un auteur d'origine ni un état de gate non fourni ; signale-les en v2. Étiquette : oia_etiqueter. Note : oia_noter. Tâche : oia_creer_tache. Ne propose pas modification de note ni bascule de tâche tant que ml_fiche_v1 ne donne pas leurs identifiants.

6. Montants : ml_montants_v1. Une ligne par categorie, sens, devise et verifie_par_humain. Aucun total global. Lignes sans montant : « N opportunités sans montant lisible ». Affiche montants_peu_surs.

7. Exports CSV et Markdown : seulement colonnes du contrat, y compris decision_humaine, gate_ok, raisons_gate, verifie_par_humain, montant, devise, confiance_montant, categorie et sens.

8. Écran « Reprendre le travail de l'ancienne console », depuis Money Lookup et Réglages :
Texte : « Ce fichier vient du bouton backup de l'ancienne console. Rien n'est effacé de ton navigateur. Tu peux annuler l'import ensuite. »
Lis un .json dans le navigateur ; vérifie kind oia.workspace.backup et version 1 ; aperçu de oia.audit.v1, oia.tags.v1, oia.notes.v1, oia.tasks.v1, oia.contacts.v1, oia.views.v1. Bloque l'import et demande la correction A4 si une clé vaut JSON null : la fonction actuelle peut la refuser, ne la transforme pas silencieusement. Envoie seulement à oia_importer_sauvegarde(p_espace, p_sauvegarde). Bouton désactivé si non éditeur. Affiche bilan et import_id, puis compare les identifiants sources et repris ; les conflits ne mettent pas à jour le contenu et les étiquettes existantes ne sont pas écrasées. Historique avec « Annuler cet import » via oia_annuler_import(p_import), seulement pour son auteur ayant encore les droits d'éditeur ou le propriétaire. Avertis que les éléments importés puis modifiés seront aussi supprimés. Erreurs telles quelles, rien importé en cas d'erreur.

9. Remplace la recherche assistée Lovable par supabase.functions.invoke('money-match', { body: { texte, projet } }). Affiche les correspondances dans l'ordre de rang, avec explication, informations_manquantes et lien vers la fiche id. Gère chargement, message, 401, 403 et 429 sans nouvel essai automatique. Si alerte_budget, affiche « Budget IA du mois presque atteint ». Supprime « modèle via Lovable ». Le suivi local oia.money.evenements.v1 reste sans transport et hors A4.

10. Ne corrige pas silencieusement les écarts v1 : auteur_origine non relu, gate de décision non relu, COMMENT comme dernière décision, REGULATORY possible dans Toutes, completed_at et identifiants absents, JSON null A4, conflits et annulation après modification, opportunités expirées dans EN_ATTENTE_DE_TRI. Documente leur comportement ou attends v2.

11. Garde en démonstration signalée, sans les inventer comme données réelles : liste des projets du registre, CRM, liste globale des notes et tâches, vues enregistrées, demandes, brouillons de projet, contrôle des liens, indicateurs de blocage. Liste ces besoins dans ta réponse comme contrat version 2.

12. Aucun changement Supabase, aucune écriture directe dans une table, aucune donnée réelle de client dans le code.
```

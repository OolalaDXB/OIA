# Brief Lovable · branchement du cockpit OIA sur les données réelles · v1

8 novembre 2026 · mandat v9, bloc E. **À coller tel quel dans Lovable**, dans
le projet du cockpit OIA. Contrat de référence :
`docs/interface/contrat-donnees-v1.md` (version 1, figée), à joindre au
message ou à coller à la suite.

---

## Message pour Lovable

Bonjour. Le cockpit OIA passe sur données réelles pour deux modules :
**Money Lookup** et **Visibility**, plus la **recherche assistée** et
**Shyrka** en texte. La base existe déjà, elle est en production et tu n'y
touches pas. Ton travail est de brancher les écrans existants sur ses vues et
ses fonctions, sans changer le design.

### 1. Connexion à Supabase

- Utilise le projet Supabase **OIA** (référence `iywmvyebuikxyvnrcnoy`),
  avec son **adresse** et sa **clé publique (anon)** uniquement.
- Aucune clé de service, nulle part dans le navigateur ni dans le code.
- Toutes les lectures se font **avec la session de l'utilisateur connecté** :
  la base décide de ce qu'il voit.
- L'inscription est fermée : l'écran de connexion n'affiche que la
  connexion par e-mail et mot de passe, sans lien « créer un compte ».

### 2. Interdits

- **Ne crée ni ne modifie aucune table, migration, politique d'accès,
  fonction ou fonction serveur dans Supabase.** Si un écran a besoin d'une
  donnée absente du contrat, arrête-toi et écris-le dans ta réponse : c'est
  une demande de contrat version 2, traitée hors de Lovable.
- Aucune écriture directe dans une table (`insert`, `update`, `delete`) :
  uniquement les fonctions `rpc` et les fonctions serveur du contrat.
- Aucun service tiers de suivi ou d'analyse.

### 3. Money Lookup

- Remplace les données de démonstration de Money Lookup par les vues
  `ml_toutes_v1`, `ml_financements_v1`, `ml_appels_offres_v1`,
  `ml_investisseurs_v1`, `ml_signals_v1`, `ml_aujourdhui_v1`,
  `ml_montants_v1`, `ml_fiche_v1` et `ml_decision_v1` (colonnes exactes dans
  le contrat, § 2).
- Montant inconnu : `null`, affiché « inconnu », jamais 0. N'additionne
  jamais deux catégories, deux sens ou deux devises.
- Actions (décision, étiquette, note, tâche, contact, vue enregistrée,
  acquittement) : fonctions `oia_*` du contrat (§ 5), espace
  `00000000-0000-4000-8000-000000000001`. Affiche le message d'erreur reçu
  tel quel.

### 4. Recherche assistée

- Remplace la recherche de démonstration (qui utilisait ton IA) par
  `supabase.functions.invoke('money-match', { body: { texte, projet } })`.
- Affiche les correspondances dans l'ordre de `rang`, avec `explication`,
  `informations_manquantes` et un lien vers la fiche (`id`).
- Gère les états : chargement ; `message` (aucun candidat, refus) ; erreurs
  401, 403, 429 (limite du jour ou plafond mensuel : pas de nouvel essai
  automatique). Si `alerte_budget` est vrai, affiche un bandeau discret
  « Budget IA du mois presque atteint ».

### 5. Visibility

- Remplace les données de démonstration de Visibility par les vues
  `vis_sujets_v1`, `vis_mesure_v1`, `vis_apercu_v1`, `vis_reponses_v1`,
  `vis_citations_v1`, `vis_reseaux_sociaux_v1`, `vis_concurrents_v1`,
  `vis_questions_v1`, `vis_recommandations_v1`, `vis_rapports_v1`,
  `vis_seo_command_v1` et `vis_planificateur_v1` (contrat, § 3).
- La fenêtre en cours s'affiche « Mesure en cours, jour N sur 5 »
  (`jours_mesures`, `jours_prevus`). Un indicateur `non_mesurable`
  s'affiche « Non mesurable » avec sa raison, jamais 0 %.
- Valider ou rejeter une recommandation : `vis_valider_recommandation` et
  `vis_rejeter_recommandation`.

### 6. Shyrka (texte seulement)

- Branche la conversation sur
  `supabase.functions.invoke('shyrka-chat', { body: { message, conversation_id, prive } })`.
  Garde `conversation_id` rendu pour les messages suivants de la même
  conversation.
- Affiche `reponse`, puis les `sources` (vue, identifiant, date) en petit
  sous la réponse. Les liens vers les brouillons créés (`brouillons`) ouvrent
  la zone Contexte.
- Interrupteur « Mode privé » : envoie `prive: true` ; rien n'est conservé.
- **Texte seulement** : retire ou masque toute commande vocale, micro ou
  bouton « parler » de la démonstration. Aucune voix factice.
- Zone **Contexte** : lis `shy_conversation`, `shy_message`, `shy_brouillon`,
  `shy_contexte` et `shy_journal` (contrat, § 4). Un brouillon affiche
  « Brouillon, non envoyé » ; il n'existe aucun bouton « Envoyer ».
  Actions : `shy_ajouter_contexte`, `shy_statuer_contexte`, `shy_oublier`
  (avec confirmation dans l'interface).
- Budget IA : `oia_ia_budget_v1` (dépensé, reste, alerte).

### 7. Accueil

- Alimente l'accueil avec les données réelles des deux modules : nombre
  d'opportunités à décider et échéances proches (`ml_aujourdhui_v1`), état
  de la mesure Visibility en cours (`vis_mesure_v1`), correctifs en attente
  (`vis_recommandations_v1` où `etat = 'pending'`).

### 8. Les autres modules

- Garde la démonstration pour tous les autres modules, signalée comme telle
  (« Démonstration »), sans la mélanger aux données réelles.

### 9. Suivi d'usage

- Garde le suivi d'usage **dans le navigateur** (stockage local), sans
  service tiers.

### 10. États de chaque écran

Chargement (squelette sans chiffres), vide (phrase qui dit pourquoi),
erreur (message et « Réessayer »), accès non accordé (0 ligne pour un compte
connecté sans droit : « Accès non accordé », pas « vide »).

### Quand tu as fini

Liste les écrans branchés, les vues et fonctions utilisées par chacun, et
tout écart au contrat que tu as rencontré. Ne publie pas : Mickaël vérifie
et publie lui-même.

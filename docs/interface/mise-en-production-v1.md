# Mise en production du cockpit OIA · v1 · liste à cocher

8 novembre 2026 · mandat v9, bloc F. Pour Mickaël, dans l'ordre. Rien
n'est publié tant que toutes les cases de « Contrôles avant publication »
ne sont pas cochées.

## 0. Avant de commencer

- [ ] Lire le rapport de la nuit : `infra/visibility/reports/2026-11-08-mandat-v9.md`.
- [ ] Coller le brief `docs/interface/brief-lovable-branchement-v1.md` dans
      Lovable, avec le contrat `docs/interface/contrat-donnees-v1.md`.
- [ ] Relire la liste des écrans branchés que Lovable rend, et ses écarts
      éventuels au contrat.

## 1. Hébergement

Deux possibilités, à choisir :

- [ ] **Publication Lovable** (le plus simple) : bouton « Publish » du projet ;
      ou
- [ ] **Vercel depuis le dépôt du projet Lovable** (plus de contrôle :
      déploiements de prévisualisation, retour arrière en un clic).

Variables d'environnement de l'application (et rien d'autre) :

| Variable | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` (ou le nom utilisé par Lovable) | `https://iywmvyebuikxyvnrcnoy.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_ANON_KEY` | clé **publique** (anon) du projet OIA, tableau de bord Supabase → Settings → API |

- [ ] Vérifier qu'**aucune clé de service** (`service_role`, `sb_secret_…`) ni
      aucune clé Mistral n'apparaît dans les variables, le code ou le
      navigateur (outils de développement → Sources, chercher `service_role`
      et `sb_secret`).

## 2. Adresse de production

- [ ] Choisir l'adresse (par exemple un sous-domaine d'un domaine existant).
      Décision de Mickaël ; rien n'est réservé ni acheté par Claude Code.
- [ ] Brancher le domaine sur l'hébergement choisi.

## 3. Connexion Supabase

Aujourd'hui, l'adresse du site dans Supabase vaut `http://localhost:3000`.

- [ ] Supabase → Authentication → URL Configuration : **Site URL** = l'adresse
      de production.
- [ ] **Redirect URLs** : ajouter l'adresse de production (et
      `https://<adresse>/**`). Retirer celles qui ne servent plus.
- [ ] Vérifier que l'inscription reste fermée (Authentication → Sign In /
      Providers : « Allow new users to sign up » désactivé). Vérifié le
      8 novembre : fermée.

## 4. Contrôles avant publication

Sur l'adresse de prévisualisation (ou de production avant annonce) :

- [ ] Connexion avec le **premier compte** de Mickaël : Money Lookup et
      Visibility affichent les données réelles.
- [ ] Connexion avec le **second compte** : idem.
- [ ] **Navigation privée, sans connexion** : aucune donnée lisible ; l'écran
      de connexion seulement.
- [ ] **Aucun autre compte** ne peut entrer (inscription fermée ; un compte
      non membre ne voit rien : testé par Claude Code cette nuit, à revoir
      si un compte est ajouté).
- [ ] Money Lookup : 272 opportunités (271 du dernier instantané et une
      notice TED du 16 septembre déjà en base), montants inconnus affichés
      « inconnu ».
- [ ] Visibility : Coach Gari, « Mesure en cours, jour N sur 5 ».
- [ ] Recherche assistée : une recherche rend des correspondances
      expliquées ; le budget IA du mois s'affiche (plafond 5 $).
- [ ] Shyrka : « Où en est Coach Gari dans Visibility ? » → chiffres réels
      avec sources ; « Quelles opportunités correspondent à SILLON ? » ;
      « Prépare un message… » → brouillon dans la zone Contexte, non envoyé.
- [ ] Aucune commande vocale affichée dans le cockpit.
- [ ] Les autres modules sont signalés « Démonstration ».

## 5. Publication

- [ ] Publier.
- [ ] Refaire les trois premiers contrôles du § 4 sur l'adresse publique.
- [ ] Garder **l'ancienne console en ligne** tant que le nouveau cockpit
      n'est pas validé.

## 6. Retour arrière

- Application : republier la version précédente (Lovable : historique des
  versions ; Vercel : « Promote » du déploiement précédent). L'ancienne
  console reste disponible pendant ce temps.
- Base : rien à faire pour un retour arrière de l'interface. Pour la base,
  voir `packages/database/supabase/migrations/README.md` (sauvegarde de
  référence `~/oia-sauvegardes/avant-v9/`).
- Fonctions serveur : `supabase functions delete shyrka-chat` ou
  `money-match` coupe la fonction sans toucher aux données.

## 7. Après validation du cockpit

- [ ] Retirer la transition de la console (`0003a`, bloc de retrait en tête du
      fichier) : la console perd ses écritures directes. À faire seulement
      quand l'ancienne console n'est plus utilisée.
- [ ] Puis retirer l'ancienne console.

## 8. Tâches sur le Mac (non installées par Claude Code)

- [ ] `pnpm ml:quotidien:install` : rafraîchissement quotidien de Money
      Lookup (launchd, 11 h 30). Refusé à Claude Code cette nuit (tâche
      persistante) ; à lancer par Mickaël.
- [ ] Facultatif : `~/.oia/mistral.env` (`MISTRAL_API_KEY=…`, `chmod 600`) pour
      que `pnpm shyrka:parler -- --texte` passe par Mistral quand Ollama est
      éteint.

## 9. Coûts à valider par Mickaël

| Poste | État | À décider |
| --- | --- | --- |
| Supabase | Organisation en offre **Pro** (vérifié le 8 novembre) : pas de mise en pause pour inactivité | Rien, sauf changement d'offre. Une offre gratuite mettrait le projet en pause après une période d'inactivité, ce qu'un cockpit de production ne peut pas se permettre |
| Mistral (Shyrka et recherche assistée) | Plafond commun **5 $ par mois**, appliqué en base, alerte à 4 $ | Relever ou non le plafond (`oia_ia_budget.plafond_usd`, rôle d'administration) |
| Hébergement de l'application | Lovable ou Vercel | Selon l'offre en cours ; un domaine personnalisé peut demander une offre payante |
| Domaine | à choisir | Achat éventuel |

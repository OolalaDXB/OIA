# Roadmap

## Open
- [x] Shyrka : présence immersive plein écran, raccourci F, parole simulée, sous-titres, saisie discrète et accessibilité clavier, avec commit local uniquement.
- [x] Shyrka : ouvrir légèrement les yeux du visage de particules sans changer la présence ni les animations.
- [x] Visibility : permettre les ajouts locaux dans Marque, Concurrents et Questions/prompts, avec conservation après rechargement et Moteurs inchangé.
- [x] Généraliser les logos et favicons aux réseaux, sources, sites et plateformes dans tout le cockpit, avec repli local et vérification visuelle.
- [x] Visibility : ajouter les couleurs pastel des indicateurs, les logos des assistants et les pastilles des marques, puis vérifier sur grand écran et mobile.
- [x] Vérifier la reprise, sécuriser aperçu et annulation avec les clés existantes (91cecd5), tests locaux réussis ; parcours connecté restant ci-dessous.
- [x] Préparer le contrat commun des dépenses Visibility, Money Lookup et Shyrka, pour Moteurs et la colonne, sans création Supabase (91cecd5).
- [x] Réduire les marges inutilisées sur grands écrans et vérifier la largeur sur mobile, livré sur main (7e79990).
- [ ] Accès du nouveau compte : rattachement OIA absent, correction des droits à effectuer dans OIA hors cockpit.
- [x] Corriger la boucle Money Lookup, tester les lectures uniques et la visite par entrée.
- [x] Ajouter « Définir mon mot de passe » dans Réglages et livrer la récupération sur OIA main (c0a2ce6).
- [x] Brancher Money Lookup sur les vues v2 avec connexion existante, accès et états explicites.
- [x] Brancher décisions, projets, CRM, notes, tâches, vues, demandes, liens et journal sur les RPC existantes.
- [x] Ajouter la reprise de l'ancienne console, bilan, historique et annulation protégée.
- [x] Vérifier les règles et parcours disponibles, documenter les écarts puis transférer uniquement le cockpit vers OIA main (73c07af).
- [ ] Vérifier les lectures et écritures de production avec un compte connecté : session Supabase externe non disponible ici.
- [x] Reprendre Réglages > Moteurs avec cartes fournisseurs, dépenses fictives, plafond et plateformes en lecture seule, puis vérifier.
- [x] Préparer une couche de données par module, sources réelles non branchées et états chargement, vide, erreur.
- [x] Vérifier l’affichage et les parcours, puis envoyer uniquement sur la branche prototype OIA.
- [x] Envoyer le prototype à jour sur `lovable/oia-visibility-prototype`, sans toucher `main` ni les dossiers protégés.
- [x] Money Lookup : préciser la démonstration via Lovable et conserver le suivi uniquement dans le navigateur.
- [x] Visibility : marquer explicitement les versions fictives des assistants.
- [x] Vérifier les règles, le parcours Money Lookup et l'absence d'envoi analytique externe.
- [x] Retirer du dépôt GitHub le fichier de configuration Supabase publique, sans clé privée.
- [x] Graphiques : couleurs par série et légendes au survol.
- [x] Money Lookup : recherche libre avec AI Gateway sur les opportunités fictives.
- [x] Money Lookup : événements onglets, filtres, exports et fiches, validation et vérification.
- [x] Navigation : Visibility, Money Lookup, CRM, Portefeuille, Data, Training, dépense sous la colonne.
- [x] Visibility : tous les onglets de mesure, réglages, règles d'affichage des chiffres.
- [x] Money Lookup : Aujourd'hui, listes filtrables, fiche, Montants, Signals, exports.
- [x] Shyrka : Conversation, Contexte, Sources, Permissions, Cadre, Identité, Applications, Journal, export et mode privé.

## Done
- [x] Prototype initial, Shyrka, sauvegarde locale, accessibilité mobile, transfert GitHub (PR #4).

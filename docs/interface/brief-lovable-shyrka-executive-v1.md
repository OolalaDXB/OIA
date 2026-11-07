# Brief Lovable · Shyrka exécutive · v1

2026-11-08 · mandat v10, bloc F4. À coller dans Lovable **quand Mickaël décidera du raccordement**. Il ne demande aucun changement de design. Contrat : `docs/interface/contrat-donnees-shyrka-executive-v1.md`.

## Message pour Lovable

> Ne modifie ni le design, ni les écrans existants, ni les branchements v1. Prépare seulement une zone « Shyrka exécutive » en lecture seule, alimentée plus tard par six vues JSON décrites dans le contrat joint. **Les données ne sont pas encore disponibles côté cloud** : affiche l'état `non_implemente` partout tant que la source n'existe pas, et n'invente aucune donnée de démonstration présentée comme réelle.
>
> 1. **Briefing** (`brief_v1`) : changements, puis trois sujets au plus. Chaque sujet montre sa nature (« fait observé » ou « recommandation de Shyrka »), son impact, sa preuve, la recommandation et l'action attendue. Si la liste est vide, écris « Aucun sujet ne demande ton attention » : ne remplis pas de cartes.
> 2. **Couverture** (`couverture_v1`) : une ligne par produit et par contrôle. Distingue quatre cas : vert (actif, ok), rouge (actif, anomalie), gris « non surveillé » (non configuré), ambre « accès manquant ». « Inconnu » n'est jamais vert.
> 3. **Incidents** (`incidents_v1`) : statut, gravité, première et dernière occurrence, nombre d'observations, réapparitions, preuve.
> 4. **Missions** (`missions_v1`) : statut, niveau d'automatisation (« automatique », « assisté », « simulé »), tentatives, lien PR, empreinte du diff. Aucun bouton « fusionner » ni « déployer ».
> 5. **Décisions** (`decisions_v1`) : liste à traiter. Chaque ligne affiche la commande à lancer sur le Mac (`action`) ; aucune écriture depuis le cockpit en v1.
> 6. **Mémoire** (`memoire_autorisee_v1`) : bandeau « Mémoire personnelle sur le Mac seulement » ; rien d'autre en v1.
>
> États à afficher pour chaque vue : connecté, déconnecté (dernière copie et son âge), ancien, non autorisé, non implémenté. N'affiche jamais une adresse locale (127.0.0.1, SQLite, Ollama) comme un lien.

## Ce qui reste à décider (Mickaël)

- Le transport : une publication en lecture seule depuis le Mac vers une table dédiée. Il faut une migration relue ; elle n'est pas faite.
- La portée `cockpit` de la mémoire : elle dépend de la migration de `shy_contexte` (ADR 0004, § 2).

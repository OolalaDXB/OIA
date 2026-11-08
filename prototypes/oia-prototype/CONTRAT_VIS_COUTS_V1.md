# Contrat proposé : vue unique des dépenses d’IA OIA

Proposition pour Claude Code, aucune vue créée ni branchement effectué par Lovable. Le nom de la vue unique reste à confirmer ; elle remplace la proposition limitée à vis_couts_v1. Les coûts affichés actuellement restent signalés comme fictifs jusqu’à livraison et validation de cette source.

## Grain et identification

Une ligne par espace, module, service, marque éventuelle, mois UTC, assistant, modèle et voie d’accès. La voie d’accès fait partie du grain : un même modèle facturé en direct et via OpenRouter ne doit pas être fusionné. Le mois est une date correspondant au premier jour du mois. Les relevés agrégés sans ventilation par modèle gardent un modèle NULL et ne sont jamais répartis artificiellement entre les cartes.

| Colonne proposée | Type | Usage dans Moteurs |
|---|---|---|
| espace_id | uuid | Périmètre d’accès OIA |
| module | text | visibility, money_lookup ou shyrka |
| service | text | Identifiant du service mesuré, notamment money-match, shyrka-chat et la veille Money distincte |
| marque_id | text nullable | Marque Visibility ; NULL pour les services sans marque |
| mois | date | Mois concerné |
| assistant | text nullable | Assistant réellement configuré ; NULL si la source ne détaille pas cette valeur |
| fournisseur | text nullable | Identifiant fournisseur pour l’icône, distinct de l’assistant |
| modele | text nullable | Identifiant exact connu ; NULL si le relevé n’est pas ventilé |
| version | text nullable | Version réellement connue, sinon « non renseignée » |
| voie_acces | text | API directe, OpenRouter ou extracteur |
| suivi | boolean | Case cochée ou non, en lecture seule |
| nb_questions | integer nullable | Questions suivies pour la marque Visibility |
| frequence | text nullable | Fréquence de mesure Visibility lisible |
| nb_reponses_prevues | integer nullable | Volume Visibility prévu dans le mois |
| nb_reponses | integer nullable | Réponses Visibility collectées, sans compter les échecs comme réponses |
| nb_appels | integer nullable | Appels Money/Shyrka, si comptés par la source |
| unite_volume | text | reponse ou appel, pour le dénominateur des coûts unitaires |
| cout_estime_par_reponse_usd | numeric nullable | Prix estimé par réponse, grille OIA/Elmo |
| cout_estime_mois_usd | numeric nullable | Estimation mensuelle selon le volume prévu et la grille applicable |
| cout_retenu_mois_usd | numeric nullable | Coût retenu par le garde-fou, journal local du Mac |
| cout_facture_mois_usd | numeric nullable | Montant réellement facturé et attribuable à cette marque/assistant/modèle/mois ; NULL si non relevé ou non attribuable |
| facture_relevee_le | timestamptz nullable | Date du relevé manuel fournisseur |
| plafond_mois_usd | numeric nullable | 30 USD pour Visibility ; 5 USD communs à money-match et shyrka-chat ; NULL pour un service sans plafond défini |
| plafond_perimetre | text | Identifie le budget partagé pour ne pas le multiplier par le nombre d’assistants ou de marques |
| depense_budget_mois_usd | numeric nullable | Dépense totale officielle du budget, répétée à l’identique sur ses lignes, jamais sommée |
| reserve_budget_mois_usd | numeric nullable | Réservations encore en cours, distinctes des dépenses exécutées |
| seuil_alerte_usd | numeric nullable | Seuil officiel du budget ; Visibility : 24 USD, Money/Shyrka : reprendre le seuil source sans l’inventer |
| alerte_budget | boolean nullable | Alerte fournie par la source sur le périmètre complet ; NULL si elle n’est pas calculable |
| statut_comptage | text | compte, partiel ou non_compte ; la veille Money est actuellement non_compte |
| source_cout | text | Origine du relevé, sans secret ni contenu de requête |
| mis_a_jour_le | timestamptz | Dernière alimentation quotidienne depuis le Mac |

## Règles d’affichage et de calcul

- Tous les montants sont en USD. Toute conversion éventuelle est faite par la source et documentée, pas inventée dans le cockpit.
- Le coût estimé, le coût retenu et le coût facturé sont trois valeurs distinctes. Le journal du garde-fou n’est pas une facture.
- `cout_facture_mois_usd IS NULL` affiche **Non relevé**. Zéro signifie un montant zéro réellement relevé.
- Coût retenu par réponse = `cout_retenu_mois_usd / nb_reponses` seulement si le nombre de réponses est strictement positif et le coût connu. Sinon : **Non mesurable** ou **Non relevé** selon la donnée manquante.
- Coût facturé par réponse = `cout_facture_mois_usd / nb_reponses` avec les mêmes conditions, seulement si la facture et les réponses ont le même périmètre.
- Estimation mensuelle en tête = somme des `cout_estime_mois_usd` des lignes du mois et de la marque. Ne pas multiplier une deuxième fois par la fréquence ou le nombre de questions.
- Total retenu et total facturé sont affichés séparément. Si un relevé manque, le total facturé est **partiel**, jamais présenté comme complet.
- Le plafond et la dépense officielle du budget sont répétés sur les lignes mais ne sont jamais sommés. Les budgets sont identifiés par `plafond_perimetre`, pas seulement par module. Alerte Visibility strictement au-delà de 80 % de 30 USD, soit au-delà de 24 USD ; Money/Shyrka utilisent le seuil et l’alerte de leur source existante.
- Une facture globale fournisseur sans ventilation fiable reste non attribuable aux cartes. Ne pas répartir au prorata sans règle explicite validée.
- Les lignes incluent les assistants configurés non suivis, même sans réponses. Les plateformes à ajouter restent « non suivi » et « coût à valider avant ajout ».
- Lecture avec la session utilisateur et contrôle d’accès existant, aucune donnée de facturation rendue publique. Claude Code définit la vue et ses permissions dans OIA.

## Dépense du mois sous la colonne

- Afficher séparément Visibility et le budget commun Money Lookup + Shyrka.
- Pour chaque budget, prendre une seule `depense_budget_mois_usd`, un seul `plafond_mois_usd` et une seule `alerte_budget` par espace/mois/périmètre. Les valeurs répétées doivent être identiques ; en cas d’incohérence, ne pas choisir arbitrairement un montant.
- Ne pas afficher 10 USD de plafond en additionnant les deux lignes du budget partagé de 5 USD.
- Un total global éventuel n’additionne que des budgets distincts, de même mois et devise ; si une source manque ou si la veille Money n’est pas comptée, afficher **Partiel**, jamais un total complet.
- « Dépense comptabilisée » n’est pas « facture payée ». Factures absentes : **Non relevé**. Réservations en cours présentées séparément, non additionnées une seconde fois au journal de dépenses.
- La vue oia_ia_budget_v1 fournit un budget agrégé. Si elle ne détaille pas le module, le modèle ou le volume, les données complémentaires doivent venir du journal d’appels existant ou rester NULL. Ne pas dupliquer la dépense agrégée sur les services comme si chacun l’avait entièrement consommée.

## Sources prévues

- Estimations : base locale Elmo sur le Mac et `infra/visibility/src/cost-grid.ts`.
- Retenues du garde-fou : `~/oia-visibility-data/cost-journal.csv`.
- Facturation : relevés manuels de Mickaël dans OpenAI, Anthropic, Mistral, OpenRouter et TypeSafe.
- Alimentation : quotidienne depuis le Mac, réalisée par la session Claude Code.
- Money Lookup : money-match déjà compté dans oia_ia_budget_v1, budget commun de 5 USD/mois avec Shyrka. La veille analysant les financements avec un modèle n’est pas encore comptée.
- Shyrka : shyrka-chat, même budget commun oia_ia_budget_v1. Les identifiants exacts en base doivent être repris par Claude Code, sans renommer les services existants.

Les noms ci-dessus sont une proposition contractuelle, pas des colonnes déjà présentes. Le branchement de Moteurs attend la vue et le contrat final.
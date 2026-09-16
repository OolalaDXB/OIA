# Aid scout

- sources read: 4 of 12
- calls kept: 66
- calls dropped as unanchored: 0
- model calls: 18 · tokens in/out: 107465/62954

## Per source
- **adio** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Cluster programme",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
      "CONSORTIUM_
- **aides-territoires** — OK · 65 kept, 0 dropped · page: 14498 chars, 103 link(s) — followed "https://aides-territoires.beta.gouv.fr/programmes/" (aides, programmes)
- **boamp** — OK · 0 kept, 0 dropped · page: 1697 chars, 38 link(s) — The page is a portal for public procurement notices (avis de marché public) and does not list specific funding opportunities, grants, or programmes. It provides access to calls for tenders and public contracts, but these are not enumerated as individual opportunities on the page itself. The page directs users to search for active tenders rather than listing them explicitly. · tried "https://www.boamp.fr/pages/aide/" but it had less text — stayed on the entry page
- **cir-cii-jei** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Tax incentive",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
      "CONSORTIUM_CALL
- **eu-funding-tenders** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Calls for proposals",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
      "CONSORTIU
- **flippa** — OK · 0 kept, 0 dropped · page: 15729 chars, 189 link(s) — The page is a marketplace for buying and selling online businesses, not a public funding body offering grants, subsidies, or funding opportunities. No funding opportunities as defined in the rules are present.
- **france-2030-ademe** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "code": "invalid_type",
    "expected": "object",
    "received": "number",
    "path": [
      "calls",
      0
    ],
    "message": "Expected object, received number"
  },
  {
    "received": "Subventions, appels à projet, diagnostics
- **hub71** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Programme",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
      "CONSORTIUM_CALL",
 
- **uae-federal-procurement** — EMPTY_PAGE · 0 kept, 0 dropped · page: 124 chars, 0 link(s) — the page rendered almost no text
- **uk-find-a-tender** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Preliminary Market Engagement",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
      
- **ungm** — ERROR · 0 kept, 0 dropped — Mistral extract failed to produce valid ScoutResult: [
  {
    "received": "Call for individual consultants",
    "code": "invalid_enum_value",
    "options": [
      "TENDER",
      "PRE_SOLICITATION",
      "GRANT",
      "TAX_INCENTIVE",
      "EQUITY",
      "DEBT_GUARANTEE",
      "PRIZE",
    
- **worldbank-afdb-ebrd** — OK · 1 kept, 0 dropped · page: 8534 chars, 356 link(s) — followed "https://projects.worldbank.org/en/projects-operations/procurement-detail/OP00468424" (tenders, procurement)

## Calls
- **4ème Programme d’investissements d’avenir - PIA 4** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/4eme-programme-dinvestissements-davenir-pia-4/
  - amount: 20 milliards d’euros · deadline: —
- **ACTEE - Action des Collectivités Territoriales pour l’Efficacité Energétique** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/actee-action-des-collectivites-territoriales-pour/
  - amount: — · deadline: —
- **Action cœur de ville** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/action-cur-de-ville/
  - amount: — · deadline: —
- **Actions pour la Relance (complémentaires à France Relance)** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/actions-pour-la-relance-hors-france-relance/
  - amount: — · deadline: —
- **EUROPE - AGRIP - Promotion des produits agricoles** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/agrip-promotion-des-produits-agricoles/
  - amount: — · deadline: —
- **EUROPE - Biodiversa +** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/biodiversa/
  - amount: — · deadline: —
- **Cités éducatives** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/cites-educatives/
  - amount: — · deadline: —
- **EUROPE - CERV - Citoyenneté, Egalité, Droits et Valeurs** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/citoyennete-egalite-droits-et-valeurs/
  - amount: — · deadline: —
- **EUROPE - CES - Corps européen de solidarité** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/corps-europeen-de-solidarite/
  - amount: — · deadline: —
- **EUROPE - COSME - Programme européen pour la compétitivité des entreprises** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/cosme-fonds-europeens/
  - amount: — · deadline: —
- **Destination France** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/destination-france/
  - amount: — · deadline: —
- **EUROPE - EaSI - Programme européen pour l'emploi et l'innovation sociale** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/easi-programme-europeen-pour-lemploi-et-linnovatio/
  - amount: — · deadline: —
- **ÉcoQuartier** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/ecoquartier/
  - amount: — · deadline: —
- **EduRénov** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/edurenov/
  - amount: — · deadline: —
- **EUROPE - EIT Food** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/eit-food/
  - amount: — · deadline: —
- **EUROPE - EIT Manufacturing** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/eit-manufacturing/
  - amount: — · deadline: —
- **EUROPE - Erasmus +** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/erasmus/
  - amount: — · deadline: —
- **EUROPE - EUCF - EU City Facility** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/eu-city-facility/
  - amount: — · deadline: —
- **EUROPE - EPSON - European Observation Network for Territorial Development and Cohesion** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/european-observation-network-for-territorial-development-and-cohesion-epson/
  - amount: — · deadline: —
- **EUROPE - Europe Créative** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/europe-creative/
  - amount: — · deadline: —
- **EUROPE - Digital Europe - Europe Numérique** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/europe-numerique/
  - amount: — · deadline: —
- **EUROPE - FEADER - Fonds européen agricole pour le développement rural** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/feader/
  - amount: — · deadline: —
- **EUROPE - FEAMPA - Fonds européen pour les affaires maritimes, la pêche et l'aquaculture** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/feamp-fonds-europeen-pour-les-affaires-maritimes-e/
  - amount: — · deadline: —
- **EUROPE - FEDER - Fonds européen de développement régional** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/feder-fonds-europeens-de-developpement-regional/
  - amount: — · deadline: —
- **EUROPE - AMIF - Fonds Asile, Migration et Intégration** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-asile-migration-et-integration/
  - amount: — · deadline: —
- **Fonds Biodiversité** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-biodiversite/
  - amount: — · deadline: —
- **EUROPE - FED - Fonds Européen de Défense** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-europeen-de-defense/
  - amount: — · deadline: —
- **EUROPE - FSI - Fonds pour la Sécurité Intérieure** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-pour-la-securite-interieure/
  - amount: — · deadline: —
- **EUROPE - InnovFund - Fonds pour l'innovation 2020-2030** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-pour-linnovation-2020-2030/
  - amount: — · deadline: —
- **EUROPE - FTJ - Fonds pour une transition juste** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-pour-une-transition-juste-ftj/
  - amount: — · deadline: —
- **Fonds vert - Édition 2026** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-vert/
  - amount: 200 millions d'euros · deadline: —
- **Fonds vert Ingénierie** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fonds-vert-ingenierie/
  - amount: — · deadline: —
- **France 2030** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/france-2030/
  - amount: 30 milliards d’euros · deadline: —
- **France Mobilités** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/france-mobilites/
  - amount: — · deadline: —
- **France Relance** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/france-relance/
  - amount: — · deadline: —
- **France Ruralités** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/france-ruralites/
  - amount: — · deadline: —
- **EUROPE - FSE + - Fonds social européen** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/fse-fonds-social-europeen/
  - amount: — · deadline: —
- **EUROPE - Horizon Europe** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/horizon-europe/
  - amount: — · deadline: —
- **EUROPE - IVCDCI - Instrument de Voisinage, de Coopération au Développement et de Coopération Internationale** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/instrument-de-voisinage-de-cooperation-au-developp/
  - amount: — · deadline: —
- **EUROPE - Interreg - Fonds européens** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/interreg/
  - amount: — · deadline: —
- **EUROPE - Interreg Europe** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/interreg-europe/
  - amount: — · deadline: —
- **EUROPE - Interreg France-Suisse** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/interreg-france-suisse/
  - amount: — · deadline: —
- **EUROPE - InvestEU** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/investeu/
  - amount: — · deadline: —
- **EUROPE - LEADER - Liaison entre Actions de Développement de l’Économie Rurale** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/leader/
  - amount: — · deadline: —
- **EUROPE - LIFE - Programme européen pour l'environnement et le climat** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/life/
  - amount: — · deadline: —
- **EUROPE - Lignes de prérogatives sociales et de compétences spécifiques - 2021-2027** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/lignes-de-prerogatives-sociales-et-de-competences/
  - amount: — · deadline: —
- **EUROPE - EU4Health - L'UE pour la santé** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/lue-pour-la-sante/
  - amount: — · deadline: —
- **EUROPE - Mécanisme de protection civile** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/mecanisme-de-protection-civile/
  - amount: — · deadline: —
- **EUROPE - MIE - Mécanisme pour l'interconnexion en Europe** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/mecanisme-pour-linterconnexion-en-europe/
  - amount: — · deadline: —
- **Mission Société Numérique** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/mission-societe-numerique/
  - amount: — · deadline: —
- **Nouveaux lieux, nouveaux liens** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/nouveaux-lieux-nouveaux-liens/
  - amount: — · deadline: —
- **EUROPE - PERICLES IV** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/pericles-iv/
  - amount: — · deadline: —
- **Petites villes de demain** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/petites-villes-de-demain/
  - amount: — · deadline: —
- **Plan France Très Haut Débit** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/plan-france-tres-haut-debit/
  - amount: — · deadline: —
- **EUROPE - EUAF - Programme Anti-Fraude 2021-2027** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/programme-anti-fraude-2021-2027/
  - amount: — · deadline: —
- **EUROPE - SMP - Programme du marché unique** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/programme-du-marche-unique/
  - amount: 4,2 milliards d’euros · deadline: —
- **EUROPE - Programme Justice 2021-2027** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/programme-justice-2021-2027/
  - amount: — · deadline: —
- **EUROPE - Promotion des produits agricoles** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/promotion-des-produits-agricoles/
  - amount: — · deadline: —
- **QPV - Quartiers Prioritaires de la politique de la Ville** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/qpv-quartiers-prioritaires-de-la-politique-de-la-ville/
  - amount: — · deadline: —
- **Renaturation des villes** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/renaturation-des-villes/
  - amount: — · deadline: —
- **Avenir Montagnes** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/ruralite-montagne-anct/
  - amount: — · deadline: —
- **Terres Mers Ultra-Marines (Te Me Um)** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/terres-mers-ultra-marines-te-me-um/
  - amount: — · deadline: —
- **Territoires d'industrie** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/territoires-dindustrie/
  - amount: — · deadline: —
- **Tourisme Ingénierie Développement** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/tourisme-ingenierie-developpement/
  - amount: — · deadline: —
- **EUROPE - URBACT** (GRANT) — beta.gouv.fr / French state
  - https://aides-territoires.beta.gouv.fr/programmes/urbact/
  - amount: — · deadline: —
- **Consultancy services for the feasibility study, detailed design, tender document preparation, construction supervision, & contract administration for the Gidabo Left Bank New Irrigation Development project** (GRANT) — Multilateral development banks
  - https://projects.worldbank.org/en/projects-operations/procurement-detail/OP00468424
  - amount: — · deadline: Oct 05, 2026 04:30

> Every call above was read by a model and is UNVERIFIED. Each is anchored to a link that
> really appears on the page it was read from — that is a check, not a promise — but a human
> still has to open it. Nothing here can reach PURSUE on its own.

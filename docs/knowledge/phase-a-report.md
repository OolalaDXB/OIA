# Knowledge Layer — Phase A : compte rendu de livraison (14/08/2026)

Mandat « BAWABA Knowledge Base, Capability Registry & Agentic Document
System » — V1 volontairement simple (§31) : repo + schémas + docs canoniques
+ registry + validation + lecteur OIA + tests. Zéro agent (Phase C), zéro MCP
décoratif (§23).

## Décision de cadrage

Espace isolé `knowledge/` dans le repo OIA (le mandat l'autorise ; mon accès
GitHub est scopé à OolalaDXB/OIA). Structure transverse dès le départ
(products/ capabilities/ entities/ evidence/ policies/…) et auto-contenue :
l'extraction future vers un repo `oolala-knowledge` dédié est un déplacement
de dossier, pas une migration.

## Les 14 livrables Phase A (§33)

1. **Architecture canonique** : `knowledge/` docs-as-code, README doctrine.
2. **Schémas** : `@oia/knowledge` (Zod) — Fact (provenance §18, lifecycle
   §19, disclosure §9-10), Capability (statuts §28, maturité de preuve §29),
   Entity (product ≠ entité, delivery MOBILISABLE vs DEDICATED §8),
   EvidenceItem, DisclosurePolicy, Product.
3. **Dossier BAWABA canonique** : product.yaml + facts.yaml + les 9 docs
   Niveau 1 (§15) — positionnement exact (§6), architecture CIBLE jamais
   présentée comme démontrée.
4. **Inventaire entités** : Oolala Next (ACTIVE, UAE), Oolala France
   (ACTIVE, FR), KM Openpay (ACTIVE, partenaire), BAWABA (PLANNED, SANS
   juridiction — location follows money, §7).
5. **KM Openpay modélisé** (§8) : `deliveryCapacity: {type: MOBILISABLE,
   headcount: "70+"}` distinct d'une équipe dédiée ; capacité réelle actée.
6. **Disclosure policy machine-readable** (§9-10) : Dixio interdit externe
   (aucun chemin d'override en code), participation KM internal-only
   (patterns), claims interdits (ADGM/incorporation, certifications).
7. **Capability registry initial** : 8 briques honnêtes — decision-api et
   evidence-audit-plane en EXPERIMENTAL/DECLARED (BAWABA), provenance-fact-
   engine, verification-gate, source-discovery-connectors en TESTED (OIA,
   preuves réelles), tenant-isolation-rls-guard et identity-and-permissions
   (multi-produits TheStudio), payments-integration (partenariat KM,
   CUSTOMER_USED avec limites explicites).
8. **Mapping Oolala Starter → capabilities** : premier passage via usedBy
   (sillon/myoolala/maisons-co) — à enrichir en Phase B.
9. **Modèle evidence** (§29) : DECLARED → … → INDEPENDENTLY_VERIFIED,
   4 items inventoriés, gaps BAWABA nommés dans evidence.md.
10. **Validation** : `pnpm --filter @oia/knowledge validate` — références,
    règles d'honnêteté (DECLARED exige une limitation ; PROVEN+ exige une
    preuve ; INFERRED jamais CANONICAL ; CANONICAL exige approvedBy ;
    PLANNED sans juridiction ; noms interdits absents des surfaces externes).
11. **API de lecture minimale** (§22, §26) : getProduct, getCapabilities,
    getCapability, getEvidence(+ForCapability), getEligibleEntities,
    getExternalSafeFacts, getTenderCapabilities, checkClaim, checkDisclosure,
    composeSolution. Déterministe, zéro LLM.
12. **Intégration OIA en lecture** (§27, §37) :
    `apps/workers/src/qualify-with-knowledge.ts` — critères de tender →
    « ce qu'on peut réellement proposer » (produit + briques avec
    statut/maturité/preuves/limites + route d'éligibilité + capacité KM +
    gaps), sortie dans knowledge/generated/ estampillée commit (§21), passée
    au gate disclosure avant écriture (dogfooding §30 minimal).
13. **Tests** : 17 tests §32 — provenance obligatoire, internal-only jamais
    externe, multi-produits, composition, KM (70+ externe OK / actionnariat
    bloqué), « BAWABA is an ADGM company » FORBIDDEN, Dixio bloqué, critère
    §37 de bout en bout. Suite monorepo entière verte.
14. **Documentation** : knowledge/README.md (doctrine + règles d'édition) +
    ce rapport.

## Preuve §37 (exécutée sur les critères exacts du mandat)

`knowledge/generated/solution-2026-08-14.md` : BAWABA + RLS Guard + Identity
+ payments-KM + route Oolala France + capacité KM 70+, avec 3 gaps explicites
(Decision API et evidence plane DECLARED sans preuve ; « EU delivery
capability » couvert par la route entité, pas par une brique — ne pas le
revendiquer comme capability).

## Suites

- **Phase B** : dossiers SILLON/BEAU/myOolala/Maisons.co, people/, catalogue
  de briques enrichi depuis Oolala Starter, détecteur STALE_DOCUMENT,
  génération de documents.
- **Phase C** : MCP sur les fonctions existantes, agents (Curator, Analyst,
  Composer, Writer, Disclosure Reviewer, Evidence Gap Analyst).
- **À faire par Mickael** : relire facts.yaml / capabilities.yaml (tout est
  FOUNDER_DECLARED d'après le mandat — corriger ce qui est faux, c'est UN
  fichier par type), et fournir les localisateurs réels des repos TheStudio
  pour ev-rls-guard-repo.

# ADR 0002 · WhatsApp, cadrage

- Statut : proposé le 2026-11-08, à valider par Mickaël.
- Références : mandat v6, B4 ; `docs/shyrka/CADRE.md` ; code :
  `infra/shyrka/src/whatsapp.ts` (interface et version fictive, rien d'autre).

## Numéros professionnels (Maisons.co, Coach Gari) : API officielle WhatsApp Business

**Circuit d'inscription :**
1. Un compte Meta Business vérifié.
2. Une application dans Meta for Developers, avec le produit WhatsApp.
3. Un numéro dédié, qui ne peut pas rester en même temps sur l'application
   WhatsApp ordinaire.
4. Un nom d'affichage approuvé par Meta.
5. Des modèles de message approuvés pour écrire en premier.
6. Un webhook pour recevoir les messages.

**Coûts, à vérifier par Mickaël** sur la page de tarification de Meta. La
facturation se fait par message, selon la catégorie (service, utilitaire,
marketing) et le pays. Les réponses dans la fenêtre de 24 h ouverte par le
client ont été gratuites ou peu chères selon les périodes : à confirmer le jour
de l'inscription.

**Limites :**
- Un message libre seulement dans les 24 h qui suivent le dernier message du
  client ; au-delà, un modèle approuvé.
- Des plafonds de volume qui augmentent avec la qualité du numéro.
- Un webhook qui exige un serveur joignable, que la session web n'a pas.

**Décision :** pas de mise en œuvre avant que Mickaël valide l'inscription et
les coûts. L'adaptateur réel suivra l'interface `AdaptateurWhatsApp`, au
palier de permission en vigueur : WhatsApp est au palier 0 aujourd'hui.

## Numéro personnel : aucune automatisation

Les outils non officiels (automatisation de WhatsApp Web, bibliothèques
d'ingénierie inverse) enfreignent les conditions de WhatsApp et exposent le
numéro à un bannissement. **Décision : aucune automatisation.** Shyrka propose
une réponse, que Mickaël copie et colle lui-même.

## Code

- `AdaptateurWhatsApp` : lister les messages d'un numéro professionnel,
  proposer une réponse. Pas d'envoi.
- `WhatsAppFictif` : version fictive pour les tests (`infra/shyrka/test/voix.test.ts`).

# ADR 0003 · Réseaux sociaux : accès officiels uniquement

**Statut** : proposé le 2026-11-07, à valider par Mickaël. Les réseaux
sociaux deviennent un pilier d'OIA Visibility (famille N du modèle de
vérification, `infra/visibility/verification/n-reseaux-sociaux.yaml`).

## Décision

1. **Accès officiels seulement.** OIA lit un profil Instagram ou TikTok
   uniquement par l'API officielle de la plateforme, avec l'autorisation
   explicite du titulaire du compte (connexion OAuth faite par lui). Pas
   d'aspiration, pas de navigateur automatisé, pas d'API non officielle,
   pas de compte prête-nom, pas de contournement de limite.
2. **Lecture seule.** Aucune publication, aucun message, aucun
   commentaire, aucune modification de profil.
3. **Interfaces et versions simulées d'abord.** Les adaptateurs
   (`infra/visibility/src/social/`) exposent un contrat unique
   (`SocialProfileReader`) avec des versions simulées sur données fictives.
   Les versions réelles ne sont pas écrites : elles refusent de
   s'exécuter tant que la présente décision n'est pas validée et que les
   comptes développeur ne sont pas ouverts.
4. **Hors réseaux sociaux, pendant une fenêtre de mesure** : aucune
   modification dans Elmo. Les citations de profils sont comptées par la
   réanalyse OIA (contrôle N06), parce qu'Elmo 0.7.7 ne classe les
   citations qu'à l'hôte près.

## Ce que permettent les accès officiels

Vérifié sur la documentation officielle le 2026-11-07 ; les champs exacts
et les permissions sont **à reconfirmer** au moment de l'activation.

| | Instagram (Meta) | TikTok |
|---|---|---|
| Produit | Instagram API, connexion « Instagram Login » (sans Page Facebook, appels vers `graph.instagram.com`) ou « Facebook Login for Business » (compte lié à une Page) | Display API, autorisation par Login Kit |
| Comptes pris en charge | Comptes **professionnels** (entreprise ou créateur) seulement | Compte de l'utilisateur qui autorise |
| Permissions | `instagram_business_basic` (Instagram Login) ; `instagram_basic`, `pages_show_list`, `pages_read_engagement` (Facebook Login) ; statistiques : `instagram_manage_insights` côté Facebook Login | `user.info.basic` (open_id, avatar, nom affiché), `video.list` (vidéos publiques récentes) ; biographie et lien de profil (`bio_description`, `profile_deep_link`) : portée exacte à confirmer |
| Lisible | Profil (nom, pseudonyme, biographie, site, compteurs), publications (légende, date, lien), statistiques selon permission | Profil (nom affiché, biographie, lien de profil), vidéos récentes et leurs métadonnées |
| Contrôles servis | N01, N02, N04, N05 | N01, N02, N04, N05 |
| Limites | Quotas par application et par utilisateur (fenêtre de 24 h) | Quotas publiés dans la documentation TikTok, à relever |

L'API Research de TikTok est réservée à la recherche académique : elle ne
s'applique pas à OIA.

## Conditions à réunir avant toute connexion réelle (à valider par Mickaël)

1. **Compte Instagram professionnel** pour chaque marque mesurée (le
   passage d'un compte personnel à un compte créateur est gratuit et
   réversible, mais il change l'affichage du profil : décision du
   titulaire).
2. **Application Meta** (developers.facebook.com) et **application
   TikTok** (developers.tiktok.com) au nom de l'entité qui exploite OIA.
   Elles demandent une politique de confidentialité publiée et une URL de
   redirection.
3. **Accès standard ou avancé.** L'accès standard couvre les comptes dont
   l'application est propriétaire ou que gèrent ses rôles : il suffit pour
   les marques internes. Pour un **client externe**, l'accès avancé exige
   l'examen de l'application (App Review) et la vérification de
   l'entreprise chez Meta. L'examen de l'application est aussi requis
   chez TikTok.
4. **Consentement écrit du titulaire** dans le contrat client : quelles
   données sont lues, pour combien de temps, et révocation possible à tout
   moment depuis la plateforme.
5. **Stockage** : les jetons d'accès sont des secrets, rangés comme les
   clés des fournisseurs d'IA (`infra/visibility/SECRETS.md`), jamais dans
   le dépôt. Les données lues restent hors du dépôt, avec les autres
   données de client.

## Coûts

La documentation consultée ne mentionne **aucun tarif** pour ces API.
Coûts indirects possibles, à valider par Mickaël : temps de mise en
place des applications et de l'examen, éventuel hébergement de la
politique de confidentialité, vérification de l'entreprise chez Meta.
Aucune dépense n'est engagée par cette décision.

## Conséquences

- Les contrôles N01, N02, N04 et N05 restent **à vérifier** (manuels)
  tant que les accès ne sont pas branchés. N03 (sameAs) passe par Crawlie,
  et N06 (citations des profils) par la réanalyse OIA des réponses déjà
  collectées : ces deux contrôles ne demandent aucun accès aux
  plateformes.
- Un profil non autorisé par son titulaire n'est jamais lu, même public.

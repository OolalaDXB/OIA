# Panel proposé (B3) · Maisons.co · 2026-11-08

Généré par `pnpm --filter @oia/visibility-infra subjects panel propose maisons-co 2026-11-08 --write`. Statut : **proposition**, à relire par Mickaël et à valider avec `visibility panel validate` + `OIA_SEO_HUMAN_IDENTITY`.

## Fichier

- `panel.proposal.v2.yaml` (20 questions, 10 FR + 10 EN, statut `proposed`).
- Le `panel.yaml` existant (v1 draft, inchangé) reste la version active jusqu'à validation du v2.

## Répartition

Répartition par défaut B2 appliquée par langue :

| Intention | FR | EN |
|---|---|---|
| decouverte | 3 | 3 |
| prix_offre | 2 | 2 |
| comparaison | 1 | 1 |
| niche_local | 2 | 2 |
| marquee (branded) | 2 | 2 |
| **Total** | **10** | **10** |

## Concurrents candidats (déjà dans `subject.yaml`)

Six concurrents sont déjà déclarés dans `subject.yaml` avec leur raison (`rationale`), tous au statut `proposed` :

- Airbnb — canal dominant cité pour la location de maisons, Bretagne comme Gudauri.
- Booking.com — très cité pour l'hébergement à Gudauri.
- Abritel — référence location de maisons de vacances en France.
- Gîtes de France — cité systématiquement pour les gîtes du Morbihan intérieur.
- Clévacances — label de location saisonnière très présent en Bretagne.
- HostnFly — conciergerie nationale souvent citée pour « conciergerie Airbnb » ; présence Morbihan à vérifier.

Ces six concurrents n'apparaissent pas encore dans les textes des questions : la répartition par défaut met l'intention `comparaison` sur une seule question par langue, et le gabarit actuel est générique (« How do providers of {offer} compare in {market} ? »). Deux choix pour les enrichir :

1. **Édition manuelle** du `panel.proposal.v2.yaml` par Mickaël, en nommant un concurrent par question `comparaison`.
2. **Deuxième passe LLM** avec `--llm` (quand G1 branchera un modèle réel) pour réécrire les questions `comparaison` en injectant les concurrents candidats.

## Limitations connues

- **Offres non structurées** : le champ `targetOffer` du générateur reçoit « the service » parce que `subject.yaml` ne porte pas encore de liste d'offres (`aliases.kind: "offer"` est utilisé comme pis-aller). La question en attente « Noms commerciaux des offres (location, conciergerie, Collection ?) » du `subject.yaml` est bloquante pour une v2 utilisable : à préciser avant validation. Un alias `kind: offer` par offre réelle suffirait pour la prochaine passe du générateur.
- **Marchés à libellé long** : « Quistinic, Morbihan et Bretagne (location et conciergerie) » apparaît tel quel dans les questions parce que le générateur reprend `markets[*].label`. Mickaël peut souhaiter raccourcir dans `subject.yaml`, ou réécrire les questions à la main.
- **Pas de LLM cette nuit** : les questions sont sèches, délibérément. Le point de branchement `VisibilityLLM.reformulate` existe et pourra adoucir tout ça quand G1 sera activé.

## Diagnostic sur le panel validé de Coach Gari (pour mémoire)

Lancée via `subjects validate` : « ok coach-gari (panel v2 validated, 10 questions actives) ». Le panel validé reste **strictement intact** (voir B1 : tests de compatibilité rechargent chaque `panel.yaml` à l'identique). Aucune règle B1 ne détecte d'écart.

## Prochaine étape

Quand Mickaël veut valider :

```
export OIA_SEO_HUMAN_IDENTITY=mt
pnpm --filter @oia/visibility-infra subjects panel validate maisons-co \
  subjects/maisons-co/panel.proposal.v2.yaml
```

Ceci écrit `panel.validated.v2.yaml` à côté. Mickaël le renomme en `panel.yaml` quand il veut en faire la version active (voir `docs/visibility/preparer-un-panel.md` pour la procédure complète).

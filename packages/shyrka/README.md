# @oia/shyrka-noyau

Noyau de Shyrka, indépendant de toute application hôte (mandat v8, bloc C ;
`docs/shyrka/adr/0003-shyrka-autonome.md`). Version simulée, en mémoire,
locale : aucun stockage réel, aucun appel réseau.

- `creerNoyau()` rend trois accès séparés : `noyau` (enregistrement des
  applications hôtes), `mickael` (permissions, validation, oubli, mode privé,
  sauvegarde, export), `shyrka` (identité, copies dérivées).
- `vuesShyrkaV1()` sert les onglets de la zone Contexte
  (`docs/interface/contrat-donnees-shyrka.md`).

Le dossier s'appelle `packages/shyrka`, comme le demande le mandat. Le nom
`@oia/shyrka` est déjà celui de Shyrka v0 (`infra/shyrka`).

```sh
pnpm --filter @oia/shyrka-noyau test
```

Régénérer la démonstration figée : `OIA_ECRIRE_DEMO=1 pnpm --filter @oia/shyrka-noyau test`.

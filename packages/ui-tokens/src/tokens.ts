/**
 * Jetons de design d'OIA · style « Salon, version sobre ».
 *
 * Source unique : ce fichier. `tokens.css` en est généré (`pnpm --filter
 * @oia/ui-tokens css`) et un test vérifie qu'il est à jour.
 *
 * Valeurs reprises du prototype Lovable « OIA Dashoard » (styles.css, commit
 * c6470e86) : fond blanc, encre bleu nuit, gris froids, accents sourds. Les
 * couleurs sont en oklch, comme dans le prototype.
 */

/** Couleurs de base de l'interface. */
export const couleurs = {
  fond: "oklch(1 0 0)",
  encre: "oklch(0.207 0.031 265)",
  carte: "oklch(1 0 0)",
  primaire: "oklch(0.278 0.03 257)",
  primaireTexte: "oklch(1 0 0)",
  attenue: "oklch(0.97 0.004 265)",
  texteAttenue: "oklch(0.446 0.03 257)",
  tertiaire: "oklch(0.551 0.027 264)",
  bordure: "oklch(0.928 0.006 265)",
  champ: "oklch(0.87 0.012 265)",
  anneau: "oklch(0.372 0.03 260)",
  piste: "oklch(0.97 0.004 265)",
  barre: "oklch(0.372 0.03 260)",
  destructif: "oklch(0.55 0.09 25)",
} as const;

/** Points d'état, désaturés : ils se lisent sans crier. */
export const etats = {
  conforme: "oklch(0.62 0.045 160)",
  verifier: "oklch(0.65 0.06 75)",
  bloquant: "oklch(0.53 0.09 25)",
} as const;

/**
 * Couleurs sourdes par module. Les clés suivent la navigation proposée par le
 * mandat v7 (F2) ; les modules du prototype qui y sont regroupés gardent leur
 * teinte d'origine (Opportunités reprend celle de Funding).
 */
export const modules = {
  visibility: "oklch(0.462373 0.055433 245.539226)",
  opportunites: "oklch(0.564883 0.049636 156.519703)",
  crm: "oklch(0.529808 0.051113 268.175454)",
  portefeuille: "oklch(0.518526 0.071025 38.498519)",
  data: "oklch(0.561963 0.028981 84.557025)",
  training: "oklch(0.562271 0.046249 59.523245)",
  personnel: "oklch(0.538275 0.043548 291.412159)",
  // Teintes du prototype conservées pour les sous-ensembles d'Opportunités.
  tenders: "oklch(0.602318 0.071609 75.419472)",
  signals: "oklch(0.509286 0.052596 202.538812)",
} as const;

/** Shyrka : nuit, lumière, particules. */
export const shyrka = {
  nuit: "oklch(0.191770 0.035371 261.303071)",
  lumiere: "oklch(0.88 0.065 215)",
  particule: "oklch(0.66 0.18 250)",
} as const;

export const typographie = {
  famille: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  graisseTitre: 500,
  approcheTitre: "0",
  chiffres: "tabular-nums",
} as const;

export const rayons = {
  base: "6px",
  petit: "2px",
  moyen: "4px",
  grand: "10px",
} as const;

export const ombres = {
  carte: "0 1px 2px rgba(16, 24, 40, 0.06)",
} as const;

export const tokens = { couleurs, etats, modules, shyrka, typographie, rayons, ombres } as const;
export type Module = keyof typeof modules;
export type Etat = keyof typeof etats;

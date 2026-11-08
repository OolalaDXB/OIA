// Données fictives de Money Lookup.
export type TypeOpp = "Financement" | "Appel d'offres" | "Investisseur";
export type TypeMontant = "Subvention" | "Chiffre d'affaires contractuel potentiel" | "Investissement en capital" | "Prêt" | "Aide fiscale" | "Montant inconnu";
export type Verification = "Vérifié" | "Non vérifié";
export type Opportunite = {
  id: string; titre: string; type: TypeOpp; organisme: string; publication: string; cloture: string | null;
  joursRestants: number | null; eligibilite: "Éligible" | "À confirmer" | "Non éligible"; recommandation: "Prioritaire" | "À étudier" | "Écarter";
  verification: Verification; entite: string; fraicheur: "Moins de 7 jours" | "Moins de 30 jours" | "Plus ancien"; statut: "À trier" | "En cours" | "En retard";
  montant: number | null; devise: "EUR" | "USD" | "AED"; typeMontant: TypeMontant;
  faits: { fait: string; source: string }[]; suggestions: { projet: string; score: number; raison: string }[];
  sources: string[]; notes: string[]; taches: string[];
};

export const projets = ["OIA", "Studio Ardoise", "Atlas Données", "Programme Formation"] as const;
export const typesMontant: TypeMontant[] = ["Subvention", "Chiffre d'affaires contractuel potentiel", "Investissement en capital", "Prêt", "Aide fiscale", "Montant inconnu"];

export const opportunites: Opportunite[] = [
  { id: "m1", titre: "Aide à l'innovation numérique", type: "Financement", organisme: "Bpifrance", publication: "12 oct. 2026", cloture: "15 nov. 2026", joursRestants: 8, eligibilite: "Éligible", recommandation: "Prioritaire", verification: "Vérifié", entite: "OIA SAS", fraicheur: "Moins de 30 jours", statut: "En cours", montant: 30000, devise: "EUR", typeMontant: "Subvention",
    faits: [{ fait: "Subvention jusqu'à 30 000 €", source: "bpifrance.fr/aide-innovation" }, { fait: "Clôture le 15 nov. 2026 à midi", source: "bpifrance.fr/aide-innovation" }],
    suggestions: [{ projet: "OIA", score: 86, raison: "Produit logiciel innovant, équipe de moins de 10 personnes." }, { projet: "Atlas Données", score: 61, raison: "Composante données, mais maturité faible." }],
    sources: ["bpifrance.fr/aide-innovation"], notes: ["Dossier commencé, budget à finaliser."], taches: ["Rédiger l'annexe technique"] },
  { id: "m2", titre: "Marché public : refonte du site de l'office de tourisme", type: "Appel d'offres", organisme: "Golfe du Morbihan Vannes Agglomération", publication: "28 oct. 2026", cloture: "12 nov. 2026", joursRestants: 5, eligibilite: "À confirmer", recommandation: "À étudier", verification: "Non vérifié", entite: "OIA SAS", fraicheur: "Moins de 30 jours", statut: "À trier", montant: 45000, devise: "EUR", typeMontant: "Chiffre d'affaires contractuel potentiel",
    faits: [{ fait: "Montant estimé 45 000 € HT", source: "marches-publics.gouv.fr/avis-2026-1182" }],
    suggestions: [{ projet: "Studio Ardoise", score: 42, raison: "Expérience de site local, mais pas de référence publique." }, { projet: "OIA", score: 58, raison: "Volet visibilité dans les IA demandé dans le cahier des charges." }],
    sources: ["marches-publics.gouv.fr/avis-2026-1182"], notes: [], taches: ["Lire le règlement de consultation"] },
  { id: "m3", titre: "Fonds d'amorçage Bretagne Tech", type: "Investisseur", organisme: "Breizh Ventures", publication: "3 nov. 2026", cloture: null, joursRestants: null, eligibilite: "À confirmer", recommandation: "À étudier", verification: "Non vérifié", entite: "OIA SAS", fraicheur: "Moins de 7 jours", statut: "À trier", montant: null, devise: "EUR", typeMontant: "Investissement en capital",
    faits: [{ fait: "Tickets annoncés entre 200 000 et 800 000 €", source: "breizhventures.fr/fonds" }],
    suggestions: [{ projet: "OIA", score: 64, raison: "Stade amorçage, thèse logicielle B2B." }],
    sources: ["breizhventures.fr/fonds"], notes: ["Montant exact inconnu tant qu'aucun échange n'a eu lieu."], taches: [] },
  { id: "m4", titre: "Prêt d'honneur création", type: "Financement", organisme: "Initiative Pays de Vannes", publication: "1 sept. 2026", cloture: "31 oct. 2026", joursRestants: -7, eligibilite: "Éligible", recommandation: "Prioritaire", verification: "Vérifié", entite: "Studio Ardoise", fraicheur: "Plus ancien", statut: "En retard", montant: 15000, devise: "EUR", typeMontant: "Prêt",
    faits: [{ fait: "Prêt à taux zéro jusqu'à 15 000 €", source: "initiative-vannes.fr" }],
    suggestions: [{ projet: "Studio Ardoise", score: 79, raison: "Création récente, ancrage local." }],
    sources: ["initiative-vannes.fr"], notes: ["Date dépassée, vérifier la session suivante."], taches: ["Appeler le chargé d'accompagnement"] },
  { id: "m5", titre: "Crédit d'impôt innovation 2026", type: "Financement", organisme: "Direction générale des Finances publiques", publication: "15 janv. 2026", cloture: "31 déc. 2026", joursRestants: 54, eligibilite: "À confirmer", recommandation: "À étudier", verification: "Non vérifié", entite: "OIA SAS", fraicheur: "Plus ancien", statut: "En cours", montant: null, devise: "EUR", typeMontant: "Aide fiscale",
    faits: [{ fait: "Taux de 30 % des dépenses éligibles", source: "impots.gouv.fr/cii" }],
    suggestions: [{ projet: "OIA", score: 70, raison: "Dépenses de conception de prototype." }],
    sources: ["impots.gouv.fr/cii"], notes: [], taches: ["Lister les dépenses éligibles"] },
  { id: "m6", titre: "Programme d'accélération Dubai AI", type: "Investisseur", organisme: "Dubai Future Foundation", publication: "30 oct. 2026", cloture: "20 nov. 2026", joursRestants: 13, eligibilite: "À confirmer", recommandation: "À étudier", verification: "Non vérifié", entite: "OIA FZ", fraicheur: "Moins de 30 jours", statut: "À trier", montant: 100000, devise: "USD", typeMontant: "Investissement en capital",
    faits: [{ fait: "Jusqu'à 100 000 USD contre participation", source: "dubaifuture.ae/accelerator" }],
    suggestions: [{ projet: "OIA", score: 55, raison: "Produit IA, entité locale existante." }],
    sources: ["dubaifuture.ae/accelerator"], notes: [], taches: [] },
  { id: "m7", titre: "Formation des dirigeants au numérique", type: "Appel d'offres", organisme: "CCI Bretagne", publication: "5 nov. 2026", cloture: "28 nov. 2026", joursRestants: 21, eligibilite: "Éligible", recommandation: "À étudier", verification: "Non vérifié", entite: "OIA SAS", fraicheur: "Moins de 7 jours", statut: "À trier", montant: null, devise: "EUR", typeMontant: "Montant inconnu",
    faits: [{ fait: "Lot 2 : visibilité en ligne des TPE", source: "cci-bretagne.fr/consultations" }],
    suggestions: [{ projet: "Programme Formation", score: 73, raison: "Contenu de formation déjà esquissé." }],
    sources: ["cci-bretagne.fr/consultations"], notes: [], taches: [] },
];

export const signals = [
  { date: "7 nov. 2026, 08:10", texte: "Nouvel appel d'offres CCI Bretagne : formation des dirigeants au numérique.", source: "cci-bretagne.fr" },
  { date: "6 nov. 2026, 17:42", texte: "Bpifrance a modifié l'heure de clôture de l'aide à l'innovation numérique.", source: "bpifrance.fr" },
  { date: "5 nov. 2026, 11:05", texte: "Breizh Ventures annonce un nouveau fonds d'amorçage.", source: "breizhventures.fr" },
  { date: "3 nov. 2026, 09:30", texte: "Dubai Future Foundation ouvre une cohorte IA.", source: "dubaifuture.ae" },
];

/** Montant affichable : un montant inconnu n'est jamais zéro. */
export function formatMontant(montant: number | null, devise: string) {
  if (montant === null) return "inconnu";
  return `${new Intl.NumberFormat("fr-FR").format(montant)} ${devise === "EUR" ? "€" : devise}`;
}

/** Sous-totaux par projet, type et devise ; jamais de total qui mélange types ou devises. */
export function sousTotaux(liste: Pick<Opportunite, "montant" | "devise" | "typeMontant">[]) {
  const r = new Map<string, { type: TypeMontant; devise: string; total: number; inconnus: number }>();
  for (const o of liste) {
    const k = `${o.typeMontant}|${o.devise}`;
    const e = r.get(k) ?? { type: o.typeMontant, devise: o.devise, total: 0, inconnus: 0 };
    if (o.montant === null) e.inconnus++; else e.total += o.montant;
    r.set(k, e);
  }
  return [...r.values()];
}

export function versCsv(liste: Opportunite[]) {
  const champs = ["Titre", "Type", "Organisme", "Clôture", "Éligibilité", "Recommandation", "Vérification", "Montant", "Type de montant"];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [champs.join(";"), ...liste.map((o) => [o.titre, o.type, o.organisme, o.cloture ?? "inconnue", o.eligibilite, o.recommandation, o.verification, formatMontant(o.montant, o.devise), o.typeMontant].map(esc).join(";"))].join("\n");
}
export function versMarkdown(liste: Opportunite[]) {
  return ["| Titre | Type | Clôture | Vérification | Montant |", "|---|---|---|---|---|", ...liste.map((o) => `| ${o.titre} | ${o.type} | ${o.cloture ?? "inconnue"} | ${o.verification} | ${formatMontant(o.montant, o.devise)} (${o.typeMontant}) |`)].join("\n");
}

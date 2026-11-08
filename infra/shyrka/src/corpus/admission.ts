import { motifExclusion, type Niveau } from "@oia/shyrka-noyau";

/**
 * Contrôle d'admission d'un document avant tout stockage (mandat Corpus
 * local, § 7). Un détecteur aide, il ne garantit pas : il refuse ce qui est
 * sûrement exclu, et met en QUARANTAINE ce qui est incertain (données de
 * tiers possibles) jusqu'à une décision explicite de Mickaël. Les verdicts ne
 * citent jamais le contenu détecté.
 */

export type Verdict =
  | { decision: "admis"; avertissements: string[] }
  | { decision: "quarantaine"; motifs: string[] }
  | { decision: "refus"; code: string; motif: string };

const REFUS: [RegExp, string, string][] = [
  [/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/, "compte_bancaire", "numéro de compte bancaire (IBAN)"],
  [/\b(?:passeport|passport|carte nationale d'identit[ée]|n° de s[ée]curit[ée] sociale|social security number|numéro fiscal)\b/i, "piece_identite", "pièce d'identité ou numéro administratif"],
  [/\b[12] ?\d{2} ?(?:0[1-9]|1[0-2]) ?\d{2} ?\d{3} ?\d{3}(?: ?\d{2})?\b/, "piece_identite", "numéro de sécurité sociale"],
  [/\bAKIA[0-9A-Z]{16}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{30,}/, "secret", "clé d'accès à un service"],
  [/\b(?:employeur|employer)\b.{0,40}\bswift\b|\bswift\b.{0,40}\b(?:client|confidentiel|interne)\b/i, "swift", "Swift et ses clients sont exclus"],
];

/** Codes de refus du noyau de mémoire, traduits en codes stables. */
function codeExclusion(m: string): string {
  if (/swift/i.test(m)) return "swift";
  if (/carte/.test(m)) return "carte_bancaire";
  return "secret";
}

/** Contrôle de Luhn : tout vrai numéro de carte le vérifie (dates, identifiants et nombres d'exemple, non). */
function luhn(chiffres: string): boolean {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let c = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2) c = c * 2 > 9 ? c * 2 - 9 : c * 2;
    somme += c;
  }
  return somme % 10 === 0;
}
const carteReelle = (t: string) => [...t.matchAll(/\b(?:\d[ -]?){13,19}\b/g)].some((m) => luhn(m[0].replace(/\D/g, "")) && !/^(\d)\1+$/.test(m[0].replace(/\D/g, "")));

/** Valeur d'exemple dans du code ou une documentation : `API_KEY`, `'YOUR_API_KEY'`, `Type.String(`, `process.env.X`, `<clé>`. */
const SECRET = /\b(?:mot de passe|password|passwd|api[_ -]?key|secret)\s*[:=]\s*(\S{4,})/gi;
const exemple = (v: string) => /^['"`]?(?:[A-Z][A-Z0-9_]*|your[_-]?\w*|x{3,}\w*|<[^>]*>?|\*{3,})['"`,]*$/i.test(v) || /[({]|process\.env|^['"`]?(?:z|v|vine|yup|Type|Schema|string|number)\b/.test(v);

export function controler(texte: string, nom = ""): Verdict {
  const tout = `${nom}\n${texte}`;
  for (const [re, code, motif] of REFUS) if (re.test(tout)) return { decision: "refus", code, motif };
  const motifs: string[] = [];
  const exclu = motifExclusion(tout);
  if (exclu) {
    const code = codeExclusion(exclu);
    const secrets = code === "secret" && /ressemble à un secret/.test(exclu) ? [...tout.matchAll(SECRET)].map((m) => m[1]!) : [];
    // Exemples de code seulement : incertain, donc quarantaine et décision de Mickaël ; une valeur réaliste reste refusée.
    if (secrets.length && secrets.every(exemple)) motifs.push("mot de passe ou clé apparemment d'exemple (code, documentation) : vérifie qu'aucun vrai secret n'y figure");
    // Numéro qui ne passe pas le contrôle de Luhn : pas une carte (date, identifiant, nombre d'exemple).
    else if (!(code === "carte_bancaire" && !carteReelle(tout))) return { decision: "refus", code, motif: exclu };
  }

  const courriels = new Set(texte.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []);
  // Format d'un numéro (préfixe + ou 0, groupes séparés) : pas un nombre d'un tableau de mesures.
  const telephones = new Set((texte.match(/(?<!\d|\d[.,])(?:\+\d{1,3}[ .-]?\(?\d{1,4}\)?|\b0\d)(?:[ .-]\d{2,4}){3,5}(?!\d|[.,]\d)/g) ?? []).filter((t) => t.replace(/\D/g, "").length >= 9));
  if (courriels.size >= 3) motifs.push(`${courriels.size} adresses électroniques : données de tiers possibles`);
  if (telephones.size >= 3) motifs.push(`${telephones.size} numéros de téléphone : données de tiers possibles`);
  if (/\b(?:diagnostic|ordonnance|dossier m[ée]dical|patient)\b/i.test(texte)) motifs.push("informations de santé possibles");
  if (/\b(?:salaire de|fiche de paie|bulletin de paie)\b/i.test(texte)) motifs.push("données salariales possibles");
  if (motifs.length) return { decision: "quarantaine", motifs };

  const avertissements: string[] = [];
  if (/<script\b|javascript:/i.test(texte)) avertissements.push("le texte contient du code de page web : il sera affiché comme texte, jamais exécuté");
  return { decision: "admis", avertissements };
}

/**
 * Niveau de confidentialité PROPOSÉ au dépôt (Mickaël le confirme ou le change) : santé, famille,
 * finances personnelles → personnel ; mention de confidentialité ou données de tiers → confidentiel ;
 * documentation publique → public ; document de projet → interne ; sinon, selon le compartiment.
 */
export function proposerNiveau(texte: string, verdict: Verdict, compartiment: string, nom = ""): { niveau: Niveau; raison: string } {
  const t = `${nom}\n${texte}`;
  const motifs = verdict.decision === "quarantaine" ? verdict.motifs.join(" ") : "";
  if (/santé|salariales/.test(motifs) || /\b(?:m[ée]dical|sant[ée]|ordonnance|famille|enfants?|divorce|imp[ôo]ts?|patrimoine|testament|salaire)\b/i.test(t)) return { niveau: "personnel", raison: "santé, famille ou finances personnelles" };
  if (/tiers/.test(motifs) || /\b(?:confidentiel|ne pas diffuser|strictement priv[ée]|secret des affaires|NDA|sous embargo)\b/i.test(t)) return { niveau: "confidentiel", raison: motifs ? "données de tiers possibles" : "le document se dit confidentiel" };
  if (/\b(?:licen[cs]e (?:MIT|Apache|BSD)|communiqu[ée] de presse|README|documentation publique|open source)\b/i.test(t)) return { niveau: "public", raison: "documentation publique" };
  if (compartiment === "personnel") return { niveau: "personnel", raison: "compartiment personnel" };
  return { niveau: "interne", raison: "document de projet" };
}

import type { AuditExterneLigneV3 } from "./visibility-v3";

export type MatriceAudit = {
  id: string;
  sujet: string;
  question: string;
  scores: Record<string, number>;
  concurrents: Record<string, string[]>;
  domaines: Record<string, string[]>;
};

function chaines(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => Boolean(v) && v !== "—") : [];
}

export function matriceDepuisLignes(lignes: AuditExterneLigneV3[], moteurs: string[]): MatriceAudit[] {
  const questions = new Map<string, MatriceAudit & { ordre: number }>();
  for (const ligne of lignes) {
    const id = ligne.question_id ?? `question-${questions.size + 1}`;
    const courant = questions.get(id) ?? {
      id,
      sujet: ligne.sujet ?? id,
      question: ligne.question ?? "",
      ordre: ligne.ordre ?? Number.MAX_SAFE_INTEGER,
      scores: {},
      concurrents: {},
      domaines: {},
    };
    const moteur = ligne.moteur ?? "Moteur inconnu";
    courant.scores[moteur] = typeof ligne.score === "number" ? ligne.score : 0;
    courant.concurrents[moteur] = chaines(ligne.concurrents);
    courant.domaines[moteur] = chaines(ligne.domaines);
    questions.set(id, courant);
  }
  return [...questions.values()]
    .sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id))
    .map(({ ordre: _ordre, ...question }) => ({
      ...question,
      scores: Object.fromEntries(moteurs.map((m) => [m, question.scores[m] ?? 0])),
      concurrents: Object.fromEntries(moteurs.map((m) => [m, question.concurrents[m] ?? []])),
      domaines: Object.fromEntries(moteurs.map((m) => [m, question.domaines[m] ?? []])),
    }));
}

function lignesCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  const source = texte.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (guillemets) {
      if (c === '"' && source[i + 1] === '"') { champ += '"'; i += 1; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i += 1;
      ligne.push(champ); champ = "";
      if (ligne.some((v) => v.trim())) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (guillemets) throw new Error("Le CSV contient des guillemets non fermés.");
  ligne.push(champ);
  if (ligne.some((v) => v.trim())) lignes.push(ligne);
  return lignes;
}

function valeursSeparees(valeur: string, separateur: ";" | ","): string[] {
  if (!valeur.trim() || valeur.trim() === "—") return [];
  return valeur.split(separateur).map((v) => v.trim()).filter((v) => Boolean(v) && v !== "—");
}

export function lireCsvAudit(texte: string): { moteurs: string[]; matrice: MatriceAudit[] } {
  const lignes = lignesCsv(texte);
  if (lignes.length < 2) throw new Error("Le CSV doit contenir une ligne d'en-têtes et au moins une question.");
  const entetes = lignes[0]!.map((v) => v.trim());
  for (const obligatoire of ["id", "topic", "prompt"]) {
    if (!entetes.includes(obligatoire)) throw new Error(`Colonne CSV manquante : ${obligatoire}`);
  }
  const moteurs = entetes.filter((v) => v.endsWith("_score") && v.length > "_score".length).map((v) => v.slice(0, -"_score".length));
  if (!moteurs.length) throw new Error("Aucun moteur trouvé : ajoutez au moins une colonne <moteur>_score.");
  for (const moteur of moteurs) {
    for (const suffixe of ["competitors", "cited_domains"]) {
      if (!entetes.includes(`${moteur}_${suffixe}`)) throw new Error(`Colonne CSV manquante : ${moteur}_${suffixe}`);
    }
  }
  const matrice = lignes.slice(1).map((valeurs, index) => {
    const ligne = Object.fromEntries(entetes.map((entete, i) => [entete, valeurs[i] ?? ""]));
    const numero = index + 2;
    const id = ligne["id"]?.trim();
    if (!id) throw new Error(`Ligne ${numero} : identifiant de question vide.`);
    const scores: Record<string, number> = {};
    const concurrents: Record<string, string[]> = {};
    const domaines: Record<string, string[]> = {};
    for (const moteur of moteurs) {
      const brut = ligne[`${moteur}_score`]?.trim() ?? "";
      const score = Number(brut);
      if (!Number.isInteger(score) || score < 0 || score > 3) throw new Error(`Ligne ${numero}, ${moteur} : le score doit être un entier de 0 à 3.`);
      scores[moteur] = score;
      concurrents[moteur] = valeursSeparees(ligne[`${moteur}_competitors`] ?? "", ";");
      domaines[moteur] = valeursSeparees(ligne[`${moteur}_cited_domains`] ?? "", ",");
    }
    return { id, sujet: ligne["topic"]?.trim() ?? "", question: ligne["prompt"]?.trim() ?? "", scores, concurrents, domaines };
  });
  return { moteurs, matrice };
}

export type ConcurrentAudit = { nom: string; reponses: number; moteurs: number };
export function classementConcurrents(matrice: MatriceAudit[]): ConcurrentAudit[] {
  const comptes = new Map<string, { nom: string; reponses: number; moteurs: Set<string> }>();
  for (const question of matrice) {
    for (const [moteur, noms] of Object.entries(question.concurrents)) {
      for (const nom of new Set(noms)) {
        const cle = nom.toLocaleLowerCase("fr-FR");
        const compte = comptes.get(cle) ?? { nom, reponses: 0, moteurs: new Set<string>() };
        compte.reponses += 1;
        compte.moteurs.add(moteur);
        comptes.set(cle, compte);
      }
    }
  }
  return [...comptes.values()]
    .map(({ nom, reponses, moteurs }) => ({ nom, reponses, moteurs: moteurs.size }))
    .sort((a, b) => b.reponses - a.reponses || b.moteurs - a.moteurs || a.nom.localeCompare(b.nom, "fr"));
}

export function domainesCites(matrice: MatriceAudit[]) {
  const comptes = new Map<string, { nom: string; citations: number }>();
  for (const question of matrice) {
    for (const noms of Object.values(question.domaines)) {
      for (const nom of new Set(noms)) {
        const cle = nom.toLocaleLowerCase("fr-FR");
        const compte = comptes.get(cle) ?? { nom, citations: 0 };
        compte.citations += 1;
        comptes.set(cle, compte);
      }
    }
  }
  return [...comptes.values()].sort((a, b) => b.citations - a.citations || a.nom.localeCompare(b.nom, "fr"));
}

export function peutImporterAudit(role: string | null | undefined) {
  return role === "owner" || role === "approver";
}

export function sourceAuditExterne(creePar: string | null | undefined) {
  if (creePar?.startsWith("audit-ia-express:")) {
    const date = creePar.slice("audit-ia-express:".length);
    return `Audit IA express${date ? ` · ${date.split("-").reverse().join("/")}` : ""}`;
  }
  if (!creePar?.startsWith("audit-externe:")) return null;
  const [, outil, date] = creePar.split(":");
  if (!outil || !date) return "Audit externe";
  return `Audit externe · ${outil.split("-").map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(" ")} · ${date.split("-").reverse().join("/")}`;
}

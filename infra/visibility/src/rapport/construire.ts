/**
 * Rapports sourcés : construits à partir des seules données de la base, par des règles fixes
 * (aucun modèle de langage : rien n'est inventé, rien ne coûte). Chaque chiffre du texte renvoie à
 * une source [S1], [S2]… ; chaque source porte son identifiant, sa date et son empreinte SHA-256 :
 *   - un relevé embarqué dans le rapport : empreinte de son JSON canonique (recalculable par tous) ;
 *   - une réponse d'IA : empreinte de la réponse brute, calculée par la base à l'enregistrement.
 */
import { canonique, sha256 } from "./sceau.js";

export type TypeRapport = "AUDIT_INITIAL" | "SUIVI_PLAN" | "RESULTATS";
export const FORMAT_RAPPORT = "oia-rapport/1";

type Obj = Record<string, unknown>;
export interface Source { ref: string; nature: string; id: string; date: string | null; empreinte: string; empreinte_de: "releve" | "reponse_brute" }
export interface Rapport {
  format: typeof FORMAT_RAPPORT;
  type: TypeRapport;
  sujet: { id: string; client_id: string; nom: string; url: string | null };
  periode: { du: string | null; au: string };
  genere_le: string;
  synthese: Obj;
  donnees: Obj;
  sources: Source[];
}

const TITRES: Record<TypeRapport, string> = {
  AUDIT_INITIAL: "Audit initial et plan d'action",
  SUIVI_PLAN: "Suivi du plan d'action",
  RESULTATS: "Résultats et évolution",
};

const arr = (x: unknown): Obj[] => (Array.isArray(x) ? (x as Obj[]) : []);
const obj = (x: unknown): Obj | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null);
const num = (x: unknown): number | null => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const jour = (x: unknown) => (typeof x === "string" ? x.slice(0, 10) : null);
const n = (x: unknown, suffixe = "") => (num(x) === null ? "non mesuré" : `${num(x)!.toLocaleString("fr-FR")}${suffixe}`);
const delta = (a: unknown, b: unknown) => {
  const x = num(a), y = num(b);
  if (x === null || y === null) return "";
  const d = Math.round((y - x) * 10) / 10;
  return d === 0 ? " (=)" : ` (${d > 0 ? "+" : ""}${d.toLocaleString("fr-FR")})`;
};
const ligne = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ")} |`;

/** Registre des sources : une entrée par relevé, numérotée dans l'ordre d'apparition. */
class Registre {
  liste: Source[] = [];
  private parId = new Map<string, string>();
  ajouter(nature: string, r: Obj | null, cle?: string): string {
    if (!r) return "";
    const id = String(r.id ?? r.action_cle ?? cle ?? "");
    if (!id) return "";
    const k = `${nature}:${id}`;
    const deja = this.parId.get(k);
    if (deja) return deja;
    const ref = `S${this.liste.length + 1}`;
    const brute = nature === "reponse_ia" && typeof r.empreinte === "string" && /^[0-9a-f]{64}$/.test(r.empreinte);
    this.liste.push({
      ref, nature, id,
      date: jour(r.recu_le ?? r.le ?? r.realise_le ?? r.importe_le ?? r.verifie_le ?? r.fait_le ?? r.derniere_fois ?? null),
      empreinte: brute ? (r.empreinte as string) : sha256(canonique(r)),
      empreinte_de: brute ? "reponse_brute" : "releve",
    });
    this.parId.set(k, ref);
    return ref;
  }
}
const cite = (ref: string) => (ref ? ` [${ref}]` : "");

export function construireRapport(entree: Obj, maintenant: Date): { rapport: Rapport; markdown: string } {
  const type = entree.type as TypeRapport;
  if (!(type in TITRES)) throw new Error(`rapport : type inconnu « ${String(entree.type)} »`);
  const s = obj(entree.sujet) ?? {};
  const sujet = { id: String(s.id ?? ""), client_id: String(s.client_id ?? ""), nom: String(s.nom ?? s.id ?? ""), url: typeof s.url === "string" ? s.url : null };
  if (!sujet.id) throw new Error("rapport : sujet absent");
  const periode = { du: jour(entree.du), au: jour(entree.au) ?? maintenant.toISOString().slice(0, 10) };
  const reg = new Registre();
  const md: string[] = [];
  const synthese: Obj = {};
  const donnees: Obj = {};

  if (type === "AUDIT_INITIAL") {
    const idx = obj(entree.indexation), lh = arr(entree.lighthouse), ct = obj(entree.contenu), constats = arr(entree.constats);
    const ia = obj(entree.audit_ia), preuves = arr(entree.preuves_ia), externes = arr(entree.rapports_externes), plan = obj(entree.plan);
    Object.assign(donnees, { indexation: idx, lighthouse: lh, contenu: ct, constats, audit_ia: ia, preuves_ia: preuves, rapports_externes: externes, plan });
    const m = obj(idx?.metriques) ?? {};
    const rIdx = reg.ajouter("indexation", idx);
    Object.assign(synthese, {
      score_indexation: num(obj(idx?.scores)?.indexation) === null ? null : Math.round(num(obj(idx?.scores)?.indexation)! * 100),
      google_pages_indexees: num(m.google_pages_indexees), google_pages_inspectees: num(m.google_pages_inspectees),
      google_impressions_28j: num(m.google_impressions_28j), bing_impressions_28j: num(m.bing_impressions_28j),
      score_ia: num(ia?.score), constats_ouverts: constats.length, chantiers: arr(plan?.groupes).length, rapports_externes: externes.length,
    });
    md.push("## 1. Indexation Google et Bing");
    if (idx) {
      md.push(`Relevé du ${jour(idx.recu_le)}${cite(rIdx)}.`, "");
      md.push(ligne(["Indicateur", "Valeur"]), ligne(["---", "---"]));
      md.push(ligne(["Score d'indexation", n(synthese.score_indexation, " / 100")]));
      md.push(ligne(["Pages indexées par Google (pages inspectées)", `${n(m.google_pages_indexees)} (${n(m.google_pages_inspectees)})`]));
      md.push(ligne(["Impressions Google sur 28 jours", n(m.google_impressions_28j)]), ligne(["Clics Google sur 28 jours", n(m.google_clics_28j)]));
      md.push(ligne(["Impressions Bing sur 28 jours", n(m.bing_impressions_28j)]), ligne(["Clics Bing sur 28 jours", n(m.bing_clics_28j)]), "");
      const ko = arr(idx.controles).filter((c) => c.ok === false);
      if (ko.length) md.push("Écarts relevés :", ...ko.map((c) => `- ${String(c.titre ?? c.id)}${c.valeur ? ` : ${String(c.valeur)}` : ""}`), "");
    } else md.push("Aucun contrôle d'indexation enregistré avant la fin de la période.", "");

    md.push("## 2. Vitesse et qualité technique (Lighthouse)");
    if (lh.length) {
      md.push(ligne(["Appareil", "Performance", "Accessibilité", "Bonnes pratiques", "SEO", "Source"]), ligne(["---", "---", "---", "---", "---", "---"]));
      for (const a of lh) {
        const sc = obj(a.scores) ?? {};
        const p = (k: string) => (num(sc[k]) === null ? "–" : String(Math.round(num(sc[k])! * 100)));
        md.push(ligne([String(a.strategie), p("performance"), p("accessibilite"), p("bonnes_pratiques"), p("seo"), reg.ajouter("lighthouse", a)]));
      }
      md.push("");
    } else md.push("Aucune mesure Lighthouse enregistrée.", "");

    md.push("## 3. Présence dans les réponses des IA");
    if (ia) {
      const rIa = reg.ajouter("audit_ia", ia);
      preuves.forEach((p) => reg.ajouter("reponse_ia", p));
      md.push(`Score : ${n(ia.score, " / 100")} sur ${arr(ia.matrice).length} questions, moteurs : ${(Array.isArray(ia.moteurs) ? ia.moteurs : []).join(", ")}, le ${jour(ia.realise_le)}${cite(rIa)}.`);
      md.push(`${preuves.length} réponses d'IA conservées, chacune avec l'empreinte de sa réponse brute (sources « reponse_ia »).`, "");
      if (typeof ia.methode === "string") md.push(`Méthode : ${ia.methode}`, "");
    } else md.push("Aucune mesure IA enregistrée.", "");

    md.push("## 4. Contenu du site");
    if (ct) {
      const sc = obj(ct.scores) ?? {};
      const pc = (x: unknown) => (num(x) === null ? "non mesuré" : `${Math.round(num(x)! * 100)} / 100`);
      md.push(`Notes${cite(reg.ajouter("contenu", ct))} : technique ${pc(sc.technique)}, fonctionnelle ${pc(sc.fonctionnel)}, commerciale ${pc(sc.commercial)}.`, "");
    } else md.push("Aucune note du contenu enregistrée.", "");

    md.push("## 5. Rapports externes croisés");
    if (externes.length) md.push(...externes.map((x) => `- « ${String(x.outil)} », ${jour(x.realise_le)}${num(x.score) !== null ? `, score ${num(x.score)}` : ""}${cite(reg.ajouter("rapport_externe", x))}`), "");
    else md.push("Aucun rapport externe fourni.", "");

    md.push(`## 6. Constats ouverts (${constats.length})`);
    if (constats.length) {
      md.push(ligne(["Gravité", "Constat", "Correction", "Source"]), ligne(["---", "---", "---", "---"]));
      for (const c of constats) md.push(ligne([String(c.gravite ?? ""), String(c.titre ?? ""), String(c.correction ?? "").slice(0, 220), reg.ajouter("constat", c)]));
      md.push("");
    }

    md.push("## 7. Plan d'action");
    if (plan) {
      md.push(`${String(plan.resume ?? "")}${cite(reg.ajouter("plan", plan))}`, "");
      for (const g of arr(plan.groupes)) {
        md.push(`### ${String(g.priorite)} · ${String(g.titre)}`);
        if (g.pourquoi) md.push(String(g.pourquoi));
        md.push(`Sources croisées : ${arr(g.sources).length ? (g.sources as unknown[]).join(", ") : "–"} · ${arr(g.actions).length} action(s) · effort ${String(g.effort ?? "?")} · ${g.qui === "client" ? "vous" : "nous"}`);
        if (arr(g.etapes).length) md.push(...(g.etapes as unknown[]).map((e) => `- [ ] ${String(e)}`));
        if (g.critere_reussite) md.push(`Critère de réussite : ${String(g.critere_reussite)}`);
        md.push("");
      }
    } else md.push("Aucun plan consolidé enregistré.", "");
  }

  if (type === "SUIVI_PLAN") {
    const actions = arr(entree.actions), gestes = arr(entree.gestes), plan = obj(entree.plan);
    Object.assign(donnees, { actions, gestes, plan });
    const compte = (k: string, v: string) => actions.filter((a) => a[k] === v).length;
    Object.assign(synthese, {
      actions: actions.length, faites: compte("suivi", "fait"), en_cours: compte("suivi", "en_cours"), a_planifier: compte("suivi", "a_planifier"),
      abandonnees: compte("suivi", "abandonne"), verifiees: compte("verification", "corrige_verifie"), en_retard: actions.filter((a) => a.en_retard === true).length,
      gestes_periode: gestes.length,
    });
    md.push("## 1. Où en est le plan");
    md.push(ligne(["État", "Actions"]), ligne(["---", "---"]));
    for (const [l, k] of [["Faites", "faites"], ["Dont corrections vérifiées", "verifiees"], ["En cours", "en_cours"], ["À planifier", "a_planifier"], ["En retard", "en_retard"], ["Abandonnées", "abandonnees"]] as const) md.push(ligne([l, String(synthese[k])]));
    md.push("");
    md.push(`## 2. Ce qui a été fait sur la période (${gestes.length})`);
    if (gestes.length) {
      md.push(ligne(["Date", "Action", "Nouvel état", "Par", "Preuve", "Source"]), ligne(["---", "---", "---", "---", "---", "---"]));
      for (const g of gestes) {
        const a = actions.find((x) => x.action_cle === g.action_cle);
        md.push(ligne([jour(g.le) ?? "", String(a?.titre ?? g.action_cle), String(g.etat), String(g.responsable ?? "–"), String(g.preuve ?? "–").slice(0, 120), reg.ajouter("geste", g)]));
      }
      md.push("");
    } else md.push("Aucun geste enregistré sur la période.", "");
    md.push("## 3. Toutes les actions");
    md.push(ligne(["Priorité", "Action", "Suivi", "Échéance", "Vérification", "Source"]), ligne(["---", "---", "---", "---", "---", "---"]));
    const verif: Record<string, string> = { corrige_verifie: "corrigé, vérifié", pas_encore_corrige: "pas encore corrigé", verification_en_attente: "vérification en attente", a_mesurer: "effet à mesurer" };
    for (const a of actions) md.push(ligne([String(a.priorite ?? ""), String(a.titre ?? ""), String(a.suivi ?? ""), `${jour(a.echeance) ?? "–"}${a.en_retard ? " (en retard)" : ""}`, verif[String(a.verification)] ?? "–", reg.ajouter("action", a)]));
    md.push("");
    if (plan) md.push(`Plan consolidé de référence${cite(reg.ajouter("plan", plan))} : ${arr(plan.groupes).length} chantiers.`, "");
  }

  if (type === "RESULTATS") {
    const depart = obj(entree.depart), serie = arr(entree.serie), mesures = arr(entree.mesures_ia), corr = arr(entree.corrections_verifiees);
    Object.assign(donnees, { depart, serie, mesures_ia: mesures, corrections_verifiees: corr });
    const fin = serie[serie.length - 1] ?? null;
    const rD = reg.ajouter("indexation", depart), rF = reg.ajouter("indexation", fin);
    serie.forEach((x) => reg.ajouter("indexation", x));
    const indic: [string, string][] = [["Score d'indexation", "score_indexation"], ["Pages indexées Google", "google_pages_indexees"], ["Impressions Google 28 j", "google_impressions_28j"], ["Clics Google 28 j", "google_clics_28j"], ["Position moyenne Google", "google_position"], ["Impressions Bing 28 j", "bing_impressions_28j"], ["Clics Bing 28 j", "bing_clics_28j"], ["Pages indexées Bing", "bing_pages_indexees"], ["Constats résolus (cumul)", "constats_resolus_cumules"]];
    Object.assign(synthese, Object.fromEntries(indic.map(([, k]) => [k, { depart: num(depart?.[k]), fin: num(fin?.[k]) }])), { mesures_ia: mesures.length, corrections_verifiees: corr.length, releves: serie.length });
    md.push("## 1. Évolution depuis le départ");
    md.push(`Départ : ${jour(depart?.recu_le) ?? "–"}${cite(rD)} · Dernier relevé de la période : ${jour(fin?.recu_le) ?? "–"}${cite(rF)} · ${serie.length} relevés sur la période.`, "");
    md.push(ligne(["Indicateur", "Départ", "Fin de période", "Écart"]), ligne(["---", "---", "---", "---"]));
    for (const [l, k] of indic) md.push(ligne([l, n(depart?.[k]), n(fin?.[k]), delta(depart?.[k], fin?.[k]).replace(/[()]/g, "").trim() || "–"]));
    md.push("");
    md.push("## 2. Présence dans les réponses des IA");
    if (mesures.length) {
      md.push(ligne(["Date", "Score", "Questions", "Citations sans le nom", "Mêmes questions", "Source"]), ligne(["---", "---", "---", "---", "---", "---"]));
      for (const x of mesures) md.push(ligne([jour(x.realise_le) ?? "", n(x.score), n(x.questions), `${n(x.citations_sans_nom)} / ${n(x.reponses_sans_nom)}`, x.memes_questions_que ? "oui" : "non", reg.ajouter("audit_ia", x)]));
      md.push("", "Les réponses des IA varient d'un jour à l'autre : un écart de quelques points sur 20 questions n'est pas un progrès établi.", "");
    } else md.push("Aucune mesure IA enregistrée.", "");
    md.push(`## 3. Corrections vérifiées (${corr.length})`);
    if (corr.length) md.push(...corr.map((c) => `- ${jour(c.verifie_le)} · ${String(c.titre)}${cite(reg.ajouter("action", c))}`), "");
    else md.push("Aucune correction vérifiée à ce jour.", "");
  }

  const rapport: Rapport = { format: FORMAT_RAPPORT, type, sujet, periode, genere_le: maintenant.toISOString(), synthese, donnees, sources: reg.liste };
  const tete = [
    `# ${TITRES[type]} · ${sujet.nom}`, "",
    `${sujet.url ?? ""} · période ${periode.du ? `du ${periode.du} ` : ""}au ${periode.au} · généré le ${rapport.genere_le.slice(0, 16).replace("T", " ")} UTC`, "",
    "Rapport généré par règles fixes à partir des relevés enregistrés (aucun modèle de langage). Chaque chiffre renvoie à une source [S…] listée en fin de rapport, avec son empreinte SHA-256.", "",
  ];
  const pied = ["## Sources", "", ligne(["Réf.", "Nature", "Identifiant", "Date", "Empreinte SHA-256"]), ligne(["---", "---", "---", "---", "---"]),
    ...reg.liste.map((x) => ligne([x.ref, x.nature + (x.empreinte_de === "reponse_brute" ? " (réponse brute)" : ""), x.id, x.date ?? "–", `\`${x.empreinte}\``])), ""];
  return { rapport, markdown: [...tete, ...md, ...pied].join("\n") };
}

/** Bloc de sceau ajouté au markdown : ce qu'il faut pour vérifier. Hors empreinte (le sceau ne se scelle pas). */
export function blocSceau(s: { empreinte: string; signature: string; cle_id: string; scelle_le: string }) {
  return ["## Sceau", "", ligne(["Élément", "Valeur"]), ligne(["---", "---"]),
    ligne(["Algorithme", "Ed25519 sur le JSON canonique du rapport"]), ligne(["Empreinte SHA-256", `\`${s.empreinte}\``]),
    ligne(["Signature (base64)", `\`${s.signature}\``]), ligne(["Clé", `\`${s.cle_id}\``]), ligne(["Scellé le", s.scelle_le]), "",
    "Pour vérifier : recalculer l'empreinte du fichier JSON du rapport (clés triées, sans espace) et contrôler la signature avec la clé publique publiée. Ce texte est une mise en page du rapport ; seul le JSON fait foi.", ""].join("\n");
}

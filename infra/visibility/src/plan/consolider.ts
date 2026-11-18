/**
 * Plan consolidé : croiser toutes les actions ouvertes d'un site (recommandations de toutes
 * origines, rapports externes compris, et constats), les regrouper quand elles visent le même
 * problème, les prioriser, et préparer chaque groupe : étapes à cocher, critère de réussite
 * vérifiable, et un prompt prêt à coller dans Lovable ou Claude Code.
 *
 * Garde-fous :
 * - le modèle ne peut regrouper que des actions qui existent (clés vérifiées) ; une action qu'il
 *   oublie est remise seule, telle quelle, dans un groupe à part : rien ne se perd ;
 * - une action n'appartient qu'à un groupe ;
 * - le prompt ne doit rien inventer : il reprend ce que disent les actions et les rapports, et
 *   laisse « à fournir » ce qui manque (prix, textes, avis réels).
 */
import { z } from "zod";
import type { LLMProvider } from "../../../../packages/providers/src/types.js";
import { enveloppe } from "../llm-forme.js";

export interface EntreePlan {
  site: { nom: string; url: string; langues?: string[] } | null;
  depot: string | null;
  actions: { cle: string; origine: string | null; priorite: string; titre: string; quoi: string; pourquoi: string; effort: string | null; qui: string | null; suivi: string }[];
  rapports: { outil: string; date: string; resume: string; extrait: string }[];
  etat: Record<string, unknown> | null;
}

const texte = (max: number) => z.string().default("").transform((x) => x.trim().slice(0, max));
const majuscule = <T extends [string, ...string[]]>(vals: T, def: T[number]) =>
  z.preprocess((x) => (x == null ? def : String(x).trim().toUpperCase()), z.enum(vals)).catch(def);
const minuscule = <T extends [string, ...string[]]>(vals: T, def: T[number]) =>
  z.preprocess((x) => (x == null ? def : String(x).trim().toLowerCase()), z.enum(vals)).catch(def);

const GroupeSchema = z.object({
  titre: texte(160),
  pourquoi: texte(600),
  priorite: majuscule(["P0", "P1", "P2", "P3"], "P2"),
  impact: minuscule(["low", "medium", "high"], "medium"),
  effort: majuscule(["XS", "S", "M", "L", "XL"], "M"),
  qui: minuscule(["client", "equipe"], "equipe"),
  actions: z.array(z.string()).default([]),
  etapes: z.array(z.string()).default([]).transform((e) => e.map((x) => x.trim().slice(0, 240)).filter(Boolean).slice(0, 10)),
  critere_reussite: texte(400),
  prompt_execution: texte(4000),
});
const PlanSchema = z.preprocess(enveloppe("groupes"), z.object({
  resume: texte(2000),
  groupes: z.array(GroupeSchema).default([]),
}));
export type GroupeConsolide = z.infer<typeof GroupeSchema> & { sources: string[] };

const ORDRE: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Garde-fous : clés existantes, une action par groupe, rien d'oublié ; sources et priorité recalculées. */
export function nettoyerPlan(brut: z.infer<typeof PlanSchema>, e: EntreePlan): { resume: string; groupes: GroupeConsolide[] } {
  const parCle = new Map(e.actions.map((a) => [a.cle, a]));
  const vues = new Set<string>();
  const groupes: GroupeConsolide[] = [];
  for (const g of brut.groupes) {
    const actions = [...new Set(g.actions)].filter((k) => parCle.has(k) && !vues.has(k));
    if (!actions.length) continue;
    actions.forEach((k) => vues.add(k));
    const membres = actions.map((k) => parCle.get(k)!);
    const sources = [...new Set(membres.map((m) => m.origine ?? "inconnue"))];
    // Jamais moins urgent que l'action la plus urgente du groupe.
    const plusUrgente = membres.map((m) => m.priorite).sort((a, b) => (ORDRE[a] ?? 3) - (ORDRE[b] ?? 3))[0] ?? g.priorite;
    const priorite = (ORDRE[plusUrgente] ?? 3) < (ORDRE[g.priorite] ?? 3) ? (plusUrgente as GroupeConsolide["priorite"]) : g.priorite;
    groupes.push({ ...g, titre: g.titre || membres[0]!.titre, actions, sources, priorite });
  }
  // Ce que le modèle a oublié revient seul, tel quel.
  for (const a of e.actions) {
    if (vues.has(a.cle)) continue;
    groupes.push({
      titre: a.titre, pourquoi: a.pourquoi, priorite: (["P0", "P1", "P2", "P3"].includes(a.priorite) ? a.priorite : "P2") as GroupeConsolide["priorite"],
      impact: "medium", effort: (["XS", "S", "M", "L", "XL"].includes(a.effort ?? "") ? a.effort : "M") as GroupeConsolide["effort"],
      qui: a.qui === "client" ? "client" : "equipe", actions: [a.cle], etapes: a.quoi ? [a.quoi] : [], critere_reussite: "", prompt_execution: "", sources: [a.origine ?? "inconnue"],
    });
  }
  // Plusieurs sources d'abord à priorité égale : un problème relevé par plusieurs outils est plus sûr.
  groupes.sort((x, y) => (ORDRE[x.priorite] ?? 3) - (ORDRE[y.priorite] ?? 3) || y.sources.length - x.sources.length || y.actions.length - x.actions.length);
  return { resume: brut.resume || `${groupes.length} chantiers à partir de ${e.actions.length} actions.`, groupes };
}

export async function consoliderPlan(llm: LLMProvider, e: EntreePlan, modele: string) {
  const lignes = e.actions.map((a) => `[${a.cle}] (${a.priorite}, ${a.origine ?? "?"}, effort ${a.effort ?? "?"}, ${a.qui ?? "?"}) ${a.titre} — ${a.quoi}${a.pourquoi ? ` Pourquoi : ${a.pourquoi}` : ""}`);
  const r = await llm.extract({
    schema: PlanSchema,
    schemaName: "PlanConsolide",
    purpose: "plan-consolide",
    model: modele,
    system: [
      `Tu es chef de projet SEO et visibilité IA pour le site « ${e.site?.nom ?? "?"} » (${e.site?.url ?? "?"})${e.depot ? `, dont le code est dans le dépôt GitHub ${e.depot}` : ""}.`,
      "On te donne toutes les actions ouvertes, venues de sources différentes (mesures OIA, audits et rapports externes, Lighthouse, hygiène d'indexation, note du contenu), et des extraits des rapports externes.",
      "Croise-les : regroupe en un même chantier les actions qui visent le même problème (même correction, même page, même cause). Une action ne va que dans un chantier. Garde chaque clé telle quelle, entre crochets dans la liste.",
      "Pour chaque chantier : un titre clair ; « pourquoi » (l'effet attendu sur Google, Bing et les réponses des IA) ; priorité P0 (cette semaine) à P3 ; impact ; effort ; qui (client ou equipe) ;",
      "« etapes » : 2 à 8 étapes concrètes à cocher, dans l'ordre ; « critere_reussite » : comment vérifier que c'est fait (ce que le contrôle verra) ;",
      "« prompt_execution » : un prompt autonome, en français, prêt à coller dans Lovable ou Claude Code pour faire la correction dans le code du site : contexte, fichiers ou pages visés si connus, changements précis, contraintes (ne rien inventer ; laisser « [à fournir] » pour un prix, un texte ou un avis réel ; travailler sur une branche, pas sur main ; tester), et le critère de réussite. Si le chantier ne se fait pas dans le code (ex. fiche Google Business, annuaires), le prompt devient une checklist d'actions pour une personne.",
      "N'invente aucun fait sur l'entreprise : reprends seulement ce que disent les actions et les rapports.",
      'Format exact : {"resume":"…","groupes":[{"titre":"…","pourquoi":"…","priorite":"P0","impact":"high","effort":"S","qui":"equipe","actions":["constat:…"],"etapes":["…"],"critere_reussite":"…","prompt_execution":"…"}]}',
    ].join("\n"),
    input: [
      `État actuel : ${JSON.stringify(e.etat ?? {})}`,
      "Actions ouvertes :",
      ...lignes,
      ...e.rapports.map((x) => `\nRapport externe « ${x.outil} » (${x.date}) : ${x.resume}\n${x.extrait}`),
    ].join("\n").slice(0, 60_000),
  });
  return nettoyerPlan(r.data, e);
}

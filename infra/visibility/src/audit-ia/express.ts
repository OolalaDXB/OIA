/**
 * Audit IA express (premium) : en une fois, ce que fait un agent comme Perplexity Computer, mais
 * par les API des moteurs (jamais par leurs interfaces grand public) et avec un coût plafonné.
 *
 *  1. lecture du site (pages publiques) ;
 *  2. N questions qu'un client poserait, tirées du contenu (Mistral, via packages/providers) :
 *     surtout sans le nom de la marque, une ou deux avec ;
 *  3. une passe par question sur chaque moteur retenu (collecteur OIA direct) ;
 *  4. pour chaque réponse : score 0 à 3, concurrents cités, domaines cités ;
 *  5. score par moteur et global (barème de Perplexity : points obtenus / points possibles) ;
 *  6. plan d'action priorisé (Mistral), versé en recommandations en attente.
 *
 * Barème d'une réponse : 3 = marque citée et site cité en source ; 2 = marque citée ; 1 = citée
 * seulement parce que la question la nomme ; 0 = absente. Correspondance déterministe (judge.ts) :
 * le modèle n'intervient pas dans le score.
 *
 * Coût : le moteur s'arrête dès que la dépense atteint le plafond engagé au GO (`coutMaxUsd`).
 */
import { z } from "zod";
import type { Collector } from "../collector.js";
import type { LLMProvider } from "../../../../packages/providers/src/types.js";
import { matchFacts } from "../judge.js";
import type { MentionConfig } from "../judge-jev.js";
import { candidatesIn } from "../site/actors.js";
import type { SiteRead } from "../site/pages.js";
import { enveloppe } from "../llm-forme.js";

export const AUDIT_MODEL = "mistral-large-4";

export interface QuestionAudit {
  id: string;
  sujet: string;
  question: string;
  langue: string;
  marquee: boolean;
  source: string | null;
}

// Tolérant sur la forme (casse, longueur), strict sur le fond : une question reste une question.
const texte = (min: number, max: number) => z.string().trim().min(min).transform((x) => x.slice(0, max));
const QuestionsSchema = z.preprocess(enveloppe("questions"), z.object({
  questions: z
    .array(
      z.object({
        sujet: texte(2, 120),
        question: texte(10, 600),
        langue: z.string().trim().transform((x) => x.slice(0, 2).toLowerCase()).pipe(z.string().regex(/^[a-z]{2}$/)).optional(),
        marquee: z.preprocess((x) => (x === "true" ? true : x === "false" ? false : x), z.boolean()),
        source: z.string().nullable().optional().transform((x) => (x ? x.slice(0, 300) : null)),
      }),
    )
    .min(5)
    .transform((q) => q.slice(0, 40)),
}));

/** Résumé du site pour le modèle : titres, H1, extraits de texte, pages. */
export function resumeSite(read: SiteRead, maxChars = 12_000): string {
  const parts: string[] = [];
  for (const p of [read.home, ...read.pages]) {
    parts.push(`## ${p.url}\nTitre : ${p.title ?? ""}\nH1 : ${p.h1.join(" | ")}\nDescription : ${p.description ?? ""}\n${p.text.slice(0, 1500)}`);
  }
  return parts.join("\n\n").slice(0, maxChars);
}

export async function proposerQuestions(
  llm: LLMProvider,
  o: { read: SiteRead; nom: string; langues: string[]; marches: string[]; n: number },
): Promise<QuestionAudit[]> {
  const r = await llm.extract({
    schema: QuestionsSchema,
    schemaName: "AuditQuestions",
    purpose: "audit-ia-questions",
    model: AUDIT_MODEL,
    system: [
      `Tu prépares un audit de visibilité dans les assistants IA pour la marque « ${o.nom} ».`,
      `Lis le contenu du site et propose exactement ${o.n} questions qu'un client potentiel poserait à ChatGPT, Gemini ou Perplexity,`,
      `couvrant les offres, publics, lieux et créneaux réels du site (marchés : ${o.marches.join(", ") || "non précisés"}).`,
      `Au plus 2 questions nomment la marque (marquee: true) ; toutes les autres ne la nomment pas (marquee: false).`,
      `Formule chaque question pour obtenir des noms précis (« recommande des coachs par leur nom »).`,
      `Langue : ${o.langues.join(" ou ")}. Pour chaque question, « sujet » = mot-clé court, « source » = adresse de la page qui justifie le sujet.`,
      `N'invente aucune offre absente du site.`,
      `Format exact : {"questions":[{"sujet":"padel","question":"…","langue":"${o.langues[0] ?? "en"}","marquee":false,"source":"https://…"}]}`,
    ].join(" "),
    input: resumeSite(o.read),
  });
  return r.data.questions.slice(0, o.n).map((q, i) => ({
    id: `K${String(i + 1).padStart(2, "0")}`,
    sujet: q.sujet,
    question: q.question,
    langue: q.langue ?? o.langues[0] ?? "en",
    marquee: q.marquee,
    source: q.source ?? null,
  }));
}

const domainOf = (u: string): string | null => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

export interface Notation {
  score: 0 | 1 | 2 | 3;
  citee: boolean;
  siteCite: boolean;
  concurrents: string[];
  domaines: string[];
}

/** Note d'une réponse (déterministe). */
export function noterReponse(texte: string, citations: { url: string }[], config: MentionConfig, marquee: boolean): Notation {
  const facts = matchFacts(texte, config);
  const citee = facts.brand !== null;
  const siteDomains = config.brand.domains.map((d) => domainOf(d.includes("://") ? d : `https://${d}`)).filter((d): d is string => !!d);
  const domaines = [...new Set(citations.map((c) => domainOf(c.url)).filter((d): d is string => !!d))];
  const siteCite = domaines.some((d) => siteDomains.some((s) => d === s || d.endsWith(`.${s}`)));
  const brandTerms = [config.brand.name, ...config.brand.aliases].map((t) => t.toLowerCase());
  const concurrents = [...new Set(candidatesIn(texte).map((c) => c.name))].filter((n) => !brandTerms.some((b) => n.toLowerCase().includes(b))).slice(0, 10);
  const score: Notation["score"] = !citee ? 0 : marquee ? (siteCite ? 3 : 1) : siteCite ? 3 : 2;
  return { score, citee, siteCite, concurrents, domaines: domaines.filter((d) => !siteDomains.includes(d)).slice(0, 10) };
}

export interface LigneMatrice {
  id: string;
  sujet: string;
  question: string;
  marquee: boolean;
  scores: Record<string, number>;
  concurrents: Record<string, string[]>;
  domaines: Record<string, string[]>;
}

/** Scores par moteur et global (points obtenus / 3 × réponses), en entiers sur 100. */
export function scores(matrice: LigneMatrice[], moteurs: string[]): { global: number | null; parMoteur: Record<string, number | null>; sansNom: { citees: number; total: number } } {
  const parMoteur: Record<string, number | null> = {};
  let pts = 0;
  let max = 0;
  let citees = 0;
  let total = 0;
  for (const m of moteurs) {
    const lignes = matrice.filter((l) => typeof l.scores[m] === "number");
    const p = lignes.reduce((s, l) => s + l.scores[m]!, 0);
    parMoteur[m] = lignes.length ? Math.round((100 * p) / (3 * lignes.length)) : null;
    pts += p;
    max += 3 * lignes.length;
    for (const l of lignes) if (!l.marquee) {
      total++;
      if (l.scores[m]! >= 2) citees++;
    }
  }
  return { global: max ? Math.round((100 * pts) / max) : null, parMoteur, sansNom: { citees, total } };
}

/** Concurrents les plus cités : nombre de réponses et de moteurs. */
export function classementConcurrents(matrice: LigneMatrice[]): { nom: string; reponses: number; moteurs: number }[] {
  const n = new Map<string, { reponses: number; moteurs: Set<string> }>();
  for (const l of matrice) for (const [m, liste] of Object.entries(l.concurrents)) for (const c of liste) {
    const k = c.trim();
    const e = n.get(k) ?? { reponses: 0, moteurs: new Set<string>() };
    e.reponses++;
    e.moteurs.add(m);
    n.set(k, e);
  }
  return [...n.entries()].map(([nom, e]) => ({ nom, reponses: e.reponses, moteurs: e.moteurs.size })).sort((a, b) => b.reponses - a.reponses || a.nom.localeCompare(b.nom)).slice(0, 25);
}

export function classementDomaines(matrice: LigneMatrice[]): { domaine: string; reponses: number }[] {
  const n = new Map<string, number>();
  for (const l of matrice) for (const liste of Object.values(l.domaines)) for (const d of liste) n.set(d, (n.get(d) ?? 0) + 1);
  return [...n.entries()].map(([domaine, reponses]) => ({ domaine, reponses })).sort((a, b) => b.reponses - a.reponses).slice(0, 25);
}

const PlanSchema = z.preprocess(enveloppe("actions"), z.object({
  resume: texte(20, 1200),
  actions: z
    .array(
      z.object({
        priorite: z.preprocess((x) => String(x).trim().toUpperCase(), z.enum(["P0", "P1", "P2", "P3"])),
        type: z.preprocess((x) => String(x).trim().toUpperCase(), z.enum(["TECH_FIX", "CONTENT_GAP", "ENTITY_INCONSISTENCY", "SOURCE_TARGET", "FIX_FACT"])),
        titre: texte(5, 160),
        action: texte(20, 1200),
        pourquoi: texte(10, 600),
        questions: z.array(z.string()).default([]).transform((q) => q.slice(0, 20)),
        impact: z.preprocess((x) => String(x).trim().toLowerCase(), z.enum(["low", "medium", "high"])),
        effort: z.preprocess((x) => String(x).trim().toUpperCase(), z.enum(["XS", "S", "M", "L", "XL"])),
      }),
    )
    .min(3)
    .transform((a) => a.slice(0, 15)),
  // Nature de chaque entité citée à la place de la marque (un concurrent n'est pas une plateforme).
  entites: z
    .array(z.object({ nom: z.string().trim().min(1).transform((x) => x.slice(0, 160)), nature: z.preprocess((x) => String(x).trim().toLowerCase(), z.enum(["concurrent", "plateforme", "application", "annuaire", "media", "autre"])) }))
    .default([])
    .catch([]),
}));
export type Plan = z.infer<typeof PlanSchema>;

export async function proposerPlan(
  llm: LLMProvider,
  o: { nom: string; site: string; matrice: LigneMatrice[]; scores: ReturnType<typeof scores>; concurrents: ReturnType<typeof classementConcurrents>; domaines: ReturnType<typeof classementDomaines>; constats: string[] },
): Promise<Plan> {
  const lignes = o.matrice.map((l) => `${l.id} ${l.sujet}${l.marquee ? " (nomme la marque)" : ""} : ${Object.entries(l.scores).map(([m, s]) => `${m}=${s}`).join(", ")} ; cités à la place : ${[...new Set(Object.values(l.concurrents).flat())].slice(0, 6).join(", ")}`);
  const r = await llm.extract({
    schema: PlanSchema,
    schemaName: "AuditPlan",
    purpose: "audit-ia-plan",
    model: AUDIT_MODEL,
    system: [
      `Tu rédiges, en français, le plan d'action d'un audit de visibilité IA pour « ${o.nom} » (${o.site}).`,
      "Appuie-toi seulement sur les résultats fournis : questions, scores (0 absent, 1 cité car nommé, 2 cité, 3 cité avec le site en source),",
      "concurrents et domaines cités par les IA, constats techniques du site. N'invente aucun fait sur la marque.",
      "Priorités : P0 cette semaine (blocages), P1 signaux d'autorité (annuaires, fiches, presse : vise les domaines réellement cités), P2 contenu, P3 données structurées.",
      "Chaque action dit quoi faire concrètement, pourquoi, et quelles questions (identifiants K..) elle sert.",
      'Format exact : {"resume":"…","actions":[{"priorite":"P0","type":"SOURCE_TARGET","titre":"…","action":"…","pourquoi":"…","questions":["K01"],"impact":"high","effort":"S"}]}.',
      "type parmi TECH_FIX, CONTENT_GAP, ENTITY_INCONSISTENCY, SOURCE_TARGET, FIX_FACT ; impact parmi low, medium, high ; effort parmi XS, S, M, L, XL.",
      'Ajoute "entites":[{"nom":"…","nature":"concurrent"}] : une ligne par nom de la liste « Cités à la place », avec sa nature :',
      "concurrent (même métier sur le même marché : un club, un coach, une salle), plateforme (réservation ou place de marché, ex. Playtomic, ClassPass),",
      "application (application mobile ou logicielle), annuaire, media (presse, blog, guide), autre. Une plateforme ou une application n'est jamais un concurrent.",
      "Dans le plan, traite les plateformes et annuaires comme des sources où être présent, pas comme des concurrents.",
    ].join(" "),
    input: [
      `Score global ${o.scores.global}/100 ; par moteur : ${JSON.stringify(o.scores.parMoteur)} ; questions sans le nom : citée ${o.scores.sansNom.citees} fois sur ${o.scores.sansNom.total}.`,
      "Résultats par question :",
      ...lignes,
      `Concurrents les plus cités : ${o.concurrents.slice(0, 15).map((c) => `${c.nom} (${c.reponses})`).join(", ")}`,
      `Domaines les plus cités : ${o.domaines.slice(0, 15).map((d) => `${d.domaine} (${d.reponses})`).join(", ")}`,
      `Constats techniques ouverts : ${o.constats.slice(0, 15).join(" ; ") || "aucun"}`,
    ].join("\n"),
  });
  return r.data;
}

export function rapportMarkdown(o: { nom: string; site: string; date: string; moteurs: string[]; matrice: LigneMatrice[]; s: ReturnType<typeof scores>; concurrents: ReturnType<typeof classementConcurrents>; domaines: ReturnType<typeof classementDomaines>; plan: Plan; coutUsd: number }): string {
  const sym = (n: number | undefined) => (n === undefined ? "—" : ["✗", "◐", "●", "★"][n] ?? "—");
  const t: string[] = [];
  t.push(`# Audit IA express · ${o.nom} · ${o.date}`, "", `**Score : ${o.s.global ?? "—"}/100** · ${o.moteurs.map((m) => `${m} ${o.s.parMoteur[m] ?? "—"}`).join(" · ")}`, "");
  t.push(`Questions sans le nom : marque citée ${o.s.sansNom.citees} fois sur ${o.s.sansNom.total} réponses.`, "", o.plan.resume, "");
  t.push("## Résultats par question", "", `| # | Sujet | ${o.moteurs.join(" | ")} |`, `|---|---|${o.moteurs.map(() => "---").join("|")}|`);
  for (const l of o.matrice) t.push(`| ${l.id} | ${l.sujet}${l.marquee ? " (nom)" : ""} | ${o.moteurs.map((m) => sym(l.scores[m])).join(" | ")} |`);
  t.push("", "★ cité avec le site en source · ● cité · ◐ cité parce que nommé · ✗ absent", "");
  const nature = new Map((o.plan.entites ?? []).map((e) => [e.nom.toLowerCase(), e.nature]));
  const groupes: [string, (n: string | undefined) => boolean][] = [
    ["Concurrents cités à la place", (n) => n === "concurrent" || n === undefined],
    ["Plateformes, applications et annuaires cités (sources où être présent)", (n) => n === "plateforme" || n === "application" || n === "annuaire"],
    ["Médias et autres", (n) => n === "media" || n === "autre"],
  ];
  for (const [titre, garde] of groupes) {
    const liste = o.concurrents.filter((c) => garde(nature.get(c.nom.toLowerCase()))).slice(0, 15);
    if (!liste.length) continue;
    t.push(`## ${titre}`, "");
    for (const c of liste) t.push(`- ${c.nom}${nature.get(c.nom.toLowerCase()) ? ` (${nature.get(c.nom.toLowerCase())})` : ""} : ${c.reponses} réponse(s), ${c.moteurs} moteur(s)`);
    t.push("");
  }
  t.push("## Sources les plus citées", "");
  for (const d of o.domaines.slice(0, 15)) t.push(`- ${d.domaine} : ${d.reponses}`);
  t.push("", "## Plan d'action", "");
  for (const a of o.plan.actions) t.push(`- **${a.priorite} · ${a.titre}** — ${a.action} *Pourquoi :* ${a.pourquoi}${a.questions.length ? ` (${a.questions.join(", ")})` : ""}`);
  t.push("", "## Méthode et limites", "", `Une passe par question et par moteur, par API avec recherche web (pas les applications grand public), le ${o.date}. Les réponses varient d'une passe à l'autre : résultats indicatifs. Coût réel : ${o.coutUsd.toFixed(2)} $.`);
  return t.join("\n");
}

/** Réponse d'un moteur, telle que gardée en preuve. */
export interface ReponseAudit {
  question: QuestionAudit;
  moteur: string;
  texte: string;
  citations: { url: string; label?: string }[];
  coutUsd: number;
  resultat: Awaited<ReturnType<Collector["collect"]>>;
}

/** Collecte bornée : une passe par question et par cible, par lots, arrêt au plafond. */
export async function collecter(o: {
  collector: Collector;
  questions: QuestionAudit[];
  cibles: string[];
  clientId: string;
  subjectId: string;
  windowId: string;
  coutMaxUsd: number;
  parallele?: number;
  log?: (l: string) => void;
}): Promise<{ reponses: ReponseAudit[]; echecs: { question: string; moteur: string; erreur: string }[]; depenseUsd: number; arretPlafond: boolean }> {
  const taches = o.questions.flatMap((q) => o.cibles.map((c) => ({ q, cible: c, moteur: c.split(":")[0]! })));
  const reponses: ReponseAudit[] = [];
  const echecs: { question: string; moteur: string; erreur: string }[] = [];
  let depense = 0;
  let arret = false;
  const n = Math.max(1, o.parallele ?? 4);
  for (let i = 0; i < taches.length; i += n) {
    if (depense >= o.coutMaxUsd) {
      arret = true;
      break;
    }
    await Promise.all(
      taches.slice(i, i + n).map(async ({ q, cible, moteur }) => {
        try {
          const r = await o.collector.collect({
            clientId: o.clientId,
            siteId: o.subjectId,
            subjectId: o.subjectId,
            windowId: o.windowId,
            promptId: `audit-${q.id.toLowerCase()}`,
            promptVersion: 1,
            promptLanguage: q.langue,
            promptText: q.question,
            engine: moteur,
            engineOptions: { target: cible },
          });
          depense += r.costUsd;
          reponses.push({ question: q, moteur, texte: r.rawText, citations: r.citations, coutUsd: r.costUsd, resultat: r });
        } catch (err) {
          echecs.push({ question: q.id, moteur, erreur: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
        }
      }),
    );
    o.log?.(`audit : ${Math.min(i + n, taches.length)}/${taches.length} appels, ${depense.toFixed(2)} $`);
  }
  return { reponses, echecs, depenseUsd: depense, arretPlafond: arret };
}

/**
 * Exporteur en lecture seule : données d'Elmo + sujet OIA → visibility.json,
 * avec exactement la structure de `src/data/demo.ts` du prototype Lovable
 * (branche lovable/oia-visibility-prototype) : utilisateur, aDecider, sites,
 * agents, depenses, onboarding, vueSite.
 *
 * Aucune donnée inventée : ce qui n'est pas encore mesuré reste vide (liste
 * vide, null, « — », « Non connecté »). Aucun appel à un fournisseur d'IA ;
 * l'exportation brute d'Elmo (ElmoExport) est produite par
 * scripts/vis-export.sh, dans une session Postgres en lecture seule.
 *
 * CLI : tsx src/vis-export.ts <subjectId> <elmo-export.json> [cost-journal.csv] > visibility.json
 */
import { existsSync, readFileSync } from "node:fs";
import { loadFamilies, type Family } from "./verification.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

// ---- Format du prototype (src/data/demo.ts) -------------------------------------
export type Etat = "conforme" | "verifier" | "bloquant";
export interface Visibility {
  utilisateur: { prenom: string };
  aDecider: { titre: string; detail: string }[];
  sites: { slug: string; nom: string; url: string; panel: string; depart: string; ia: number | null; google: string; etat: Etat }[];
  agents: string[];
  depenses: { montant: number; plafond: number };
  onboarding: {
    url: string;
    constats: string[];
    activite: string;
    lieu: string;
    langues: string;
    offres: string[];
    concurrents: string[];
    connexions: { nom: string; detail: string }[];
    questions: { q: string; marque: boolean }[];
    assistants: string[];
    bloquants: string[];
    familles: [string, number, number, number][];
  };
  vueSite: {
    nom: string;
    url: string;
    presence: number;
    min: number;
    max: number;
    jours: number;
    parAssistant: { nom: string; v: number }[];
    sources: { nom: string; n: number }[];
    concurrents: { nom: string; v: number }[];
    recommandations: { etat: Etat; titre: string; effet: string }[];
    historique: { fenetre: string; v: number; min: number; max: number; statut: string }[];
  };
}

// ---- Exportation brute d'Elmo (scripts/vis-export.sh) -----------------------------
export interface ElmoExport {
  exportedAt: string;
  brand: { id: string; name: string; website: string } | null;
  competitors: { name: string }[];
  prompts: { id: string; value: string; enabled: boolean; tags: string[] }[];
  runs: {
    id: string;
    promptId: string;
    model: string;
    version: string;
    createdAt: string;
    /** null tant que la réponse n'est pas jugée (run_mentions absent). */
    brandMentioned: boolean | null;
    competitorsMentioned: string[];
    citedDomains: string[];
  }[];
  failed: { model: string; count: number }[];
}

export interface ExportContext {
  prenom: string;
  /** Coût retenu du mois (journal de cost-guard.sh), null si inconnu. */
  spentUsd: number | null;
  capUsd: number;
  families: Family[];
}

/** Libellés vus par l'utilisateur (Mistral = Le Chat, comme dans le prototype). */
const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  mistral: "Le Chat",
  perplexity: "Perplexity",
  grok: "Grok",
};
const label = (model: string) => ENGINE_LABELS[model] ?? model;
const AGENTS = ["Orchestrateur", "Technique", "SEO", "Contenu", "AEO", "Conversion"];
const LANG_FR: Record<string, string> = { fr: "français", en: "anglais", ru: "russe", es: "espagnol", de: "allemand", it: "italien", ar: "arabe" };
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((100 * num) / den));
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildVisibility(b: SubjectBundle, elmo: ElmoExport, ctx: ExportContext): Visibility {
  const s = b.subject;
  const plan = b.measurement.engines.filter((e) => e.collection === "api").map((e) => e.model);
  const active = b.panel.prompts.filter((p) => p.status === "active");
  const window = b.measurement.windows.find((w) => w.kind === "baseline") ?? b.measurement.windows[0]!;
  // Seules les réponses jugées comptent dans les pourcentages.
  const judged = elmo.runs.filter((r) => r.brandMentioned !== null);
  const days = [...new Set(judged.map((r) => r.createdAt.slice(0, 10)))].sort();
  const daily = days.map((d) => {
    const rs = judged.filter((r) => r.createdAt.startsWith(d));
    return pct(rs.filter((r) => r.brandMentioned).length, rs.length);
  });
  const presence = pct(judged.filter((r) => r.brandMentioned).length, judged.length);
  const failedTotal = elmo.failed.reduce((n, f) => n + f.count, 0);
  const etat: Etat = elmo.runs.length === 0 ? "bloquant" : failedTotal > 0 ? "verifier" : "conforme";
  const facts = (cat: string) =>
    b.facts.facts.filter((f) => f.category === cat && f.status !== "rejected").map((f) => f.statement);
  const domainCounts = new Map<string, number>();
  for (const r of elmo.runs) for (const d of new Set(r.citedDomains)) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);

  const aDecider: Visibility["aDecider"] = [];
  if (!elmo.brand) {
    aDecider.push({ titre: `Lancer la mesure de départ · ${s.displayName}`, detail: "Compte Elmo à créer, puis scripts/j0-launch.sh." });
  }
  for (const f of elmo.failed) {
    aDecider.push({ titre: `Moteur en échec · ${label(f.model)}`, detail: `${f.count} appel(s) échoué(s) : voir scripts/j0-first-run.sh.` });
  }
  if (b.panel.status !== "validated") aDecider.push({ titre: `Valider le panel · ${s.displayName}`, detail: `${active.length} questions proposées.` });

  return {
    utilisateur: { prenom: ctx.prenom },
    aDecider,
    sites: [
      {
        slug: s.id,
        nom: s.displayName,
        url: host(s.urls.primary),
        panel: `${active.length} questions`,
        depart: window.start ? frDate(window.start) : "—",
        ia: judged.length ? presence : null,
        google: "Non connecté",
        etat,
      },
    ],
    agents: AGENTS,
    depenses: { montant: Math.round(100 * (ctx.spentUsd ?? 0)) / 100, plafond: ctx.capUsd },
    onboarding: {
      url: host(s.urls.primary),
      constats: [
        `${active.length} questions dans le panel v${b.panel.panelVersion}`,
        `Langues : ${s.languages.map((l) => LANG_FR[l] ?? l).join(" et ")}`,
        `${s.competitors.filter((c) => c.status !== "rejected").length} concurrents suivis`,
        `${plan.length} assistants mesurés`,
      ],
      activite: facts("identity")[0] ?? "—",
      lieu: facts("location")[0] ?? "—",
      langues: s.languages.map((l) => capitalize(LANG_FR[l] ?? l)).join(", "),
      offres: facts("offer"),
      concurrents: s.competitors.filter((c) => c.status !== "rejected").map((c) => c.name),
      connexions: [
        { nom: "Google Search Console", detail: "Requêtes, clics et pages indexées." },
        { nom: "Le dépôt du site", detail: "Permet de proposer des corrections précises." },
        { nom: "La fiche Google", detail: "Horaires, avis et catégorie de l'établissement." },
      ],
      questions: active.map((p) => ({ q: p.text, marque: p.family === "branded" })),
      assistants: plan.map(label),
      bloquants: [],
      // Aucun audit encore rattaché au site : tous les contrôles sont « à vérifier ».
      familles: ctx.families.map((f) => [f.title, 0, f.checks.length, 0] as [string, number, number, number]),
    },
    vueSite: {
      nom: s.displayName,
      url: host(s.urls.primary),
      presence,
      min: daily.length ? Math.min(...daily) : 0,
      max: daily.length ? Math.max(...daily) : 0,
      jours: days.length,
      parAssistant: plan.map((m) => {
        const rs = judged.filter((r) => r.model === m);
        return { nom: label(m), v: pct(rs.filter((r) => r.brandMentioned).length, rs.length) };
      }),
      sources: [...domainCounts.entries()]
        .sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))
        .slice(0, 5)
        .map(([nom, n]) => ({ nom, n })),
      concurrents: elmo.competitors.map((c) => ({
        nom: c.name,
        v: pct(judged.filter((r) => r.competitorsMentioned.includes(c.name)).length, judged.length),
      })),
      recommandations: [],
      historique: days.length
        ? [
            {
              fenetre: `${frDate(days[0]!)} – ${frDate(days[days.length - 1]!)}`,
              v: presence,
              min: Math.min(...daily),
              max: Math.max(...daily),
              statut: window.kind === "baseline" ? "Mesure de départ" : "Mesure de suivi",
            },
          ]
        : [],
    },
  };
}

/** Dernier coût retenu du mois en cours dans le journal de cost-guard.sh. */
export function spentFromJournal(csv: string, month: string): number | null {
  const [header, ...rows] = csv.trim().split("\n");
  if (!header) return null;
  const cols = header.split(",");
  const iMonth = cols.indexOf("month_utc");
  const iRetained = cols.indexOf("retained_usd");
  if (iMonth < 0 || iRetained < 0) return null;
  for (const row of rows.reverse()) {
    const f = row.split(",");
    const v = Number(f[iRetained]);
    if (f[iMonth] === month && Number.isFinite(v)) return v;
  }
  return null;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, exportFile, journalFile] = process.argv.slice(2);
  try {
    if (!subjectId || !exportFile) throw new Error("usage: tsx src/vis-export.ts <subjectId> <elmo-export.json> [cost-journal.csv]");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const elmo = JSON.parse(readFileSync(exportFile, "utf8")) as ElmoExport;
    const month = new Date().toISOString().slice(0, 7);
    const spent = journalFile && existsSync(journalFile) ? spentFromJournal(readFileSync(journalFile, "utf8"), month) : null;
    const v = buildVisibility(loadSubject(dir), elmo, {
      prenom: process.env.OIA_VIS_PRENOM ?? "Mickaël",
      spentUsd: spent,
      capUsd: Number(process.env.OIA_VIS_MONTHLY_CAP_USD ?? 30),
      families: loadFamilies(),
    });
    process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`vis-export : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

/**
 * Préparation de P2 (mandat v7, bloc D) : mission manuelle de SEO Command,
 * correctifs prêts à valider sur une COPIE LOCALE du dépôt du site, fiche de
 * décision. Rien n'est poussé ; aucun appel à un modèle.
 *
 * D1 · cinq agents déterministes (technique, SEO, contenu, AEO, conversion)
 *      qui ne lisent que l'audit Crawlie, les recommandations déjà produites,
 *      le modèle de vérification et les faits validés. Un agent qui aurait
 *      besoin d'un modèle pour rédiger produit un plan de rédaction, et le dit.
 * D2 · correctifs calculés sur l'état réel de la copie locale, chacun dans
 *      une demande de fusion simulée (src/repo/pr.ts) : diff, raison,
 *      contrôle concerné, risque. Les valeurs inconnues restent __TO_FILL__.
 * D3 · subjects/<sujet>/p2/decisions.md.
 *
 * CLI : tsx src/p2-prepare.ts <subjectId> <copie locale> <dossier de sortie> [ref de base]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { createActionLog } from "./seo-command/action-log.js";
import type { AgentOutput, Executor } from "./seo-command/executor.js";
import { MissionSchema, type Mission } from "./seo-command/mission.js";
import { tick } from "./seo-command/orchestrator.js";
import { createQueue } from "./seo-command/queue.js";
import { readRepo, type RepoMap } from "./repo/reader.js";
import { type Fix, fixPriceSsrPlaceholder, unifiedDiff } from "./repo/fixers.js";
import { prepareSimulatedPR } from "./repo/pr.js";
import type { Client, Site } from "./tenancy.js";
import { flatChecks } from "./verification.js";
import { profileUrls } from "./j0-reanalysis.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

export type AgentName = "technique" | "seo" | "contenu" | "aeo" | "conversion";
export const AGENTS: AgentName[] = ["technique", "seo", "contenu", "aeo", "conversion"];

export interface Finding {
  agent: AgentName;
  checkId: string;
  finding: string;
  source: string;
  /** Vrai si l'agent aurait besoin d'un modèle pour rédiger : il livre un plan. */
  needsWriting?: boolean;
}

/** Règle Crawlie → agent et contrôle du modèle de vérification. */
const CRAWLIE_RULES: Record<string, { agent: AgentName; checkId: string; writing?: boolean }> = {
  "schema-missing-required": { agent: "technique", checkId: "E03" },
  "schema-missing-recommended": { agent: "technique", checkId: "E06" },
  "structured-data-missing": { agent: "technique", checkId: "E01" },
  "canonical-missing": { agent: "technique", checkId: "B03" },
  noindex: { agent: "technique", checkId: "B06" },
  nofollow: { agent: "technique", checkId: "B06" },
  "blocked-by-robots": { agent: "technique", checkId: "B04" },
  "h1-multiple": { agent: "seo", checkId: "D03" },
  "title-too-short": { agent: "seo", checkId: "D01" },
  "description-missing": { agent: "seo", checkId: "D02", writing: true },
  "image-missing-alt": { agent: "contenu", checkId: "D05", writing: true },
  "thin-content": { agent: "contenu", checkId: "F08", writing: true },
  "geo-not-answerable": { agent: "contenu", checkId: "F05", writing: true },
  "geo-no-author": { agent: "aeo", checkId: "E05" },
  "geo-no-structured-data": { agent: "aeo", checkId: "E01" },
  "geo-no-llms-txt": { agent: "aeo", checkId: "H07", writing: true },
  "a11y-input-no-label": { agent: "conversion", checkId: "I02" },
};

export interface MissionInputs {
  crawlie: { issues: { rule: string; title: string; url: string; detail?: string }[] };
  crawlieRef: string;
  recommendations: { id: string; title: string; type: string }[];
}

export function agentFindings(b: SubjectBundle, inputs: MissionInputs, agent: AgentName): Finding[] {
  const known = new Set(flatChecks().map((c) => c.id));
  const out: Finding[] = [];
  const grouped = new Map<string, { n: number; urls: Set<string>; title: string; detail?: string }>();
  for (const i of inputs.crawlie.issues) {
    const r = CRAWLIE_RULES[i.rule];
    if (!r || r.agent !== agent) continue;
    const g = grouped.get(i.rule) ?? { n: 0, urls: new Set<string>(), title: i.title, detail: i.detail };
    g.n++;
    g.urls.add(i.url);
    grouped.set(i.rule, g);
  }
  for (const [rule, g] of grouped) {
    const r = CRAWLIE_RULES[rule]!;
    out.push({
      agent,
      checkId: r.checkId,
      finding: `${g.title} (${g.n}×, ${[...g.urls].length} page(s))${g.detail ? ` : ${g.detail}` : ""}`,
      source: `${inputs.crawlieRef}#issues[rule=${rule}]`,
      needsWriting: r.writing,
    });
  }
  const facts = b.facts.facts;
  if (agent === "aeo") {
    for (const f of facts.filter((x) => x.category === "price" && x.status !== "validated")) {
      out.push({ agent, checkId: "F02", finding: `Prix non validés (« ${f.statement} ») : les assistants ne peuvent pas citer de prix exact.`, source: `facts.yaml#${f.id}` });
    }
    if (profileUrls(b).length) out.push({ agent, checkId: "E02", finding: `Profils officiels à déclarer en sameAs : ${profileUrls(b).join(", ")}.`, source: "facts.yaml (faits contact validés)" });
  }
  if (agent === "conversion") {
    for (const rec of inputs.recommendations.filter((x) => /price|prix/i.test(`${x.id} ${x.title}`))) {
      out.push({ agent, checkId: "C02", finding: `Prix et offres lisibles sans JavaScript : ${rec.title}.`, source: `recommendations/${rec.id}.json` });
    }
  }
  return out.filter((f) => known.has(f.checkId));
}

/** Exécuteur déterministe d'un agent : lit les fichiers fournis, aucun appel à un modèle. */
export function createFileAgentExecutor(b: SubjectBundle, inputs: MissionInputs, agent: AgentName, sink: Finding[]): Executor {
  return {
    name: "manual",
    enabled: true,
    async execute(): Promise<AgentOutput> {
      const found = agentFindings(b, inputs, agent);
      sink.push(...found);
      const writing = found.filter((f) => f.needsWriting).length;
      return {
        recommendationIds: found.map((f) => `p2-${agent}-${f.checkId}`),
        evidenceIds: [...new Set(found.map((f) => f.source))],
        costUsd: 0,
        hasWriteProposal: found.length > 0,
        notes: `${found.length} constat(s), lecture de fichiers seulement, aucun modèle${writing ? ` ; ${writing} plan(s) de rédaction au lieu de texte` : ""}.`,
      };
    },
  };
}

export async function runP2Mission(b: SubjectBundle, inputs: MissionInputs, today: string) {
  const queue = createQueue();
  const log = createActionLog();
  const findings: Finding[] = [];
  const executors: Record<string, Executor> = {};
  for (const agent of AGENTS) {
    executors[agent] = createFileAgentExecutor(b, inputs, agent, findings);
    queue.enqueue(
      MissionSchema.parse({
        id: `msn-p2-${b.subject.id}-${agent}`,
        type: agent === "technique" ? "audit-technique" : "audit-seo",
        clientId: b.subject.ownership === "internal" ? "oia-internal" : b.subject.id,
        subjectId: b.subject.id,
        trigger: "manual",
        agents: [agent],
        reservedBudgetUsd: 0,
        actualCostUsd: 0,
        state: "planned",
        createdAt: today,
        updatedAt: today,
        results: { recommendationIds: [], evidenceIds: [] },
        checkIds: [],
      } satisfies Mission),
    );
  }
  const budget = {
    reserve: () => "ok" as const,
    settle: () => undefined,
    cancel: () => undefined,
    reservedUsd: () => 0,
    spentUsd: () => 0,
    capUsd: () => 0,
  };
  const missions: Mission[] = [];
  for (let i = 0; i < AGENTS.length; i++) {
    const m = await tick({ queue, budget: budget as never, log, executors }, "p2-manual");
    if (m) missions.push(m);
  }
  return { missions, findings, log: log.all() };
}

// ---- D2 : correctifs sur l'état réel de la copie locale ---------------------------

export interface P2Fix {
  slug: string;
  title: string;
  checkIds: string[];
  google: string;
  assistants: string;
  fixes: Fix[];
  blockedBy?: string;
}

const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
function fix(kind: Fix["kind"], path: string, before: string | null, after: string, rationale: string, risk: Fix["risk"]): Fix {
  return { id: `${kind}-${shortHash(`${path}|${after}`)}`, kind, path, before, after, rationale, risk };
}

/** Ajoute des adresses aux tableaux sameAs existants du JSON-LD (texte modifié au plus juste). */
export function addSameAs(html: string, urls: string[]): string {
  return html.replace(/("sameAs"\s*:\s*\[)([^\]]*?)(\s*\])/g, (all, open: string, items: string, close: string) => {
    const missing = urls.filter((u) => !items.includes(`"${u}"`));
    if (!missing.length) return all;
    const sep = items.trim() ? ", " : "";
    return `${open}${items}${sep}${missing.map((u) => `"${u}"`).join(", ")}${close}`;
  });
}

/** Pose prix et devise à remplir sur chaque Offer qui n'en a pas. */
export function addOfferPricePlaceholders(html: string): string {
  return html.replace(/"@type"\s*:\s*"Offer"\s*,(?![^{}]*"price")/g, '"@type": "Offer", "price": "__TO_FILL__", "priceCurrency": "__TO_FILL__",');
}

/**
 * `publicPages` : pages publiques du site (freeze-surface.yaml du sujet). Les pages de
 * back-office du dépôt (administration, courriels, paiement) ne sont pas analysées.
 */
export function computeP2Fixes(b: SubjectBundle, m: RepoMap, publicPages?: string[]): { fixes: P2Fix[]; notes: string[] } {
  const out: P2Fix[] = [];
  const notes: string[] = [];
  const read = (p: string) => readFileSync(join(m.root, p), "utf8");
  const isPublic = (p: string) => /\.html?$/.test(p) && (!publicPages || publicPages.includes(p));
  const ldFiles = m.jsonLdFiles.filter(isPublic);
  const prices = b.facts.facts.filter((f) => f.category === "price" && f.status === "validated");

  const profiles = profileUrls(b);
  const sameAs = ldFiles
    .map((p) => ({ p, before: read(p) }))
    .map(({ p, before }) => ({ p, before, after: addSameAs(before, profiles) }))
    .filter((x) => x.after !== x.before);
  if (sameAs.length) {
    out.push({
      slug: "sameas-profils",
      title: "JSON-LD : profils officiels manquants dans sameAs",
      checkIds: ["E02", "N03"],
      google: "Relie l'entité du site à tous ses profils officiels (graphe de connaissances).",
      assistants: "Les assistants peuvent rattacher les profils à la marque, et donc les citer pour elle.",
      fixes: sameAs.map(({ p, before, after }) => fix("jsonld-organization", p, before, after, "Ajout des profils officiels validés (facts.yaml) aux tableaux sameAs existants.", "low")),
    });
  } else notes.push("E02 / N03 : tous les profils officiels sont déjà déclarés en sameAs.");

  const offers = ldFiles
    .map((p) => ({ p, before: read(p) }))
    .map(({ p, before }) => ({ p, before, after: addOfferPricePlaceholders(before) }))
    .filter((x) => x.after !== x.before);
  if (offers.length) {
    out.push({
      slug: "offres-prix",
      title: "JSON-LD : prix et devise sur chaque offre",
      checkIds: ["E03", "E07"],
      google: "Offres éligibles aux résultats enrichis une fois le prix posé ; supprime l'avertissement « Offer sans price ».",
      assistants: "Le prix devient lisible dans les données structurées : réponses exactes aux questions de prix.",
      fixes: offers.map(({ p, before, after }) => fix("jsonld-product", p, before, after, "Prix et devise à remplir sur chaque Offer (aucun prix validé : __TO_FILL__, règle 12).", prices.length ? "low" : "medium")),
      blockedBy: prices.length ? undefined : "prix validés par Mickaël et Gari (fait f-prices « à fournir »)",
    });
  }

  const pricePages = m.pageFiles.filter((p) => isPublic(p) && !/\b(AED|USD|ZAR)\b|\$\s?\d/.test(read(p).replace(/<script[\s\S]*?<\/script>/g, "")));
  if (pricePages.length) {
    out.push({
      slug: "prix-sans-js",
      title: "Prix et offres lisibles sans JavaScript",
      checkIds: ["C02", "F02"],
      google: "Le prix figure dans le HTML servi : indexable sans exécution de JavaScript.",
      assistants: "Les robots des assistants lisent le prix dans la page elle-même.",
      fixes: pricePages.slice(0, 1).map((p) =>
        fixPriceSsrPlaceholder(m, p, `Aucun prix n'apparaît dans le HTML servi de ${pricePages.length} page(s) d'offre (${pricePages.join(", ")}). Les prix ne sont pas validés : ce correctif décrit où et comment les afficher, sans valeur inventée.`),
      ),
      blockedBy: prices.length ? undefined : "prix validés par Mickaël et Gari",
    });
  }

  const noindex = m.pageFiles.filter((p) => isPublic(p) && /<meta\s+name="robots"[^>]*noindex/i.test(read(p)));
  if (noindex.length) notes.push(`B06 : noindex présent sur ${noindex.join(", ")} : levée en correctif séparé, décision de Mickaël et de Gari.`);
  else notes.push("B06 : aucune page publique en noindex dans la copie locale : la levée du noindex est sans objet (déjà faite dans le dépôt du site).");

  // Titres et descriptions : unicité et longueur (D01, D02). Réécrire un texte demande un
  // modèle : l'agent contenu livre un plan, pas un texte.
  const pages = m.pageFiles.filter(isPublic);
  const meta = pages.map((p) => {
    const h = read(p);
    const title = /<title>([^<]*)<\/title>/i.exec(h)?.[1]?.trim() ?? "";
    const description = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(h)?.[1] ?? "";
    return { p, title, description };
  });
  const dupTitles = meta.filter((x, i) => meta.findIndex((y) => y.title === x.title) !== i);
  const badTitles = meta.filter((x) => x.title.length < 30 || x.title.length > 60);
  const badDesc = meta.filter((x) => x.description.length < 70 || x.description.length > 155);
  notes.push(dupTitles.length || badTitles.length ? `D01 : titres à revoir : ${[...new Set([...dupTitles, ...badTitles].map((x) => x.p))].join(", ")}.` : "D01 : titres uniques, entre 30 et 60 caractères.");
  if (badDesc.length) {
    notes.push(`D02 : plan de rédaction (pas de texte sans modèle) : ramener à 155 caractères au plus les descriptions de ${badDesc.map((x) => `${x.p} (${x.description.length})`).join(", ")}, en gardant le lieu et l'offre.`);
  } else notes.push("D02 : descriptions uniques et de bonne longueur.");
  return { fixes: out, notes };
}

export function renderDecisions(b: SubjectBundle, base: string, fixes: P2Fix[], prs: { slug: string; branch: string; commitSha: string; file: string }[], notes: string[], findings: Finding[]): string {
  const L: string[] = [];
  L.push(`# P2 · correctifs de ${b.subject.displayName} à valider`, "");
  L.push(`Préparés le ${new Date().toISOString().slice(0, 10)} sur une copie locale du dépôt du site (base \`${base.slice(0, 7)}\`), hors du dépôt OIA. **Rien n'est poussé.** Les correctifs validés ne seront publiés qu'après la validation du rapport J0 (gel actif).`, "");
  L.push("| # | Correctif | Contrôles | Risque | Bloqué par | Valider |", "|---|---|---|---|---|---|");
  fixes.forEach((f, i) => L.push(`| ${i + 1} | ${f.title} | ${f.checkIds.join(", ")} | ${[...new Set(f.fixes.map((x) => x.risk))].join(", ")} | ${f.blockedBy ?? "—"} | [ ] |`));
  L.push("");
  fixes.forEach((f, i) => {
    const pr = prs.find((x) => x.slug === f.slug);
    L.push(`## ${i + 1} · ${f.title}`, "");
    L.push(`- **Pour Google** : ${f.google}`);
    L.push(`- **Pour les assistants** : ${f.assistants}`);
    L.push(`- **Contrôles** : ${f.checkIds.join(", ")} · **risque** : ${[...new Set(f.fixes.map((x) => x.risk))].join(", ")}`);
    if (f.blockedBy) L.push(`- **Bloqué par** : ${f.blockedBy}`);
    if (pr) L.push(`- **Demande de fusion simulée** : branche \`${pr.branch}\` (commit \`${pr.commitSha.slice(0, 7)}\`, copie locale), détail dans \`${pr.file}\``);
    L.push(`- [ ] valider`, "");
  });
  L.push("## Sans correctif (constats et plans)", "");
  for (const n of notes) L.push(`- ${n}`);
  L.push("", "## Mission SEO Command (D1)", "");
  L.push("Cinq agents en mode manuel, lecture de fichiers seulement, aucun modèle. Constats de l'audit Crawlie (antérieur à la publication des pages de service : à refaire après J0).", "");
  for (const a of AGENTS) {
    const fs = findings.filter((f) => f.agent === a);
    L.push(`### ${a}`, "");
    for (const f of fs) L.push(`- ${f.checkId} · ${f.finding}${f.needsWriting ? " · *plan de rédaction, pas de texte*" : ""} (source : ${f.source})`);
    if (!fs.length) L.push("- aucun constat");
    L.push("");
  }
  return `${L.join("\n")}\n`;
}

function latestAuditDir(subjectDir: string): string {
  const root = join(subjectDir, "audits");
  const dates = existsSync(root) ? readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  if (!dates.length) throw new Error(`aucun audit dans ${root}`);
  return join(root, dates[dates.length - 1]!);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, copy, outDir, baseRef = "oia-p2-base"] = process.argv.slice(2);
  (async () => {
    if (!subjectId || !copy || !outDir) throw new Error("usage: tsx src/p2-prepare.ts <subjectId> <copie locale> <dossier de sortie> [ref de base]");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const remotes = execFileSync("git", ["-C", copy, "remote"], { encoding: "utf8" }).trim();
    if (remotes) throw new Error(`la copie locale a un remote (${remotes}) : refus, rien ne doit pouvoir être poussé`);
    const b = loadSubject(dir);
    const audit = latestAuditDir(dir);
    const recDir = join(audit, "recommendations");
    const inputs: MissionInputs = {
      crawlie: JSON.parse(readFileSync(join(audit, "crawlie.json"), "utf8")),
      crawlieRef: `audits/${audit.split(/[\\/]/).pop()}/crawlie.json`,
      recommendations: existsSync(recDir) ? readdirSync(recDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(recDir, f), "utf8"))) : [],
    };
    const today = new Date().toISOString().slice(0, 10);
    const mission = await runP2Mission(b, inputs, today);
    const git = (...a: string[]) => execFileSync("git", ["-C", copy, ...a], { encoding: "utf8" }).trim();
    git("checkout", "-q", "--detach", baseRef);
    const base = git("rev-parse", "HEAD");
    const surface = join(dir, "freeze-surface.yaml");
    const publicPages = existsSync(surface)
      ? ((parse(readFileSync(surface, "utf8")) as { publicFiles?: string[] }).publicFiles ?? []).filter((p) => /\.html?$/.test(p))
      : undefined;
    const { fixes, notes } = computeP2Fixes(b, readRepo(copy), publicPages);
    const client = { id: "oia-internal", displayName: "OIA (interne)", ownership: "internal", status: "active", monthlyBudgetUsd: 0, defaultRepoActionMode: "proposition", contacts: [] } as unknown as Client;
    const site = { id: b.subject.id, clientId: "oia-internal", primaryUrl: b.subject.urls.primary, additionalUrls: [], status: "active", repository: { url: copy, branch: "main", actionMode: "proposition" } } as unknown as Site;
    mkdirSync(join(outDir, "prs"), { recursive: true });
    const prs: { slug: string; branch: string; commitSha: string; file: string }[] = [];
    fixes.forEach((f, i) => {
      git("checkout", "-q", "--detach", base);
      const pr = prepareSimulatedPR({ client, site, repoRoot: copy, fixes: f.fixes, recommendationId: `p2-${f.slug}`, decisionId: "en-attente-de-validation", evidences: [], title: f.title });
      const file = join("prs", `${String(i + 1).padStart(2, "0")}-${f.slug}.md`);
      // Le diff complet de pr.ts recopie les fichiers entiers : on garde le vrai diff git de la branche.
      const realDiff = git("diff", base, pr.commitSha);
      const body = pr.body.split("\n## Diffs")[0]!.replace("approuvée dans la décision `en-attente-de-validation`", "en attente de validation par Mickaël");
      writeFileSync(
        join(outDir, file),
        `# ${pr.title}\n\nContrôles : ${f.checkIds.join(", ")}${f.blockedBy ? ` · bloqué par : ${f.blockedBy}` : ""}\n\n${body}\n\n## Diff (copie locale, \`git diff ${base.slice(0, 7)} ${pr.commitSha.slice(0, 7)}\`)\n\n\`\`\`diff\n${realDiff}\n\`\`\`\n`,
      );
      prs.push({ slug: f.slug, branch: pr.branch, commitSha: pr.commitSha, file });
    });
    git("checkout", "-q", "--detach", base);
    writeFileSync(join(outDir, "decisions.md"), renderDecisions(b, base, fixes, prs, notes, mission.findings));
    writeFileSync(join(outDir, "mission-d1.json"), `${JSON.stringify({ missions: mission.missions.map((m) => ({ id: m.id, agents: m.agents, state: m.state, results: m.results, actualCostUsd: m.actualCostUsd })), log: mission.log }, null, 2)}\n`);
    process.stdout.write(`${fixes.length} correctif(s), ${mission.missions.length} mission(s) : ${join(outDir, "decisions.md")}\n`);
  })().catch((err) => {
    process.stderr.write(`p2-prepare : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

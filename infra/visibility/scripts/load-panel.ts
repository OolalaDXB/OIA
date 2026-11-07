#!/usr/bin/env tsx
/**
 * Chargement d'un panel OIA dans Elmo — SIMULATION par défaut.
 *
 * Mandat du 2026-11-07 : générique (il prend l'id du sujet en argument,
 * le runbook J0 montre son usage pour le premier pilote). Il n'exécute
 * AUCUN appel réseau réel : sans le drapeau d'engagement explicite
 * `--i-have-validated-and-am-ready-to-send-to-elmo`, le script imprime
 * uniquement ce qu'il POSTerait à l'API REST d'Elmo (voir HANDOFF §2.1 :
 * endpoints `/brands`, `/competitors`, `/prompts`, pas d'import de
 * réponses). Avec ce drapeau, il s'arrête avec une erreur rappelant qu'il
 * n'est pas encore outillé pour appeler Elmo : la mise en route d'Elmo
 * reste manuelle (via l'interface web à http://localhost:1515) en P1.
 *
 * Usage (depuis infra/visibility) :
 *   tsx scripts/load-panel.ts <subjectId>              # dry-run (défaut)
 *   tsx scripts/load-panel.ts <subjectId> --json       # payload brut
 *   tsx scripts/load-panel.ts <subjectId> --i-have-validated-and-am-ready-to-send-to-elmo  # refuse
 *
 * Règles respectées :
 *   - ne lit aucun secret (pas d'ELMO_API_KEY lu ici) ;
 *   - ne touche pas au conteneur Elmo (aucun docker compose) ;
 *   - ne modifie aucun fichier du sujet ;
 *   - panel v(X) doit être validé avant le dry-run (sauf --draft).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  defaultSubjectsDir,
  enginePlan,
  listSubjectDirs,
  loadSubject,
} from "../src/load.ts";
import { renderElmoBrief } from "../src/render.ts";
import type { SubjectBundle } from "../src/schema.ts";

const argv = process.argv.slice(2);
const subjectId = argv.find((a) => !a.startsWith("--"));
const draft = argv.includes("--draft");
const asJson = argv.includes("--json");
const forReal = argv.includes("--i-have-validated-and-am-ready-to-send-to-elmo");

if (!subjectId) {
  console.error(
    "usage: tsx scripts/load-panel.ts <subjectId> [--draft] [--json] [--i-have-validated-and-am-ready-to-send-to-elmo]",
  );
  process.exit(2);
}

const root = defaultSubjectsDir();
const dir = listSubjectDirs(root).find(
  (d) => d.endsWith(`/${subjectId}`) || d.endsWith(`\\${subjectId}`),
);
if (!dir) {
  console.error(`erreur : aucun sujet "${subjectId}" dans ${root}`);
  process.exit(2);
}
const bundle: SubjectBundle = loadSubject(dir);

if (bundle.panel.status !== "validated" && !draft) {
  console.error(
    `erreur : le panel v${bundle.panel.panelVersion} de ${subjectId} est ${bundle.panel.status} ; utilisez --draft pour une répétition.`,
  );
  process.exit(2);
}

const brief = JSON.parse(renderElmoBrief(bundle)) as ReturnType<typeof renderElmoBriefType>;
type renderElmoBriefType = () => {
  brand: {
    slug: string;
    name: string;
    website: string;
    additionalDomains: string[];
    aliases: string[];
    enabledModels: string[];
  };
  reportLanguages: Record<string, string[]>;
  manualEngines: string[];
  competitors: { name: string; domains: string[]; aliases: string[] }[];
  prompts: { value: string; tags: string[] }[];
  panelStatus: string;
};

// Elmo expose son API REST sur http://localhost:1515/api (voir compose.yaml).
// Les chemins utilisés sont ceux documentés par Elmo (HANDOFF §2.1).
const ELMO_API = process.env.ELMO_API ?? "http://localhost:1515/api";

type Call = { method: "POST" | "PUT"; path: string; body: unknown; note?: string };

const plan = enginePlan(bundle);
const calls: Call[] = [];

// 1) La marque : slug, nom, site, alias, domaines additionnels, moteurs
calls.push({
  method: "POST",
  path: "/brands",
  body: {
    slug: brief.brand.slug,
    name: brief.brand.name,
    website: brief.brand.website,
    additionalDomains: brief.brand.additionalDomains,
    aliases: brief.brand.aliases,
    enabledModels: brief.brand.enabledModels,
  },
  note: `${brief.brand.enabledModels.length} moteurs activés sur cette marque`,
});

// 2) Les concurrents
for (const c of brief.competitors) {
  calls.push({
    method: "POST",
    path: "/competitors",
    body: {
      brandSlug: brief.brand.slug,
      name: c.name,
      domains: c.domains,
      aliases: c.aliases,
    },
  });
}

// 3) Les questions actives, une par appel (pas de batch REST connu)
for (const p of brief.prompts) {
  calls.push({
    method: "POST",
    path: "/prompts",
    body: {
      brandSlug: brief.brand.slug,
      value: p.value,
      tags: p.tags,
    },
    note: p.tags.find((t) => t.startsWith("oia:")) ?? "",
  });
}

// 4) Rappel : AUCUN import de réponses. Elmo mesure lui-même.
// 5) Rappel : le worker ne doit pas être démarré avant que Mickaël pose les
//    clés et vérifie `cost-guard.sh`. Ce script ne démarre rien.

if (forReal) {
  console.error(
    "refus : ce script ne sait pas appeler l'API d'Elmo en P1 (règle du mandat : rien n'est envoyé à Elmo depuis OIA).\n" +
      "La bascule « pour de vrai » se fait manuellement dans l'interface Elmo à http://localhost:1515, avec le brief imprimé ci-dessus.",
  );
  process.exit(3);
}

const summary = {
  subject: subjectId,
  elmoApi: ELMO_API,
  panelVersion: bundle.panel.panelVersion,
  panelStatus: bundle.panel.status,
  engines: {
    enabled: plan.enabledModels,
    manual: plan.manualEngines,
    reportLanguages: plan.reportLanguages,
  },
  callsPlanned: calls.length,
  payloadCountsByPath: calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.path] = (acc[c.path] ?? 0) + 1;
    return acc;
  }, {}),
};

if (asJson) {
  process.stdout.write(`${JSON.stringify({ summary, calls }, null, 2)}\n`);
  process.exit(0);
}

// Format humain (lecture rapide)
const L: string[] = [];
L.push(`SIMULATION — chargement du panel ${subjectId} dans Elmo (${ELMO_API})`);
L.push(`  panel v${summary.panelVersion} · ${summary.panelStatus}`);
L.push(`  moteurs activés : ${summary.engines.enabled.join(", ") || "aucun"}`);
L.push(`  moteurs manuels (pas Elmo) : ${summary.engines.manual.join(", ") || "aucun"}`);
L.push(`  appels planifiés : ${summary.callsPlanned}`);
for (const [path, n] of Object.entries(summary.payloadCountsByPath))
  L.push(`    - ${n} × ${path}`);
L.push("");
L.push("Liste des appels (aucun exécuté) :");
for (const c of calls) {
  const short = typeof c.body === "object" && c.body && "value" in (c.body as Record<string, unknown>)
    ? (c.body as Record<string, unknown>).value
    : (c.body as Record<string, unknown>).slug ?? (c.body as Record<string, unknown>).name;
  L.push(`  ${c.method.padEnd(4)} ${c.path.padEnd(16)} ${JSON.stringify(short)}${c.note ? ` // ${c.note}` : ""}`);
}
L.push("");
L.push("Pour envoyer réellement à Elmo : utiliser l'interface http://localhost:1515 (P1, pas d'écriture automatique).");
L.push("Pour le payload complet en JSON : rejouer avec --json.");

process.stdout.write(`${L.join("\n")}\n`);

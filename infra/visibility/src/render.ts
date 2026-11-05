import type { Prompt, SubjectBundle } from "./schema";

const GENERATED = "<!-- Généré par `pnpm --filter @oia/visibility-infra subjects review <id>` : ne pas éditer à la main. -->";

const mark = (s: string) => (s === "confirmed" || s === "validated" ? "✅" : s === "rejected" ? "❌" : "❓");

/** Human review sheet of one subject, regenerated from its YAML files. */
export function renderReview(b: SubjectBundle): string {
  const { subject: s, panel, facts } = b;
  const L: string[] = [GENERATED, "", `# ${s.displayName} — revue (panel v${panel.panelVersion}, ${panel.status})`, ""];
  L.push("✅ confirmé · ❓ proposé, à confirmer · ❌ rejeté", "");
  L.push("## Identité", "", `- Site : ${s.urls.primary}`);
  for (const a of s.urls.additional) L.push(`- Autre URL ${mark(a.status)} : ${a.url}${a.note ? ` (${a.note})` : ""}`);
  L.push(`- Langues : ${s.languages.join(", ")}`);
  L.push(`- Marchés : ${s.markets.map((m) => `${m.label} (${m.country}) ${mark(m.status)}`).join(" · ")}`, "");
  L.push("## Alias", "", "| Alias | Type | Statut | Note |", "|---|---|---|---|");
  for (const a of s.aliases) L.push(`| ${a.value} | ${a.kind} | ${mark(a.status)} | ${a.note ?? ""} |`);
  L.push("", "## Concurrents", "", "| Nom | Domaines | Catégorie | Marchés | Statut | Pourquoi |", "|---|---|---|---|---|---|");
  for (const c of s.competitors)
    L.push(`| ${c.name} | ${c.domains.join(", ") || "à vérifier"} | ${c.category} | ${c.markets.join(", ")} | ${mark(c.status)} | ${c.rationale} |`);
  L.push("", "## Panel", "");
  const active = panel.prompts.filter((p) => p.status === "active");
  for (const language of s.languages) {
    const rows = active.filter((p: Prompt) => p.language === language);
    L.push(`### ${language.toUpperCase()} (${rows.length} questions, dont ${rows.filter((p) => p.family === "branded").length} marquées)`, "");
    L.push("| ID | Famille | Marchés | Question | Origine |", "|---|---|---|---|---|");
    for (const p of rows)
      L.push(`| ${p.id}@v${p.version} | ${p.family === "branded" ? "marquée" : "non marquée"} | ${p.markets.join(", ")} | ${p.text} | ${p.origin} |`);
    L.push("");
  }
  L.push("## Faits de référence", "", "| ID | Fait | Statut | Source |", "|---|---|---|---|");
  for (const f of facts.facts) L.push(`| ${f.id} | ${f.statement} | ${mark(f.status)} ${f.status} | ${f.sourceId} |`);
  if (s.openQuestions.length) L.push("", "## Questions ouvertes", "", ...s.openQuestions.map((q) => `- ${q}`));
  return `${L.join("\n")}\n`;
}

/**
 * What to type into Elmo for one subject (brand, domains, aliases, competitors,
 * prompts with traceability tags). Elmo is configured by hand from this sheet:
 * no OIA code writes into Elmo in P1.
 */
export function renderElmoBrief(b: SubjectBundle): string {
  const { subject: s, panel } = b;
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  const usable = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status !== "rejected");
  const brief = {
    brand: {
      slug: s.id,
      name: s.displayName,
      website: s.urls.primary,
      additionalDomains: usable(s.urls.additional).map((a) => host(a.url)),
      aliases: usable(s.aliases).filter((a) => a.kind !== "domain").map((a) => a.value),
    },
    competitors: usable(s.competitors).map((c) => ({ name: c.name, domains: c.domains, aliases: c.aliases })),
    prompts: panel.prompts
      .filter((p) => p.status === "active")
      .map((p) => ({
        value: p.text,
        tags: [`oia:${p.id}@v${p.version}`, `panel:v${panel.panelVersion}`, `lang:${p.language}`, `family:${p.family}`],
      })),
    panelStatus: panel.status,
  };
  return `${JSON.stringify(brief, null, 2)}\n`;
}

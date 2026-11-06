import type { Recommendation } from "./recommendation";
import type { WindowStats } from "./stats/engine";

/**
 * Gabarit de rapport client (F5). Produit un rapport **Markdown** par site
 * et par fenêtre. Un simple adaptateur produit la version HTML (via une
 * librairie en G1 plus tard) ; ici on expose aussi `renderHtml()` qui fait
 * une conversion naïve, suffisante pour un exemple fictif.
 */

export interface ClientReportInput {
  clientName: string;
  siteUrl: string;
  subjectId: string;
  windowId: string;
  perEngine: Array<{ engine: string; stats: WindowStats }>;
  citations: Array<{ engine: string; url: string; promptId?: string }>;
  factualErrors: Array<{ factId: string; engine: string; detail: string }>;
  recommendations: Recommendation[];
  limit: {
    note: string; // Mention explicite des limites API / application
  };
}

export function renderMarkdown(input: ClientReportInput): string {
  const lines: string[] = [];
  lines.push(`# Rapport OIA Visibility · ${input.clientName}`, "");
  lines.push(`**Site :** <${input.siteUrl}>`);
  lines.push(`**Sujet :** \`${input.subjectId}\` · **Fenêtre :** \`${input.windowId}\``);
  lines.push("");
  lines.push("## Métriques par fournisseur", "");
  lines.push("| Moteur | Mentions moy. | Intervalle | Citations moy. | Changement démontrable | Changement de modèle | Coût USD |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const e of input.perEngine) {
    const s = e.stats;
    lines.push(
      `| ${e.engine} | ${s.meanBrandMentions.toFixed(2)} | ${s.rangeBrandMentions.min}-${s.rangeBrandMentions.max} | ${s.meanBrandCitations.toFixed(2)} | ${s.demonstrableChange ? "oui" : "non"} | ${s.modelVersionChanged ? "oui" : "non"} | ${s.totalCostUsd.toFixed(2)} |`,
    );
  }
  lines.push("", "## Sources citées par les IA", "");
  if (input.citations.length === 0) lines.push("_Aucune citation sur la fenêtre._");
  else for (const c of input.citations) lines.push(`- (${c.engine}) ${c.url}${c.promptId ? ` — question \`${c.promptId}\`` : ""}`);
  lines.push("", "## Erreurs factuelles détectées", "");
  if (input.factualErrors.length === 0) lines.push("_Aucune erreur factuelle détectée._");
  else for (const f of input.factualErrors) lines.push(`- \`${f.factId}\` (${f.engine}) : ${f.detail}`);
  lines.push("", "## Recommandations", "");
  if (input.recommendations.length === 0) lines.push("_Aucune recommandation sur cette fenêtre._");
  else {
    for (const r of input.recommendations) {
      lines.push(`### ${r.title}`);
      lines.push(`- Type : \`${r.type}\` · Impact : ${r.impact.level} · Effort : ${r.effort.level} · Risque : ${r.risk} · Confiance : ${r.confidence}`);
      lines.push(`- Décision : \`${r.decision.status}\`${r.decision.by ? ` par ${r.decision.by}` : ""}${r.decision.at ? ` le ${r.decision.at}` : ""}`);
      lines.push(`- ${r.statement}`);
      lines.push("");
    }
  }
  lines.push("## Limites de mesure", "");
  lines.push(input.limit.note);
  lines.push("", "---", "", `Généré par OIA Visibility. Aucune donnée inventée (règle 12).`);
  return lines.join("\n");
}

export function renderHtml(input: ClientReportInput): string {
  // Conversion naïve ; G1 brancherait une vraie librairie Markdown→HTML.
  const md = renderMarkdown(input);
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8"><title>Rapport OIA Visibility</title></head><body><pre>${escaped}</pre></body></html>\n`;
}

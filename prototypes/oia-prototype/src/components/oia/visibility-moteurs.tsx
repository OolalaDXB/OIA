import { Checkbox } from "@/components/ui/checkbox";
import { LogoAssistant } from "@/components/oia/visibility-identites";
import { FaviconSource } from "@/components/oia/identites";
import { useVisibilityDonnees } from "@/lib/donnees/provider";
import { alerteDepense, estimerDepense } from "@/lib/visibility-couts";

const dollars = (v: number, precision = 2) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: precision, maximumFractionDigits: precision })} $`;
const domainesPlateformes: Record<string, string> = { "Google AI Mode": "google.com", "Google AI Overview": "google.com", Copilot: "copilot.microsoft.com", DeepSeek: "deepseek.com", Qwen: "qwen.ai", Kimi: "kimi.com", Grok: "grok.com" };

export function VueMoteurs() {
  const { marque, moteurs, depensesMoteurs: d, plateformesMoteurs } = useVisibilityDonnees();
  const estimation = estimerDepense(d.questions, d.joursMesures, moteurs);
  const alerte = alerteDepense(d.observe, d.plafond);
  const proportion = Math.round(d.observe / d.plafond * 100);
  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tertiary"><span>{marque.nom} · {d.mois}</span><span>Exemple fictif · coûts de démonstration · lecture seule</span></div>
    <div className="grid gap-6 border-y border-border py-6 lg:grid-cols-2">
      <section aria-labelledby="depense-estimee"><h2 id="depense-estimee" className="text-sm text-muted-foreground">Dépense estimée du mois pour la marque</h2><p className="num mt-3 text-3xl">{dollars(estimation)}</p><p className="mt-3 text-sm text-muted-foreground">{d.questions} questions · {moteurs.filter((m) => m.suivi).length} assistants mesurés</p><p className="mt-1 text-xs text-tertiary">{d.frequence}</p></section>
      <section aria-labelledby="depense-observee" className="lg:border-l lg:border-border lg:pl-6"><h2 id="depense-observee" className="text-sm text-muted-foreground">Dépense réelle du mois <span className="text-xs text-tertiary">(démonstration)</span></h2><div className="mt-3 flex flex-wrap items-baseline justify-between gap-3"><p className="num text-3xl">{dollars(d.observe)}</p><p className="num text-sm text-muted-foreground">Plafond : {dollars(d.plafond, 0)}</p></div><meter aria-label="Utilisation du plafond mensuel" min={0} max={d.plafond} value={d.observe} className="mt-3 block h-3 w-full" /><p className={`mt-2 text-xs ${alerte ? "text-warn" : "text-tertiary"}`} role={alerte ? "alert" : undefined}>{alerte ? "Alerte : plus de 80 % du plafond utilisé" : "Plafond respecté"} · {proportion} %</p></section>
    </div>
    <section aria-labelledby="assistants-mesures"><div className="mb-4 flex flex-wrap justify-between gap-2"><h2 id="assistants-mesures" className="text-base">Assistants mesurés</h2><span className="text-xs text-tertiary">Sélection en lecture seule</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{moteurs.map((m) => <article key={m.assistant} className="rounded-md border border-border bg-card p-5">
        <div className="flex items-center gap-3"><LogoAssistant nom={m.assistant} /><h3 className="flex-1 text-base">{m.assistant}</h3><Checkbox disabled checked={m.suivi} aria-label={`${m.assistant}, ${m.suivi ? "suivi" : "non suivi"}, lecture seule`} className="disabled:opacity-100" /></div>
        <p className="mt-4 text-sm">{m.modele}</p><p className="mt-1 min-h-10 break-words text-xs leading-5 text-tertiary">{m.version}</p><div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground"><span>{m.acces}</span><span>{m.suivi ? "Suivi" : "Non suivi"}</span></div>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs"><div className="flex justify-between gap-2"><dt className="text-tertiary">Estimé par réponse</dt><dd className="num">{dollars(m.estime, 3)}</dd></div><div className="flex justify-between gap-2"><dt className="text-tertiary">Réel observé par réponse</dt><dd className="num">{m.observe === null ? "Non mesuré" : dollars(m.observe, 3)}</dd></div></dl>
      </article>)}</div>
    </section>
    <section aria-labelledby="plateformes-ajouter"><h2 id="plateformes-ajouter" className="mb-4 text-base">Plateformes à ajouter</h2><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs text-tertiary"><tr className="border-b border-border">{["Plateforme", "Accès", "État", "Coût"].map((h) => <th key={h} className="py-3 pr-4 font-normal">{h}</th>)}</tr></thead><tbody>{plateformesMoteurs.map((p) => <tr key={p.nom} className="border-b border-border"><td className="py-3 pr-4"><span className="flex items-center gap-2.5"><FaviconSource source={domainesPlateformes[p.nom] ?? `${p.nom.toLowerCase().replaceAll(" ", "")}.com`} petite />{p.nom}</span></td><td className="pr-4 text-muted-foreground">{p.acces}</td><td className="pr-4 text-tertiary">Non suivi</td><td className="text-xs text-tertiary">Coût à valider avant ajout</td></tr>)}</tbody></table></div></section>
  </div>;
}
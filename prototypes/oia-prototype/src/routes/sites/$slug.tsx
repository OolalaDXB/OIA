import { createFileRoute } from "@tanstack/react-router";
import { Section, Statut, Barre } from "@/components/oia/ui";
import { VisibilityShell } from "@/components/oia/visibility";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useDonnees } from "@/lib/donnees-visibility";
import { Indicateurs, Paysage } from "@/components/oia/visibility-vues";
import { FiltresVisibility, NoteMesure } from "@/components/oia/mesure";

export const Route = createFileRoute("/sites/$slug")({
  head: () => ({
    meta: [
      { title: "Studio Ardoise , Visibilité dans les IA | OIA" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Présence du Studio Ardoise dans les réponses de ChatGPT, Claude, Gemini, Le Chat et Perplexity." },
      { property: "og:title", content: "Studio Ardoise , Visibilité dans les IA" },
      { property: "og:description", content: "Présence, sources citées, concurrents et recommandations." },
    ],
  }),
  component: VueSite,
});

const ordre = { bloquant: 0, verifier: 1, conforme: 2 };

function VueSite() {
  const [prepare, setPrepare] = useState(false);
  const d = useDonnees().vueSite;
  const maxSrc = Math.max(...d.sources.map((s) => s.n));
  return (
    <VisibilityShell page={d.nom} active="sites">
      <div className="mt-2 mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">{d.nom}</h1>
          <p className="mt-1 text-tertiary">{d.url}</p>
        </div>
        <div><Button className="min-h-11" onClick={() => setPrepare(true)}>Préparer les corrections</Button><p className="mt-2 text-xs text-tertiary">Rien n'est publié sans votre validation.</p>{prepare && <p role="status" className="mt-2 text-xs text-muted-foreground">Corrections préparées, simulation en attente de validation.</p>}</div>
      </div>

      <FiltresVisibility /><Indicateurs /><div className="my-6"><Paysage /></div>
      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Section titre="Présence dans les réponses des IA">
          <div className="num text-8xl font-normal ">{d.presence} %</div>
          <p className="num mt-4 text-sm text-muted-foreground">Intervalle de {d.min} à {d.max} % · mesure sur {d.jours} jours</p>
          <div className="relative mt-5 h-1.5 rounded-full bg-track">
            <span className="absolute h-full rounded-full bg-input" style={{ left: `${d.min * 2}%`, width: `${(d.max - d.min) * 2}%` }} />
            <span className="absolute -top-1 h-3.5 w-0.5 bg-bar" style={{ left: `${d.presence * 2}%` }} />
          </div>
          <div className="num mt-2 flex justify-between text-xs text-tertiary"><span>0 %</span><span>50 %</span></div>
        </Section>
        <Section titre="Par assistant">
          {d.parAssistant.map((a) => <Barre key={a.nom} label={a.nom} v={a.v} max={50} />)}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section titre="Sources citées par les IA">
          <table className="num w-full text-sm"><tbody>
            {d.sources.map((s) => (
              <tr key={s.nom} className="border-b border-border last:border-0">
                <td className="py-2.5">{s.nom}{s.nom === d.url && <span className="ml-2 text-tertiary">votre site</span>}</td>
                <td className="w-1/3"><span className="block h-1.5 rounded-full bg-track"><span className={`block h-full rounded-full ${s.nom === d.url ? "bg-module-visibility" : "bg-bar"}`} style={{ width: `${(s.n / maxSrc) * 100}%` }} /></span></td>
                <td className="w-12 text-right">{s.n}</td>
              </tr>
            ))}
          </tbody></table>
        </Section>
        <Section titre="Concurrents cités à la place du site">
          {d.concurrents.map((c) => <Barre key={c.nom} label={c.nom} v={c.v} max={50} />)}
        </Section>
      </div>

      <div className="mt-6 grid gap-6">
        <Section titre="Recommandations" aside={<span className="text-sm text-tertiary">Classées par gravité</span>}>
          <ol>
            {[...d.recommandations].sort((a, b) => ordre[a.etat] - ordre[b.etat]).map((r, i) => (
              <li key={r.titre} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-border py-3 first:border-0 sm:grid-cols-[2.5rem_1fr_10rem_8rem] sm:items-center">
                <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm">{r.titre}</span>
                <span className="col-start-2 text-sm text-tertiary sm:col-start-auto">{r.effet}</span>
                <span className="col-start-2 sm:col-start-auto"><Statut etat={r.etat} /></span>
              </li>
            ))}
          </ol>
        </Section>
        <Section titre="Historique des fenêtres de mesure">
          <table className="num w-full text-sm">
            <thead className="text-left text-tertiary"><tr className="border-b border-border">
              <th className="py-2 font-normal">Fenêtre</th><th className="font-normal">Présence</th><th className="hidden font-normal sm:table-cell">Intervalle</th><th className="font-normal">Statut</th>
            </tr></thead>
            <tbody>{d.historique.map((h) => (
              <tr key={h.fenetre}><td className="py-3">{h.fenetre}</td><td>{h.v} %</td><td className="hidden text-muted-foreground sm:table-cell">{h.min} – {h.max} %</td><td className="text-muted-foreground">{h.statut}</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-3 text-sm text-tertiary">Prochaine fenêtre : 9 – 13 nov. 2026.</p>
        </Section>
      </div>
      <NoteMesure />
    </VisibilityShell>
  );
}

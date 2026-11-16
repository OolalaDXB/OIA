import { createFileRoute } from "@tanstack/react-router";
import { Section, Statut, Barre } from "@/components/oia/ui";
import { VisibilityShell } from "@/components/oia/visibility";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useDonnees } from "@/lib/donnees-visibility";
import { Indicateurs, Paysage } from "@/components/oia/visibility-vues";
import { FiltresVisibility, NoteMesure, texteChiffre, useFiltres } from "@/components/oia/mesure";
import { LogoAssistant, LogoMarque } from "@/components/oia/visibility-identites";
import { FaviconSource } from "@/components/oia/identites";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { PilotageSite } from "@/components/oia/visibility-etude";

export const Route = createFileRoute("/sites/$slug")({
  head: () => ({
    meta: [
      { title: "Site, Visibility | OIA" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Présence d'un site dans les réponses des assistants d'IA." },
      { property: "og:title", content: "Site, Visibility | OIA" },
      { property: "og:description", content: "Présence, sources citées, concurrents et recommandations." },
    ],
  }),
  component: VueSite,
});

const ordre = { bloquant: 0, verifier: 1, conforme: 2 };

function VueSite() {
  const { slug } = Route.useParams();
  const selection = useSelectionVisibility();
  useEffect(() => { if (selection.reel && selection.sujets.some((s) => s.id === slug) && selection.sujetId !== slug) selection.setSujetId(slug); }, [slug, selection.reel, selection.sujetId]);
  const [prepare, setPrepare] = useState(false);
  const donnees = useDonnees();
  const d = donnees.vueSite;
  const f = useFiltres();
  const fen = f.fenetreActive;
  if (donnees.reel && donnees.fenetres.length === 0) return <VisibilityShell page={d.nom} active="sites"><div className="mb-8"><h1 className="text-3xl md:text-4xl">{d.nom}</h1><p className="mt-1 flex items-center gap-2 text-tertiary"><FaviconSource source={d.url} petite />{d.url}</p></div><PilotageSite subject={slug} client={selection.sujets.find((s) => s.id === slug)?.clientId ?? ""} /></VisibilityShell>;
  const presence = donnees.indicateurs[fen.id]?.presence ?? { v: null, min: null, max: null, raison: "Mesure en cours de chargement." };
  const textePresence = texteChiffre(presence, fen);
  const citations = donnees.citationsParFenetre?.[fen.id]?.[f.assistant] ?? donnees.citations;
  const sources = donnees.reel ? citations.map((c) => ({ nom: c.source, n: c.n })) : d.sources;
  const partVoix = donnees.partVoixParFenetre?.[fen.id] ?? donnees.partVoix;
  const concurrents = donnees.reel ? partVoix.global.filter((c) => c.nom !== donnees.marque.nom) : d.concurrents;
  const maxSrc = Math.max(1, ...sources.map((s) => s.n));
  return (
    <VisibilityShell page={d.nom} active="sites">
      <div className="mt-2 mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl">{d.nom}</h1>
          <p className="mt-1 flex items-center gap-2 text-tertiary"><FaviconSource source={d.url} petite />{d.url}</p>
        </div>
        {!donnees.reel && <div><Button className="min-h-11" onClick={() => setPrepare(true)}>Préparer les corrections</Button><p className="mt-2 text-xs text-tertiary">Rien n'est publié sans votre validation.</p>{prepare && <p role="status" className="mt-2 text-xs text-muted-foreground">Corrections préparées, simulation en attente de validation.</p>}</div>}
      </div>

      {donnees.reel && <PilotageSite subject={slug} client={selection.sujets.find((s) => s.id === slug)?.clientId ?? ""} />}
      <FiltresVisibility /><Indicateurs /><div className="my-6"><Paysage /></div>
      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <Section titre="Présence dans les réponses des IA">
          <div className={`num ${presence.v !== null && !fen.enCours ? "text-8xl" : "text-sm text-muted-foreground"}`}>{textePresence.principal}</div>
          <p className="num mt-4 text-sm text-muted-foreground">{textePresence.intervalle ?? `Mesure sur ${donnees.fenetres.find((w) => w.id === fen.id)?.joursPrevus ?? 5} jours`}</p>
          {presence.v !== null && presence.min !== null && presence.max !== null && !fen.enCours && <>
            <div className="relative mt-5 h-1.5 rounded-full bg-track">
              <span className="absolute h-full rounded-full bg-input" style={{ left: `${Math.min(100, presence.min * 2)}%`, width: `${Math.min(100, (presence.max - presence.min) * 2)}%` }} />
              <span className="absolute -top-1 h-3.5 w-0.5 bg-bar" style={{ left: `${Math.min(100, presence.v * 2)}%` }} />
            </div>
            <div className="num mt-2 flex justify-between text-xs text-tertiary"><span>0 %</span><span>50 %</span></div>
          </>}
        </Section>
        <Section titre="Par assistant">
          {donnees.assistants.filter((a) => f.assistant === "Tous" || a.nom === f.assistant).map((a) => {
            const valeur = donnees.presenceAssistant[fen.id]?.[a.nom] ?? { v: null, min: null, max: null, raison: "Valeur absente de la source." };
            return valeur.v === null ? <div key={a.nom} className="flex items-center justify-between gap-4 py-2 text-sm"><span className="flex items-center gap-2"><LogoAssistant nom={a.nom} petite />{a.nom}</span><span className="text-right text-xs text-muted-foreground">Non mesurable<span className="block">{valeur.raison}</span></span></div> : <Barre key={a.nom} label={a.nom} v={valeur.v} max={50} identite={<LogoAssistant nom={a.nom} petite />} />;
          })}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Section titre="Sources citées par les IA">
          {sources.length === 0 ? <p className="text-sm text-muted-foreground">Aucune citation pour ces filtres.</p> : <table className="num w-full text-sm"><tbody>
            {sources.map((s) => (
              <tr key={s.nom} className="border-b border-border last:border-0">
                <td className="py-2.5"><span className="flex items-center gap-2.5"><FaviconSource source={s.nom} petite /><span>{s.nom}{s.nom === d.url && <span className="ml-2 text-tertiary">votre site</span>}</span></span></td>
                <td className="w-1/3"><span className="block h-1.5 rounded-full bg-track"><span className={`block h-full rounded-full ${s.nom === d.url ? "bg-module-visibility" : "bg-bar"}`} style={{ width: `${(s.n / maxSrc) * 100}%` }} /></span></td>
                <td className="w-12 text-right">{s.n}</td>
              </tr>
            ))}
          </tbody></table>}
        </Section>
        <Section titre="Concurrents cités à la place du site">
          {concurrents.map((c) => c.v === null ? <div key={c.nom} className="flex justify-between gap-3 py-2 text-sm"><span className="flex items-center gap-2"><LogoMarque nom={c.nom} />{c.nom}</span><span className="text-muted-foreground">Non mesurable</span></div> : <Barre key={c.nom} label={c.nom} v={c.v} max={50} identite={<LogoMarque nom={c.nom} />} />)}
        </Section>
      </div>

      <div className="mt-6 grid gap-6">
        <Section titre="Recommandations" aside={<span className="text-sm text-tertiary">Classées par priorité</span>}>
          {d.recommandations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune recommandation pour ce sujet.</p> : <ol>
            {[...d.recommandations].sort((a, b) => ordre[a.etat] - ordre[b.etat]).map((r, i) => (
              <li key={r.titre} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-border py-3 first:border-0 sm:grid-cols-[2.5rem_1fr_10rem_8rem] sm:items-center">
                <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm">{r.titre}</span>
                <span className="col-start-2 text-sm text-tertiary sm:col-start-auto">{r.effet}</span>
                <span className="col-start-2 sm:col-start-auto"><Statut etat={r.etat} /></span>
              </li>
            ))}
          </ol>}
        </Section>
        <Section titre="Historique des fenêtres de mesure">
          <table className="num w-full text-sm">
            <thead className="text-left text-tertiary"><tr className="border-b border-border">
              <th className="py-2 font-normal">Fenêtre</th><th className="font-normal">Présence</th><th className="hidden font-normal sm:table-cell">Intervalle</th><th className="font-normal">Statut</th>
            </tr></thead>
            <tbody>{d.historique.map((h) => (
              <tr key={h.fenetre}><td className="py-3">{h.fenetre}</td><td>{h.v === null ? "Non mesurable" : `${h.v} %`}</td><td className="hidden text-muted-foreground sm:table-cell">{h.min === null || h.max === null ? "Non fourni" : `${h.min} – ${h.max} %`}</td><td className="text-muted-foreground">{h.statut}</td></tr>
            ))}</tbody>
          </table>
          {!donnees.reel && <p className="mt-3 text-sm text-tertiary">Prochaine fenêtre : 9 – 13 nov. 2026.</p>}
        </Section>
      </div>
      <NoteMesure />
    </VisibilityShell>
  );
}

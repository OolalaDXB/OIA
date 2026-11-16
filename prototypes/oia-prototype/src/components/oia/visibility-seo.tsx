import { Section, Statut } from "@/components/oia/ui";
import { EtatVisibilityV3, SelecteurSujetV3 } from "@/components/oia/visibility-score";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { dollars, objet } from "@/lib/donnees/visibility-pilotage";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const jour = (valeur: string | null) => valeur ? date.format(new Date(valeur)) : "Date non fournie";

export function VueSeoV3() {
  const { donnees, connecte } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const subject = selection.sujetId ?? donnees.scores[0]?.subject_id;
  const client = selection.sujets.find((s) => s.id === subject)?.clientId;
  const missions = donnees.seo.filter((m) => !connecte || m.subject_id === subject).sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""));
  const planificateurs = donnees.planificateur.filter((p) => !connecte || p.client_id === client);
  return <EtatVisibilityV3><div className="mb-6"><SelecteurSujetV3 subject={subject ?? ""} /></div>{missions.length === 0 && planificateurs.length === 0 ? <Section titre="SEO Command"><p className="text-sm text-muted-foreground">Aucune mission</p></Section> : <div className="grid gap-6"><Section titre="Missions SEO Command" aside={<span className="num text-sm text-tertiary">{missions.length}</span>}><p className="mb-4 text-sm text-muted-foreground">Le journal montre les missions réellement enregistrées, sans créer de nouvelle mission depuis cet écran.</p>{missions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune mission</p> : <ol>{missions.map((m) => <li key={m.id} className="grid gap-2 border-b border-border py-4 text-sm last:border-0 lg:grid-cols-[12rem_minmax(0,1fr)_10rem_8rem]"><span className="num text-xs text-tertiary">{jour(m.le)}</span><span>{m.quoi || m.mission_id || "Mission sans libellé"}<span className="mt-1 block text-xs text-tertiary">{m.mission_id} · {m.qui || "Intervenant non fourni"}</span>{objet(m.details) && Object.keys(objet(m.details)).length > 0 && <span className="mt-2 block text-xs text-muted-foreground">{Object.entries(objet(m.details)).map(([k, v]) => `${k} : ${typeof v === "string" || typeof v === "number" ? v : JSON.stringify(v)}`).join(" · ")}</span>}</span><span className="num">{m.cout_usd === null ? "Coût non fourni" : dollars(m.cout_usd)}</span><Statut etat="conforme" label="Journalisée" /></li>)}</ol>}</Section><Section titre="Planificateur">{planificateurs.length === 0 ? <p className="text-sm text-muted-foreground">Aucun planificateur enregistré pour ce client.</p> : planificateurs.map((p) => <div key={p.client_id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><div><Statut etat={p.actif ? "conforme" : "verifier"} label={p.actif ? "Actif" : "Désactivé"} /><p className="mt-2 text-xs text-tertiary">Changé le {jour(p.bascule_le)} par {p.bascule_par || "intervenant non fourni"}</p></div><p className="text-muted-foreground">{p.motif || "Aucun motif fourni"}</p></div>)}</Section></div>}</EtatVisibilityV3>;
}

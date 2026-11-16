import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/oia/ui";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";

export function ReglagesDepotGithub() {
  const { donnees, connecte } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const geste = useGesteVisibility();
  const [message, setMessage] = useState<string | null>(null);
  const subject = selection.sujetId ?? donnees.notesContenu[0]?.subject_id ?? "studio-ardoise";
  const depot = donnees.depots.find((item) => item.subject_id === subject);

  async function lier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formulaire = new FormData(event.currentTarget);
    const nom = String(formulaire.get("depot") ?? "").trim();
    const branche = String(formulaire.get("branche") ?? "").trim();
    if (!nom) return;
    setMessage(null);
    try {
      await geste.executer("vis_lier_depot", { p_subject: subject, p_depot: nom, ...(branche ? { p_branche: branche } : {}) });
      setMessage("Liaison enregistrée. Les données du contrat sont rechargées.");
    } catch { /* erreur RPC affichée telle quelle */ }
  }

  async function delier() {
    setMessage(null);
    try {
      await geste.executer("vis_lier_depot", { p_subject: subject, p_depot: null });
      setMessage("Dépôt délié. Les données du contrat sont rechargées.");
    } catch { /* erreur RPC affichée telle quelle */ }
  }

  return <Section titre="Dépôt GitHub" aside={<span className="text-xs text-tertiary">Lecture seule</span>}>
    <p className="mb-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">Lecture seule. Le contenu des fichiers sensibles (.env, clés) n'est jamais lu. Dépôt privé : jeton en lecture seule côté OIA.</p>
    <p className="mb-4 text-sm"><span className="text-tertiary">Dépôt actuel : </span>{depot?.depot ?? "Aucun dépôt lié"}{depot?.branche ? <span className="text-tertiary"> · branche {depot.branche}</span> : null}</p>
    <form key={subject} className="grid gap-4" onSubmit={(event) => void lier(event)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-tertiary">Dépôt GitHub<Input name="depot" className="min-h-11" defaultValue={depot?.depot ?? ""} placeholder="proprietaire/nom" maxLength={300} required disabled={!connecte || geste.enCours} /></label>
        <label className="grid gap-1.5 text-xs text-tertiary">Branche, facultative<Input name="branche" className="min-h-11" defaultValue={depot?.branche ?? ""} placeholder="main" maxLength={200} disabled={!connecte || geste.enCours} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={!connecte || geste.enCours}>{geste.enCours ? "Enregistrement…" : "Lier le dépôt"}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!connecte || geste.enCours || !depot?.depot} onClick={() => void delier()}>Délier</Button>
      </div>
    </form>
    {!connecte && <p className="mt-3 text-sm text-muted-foreground">Connexion requise pour modifier le dépôt réel.</p>}
    <ErreurGeste erreur={geste.erreur} />
    {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
  </Section>;
}

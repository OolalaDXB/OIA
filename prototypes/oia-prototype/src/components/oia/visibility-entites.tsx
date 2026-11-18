import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/oia/ui";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { LogoMarque } from "@/components/oia/visibility-identites";
import { EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import type { EntiteV3 } from "@/lib/donnees/visibility-v3";
import { groupeNature, LIBELLES_NATURE, NATURES_ENTITE, natureValide, type GroupeEntite } from "@/lib/donnees/visibility-entites";

const groupes: { id: GroupeEntite; titre: string; description?: string }[] = [
  { id: "concurrents", titre: "Concurrents directs" },
  { id: "plateformes", titre: "Plateformes et applications", description: "sources où être présent, pas des concurrents" },
  { id: "annuaires", titre: "Annuaires et médias" },
  { id: "a_classer", titre: "À classer" },
];

function LigneEntite({ entite, subject, connecte }: { entite: EntiteV3; subject: string; connecte: boolean }) {
  const geste = useGesteVisibility();
  const nom = entite.entite ?? "Entité sans nom";
  const nature = natureValide(entite.nature ?? "") ? entite.nature! : "a_classer";
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="flex min-w-0 items-center gap-2.5"><LogoMarque nom={nom} /><div><p className="text-sm">{nom}</p>{entite.origine === "moteur" && <span className="mt-1 inline-flex rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-tertiary">classé par l'IA</span>}</div></div>
    <label className="sr-only" htmlFor={`nature-${subject}-${nom}`}>Nature de {nom}</label>
    <FiltreSelect id={`nature-${subject}-${nom}`} aria-label={`Nature de ${nom}`} value={nature} disabled={!connecte || geste.enCours} onChange={async (e) => {
      const nouvelleNature = e.target.value;
      if (!natureValide(nouvelleNature)) return;
      try { await geste.executer("vis_classer_entite", { p_subject: subject, p_entite: nom, p_nature: nouvelleNature }); } catch { /* erreur RPC affichée sans état optimiste */ }
    }}>{NATURES_ENTITE.map((n) => <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>)}</FiltreSelect>
    <ErreurGeste erreur={geste.erreur} />
  </div>;
}

function AjouterConcurrent({ subject, connecte }: { subject: string; connecte: boolean }) {
  const geste = useGesteVisibility();
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) return <Button type="button" variant="outline" className="min-h-11" disabled={!connecte} title={!connecte ? "Connexion requise pour enregistrer un concurrent réel" : undefined} onClick={() => setOuvert(true)}><Plus aria-hidden="true" />Ajouter un concurrent</Button>;
  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulaire = e.currentTarget;
    const nom = String(new FormData(formulaire).get("nom") ?? "").trim();
    if (!nom) return;
    try {
      await geste.executer("vis_classer_entite", { p_subject: subject, p_entite: nom, p_nature: "concurrent" });
      formulaire.reset(); setOuvert(false);
    } catch { /* erreur RPC conservée */ }
  }
  return <div><form className="grid max-w-xl gap-3 rounded-md border border-border p-4" onSubmit={soumettre}>
    <label className="grid gap-1.5 text-xs text-tertiary">Nom du concurrent<Input name="nom" className="min-h-11" required maxLength={120} /></label>
    <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>Enregistrer comme concurrent direct</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOuvert(false)}>Annuler</Button></div>
    <ErreurGeste erreur={geste.erreur} />
  </form></div>;
}

export function GestionEntitesVisibility() {
  const { connecte, donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const subject = selection.sujetId ?? donnees.scores[0]?.subject_id ?? "studio-ardoise";
  const entites = donnees.entites.filter((e) => e.subject_id === subject && e.entite && e.nature !== "marque");
  return <EtatVisibilityV3><div className="grid gap-6">
    {groupes.map((groupe) => {
      const lignes = entites.filter((e) => groupeNature(e.nature) === groupe.id);
      if (groupe.id === "a_classer" && lignes.length === 0) return null;
      return <Section key={groupe.id} titre={groupe.titre} aside={<span className="num text-xs text-tertiary">{lignes.length}</span>}>
        {groupe.description && <p className="mb-4 text-sm text-muted-foreground">{groupe.description}</p>}
        {lignes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune entité dans ce groupe.</p> : lignes.map((entite) => <LigneEntite key={entite.entite} entite={entite} subject={subject} connecte={connecte} />)}
      </Section>;
    })}
    <Section titre="Ajouter un concurrent direct"><AjouterConcurrent subject={subject} connecte={connecte} />{!connecte && <p className="mt-3 text-xs text-tertiary">La démonstration est en lecture seule. Connectez-vous pour enregistrer le classement en base.</p>}</Section>
  </div></EtatVisibilityV3>;
}

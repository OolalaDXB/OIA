"use client";

// Routes courtes du prototype Lovable « OIA Dashoard » (commit c6470e86), regroupées.
import { Shell, Section, Fictif } from "@/components/oia/ui";
import { VisibilityShell, AjouterCompte, SitesSuivis, SeoResume } from "@/components/oia/visibility";
import { useState } from "react";
import { Statut } from "@/components/oia/ui";
import { vueSite } from "@/data/demo";

export function Reglages() {
  return (
    <Shell>
      <Fictif />
      <h1 className="mt-2 mb-10 text-3xl md:text-4xl">Réglages</h1>
      <Section titre="Bientôt">
        <p className="text-sm text-muted-foreground">Compte, plafonds de dépenses et cadre de l'assistant.</p>
      </Section>
    </Shell>
  );
}

export const VisibilityIndex = () => (<VisibilityShell><AjouterCompte /><div className="grid gap-6"><SitesSuivis /><SeoResume /></div></VisibilityShell>);
export const VisibilitySites = () => (<VisibilityShell page="Sites" active="sites"><AjouterCompte /><SitesSuivis /></VisibilityShell>);
export const VisibilitySeo = () => (<VisibilityShell page="SEO Command" active="seo"><SeoResume /></VisibilityShell>);
export const VisibilityRapports = () => (<VisibilityShell page="Rapports" active="reports"><section className="border-t border-border py-6"><h2 className="text-lg">Dernière fenêtre de mesure</h2><p className="mt-4 text-sm text-muted-foreground">Studio Ardoise : 2 – 6 nov. 2026</p><p className="num mt-2 text-sm">Présence : 12 % · intervalle : 8 à 16 %</p></section></VisibilityShell>);

/**
 * Fiche de décision des corrections (mandat v7, F4) : ouverte par « Préparer
 * les corrections ». En ligne, sur des données de démonstration ; rien n'est
 * publié. La vraie fiche de décision se lit en local, avec les vraies données.
 */
export function FicheCorrections() {
  const [valide, setValide] = useState<Record<string, boolean>>({});
  return (
    <VisibilityShell page="Préparer les corrections" active="overview">
      <Section titre="Fiche de décision · corrections" aside={<span className="text-sm text-tertiary">Rien n'est publié</span>}>
        <p className="mb-4 text-sm text-muted-foreground">Chaque correction indique ce qu'elle change pour Google et pour les assistants, et son effet attendu. Cocher « valider » ne publie rien : la publication reste une décision séparée, après validation du rapport de mesure.</p>
        <ol>
          {vueSite.recommandations.map((r, i) => (
            <li key={r.titre} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-t border-border py-3 first:border-0">
              <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-sm">{r.titre}</p>
                <p className="text-sm text-tertiary">{r.effet}</p>
                <Statut etat={r.etat} />
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={!!valide[r.titre]} onChange={() => setValide((v) => ({ ...v, [r.titre]: !v[r.titre] }))} className="size-4" />
                Valider
              </label>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-tertiary">Exemple fictif. La fiche réelle, avec les vraies données, se consulte en local avec pnpm vis:j0-view.</p>
      </Section>
    </VisibilityShell>
  );
}

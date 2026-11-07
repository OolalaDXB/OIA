"use client";

// Routes courtes du prototype Lovable « OIA Dashoard » (commit c6470e86), regroupées.
import { Shell, Section, Fictif } from "@/components/oia/ui";
import { VisibilityShell, AjouterCompte, SitesSuivis, SeoResume } from "@/components/oia/visibility";
import { ConsoleExistante } from "@/components/oia/console-existante";

export function Funding() {
  return (
    <Shell>
      <Fictif />
      <h1 className="mt-2 mb-10 text-3xl md:text-4xl">Funding</h1>
      <Section titre="En pause">
        <p className="text-sm text-muted-foreground">Module en pause. Reprise prévue après la première boucle complète de Visibility.</p>
      </Section>
      <ConsoleExistante slug="funding" />
    </Shell>
  );
}

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

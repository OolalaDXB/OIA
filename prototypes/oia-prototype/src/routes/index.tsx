import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, Section, Fictif, Statut, btnPrimary } from "@/components/oia/ui";
import { aDecider, sites, agents, depenses, utilisateur } from "@/data/demo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Accueil — OIA Visibility" },
      { name: "description", content: "Console OIA : décisions en attente, sites suivis, agents SEO et dépenses du mois." },
      { property: "og:title", content: "Accueil — OIA Visibility" },
      { property: "og:description", content: "Mesurez et améliorez la visibilité d'un site dans Google et les assistants d'IA." },
    ],
  }),
  component: Accueil,
});

function Accueil() {
  return (
    <Shell>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Fictif />
          <h1 className="mt-2 text-3xl md:text-4xl">Bonjour {utilisateur.prenom}</h1>
          <p className="mt-2 text-muted-foreground">Cinq décisions vous attendent.</p>
        </div>
        <Link to="/nouveau-compte" className={btnPrimary}>Ajouter un compte</Link>
      </div>

      <div className="grid gap-6">
        <Section titre="À décider" aside={<span className="num text-sm text-tertiary">5</span>}>
          <ol>
            {aDecider.map((a, i) => (
              <li key={a.titre} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-t border-border py-3 first:border-0">
                <span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-sm">{a.titre}</div>
                  <div className="text-sm text-tertiary">{a.detail}</div>
                </div>
                <button className="link min-h-11 text-sm underline underline-offset-4">Ouvrir</button>
              </li>
            ))}
          </ol>
        </Section>

        <Section titre="Sites suivis">
          <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-tertiary">
                <tr className="border-b border-border">
                  {["Site", "Panel", "Mesure de départ", "Visibilité dans les IA", "Google"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="num">
                {sites.map((s) => (
                  <tr key={s.nom} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <Link to="/sites/$slug" params={{ slug: s.slug }} className="underline underline-offset-4">{s.nom}</Link>
                      <div className="text-tertiary">{s.url}</div>
                    </td>
                    <td className="pr-4 text-muted-foreground">{s.panel}</td>
                    <td className="pr-4 text-muted-foreground">{s.depart}</td>
                    <td className="pr-4">{s.ia === null ? <Statut etat="bloquant" label="Non mesuré" /> : <span className="text-lg">{s.ia} %</span>}</td>
                    <td className="text-muted-foreground">{s.google}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <Section titre="SEO Command" aside={<Link to="/seo-command" className="text-sm underline underline-offset-4">Détail</Link>}>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {agents.map((a) => (
                <div key={a} className="flex items-center justify-between border-b border-border py-3 text-sm">
                  <span>{a}</span><Statut etat="conforme" label="En veille" />
                </div>
              ))}
            </div>
            <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block"><dt className="text-tertiary">File de missions</dt><dd>Vide</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-tertiary">Planificateur</dt><dd>Désactivé</dd></div>
            </dl>
          </Section>
          <Section titre="Dépenses du mois">
            <div className="num text-6xl font-normal tracking-[-0.03em]">{depenses.montant} $</div>
            <div className="mt-3 h-1.5 rounded-full bg-track" />
            <p className="num mt-3 text-sm text-tertiary">sur un plafond de {depenses.plafond} $</p>
          </Section>
        </div>
      </div>
    </Shell>
  );
}

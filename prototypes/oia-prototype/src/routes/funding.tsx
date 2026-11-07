import { createFileRoute } from "@tanstack/react-router";
import { Shell, Section, Fictif } from "@/components/oia/ui";

export const Route = createFileRoute("/funding")({
  head: () => ({
    meta: [
      { title: "Funding — OIA Visibility" },
      { name: "description", content: "Aucun financement en cours. Plafond mensuel : 30 $." },
      { property: "og:title", content: "Funding — OIA Visibility" },
      { property: "og:description", content: "Aucun financement en cours. Plafond mensuel : 30 $." },
    ],
  }),
  component: () => (
    <Shell>
      <Fictif />
      <h1 className="mt-2 mb-10 text-3xl md:text-4xl">Funding</h1>
      <Section titre="Bientôt">
        <p className="text-sm text-muted-foreground">Aucun financement en cours. Plafond mensuel : 30 $.</p>
      </Section>
    </Shell>
  ),
});

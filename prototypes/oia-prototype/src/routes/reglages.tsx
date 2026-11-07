import { createFileRoute } from "@tanstack/react-router";
import { Shell, Section, Fictif } from "@/components/oia/ui";

export const Route = createFileRoute("/reglages")({
  head: () => ({
    meta: [
      { title: "Réglages , OIA Visibility" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Compte, plafonds de dépenses et cadre de l'assistant." },
      { property: "og:title", content: "Réglages , OIA Visibility" },
      { property: "og:description", content: "Compte, plafonds de dépenses et cadre de l'assistant." },
    ],
  }),
  component: () => (
    <Shell>
      <Fictif />
      <h1 className="mt-2 mb-10 text-3xl md:text-4xl">Réglages</h1>
      <Section titre="Bientôt">
        <p className="text-sm text-muted-foreground">Compte, plafonds de dépenses et cadre de l'assistant.</p>
      </Section>
    </Shell>
  ),
});

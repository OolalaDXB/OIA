import { createFileRoute } from "@tanstack/react-router";
import { Shell, Section, Fictif } from "@/components/oia/ui";

export const Route = createFileRoute("/seo-command")({
  head: () => ({
    meta: [
      { title: "SEO Command — OIA Visibility" },
      { name: "description", content: "Six agents en veille, file de missions vide, planificateur désactivé." },
      { property: "og:title", content: "SEO Command — OIA Visibility" },
      { property: "og:description", content: "Six agents en veille, file de missions vide, planificateur désactivé." },
    ],
  }),
  component: () => (
    <Shell>
      <Fictif />
      <h1 className="mt-2 mb-10 text-3xl md:text-4xl">SEO Command</h1>
      <Section titre="Bientôt">
        <p className="text-sm text-muted-foreground">Six agents en veille, file de missions vide, planificateur désactivé.</p>
      </Section>
    </Shell>
  ),
});

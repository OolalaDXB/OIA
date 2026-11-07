import { VueSite } from "@/pages/site";
import { sites } from "@/data/demo";

export const metadata = { title: "Studio Ardoise, Visibilité dans les IA | OIA", description: "Présence, sources citées, concurrents et recommandations." };

export function generateStaticParams() {
  return [...new Set(sites.map((s) => s.slug))].map((slug) => ({ slug }));
}

export default function Page() {
  return <VueSite />;
}

import { PersonnelPage } from "@/pages/personnel";
import { modulesPersonnels } from "@/data/demo";

export const metadata = { title: "Personnel, OIA", description: "Espace personnel fictif : module en préparation." };

export function generateStaticParams() {
  return modulesPersonnels.map((m) => ({ module: m.slug }));
}

export default function Page({ params }: { params: { module: string } }) {
  return <PersonnelPage module={params.module} />;
}

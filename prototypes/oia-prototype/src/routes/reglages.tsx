import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, Section, Fictif } from "@/components/oia/ui";
import { useOiaAuth } from "@/lib/oia-auth";
import { Button } from "@/components/ui/button";
import { AccesMoney } from "@/components/oia/money-commun";
import { RepriseMoney } from "@/components/oia/money-import";
import { useState } from "react";
import { DefinePassword } from "@/components/oia/password-recovery";

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
  component: Reglages,
});
function Reglages() {
  const auth = useOiaAuth(); const [error, setError] = useState<string | null>(null);
  return <Shell fictif={false}><h1 className="mb-8 text-3xl">Réglages</h1><div className="space-y-6"><Section titre="Compte OIA">{auth.user ? <><p className="mb-4 text-sm">Compte connecté.</p><Button variant="outline" onClick={() => { void auth.signOut().catch((e: Error) => setError(e.message)); }}>Se déconnecter</Button><div className="mt-4"><DefinePassword /></div></> : <Button asChild><Link to="/auth">Se connecter</Link></Button>}{error && <p role="alert" className="mt-3 text-sm text-block">{error}</p>}</Section><AccesMoney><RepriseMoney /></AccesMoney><Section titre="Plafonds et cadre de l'assistant"><Fictif /><p className="mt-3 text-sm text-muted-foreground">Visibility et Shyrka restent en démonstration.</p></Section></div></Shell>;
}

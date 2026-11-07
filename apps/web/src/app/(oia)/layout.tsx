import type { ReactNode } from "react";
import "@oia/ui-tokens/tokens.css";
import "./oia.css";
import { AuthGate } from "../(console)/AuthGate";
import { oiaInterfaceEnabled, OIA_INTERFACE_FLAG } from "../../lib/oiaFlag";
import { DonneesProvider } from "@/lib/donnees-visibility";
import { ShyrkaProvider, ShyrkaGlobale } from "@/components/oia/shyrka";
import { NotificateurDeRoute } from "@/lib/router";

/**
 * Layout racine de l'interface OIA (/oia), séparé de celui de la console :
 * Next recharge la page en passant de l'un à l'autre, si bien que les styles
 * Tailwind du prototype ne touchent jamais la console existante.
 *
 * Bascule : allumée sur les déploiements Preview de Vercel, jamais en
 * production (oia-flag.mjs). Éteinte, chaque page /oia n'affiche qu'un avis.
 * Allumée, l'interface passe derrière le même écran de connexion que la
 * console (AuthGate, mandat v7, F1) et prend ses couleurs dans les jetons de
 * packages/ui-tokens.
 */
export const metadata = {
  title: "OIA",
  description: "Interface OIA : accueil, modules, Visibility et Shyrka (données de démonstration).",
  robots: { index: false, follow: false },
};

export default function OiaRootLayout({ children }: { children: ReactNode }) {
  const allumee = oiaInterfaceEnabled();
  return (
    <html lang="fr">
      <body>
        {allumee ? (
          <AuthGate>
            <DonneesProvider>
              <ShyrkaProvider>
                <NotificateurDeRoute />
                {children}
                <ShyrkaGlobale />
              </ShyrkaProvider>
            </DonneesProvider>
          </AuthGate>
        ) : (
          <main data-oia-interface="off" className="flex min-h-dvh items-center justify-center px-5">
            <div className="card max-w-md p-6">
              <h1 className="text-xl">Interface OIA désactivée</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Cette interface s'allume sur les déploiements Preview. En local, au build : <code>{OIA_INTERFACE_FLAG}=on</code>.
              </p>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}

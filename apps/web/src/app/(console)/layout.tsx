import type { ReactNode } from "react";
import "./globals.css";
import { AuthGate } from "./AuthGate";
import { Bascule } from "../../oia/lib/bascule";

export const metadata = {
  title: "OIA — Review Console",
  description: "Evidence-first review of real discovered funding opportunities.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Bascule vers /oia (mandat v7, F6) : désactivée, sans effet tant que BASCULE_ACCUEIL vaut false. */}
        <Bascule />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}

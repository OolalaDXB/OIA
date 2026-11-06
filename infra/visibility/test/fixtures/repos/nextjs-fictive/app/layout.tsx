// Donnée fictive. Layout minimal d'un site fictif.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fictive Site · accueil",
  description: "Donnée fictive. Description placeholder du site fictif.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

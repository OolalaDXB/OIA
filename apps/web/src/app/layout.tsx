import type { ReactNode } from "react";
import "./globals.css";
import { AuthGate } from "./AuthGate";

export const metadata = {
  title: "OIA — Review Console",
  description: "Evidence-first review of real discovered funding opportunities.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}

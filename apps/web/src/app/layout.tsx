import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OIA Funding — Milestone 0 Review Console",
  description: "Evidence-first review of real Milestone-0 funding opportunities.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

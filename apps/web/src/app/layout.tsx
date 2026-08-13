import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OIA — Review Console",
  description: "Evidence-first review of real discovered funding opportunities.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

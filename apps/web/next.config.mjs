import { resolveOiaInterface } from "./oia-flag.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static console (data bundled at build, interactivity is client-side).
  // Static export lets Vercel serve a plain output directory — no monorepo
  // framework-detection needed (avoids "No Next.js version detected" at repo root).
  output: "export",
  // Folder-per-route (…/tenders/index.html) so any static host serves clean URLs.
  trailingSlash: true,
  // @oia/* packages are consumed as TypeScript source (internal packages).
  transpilePackages: ["@oia/ingestion", "@oia/workspace", "@oia/database", "@oia/registry", "@oia/connectors"],
  eslint: { ignoreDuringBuilds: true },
  // Bascule de /oia, figée au build (voir oia-flag.mjs) : Preview oui, production jamais.
  env: {
    OIA_INTERFACE: resolveOiaInterface({ vercelEnv: process.env.VERCEL_ENV, flag: process.env.NEXT_PUBLIC_OIA_INTERFACE }),
  },
};

export default nextConfig;

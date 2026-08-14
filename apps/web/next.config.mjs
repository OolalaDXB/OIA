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
  transpilePackages: ["@oia/ingestion", "@oia/workspace", "@oia/database"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

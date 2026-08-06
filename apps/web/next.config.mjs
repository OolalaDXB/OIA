/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static console (data bundled at build, interactivity is client-side).
  // Static export lets Vercel serve a plain output directory — no monorepo
  // framework-detection needed (avoids "No Next.js version detected" at repo root).
  output: "export",
  // @oia/* packages are consumed as TypeScript source (internal packages).
  transpilePackages: ["@oia/ingestion"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

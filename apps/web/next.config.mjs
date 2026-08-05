/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @oia/* packages are consumed as TypeScript source (internal packages).
  transpilePackages: ["@oia/ingestion"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

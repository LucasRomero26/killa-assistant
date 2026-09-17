/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    // googleapis is large and ships its own Node-only code; let Node require
    // it at runtime instead of bundling it into every route handler.
    serverComponentsExternalPackages: ["googleapis"],
  },
};

export default nextConfig;

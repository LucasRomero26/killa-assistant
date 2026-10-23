/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Never ship .map files to the browser: they would expose the original
  // source. (Next's default, pinned here so it can't be flipped by accident.)
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  experimental: {
    // googleapis is large and ships its own Node-only code; let Node require
    // it at runtime instead of bundling it into every route handler.
    serverComponentsExternalPackages: ["googleapis"],
  },
  async rewrites() {
    // llms.txt is the convention; answer the singular spelling too.
    return [{ source: "/llm.txt", destination: "/llms.txt" }];
  },
};

export default nextConfig;

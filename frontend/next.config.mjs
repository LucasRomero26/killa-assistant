const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Never ship .map files to the browser: they would expose the original
  // source. (Next's default, pinned here so it can't be flipped by accident.)
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // googleapis is large and ships its own Node-only code; let Node require
  // it at runtime instead of bundling it into every route handler.
  serverExternalPackages: ["googleapis"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    // llms.txt is the convention; answer the singular spelling too.
    return [{ source: "/llm.txt", destination: "/llms.txt" }];
  },
};

export default nextConfig;

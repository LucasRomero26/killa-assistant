import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/site";

// Date of each page's last real content change; update it when the page changes.
const ROUTES: Record<(typeof PUBLIC_ROUTES)[number], { lastModified: string; priority: number }> = {
  "/": { lastModified: "2026-10-24", priority: 1 },
  "/signup": { lastModified: "2026-10-23", priority: 0.9 },
  "/login": { lastModified: "2026-10-23", priority: 0.8 },
  "/privacy": { lastModified: "2026-10-23", priority: 0.3 },
  "/terms": { lastModified: "2026-10-23", priority: 0.3 },
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: ROUTES[route].lastModified,
    changeFrequency: "monthly",
    priority: ROUTES[route].priority,
  }));
}

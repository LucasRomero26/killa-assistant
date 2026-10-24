import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/site";

const PRIORITY: Record<(typeof PUBLIC_ROUTES)[number], number> = {
  "/": 1,
  "/signup": 0.9,
  "/login": 0.8,
  "/privacy": 0.3,
  "/terms": 0.3,
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: PRIORITY[route],
  }));
}

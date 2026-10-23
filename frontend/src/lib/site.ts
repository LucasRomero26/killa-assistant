/**
 * Public site identity, shared by metadata, robots, sitemap, the OG image
 * and JSON-LD. Mirrors the server's APP_URL resolution so canonical URLs
 * always point at the production domain.
 */
export const SITE_NAME = "KillaAssistant";

export const SITE_DESCRIPTION =
  "Multi-user AI assistant that lives in Telegram: manage Google Calendar events, file photos and documents into Google Drive, and send voice notes, using your own encrypted API keys.";

export const SITE_URL = (
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://killa-assistant.vercel.app")
).replace(/\/$/, "");

/** Routes anyone can visit; everything else sits behind login. */
export const PUBLIC_ROUTES = ["/login", "/signup", "/privacy", "/terms"] as const;

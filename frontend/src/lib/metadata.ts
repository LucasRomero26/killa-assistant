import type { Metadata } from "next";
import { SITE_NAME } from "./site";

const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — AI assistant for Telegram`,
};

interface PageMetadataOptions {
  title: string;
  description: string;
  /** Path of the page, used for its canonical URL and og:url. */
  path: string;
  /** Private panel pages are kept out of search results. */
  index?: boolean;
}

/**
 * Per-page metadata. Next merges openGraph/twitter shallowly, so each page
 * restates the full objects instead of inheriting half of the root's.
 */
export function pageMetadata({ title, description, path, index = true }: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

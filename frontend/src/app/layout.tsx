import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import dynamic from "next/dynamic";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Self-hosted via next/font: no render-blocking request to Google Fonts and
// no layout shift while the font swaps in.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "KillaAssistant",
  description: "Multi-user AI agent management panel",
  icons: {
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d14",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg text-text-primary antialiased">
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}

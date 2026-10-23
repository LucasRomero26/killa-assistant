import { pageMetadata } from "@/lib/metadata";

// The page itself is a client component, so its metadata lives here.
export const metadata = pageMetadata({
  title: "Sign in",
  description:
    "Sign in to the KillaAssistant control panel to link Telegram, connect Google Calendar and Drive, and manage your AI assistant.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

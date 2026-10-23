import { pageMetadata } from "@/lib/metadata";

// The page itself is a client component, so its metadata lives here.
export const metadata = pageMetadata({
  title: "Create your account",
  description:
    "Create a free KillaAssistant account and get an AI assistant in Telegram that manages your Google Calendar, files your documents into Drive and understands voice notes.",
  path: "/signup",
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}

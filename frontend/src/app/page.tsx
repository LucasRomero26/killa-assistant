import Link from "next/link";
import { ArrowRight, KeyRound, Mic, ShieldCheck, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SERVICE_COLOR, ServiceLogo } from "@/components/ServiceLogo";
import { TelegramDemo } from "@/components/TelegramDemo";
import { pageMetadata } from "@/lib/metadata";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";

export const metadata = {
  ...pageMetadata({ title: "AI assistant for Telegram", description: SITE_DESCRIPTION, path: "/" }),
  title: { absolute: `${SITE_NAME} — AI assistant for Telegram` },
};

const REPOSITORY_URL = "https://github.com/LucasRomero26/killa-assistant";

type FeatureVisual = { service: "calendar" | "drive" } | { icon: LucideIcon };

const FEATURES: { title: string; description: string; visual: FeatureVisual }[] = [
  {
    title: "Google Calendar",
    description:
      "Ask what is coming up, create meetings, move them or cancel them in plain language. The assistant asks for a time when you leave it out.",
    visual: { service: "calendar" },
  },
  {
    title: "Google Drive",
    description:
      "Send a photo or document, say where it belongs and it lands in that folder. Search, list and create folders from the same chat.",
    visual: { service: "drive" },
  },
  {
    title: "Voice notes",
    description:
      "Talk instead of typing. Voice messages are transcribed with Whisper and handled exactly like a text request.",
    visual: { icon: Mic },
  },
  {
    title: "Your keys, encrypted",
    description:
      "Bring your own NVIDIA NIM and Groq keys. Keys and Google tokens are encrypted with AES-256-GCM and isolated per user.",
    visual: { icon: ShieldCheck },
  },
];

const STEPS = [
  { title: "Create an account", description: "Sign up with your email and confirm it." },
  { title: "Add your API keys", description: "Paste your NVIDIA NIM and Groq keys in the panel." },
  { title: "Connect Google", description: "Grant access to Calendar and Drive through Google OAuth." },
  { title: "Link Telegram", description: "Send the one-time code to the bot and start chatting." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-sans text-[15px] font-semibold tracking-tight">KillaAssistant</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary md:inline">
              Features
            </a>
            <a href="#how-it-works" className="hidden px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary md:inline">
              How it works
            </a>
            <Link href="/login" className="px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary hidden sm:inline-flex">
              Create account
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="min-w-0 animate-fade-up">
            <p className="pill mb-6 border-border bg-bg-elevated/60 text-text-secondary">
              <ServiceLogo name="telegram" size={14} />
              Works inside Telegram
            </p>
            <h1 className="font-sans text-4xl text-text-primary md:text-5xl md:leading-[1.05]">
              Your calendar and files, one message away.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
              KillaAssistant is an AI agent that lives in your Telegram chats. Text it, send a voice
              note or forward a file, and it manages your Google Calendar and Google Drive for you.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn btn-primary px-5 py-3">
                Create account
                <ArrowRight size={16} />
              </Link>
              <a href="#demo" className="btn btn-secondary px-5 py-3">
                See demo
              </a>
            </div>
            <p className="mt-4 text-xs text-text-tertiary">
              Free to use. You only pay your own LLM providers.
            </p>
          </div>

          <div id="demo" className="mx-auto w-full min-w-0 max-w-md scroll-mt-24 lg:max-w-none">
            <TelegramDemo />
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-sans text-3xl text-text-primary">What it does</h2>
              <p className="mt-3 text-text-secondary">
                The assistant decides which tool to call from what you write, runs it against your own
                Google account and replies in the same chat.
              </p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2">
              {FEATURES.map(({ title, description, visual }) => (
                <li key={title} className="surface rounded-2xl p-6">
                  {"service" in visual ? (
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: SERVICE_COLOR[visual.service] }}
                    >
                      <ServiceLogo name={visual.service} size={20} />
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-elevated text-accent">
                      <visual.icon size={20} />
                    </span>
                  )}
                  <h3 className="mt-5 font-sans text-lg font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-sans text-3xl text-text-primary">Set up in four steps</h2>
              <p className="mt-3 text-text-secondary">
                Everything is configured from the web panel. After that, Telegram is the only app you need.
              </p>
            </div>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ title, description }, i) => (
                <li key={title} className="surface rounded-2xl p-6">
                  <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-3 font-sans text-base font-semibold text-text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-sans text-3xl text-text-primary">Ready to delegate?</h2>
              <p className="mt-3 flex items-center gap-2 text-text-secondary">
                <KeyRound size={16} className="text-accent" />
                Have your NVIDIA NIM and Groq API keys at hand.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="btn btn-primary px-5 py-3">
                Create account
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="btn btn-secondary px-5 py-3">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-text-tertiary sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>KillaAssistant by Lucas Romero</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition-colors hover:text-text-secondary">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-text-secondary">
              Terms
            </Link>
            <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-text-secondary">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

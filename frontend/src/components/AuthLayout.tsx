import Link from "next/link";
import { CalendarDays, FolderOpen, Mic, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";

const HIGHLIGHTS = [
  { icon: CalendarDays, text: "Create and list Google Calendar events from a chat" },
  { icon: FolderOpen, text: "Send a photo or file and file it straight into Drive" },
  { icon: Mic, text: "Voice notes transcribed and understood" },
  { icon: ShieldCheck, text: "Your own API keys, encrypted with AES-256-GCM" },
] as const;

interface AuthLayoutProps {
  children: React.ReactNode;
}

/** Split auth layout: brand panel on wide screens, form on the right. */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden border-r border-border">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(40rem 24rem at 20% 20%, oklch(45% 0.16 285 / 0.35), transparent 60%), radial-gradient(30rem 20rem at 90% 90%, oklch(50% 0.12 225 / 0.28), transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <Logo size={40} />
          <span className="font-sans text-lg font-semibold tracking-tight">KillaAssistant</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-sans text-4xl text-text-primary">
            Your assistant, <span className="text-gradient">one message away.</span>
          </h1>
          <p className="text-text-secondary mt-4 leading-relaxed">
            Delegate calendar, files and notes to an AI agent that lives in your Telegram.
          </p>

          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-text-secondary">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-elevated/70 border border-border flex items-center justify-center text-accent">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-text-tertiary">
          <Link href="/privacy" className="hover:text-text-secondary transition-colors">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-text-secondary transition-colors">Terms</Link>
        </p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <Logo size={40} />
            <span className="font-sans text-lg font-semibold tracking-tight">KillaAssistant</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

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
      <aside className="hidden lg:flex flex-col justify-between p-12 border-r border-border">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <span className="font-sans text-lg font-semibold tracking-tight">KillaAssistant</span>
        </div>

        <div className="max-w-md">
          <p className="font-sans text-4xl text-text-primary">
            Your assistant, one message away.
          </p>
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

        <p className="text-xs text-text-tertiary">
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

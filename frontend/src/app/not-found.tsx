import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you are looking for does not exist or has moved.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center animate-fade-up">
        <div className="flex items-center justify-center gap-3 mb-10">
          <Logo size={40} />
          <span className="font-sans text-lg font-semibold tracking-tight">KillaAssistant</span>
        </div>

        <p className="font-mono text-sm text-accent mb-3">Error 404</p>
        <h1 className="font-sans text-3xl md:text-4xl text-text-primary">Page not found</h1>
        <p className="text-sm text-text-secondary mt-3 leading-relaxed">
          The page you are looking for does not exist or has moved. Check the address, or head
          back to your control panel.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/connections" className="btn btn-primary">
            Go to the control panel
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

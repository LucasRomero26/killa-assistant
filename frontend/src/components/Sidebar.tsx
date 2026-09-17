"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LayoutGrid, Brain, Key, X, Menu, LogOut, ExternalLink } from "lucide-react";
import { Logo } from "./Logo";

const NAV_ITEMS = [
  { href: "/connections", label: "Connections", icon: LayoutGrid },
  { href: "/behavior", label: "Behavior", icon: Brain },
  { href: "/apis", label: "AI APIs", icon: Key },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav
        className={`fixed left-0 top-0 h-dvh w-sidebar glass border-r border-border flex flex-col z-50
        transition-transform duration-300 ease-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between px-5 h-16">
          <Link href="/connections" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-sans text-[15px] font-semibold tracking-tight text-text-primary">
              KillaAssistant
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-3 pt-2">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
            Workspace
          </p>
          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150
                  ${isActive
                    ? "bg-accent/10 text-text-primary font-medium"
                    : "text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-accent" />
                  )}
                  <Icon
                    size={18}
                    className={isActive ? "text-accent" : "text-text-tertiary group-hover:text-text-secondary transition-colors"}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-auto p-3 space-y-1 border-t border-border">
          <a
            href="https://t.me"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary transition-colors"
          >
            <ExternalLink size={16} className="text-text-tertiary" />
            Open Telegram
          </a>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-elevated/70 hover:text-text-primary transition-colors disabled:opacity-50 md:hidden"
          >
            <LogOut size={16} className="text-text-tertiary" />
            {loggingOut ? "Signing out..." : "Logout"}
          </button>
        </div>
      </nav>

      <div className="md:hidden fixed top-0 left-0 w-full h-14 glass border-b border-border flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-sans text-[15px] font-semibold tracking-tight text-text-primary">KillaAssistant</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          <Menu size={22} />
        </button>
      </div>
    </>
  );
}

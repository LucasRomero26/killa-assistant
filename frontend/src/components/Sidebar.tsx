"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { LayoutGrid, Brain, Key, X, Menu, LogOut } from "lucide-react";
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
      router.push("/login");
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
        className={`fixed left-0 top-0 h-screen w-sidebar bg-bg-surface border-r border-border flex flex-col z-50
        transition-transform duration-300 ease-out
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Logo size={40} />
            <span className="font-sans font-2xl text-text-primary">KillaAssistant</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-1 p-3 mt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200
                ${isActive
                  ? "bg-accent/10 text-text-primary font-medium border border-accent/20"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary border border-transparent"
                }`}
              >
                <Icon size={18} className={isActive ? "text-accent" : ""} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto p-3 border-t border-border md:hidden">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <LogOut size={18} />
            {loggingOut ? "..." : "Logout"}
          </button>
        </div>
      </nav>

      <div className="md:hidden fixed top-0 left-0 w-full h-14 bg-bg-surface/80 backdrop-blur-md border-b border-border flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-sans font-xl text-text-primary">KillaAssistant</span>
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

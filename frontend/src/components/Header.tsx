"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useState } from "react";
import { LogOut } from "lucide-react";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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
    <header
      className="hidden md:flex fixed top-0 right-0 w-[calc(100%-220px)] h-14 bg-bg-surface/80 backdrop-blur-md border-b border-border items-center justify-between px-6 lg:px-8 z-40"
      role="banner"
    >
      <h2 className="font-sans font-xl text-text-primary truncate">{title}</h2>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut size={16} />
        <span>{loggingOut ? "..." : "Logout"}</span>
      </button>
    </header>
  );
}

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
      router.replace("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header
      className="hidden md:flex fixed top-0 right-0 left-sidebar h-16 glass border-b border-border items-center justify-between px-8 z-40"
      role="banner"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-tertiary">Workspace</span>
        <span className="text-text-tertiary">/</span>
        <h2 className="font-medium text-text-primary truncate">{title}</h2>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="btn btn-secondary !py-1.5 !px-3 text-xs"
      >
        <LogOut size={14} />
        <span>{loggingOut ? "Signing out..." : "Logout"}</span>
      </button>
    </header>
  );
}

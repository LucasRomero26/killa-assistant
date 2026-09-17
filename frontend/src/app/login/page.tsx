"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { AuthLayout } from "@/components/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<div className="h-72" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/connections";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      // Full navigation (not router.push + refresh): one request, the
      // middleware sees the fresh session cookie, no stale router cache.
      window.location.assign(redirectTo.startsWith("/") ? redirectTo : "/connections");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="font-sans text-2xl text-text-primary">Welcome back</h2>
      <p className="text-sm text-text-secondary mt-1 mb-8">Sign in to your control panel.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-2">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div role="alert" className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-text-secondary mt-8 text-center">
        New here?{" "}
        <Link href="/signup" className="text-accent hover:text-accent-hover transition-colors font-medium">
          Create an account
        </Link>
      </p>
    </>
  );
}

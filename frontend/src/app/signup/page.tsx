"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data?.user && data.user.identities?.length === 0) {
        setError("This email is already registered. Try signing in instead.");
        return;
      }

      if (data?.user?.confirmation_sent_at || !data?.session) {
        setNeedsConfirmation(true);
        return;
      }

      window.location.assign("/connections");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      {needsConfirmation ? (
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success/10 border border-success/20 text-success mb-5">
            <MailCheck size={26} />
          </div>
          <h2 className="font-sans text-2xl text-text-primary mb-2">Check your email</h2>
          <p className="text-sm text-text-secondary mb-6 leading-relaxed">
            We sent a confirmation link to{" "}
            <span className="text-text-primary font-medium">{email}</span>. Click it to activate
            your account.
          </p>
          <div className="surface rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-text-tertiary leading-relaxed">
              If it does not arrive in a few minutes, check your spam or junk folder.
            </p>
          </div>
          <Link href="/login" className="btn btn-primary w-full">
            Go to sign in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="font-sans text-2xl text-text-primary">Create your account</h2>
          <p className="text-sm text-text-secondary mt-1 mb-8">
            Set up your control panel in under a minute.
          </p>

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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-text-secondary mb-2">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="Repeat your password"
              />
            </div>

            {error && (
              <div role="alert" className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          <p className="text-sm text-text-secondary mt-8 text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:text-accent-hover transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

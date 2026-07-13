"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { MailCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function SignupPage() {
  const router = useRouter();

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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

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

      router.push("/connections");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Logo size={60} />
          <div>
            <h1 className="font-sans font-3xl text-text-primary">KillaAssistant</h1>
            <p className="text-sm text-text-secondary mt-0.5">Control Panel</p>
          </div>
        </div>

        <div className="surface rounded-xl p-6 sm:p-8 shadow-lg shadow-black/20">
          {needsConfirmation ? (
            <div className="text-center py-4">
              <MailCheck size={48} className="text-success mx-auto mb-4" />
              <h2 className="font-sans font-xl text-text-primary mb-3">
                Check your email
              </h2>
              <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                We have sent a confirmation link to{" "}
                <span className="text-text-primary font-medium">{email}</span>.
                Click the link in your email to activate your account.
              </p>
              <div className="bg-bg-input border border-border rounded-lg p-4 mb-6 text-left">
                <p className="text-xs text-text-tertiary leading-relaxed">
                  If you do not receive the email in a few minutes, check
                  your spam or junk folder.
                </p>
              </div>
              <a
                href="/login"
                className="block w-full bg-accent text-accent-foreground py-2.5 rounded-lg text-sm font-medium text-center hover:bg-accent-hover transition-colors"
              >
                Go to sign in
              </a>
            </div>
          ) : (
            <>
              <h2 className="font-sans font-xl text-text-primary mb-1">
                Create account
              </h2>
              <p className="text-sm text-text-secondary mb-6">
                Set up your control panel.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium text-text-secondary mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-0 transition-colors placeholder:text-text-tertiary"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium text-text-secondary mb-2"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-0 transition-colors placeholder:text-text-tertiary"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-xs font-medium text-text-secondary mb-2"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-0 transition-colors placeholder:text-text-tertiary"
                    placeholder="Repeat your password"
                  />
                </div>

                {error && (
                  <div className="text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-accent text-accent-foreground py-2.5 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating..." : "Create account"}
                </button>
              </form>

              <p className="text-sm text-text-secondary mt-6 text-center">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="text-accent hover:text-accent-hover transition-colors"
                >
                  Sign in
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

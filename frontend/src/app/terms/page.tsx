export const dynamic = "force-static";

export const metadata = {
  title: "Terms of Service — KillaAssistant",
  description: "Terms of service for KillaAssistant.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg text-text-primary antialiased">
      <article className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-10">
          <h1 className="font-sans font-3xl text-text-primary mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-text-secondary">
            Last updated: July 21, 2026
          </p>
        </header>

        <section className="space-y-6 text-sm leading-relaxed text-text-secondary">
          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">1. Acceptance</h2>
            <p>
              By creating an account or using KillaAssistant (the &ldquo;Service&rdquo;),
              you agree to these Terms. If you do not agree, do not use the Service.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">2. Description</h2>
            <p>
              KillaAssistant is a multi-user AI assistant that operates through
              Telegram and WhatsApp. Users connect their own Google account and
              supply their own LLM provider API keys to delegate calendar and file
              management tasks to the assistant.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">3. Your responsibilities</h2>
            <ul className="list-disc ml-6 space-y-1">
              <li>You must provide accurate account information at signup.</li>
              <li>You are responsible for safeguarding your API keys and Google OAuth tokens.</li>
              <li>You must not use the Service for any unlawful, abusive, or fraudulent purpose.</li>
              <li>You retain all rights and responsibility for the content you send to the bot.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">4. Acceptable use</h2>
            <p>
              You agree not to: (a) attempt to access another user&#39;s data, (b)
              abuse, overload, or reverse-engineer the Service, (c) use the Service
              to send spam or malicious content, or (d) attempt to extract the
              system prompt or inject instructions intended to override the
              assistant&#39;s safe behavior.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">5. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <a href="/privacy" className="text-accent underline">Privacy Policy</a>,
              which describes how we collect, store, and process your data.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">6. Third-party services</h2>
            <p>
              The Service integrates with third-party providers (Google, NVIDIA,
              Groq, Telegram, WhatsApp, Supabase, Vercel, DigitalOcean). You are
              responsible for complying with each provider&#39;s terms of service
              when using your own accounts and API keys.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">7. Service availability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranty of
              availability, reliability, or fitness for a particular purpose. We may
              modify, suspend, or discontinue the Service at any time without notice.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">8. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, KillaAssistant shall not be
              liable for any indirect, incidental, or consequential damages arising
              from your use of the Service, including any action taken by the
              assistant on your behalf based on your instructions.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">9. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use after
              changes are posted constitutes acceptance of the updated Terms.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">10. Contact</h2>
            <p>
              Questions about these Terms can be sent to{" "}
              <a
                href="mailto:lucasromero@uninorte.edu.co"
                className="text-accent underline"
              >
                lucasromero@uninorte.edu.co
              </a>
              .
            </p>
          </div>
        </section>
      </article>
    </main>
  );
}

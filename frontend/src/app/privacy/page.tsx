export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy — KillaAssistant",
  description: "How KillaAssistant collects, stores, and uses your data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg text-text-primary antialiased">
      <article className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-10">
          <h1 className="font-sans font-3xl text-text-primary mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-text-secondary">
            Last updated: July 21, 2026
          </p>
        </header>

        <section className="space-y-6 text-sm leading-relaxed text-text-secondary">
          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">1. Overview</h2>
            <p>
              KillaAssistant (&ldquo;the Service&rdquo;) is a multi-user AI assistant
              that operates through Telegram and WhatsApp. Users connect their own
              Google account, supply their own LLM provider API keys, and chat with
              the bot to delegate calendar and file management tasks.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">2. Account information</h2>
            <p>
              When you create an account, we store your email address and a hashed
              password (managed by Supabase Auth). A profile row is created in our
              database with your user ID and email. No password is ever stored in
              plaintext.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">3. Google account data</h2>
            <p>
              When you connect your Google account, KillaAssistant requests OAuth 2.0
              authorization to access Google Calendar and Google Drive. Depending on
              your account tier, the requested scopes are either:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>
                <span className="text-text-primary">Light scopes:</span>{" "}
                <code className="font-mono text-xs">calendar.events</code> and{" "}
                <code className="font-mono text-xs">drive.file</code> — limited to
                events and files created or opened by the assistant.
              </li>
              <li>
                <span className="text-text-primary">Restricted scopes:</span>{" "}
                <code className="font-mono text-xs">calendar</code> and{" "}
                <code className="font-mono text-xs">drive</code> — full read/write
                access to your calendars and files. Granted only to accounts
                explicitly marked as VIP by the project owner.
              </li>
            </ul>
            <p className="mt-3">
              Google OAuth access and refresh tokens are encrypted at rest with
              AES-256-GCM and stored in our database. We never share these tokens
              with third parties.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">4. LLM provider API keys</h2>
            <p>
              You supply your own NVIDIA NIM and Groq API keys. These are encrypted
              with AES-256-GCM at rest and are used solely to make inference requests
              on your behalf. We never read, log, or reuse your API keys for any
              other purpose.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">5. Messages and content</h2>
            <p>
              The text, voice, photos, and documents you send to the bot are
              processed to fulfill your requests: transcribed (via Groq), passed to
              the LLM (via NVIDIA), and used to call the appropriate Google APIs on
              your behalf. Metadata about each interaction (tool name, success
              status, timestamp) is logged for debugging and auditing. Message
              contents are not retained beyond the active processing window.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">6. Data retention and deletion</h2>
            <p>
              You can disconnect your Google account at any time from the Connections
              panel; this deletes your stored OAuth tokens immediately. You can
              delete your KillaAssistant account by contacting{" "}
              <a
                href="mailto:lucasromero@uninorte.edu.co"
                className="text-accent underline"
              >
                lucasromero@uninorte.edu.co
              </a>
              ; deletion cascades to all associated records (profile, bot
              configuration, API keys, Google credentials, messaging connections,
              and activity logs) within 30 days.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">7. Third-party services</h2>
            <p>
              The Service integrates with the following third parties, each governed
              by their own privacy policy:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Supabase (PostgreSQL hosting and authentication)</li>
              <li>Vercel (frontend hosting)</li>
              <li>DigitalOcean (backend hosting)</li>
              <li>NVIDIA NIM (LLM inference — your API key, your requests)</li>
              <li>Groq (voice transcription — your API key, your requests)</li>
              <li>Google Calendar and Google Drive (your OAuth authorization)</li>
              <li>Telegram Bot API and OpenWA / WhatsApp Web (chat delivery)</li>
            </ul>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">8. Security</h2>
            <p>
              All sensitive data at rest (API keys, Google OAuth tokens) is
              encrypted with AES-256-GCM. Database access is protected by Supabase
              Row-Level Security: users can only access their own rows. All backend
              endpoints require JWT authentication. Rate limiting is enforced on
              every endpoint. Prompt injection attempts are filtered before reaching
              the LLM.
            </p>
          </div>

          <div>
            <h2 className="font-sans font-l text-text-primary mb-2">9. Contact</h2>
            <p>
              For any privacy-related questions or data deletion requests, contact{" "}
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

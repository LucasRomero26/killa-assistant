# KillaAssistant

A multi-user AI assistant that operates through Telegram. Users delegate tasks — calendar management, file organization, voice processing — by chatting with a bot. Each user brings their own LLM API keys and links their own Google account. The assistant handles the rest.

**Live demo:** https://killa-assistant.vercel.app

## How It Works

Users interact with the bot via text, voice notes, photos, or documents. The backend resolves which user sent the message, loads their encrypted API keys, sanitizes the input, and sends it to the LLM with tool definitions for Google Calendar and Drive. The LLM decides when to call a tool — listing events, creating meetings, searching Drive, uploading files — and can run up to 5 tool-calling rounds before returning a final response.

Voice messages are transcribed with Groq Whisper. Photos and documents are held as "pending media" until the user's next message specifies what to do with them (e.g., "save this to Drive in the Documents folder").

```
Telegram ──► /api/webhooks/telegram ──► Next.js Route Handlers (Vercel)
                                          ├──► NVIDIA NIM (Llama 3.1) — LLM + tool calling
                                          ├──► Groq (Whisper) — voice transcription
                                          ├──► Google Calendar + Drive (OAuth 2.0)
                                          └──► Supabase (PostgreSQL + RLS)

Control panel (Next.js) ──► /api/* (same app, Supabase session cookie)
```

Everything runs inside one Next.js app on Vercel — there is no separate backend server. The Telegram webhook acknowledges immediately and runs the LLM/tool loop in the background (`waitUntil`), so Telegram never re-delivers slow updates.

## Usage

### 1. Create an account

Go to https://killa-assistant.vercel.app and sign up with your email. You'll receive a confirmation link — click it to activate your account.

### 2. Add your API keys

Navigate to **APIs** and enter your NVIDIA NIM and Groq API keys. These are encrypted with AES-256-GCM and used for every LLM inference and voice transcription. Get your keys at:

- NVIDIA: https://build.nvidia.com
- Groq: https://console.groq.com

### 3. Connect Google

Go to **Connections** and click **Connect Google**. You'll be redirected to Google's OAuth consent screen — authorize Calendar and Drive access. Your OAuth tokens are encrypted and auto-refreshed on expiry.

### 4. Link Telegram

On the same **Connections** page, click **Link** on the Telegram card. A one-time code (e.g., `KILLA-X7B2`) appears — send it to the bot as `/start KILLA-X7B2`. This links your chat to your account. The code expires in 10 minutes.

### 5. Chat

Send a message to the bot on Telegram:

- **Text:** "What's on my calendar tomorrow?" — the bot lists events via Google Calendar tool calling
- **Voice:** Send a voice note — Groq transcribes it, the bot processes it as text
- **Photo/Document:** Send a file, then follow up with instructions — "Save this to Drive in the Documents folder"

## Tech Stack

| Component | Technology |
| :-- | :-- |
| App | Next.js 14 (App Router + Route Handlers), TypeScript, Tailwind CSS, SWR |
| Hosting | Vercel (serverless functions, no server to maintain) |
| Database | PostgreSQL, Supabase (RLS, Auth) |
| LLM | NVIDIA NIM (Llama 3.1 70B Instruct) — per-user API key |
| Transcription | Groq (Whisper Large v3) — per-user API key |
| Messaging | Telegram Bot API (webhook) |
| Integrations | Google Calendar API, Google Drive API (OAuth 2.0) |

## Security

- **Session auth** on all user endpoints — route handlers validate the Supabase session cookie server-side; no token is ever exposed to the browser
- **AES-256-GCM encryption** for API keys and Google OAuth tokens at rest
- **Supabase RLS** on every table — users can only access their own data
- **Prompt injection sanitizer** — filters instruction-override and data-exfiltration patterns
- **Webhook verification** — Telegram webhook requires a shared secret token
- **Atomic link tokens** — race-condition-safe `UPDATE ... WHERE status = 'pending'` consumption

## CI/CD

**CI** (`ci.yml`): On every PR and push to `main`, runs typecheck, lint, and tests (component tests in jsdom, server tests in Node).

**Deploy**: Vercel auto-deploys the whole app (pages + API routes + Telegram webhook) on push to `main`. Nothing else to provision.

### Environment variables (Vercel → Project → Settings → Environment Variables)

See [`.env.example`](.env.example). The ones without a default:

| Variable | Description |
| :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access (bypasses RLS) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot token from @BotFather and a random ≥32-char secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client; redirect URI is `https://<app>/api/auth/callback/google` |
| `ENCRYPTION_KEY` | 64 hex chars. Must stay constant — it decrypts stored keys and tokens |
| `ADMIN_TOKEN` | Operator token for `/api/telegram/setup-webhook` |

### Register the Telegram webhook (once per deployment URL)

```bash
curl -X POST https://<app>/api/telegram/setup-webhook -H "x-admin-token: $ADMIN_TOKEN"
```

## Local development

```bash
npm install
cp .env.example frontend/.env.local   # fill in values
npm run dev                            # http://localhost:3000
npm test
```

# KillaAssistant

A multi-user AI assistant that operates through Telegram and WhatsApp. Users delegate tasks — calendar management, file organization, voice processing — by chatting with a bot. Each user brings their own LLM API keys and links their own Google account. The assistant handles the rest.

**Live demo:** https://killa-assistant.vercel.app

## How It Works

Users interact with the bot via text, voice notes, photos, or documents. The backend resolves which user sent the message, loads their encrypted API keys, sanitizes the input, and sends it to the LLM with tool definitions for Google Calendar and Drive. The LLM decides when to call a tool — listing events, creating meetings, searching Drive, uploading files — and can run up to 5 tool-calling rounds before returning a final response.

Voice messages are transcribed with Groq Whisper. Photos and documents are held as "pending media" until the user's next message specifies what to do with them (e.g., "save this to Drive in the Documents folder").

```
Telegram / WhatsApp ──► Backend (Fastify)
                          ├──► NVIDIA NIM (Llama 3.1) — LLM + tool calling
                          ├──► Groq (Whisper) — voice transcription
                          ├──► Google Calendar + Drive (OAuth 2.0)
                          └──► Supabase (PostgreSQL + RLS)

Frontend (Next.js) ──► /api/proxy ──► Backend (JWT-authenticated)
```

## Usage

### 1. Create an account

Go to https://killa-assistant.vercel.app and sign up with your email. You'll receive a confirmation link — click it to activate your account.

### 2. Add your API keys

Navigate to **APIs** and enter your NVIDIA NIM and Groq API keys. These are encrypted with AES-256-GCM and used for every LLM inference and voice transcription. Get your keys at:

- NVIDIA: https://build.nvidia.com
- Groq: https://console.groq.com

### 3. Connect Google

Go to **Connections** and click **Connect Google**. You'll be redirected to Google's OAuth consent screen — authorize Calendar and Drive access. Your OAuth tokens are encrypted and auto-refreshed on expiry.

### 4. Link Telegram or WhatsApp

On the same **Connections** page, click **Link** on the Telegram or WhatsApp card. A one-time code (e.g., `KILLA-X7B2`) appears — send it to the bot as `/start KILLA-X7B2`. This links your chat to your account. The code expires in 10 minutes.

### 5. Chat

Send a message to the bot via Telegram or WhatsApp:

- **Text:** "What's on my calendar tomorrow?" — the bot lists events via Google Calendar tool calling
- **Voice:** Send a voice note — Groq transcribes it, the bot processes it as text
- **Photo/Document:** Send a file, then follow up with instructions — "Save this to Drive in the Documents folder"

## Tech Stack

| Component | Technology |
| :-- | :-- |
| Backend | Node.js 20+, TypeScript, Fastify 5, Docker |
| Frontend | Next.js 14, Tailwind CSS, SWR |
| Database | PostgreSQL, Supabase (RLS, Auth) |
| LLM | NVIDIA NIM (Llama 3.1 70B Instruct) — per-user API key |
| Transcription | Groq (Whisper Large v3) — per-user API key |
| Messaging | Telegram Bot API, OpenWA 4.x (WhatsApp) |
| Integrations | Google Calendar API, Google Drive API (OAuth 2.0) |

## Security

- **JWT auth** on all user endpoints — the frontend proxy injects the token server-side, never exposed to the browser
- **AES-256-GCM encryption** for API keys and Google OAuth tokens at rest
- **Supabase RLS** on every table — users can only access their own data
- **Prompt injection sanitizer** — filters instruction-override and data-exfiltration patterns
- **Rate limiting** — global 100 req/min with per-endpoint overrides
- **Webhook verification** — Telegram webhook requires a shared secret token
- **Atomic link tokens** — race-condition-safe `UPDATE ... WHERE status = 'pending'` consumption
- **WhatsApp access control** — only linked chat IDs are processed; others get an "unauthorized" reply

## CI/CD

**CI** (`ci.yml`): On every PR and push to `main`, runs typecheck, lint, and tests for both backend and frontend in parallel.

**CD** (`deploy.yml`): On push to `main`, compiles the backend on the GitHub runner, copies `dist/` to the DigitalOcean droplet via SCP, rebuilds the Docker container via SSH, and runs a health check.

**Frontend**: Vercel auto-deploys on push to `main`.

### Required GitHub Secrets

| Secret | Description |
| :-- | :-- |
| `DROPLET_IP` | Droplet public IP |
| `DROPLET_SSH_KEY` | Private SSH key for the droplet |
| `HEALTH_URL` | Backend health endpoint URL |

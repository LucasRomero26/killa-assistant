import { waitUntil } from "@vercel/functions";
import { handleTelegramWebhook } from "@/server/handlers/telegram-webhook";

export const dynamic = "force-dynamic";
// Upper bound for the background LLM/tool loop after the 200 is sent.
// Raise (up to 300 on Hobby with Fluid Compute) if long replies get cut off.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleTelegramWebhook(request, (work) => waitUntil(work));
}

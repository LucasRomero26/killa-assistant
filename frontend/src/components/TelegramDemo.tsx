import { Check, FileText, Mic } from "lucide-react";
import { Logo } from "./Logo";

type Message =
  | { from: "user"; kind: "text"; text: string; time: string }
  | { from: "user"; kind: "voice"; duration: string; transcript: string; time: string }
  | { from: "user"; kind: "file"; name: string; size: string; time: string }
  | { from: "bot"; text: string; detail?: string[]; time: string };

const CONVERSATION: Message[] = [
  { from: "user", kind: "text", text: "What's on my calendar tomorrow?", time: "8:02" },
  {
    from: "bot",
    text: "You have 2 events tomorrow:",
    detail: ["09:30  Sprint planning", "15:00  Dentist appointment"],
    time: "8:02",
  },
  {
    from: "user",
    kind: "voice",
    duration: "0:04",
    transcript: "Schedule a call with Ana on Friday at 4 pm",
    time: "8:03",
  },
  {
    from: "bot",
    text: "Done. I added \"Call with Ana\" to your calendar on Friday, 16:00 to 17:00.",
    time: "8:03",
  },
  { from: "user", kind: "file", name: "invoice-october.pdf", size: "182 KB", time: "8:05" },
  { from: "user", kind: "text", text: "Save this to Drive in Invoices", time: "8:05" },
  {
    from: "bot",
    text: "Saved invoice-october.pdf to Google Drive, folder Invoices.",
    time: "8:05",
  },
];

function UserBubble({ message }: { message: Extract<Message, { from: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#2b5278] px-3 py-2 text-sm text-white">
        {message.kind === "text" && <p>{message.text}</p>}
        {message.kind === "voice" && (
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <Mic size={14} />
              </span>
              <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
                {[3, 5, 8, 4, 10, 6, 12, 7, 4, 9, 5, 3, 6, 4].map((height, i) => (
                  <span key={i} className="w-0.5 rounded-full bg-white/70" style={{ height: `${height + 4}px` }} />
                ))}
              </span>
              <span className="text-xs text-white/70">{message.duration}</span>
            </div>
            <p className="mt-1.5 text-xs italic text-white/75">{message.transcript}</p>
          </div>
        )}
        {message.kind === "file" && (
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <FileText size={16} />
            </span>
            <div>
              <p className="font-medium">{message.name}</p>
              <p className="text-xs text-white/70">{message.size}</p>
            </div>
          </div>
        )}
        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/80">
          {message.time}
          <Check size={11} />
        </p>
      </div>
    </div>
  );
}

function BotBubble({ message }: { message: Extract<Message, { from: "bot" }> }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-[#182533] px-3 py-2 text-sm text-white">
        <p>{message.text}</p>
        {message.detail && (
          <ul className="mt-1.5 space-y-0.5 font-mono text-xs text-white/85">
            {message.detail.map((line) => (
              <li key={line} className="whitespace-pre">
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-right text-[11px] text-white/80">{message.time}</p>
      </div>
    </div>
  );
}

export function TelegramDemo() {
  return (
    <figure className="overflow-hidden rounded-3xl border border-border bg-[#0e1621] shadow-card">
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#17212b] px-4 py-3">
        <Logo size={36} className="rounded-full" />
        <div>
          <p className="text-sm font-semibold text-white">KillaAssistant</p>
          <p className="text-xs text-[#6ab3f3]">bot</p>
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-4 sm:px-4">
        {CONVERSATION.map((message, i) =>
          message.from === "user" ? (
            <UserBubble key={i} message={message} />
          ) : (
            <BotBubble key={i} message={message} />
          )
        )}
      </div>
      <figcaption className="sr-only">
        Example Telegram conversation with KillaAssistant: listing calendar events, creating an event
        from a voice note and saving a PDF to Google Drive.
      </figcaption>
    </figure>
  );
}

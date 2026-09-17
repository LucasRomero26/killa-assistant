"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import { X, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { ServiceLogo } from "./ServiceLogo";
import { proxyFetcher } from "@/lib/swr-fetcher";
import { proxyFetch } from "@/lib/api";

interface TelegramLinkModalProps {
  onLinked: () => void;
  onClose: () => void;
}

interface LinkTokenResponse {
  token: string;
  botCommand: string;
}

interface LinkStatusResponse {
  linked: boolean;
  chatId: string | null;
}

export function TelegramLinkModal({ onLinked, onClose }: TelegramLinkModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<LinkTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  useEffect(() => {
    let cancelled = false;
    async function generateToken() {
      setLoading(true);
      setError(null);
      try {
        const res = await proxyFetch("/api/telegram/link-token", { method: "POST" });
        if (!res.ok) throw new Error("Failed to generate token");
        const data = (await res.json()) as LinkTokenResponse;
        if (!cancelled) setTokenData(data);
      } catch {
        if (!cancelled) setError("Could not generate a linking code. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generateToken();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const linkStatusFetcher = useCallback(
    (path: string) => proxyFetcher<LinkStatusResponse>(path),
    []
  );

  useSWR<LinkStatusResponse>(
    tokenData ? "/api/telegram/link-status" : null,
    linkStatusFetcher,
    {
      refreshInterval: 3000,
      onSuccess: (data) => {
        if (data.linked) onLinkedRef.current();
      },
    }
  );

  async function handleCopyCommand() {
    if (!tokenData) return;
    try {
      await navigator.clipboard.writeText(tokenData.botCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may not be available
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-link-title"
        className="relative surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 sm:p-8 bg-bg-surface animate-fade-up"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl border mb-4"
            style={{
              backgroundColor: "color-mix(in oklab, #2AABEE 12%, transparent)",
              borderColor: "color-mix(in oklab, #2AABEE 25%, transparent)",
            }}
          >
            <ServiceLogo name="telegram" size={26} />
          </div>
          <h3 id="telegram-link-title" className="font-sans text-xl text-text-primary">
            Link Telegram
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Send the one-time command below to the bot. The code expires in 10 minutes.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <Loader2 size={28} className="text-accent animate-spin mx-auto mb-3" />
            <p className="text-sm text-text-secondary">Generating code...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-error mb-4">{error}</p>
            <button onClick={() => setRetryKey((k) => k + 1)} className="btn btn-primary px-6">
              Retry
            </button>
          </div>
        ) : tokenData ? (
          <ol className="space-y-4">
            <li className="flex gap-3">
              <StepNumber n={1} />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Open the KillaAssistant bot</p>
                <p className="text-sm text-text-secondary mt-0.5">
                  Find the bot in Telegram and open the chat.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={2} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary mb-2">Send this command</p>
                <div className="flex items-center gap-2 bg-bg-input border border-border rounded-lg p-3">
                  <code className="flex-1 text-text-primary text-sm font-mono break-all">
                    {tokenData.botCommand}
                  </code>
                  <button
                    onClick={handleCopyCommand}
                    className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors flex-shrink-0"
                    aria-label="Copy command"
                  >
                    {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={3} />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Wait for confirmation</p>
                <p className="text-sm text-text-secondary mt-0.5">
                  The bot replies once your chat is linked and this window closes automatically.
                </p>
              </div>
            </li>

            <li className="pt-2 space-y-3">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                <p className="text-xs text-warning">Waiting for /start...</p>
              </div>
              <a
                href="https://t.me"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary w-full"
              >
                <ExternalLink size={14} />
                Open Telegram
              </a>
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center mt-0.5">
      {n}
    </span>
  );
}

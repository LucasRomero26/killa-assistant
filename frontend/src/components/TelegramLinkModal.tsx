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

export function TelegramLinkModal({
  onLinked,
  onClose,
}: TelegramLinkModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<LinkTokenResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  useEffect(() => {
    let cancelled = false;
    async function generateToken() {
      setLoading(true);
      setError(null);
      try {
        const res = await proxyFetch("/api/telegram/link-token", {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error("Failed to generate token");
        }
        const data = (await res.json()) as LinkTokenResponse;
        if (!cancelled) setTokenData(data);
      } catch {
        if (!cancelled) setError("Failed to generate linking code.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    generateToken();

    return () => {
      cancelled = true;
    };
  }, []);

  const linkStatusFetcher = useCallback(
    (path: string) => proxyFetcher<LinkStatusResponse>(path),
    []
  );

  const shouldPoll = Boolean(tokenData);

  useSWR<LinkStatusResponse>(
    shouldPoll ? "/api/telegram/link-status" : null,
    linkStatusFetcher,
    {
      refreshInterval: 3000,
      onSuccess: (data) => {
        if (data.linked) {
          onLinkedRef.current();
        }
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      <div className="relative surface rounded-xl max-w-md w-full p-8 bg-bg-surface">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-bg-elevated ring-1 ring-border mb-4">
            <ServiceLogo name="telegram" size={28} />
          </div>
          <h3 className="font-sans font-xl text-text-primary mb-2">
            Link Telegram
          </h3>
          <p className="text-sm text-text-secondary">
            Follow these steps to link your account.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <Loader2 size={32} className="text-accent animate-spin mx-auto mb-4" />
            <p className="text-sm text-text-secondary">Generating code...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-error mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-accent text-accent-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Retry
            </button>
          </div>
        ) : tokenData ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">
                Step 1: Open Telegram
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                Find your KillaAssistant bot in Telegram and open the chat.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">
                Step 2: Send this command
              </p>
              <div className="flex items-center gap-2 bg-bg-input border border-border rounded-lg p-3">
                <code className="flex-1 text-text-primary text-sm font-mono break-all">
                  {tokenData.botCommand}
                </code>
                <button
                  onClick={handleCopyCommand}
                  className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
                  aria-label="Copy command"
                >
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">
                Step 3: Wait for confirmation
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                El bot te respondera con un mensaje de confirmacion.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 py-2">
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
              <p className="text-xs text-warning">Waiting for /start...</p>
            </div>

            <a
              href="https://t.me"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded-lg text-sm hover:bg-accent/20 transition-colors"
            >
              <ExternalLink size={14} />
              Open Telegram
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

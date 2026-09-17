"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { ConnectionCard } from "./ConnectionCard";
import { TelegramLinkModal } from "./TelegramLinkModal";
import { apiFetcher } from "@/lib/swr-fetcher";
import { apiFetch } from "@/lib/api";

interface GoogleStatus {
  connected: boolean;
  calendar_connected: boolean;
  drive_connected: boolean;
  has_refresh_token: boolean;
  expiry_date: string | null;
}

interface TelegramLinkStatus {
  linked: boolean;
  chatId: string | null;
}

interface ConnectionsClientProps {
  googleOAuthUrl: string;
}

const GOOGLE_STATUS_KEY = "/api/auth/google/status";
const TELEGRAM_STATUS_KEY = "/api/telegram/link-status";

function CardSkeleton() {
  return (
    <div className="surface rounded-xl p-5 space-y-5" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="skeleton h-11 w-11 rounded-lg" />
        <div className="skeleton h-6 w-24 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
      <div className="skeleton h-10 w-full rounded-lg" />
    </div>
  );
}

/**
 * Both statuses are fetched client-side so the page shell paints
 * immediately; the previous version blocked the whole server render on a
 * round-trip to the backend before showing anything.
 */
export function ConnectionsClient({ googleOAuthUrl }: ConnectionsClientProps) {
  const [showTelegramLink, setShowTelegramLink] = useState(false);
  const [disconnecting, setDisconnecting] = useState<"google" | "telegram" | null>(null);

  const closeTelegramLink = useCallback(() => {
    setShowTelegramLink(false);
    mutate(TELEGRAM_STATUS_KEY);
  }, []);

  const { data: googleStatus, isLoading: googleLoading } = useSWR<GoogleStatus>(
    GOOGLE_STATUS_KEY,
    apiFetcher
  );

  const { data: telegramLinkData, isLoading: telegramLoading } = useSWR<TelegramLinkStatus>(
    TELEGRAM_STATUS_KEY,
    apiFetcher
  );

  const googleConnected = googleStatus?.connected ?? false;
  const googleCalendarConnected = googleStatus?.calendar_connected ?? false;
  const googleDriveConnected = googleStatus?.drive_connected ?? false;
  const telegramLinked = telegramLinkData?.linked ?? false;

  async function handleGoogleDisconnect() {
    setDisconnecting("google");
    try {
      const res = await apiFetch("/api/auth/google/disconnect", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      await mutate(GOOGLE_STATUS_KEY);
    } catch {
      // ignore
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleTelegramDisconnect() {
    setDisconnecting("telegram");
    try {
      const res = await apiFetch("/api/telegram/unlink", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unlink");
      await mutate(TELEGRAM_STATUS_KEY);
    } catch {
      // ignore
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
        {telegramLoading ? (
          <CardSkeleton />
        ) : (
          <ConnectionCard
            title="Telegram"
            subtitle={telegramLinked ? "Linked to your account" : "Link your chat to start"}
            logo="telegram"
            status={telegramLinked ? "on" : "pending"}
            action={{ label: "Link" }}
            onActionClick={telegramLinked ? undefined : () => setShowTelegramLink(true)}
            onDisconnect={telegramLinked ? handleTelegramDisconnect : undefined}
            disconnecting={disconnecting === "telegram"}
          />
        )}

        {googleLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <ConnectionCard
              title="Calendar"
              subtitle={googleCalendarConnected ? "Google Calendar access granted" : "Not linked"}
              logo="calendar"
              status={googleCalendarConnected ? "on" : "off"}
              action={{ label: "Connect Google", href: googleConnected ? undefined : googleOAuthUrl }}
              onDisconnect={googleConnected ? handleGoogleDisconnect : undefined}
              disconnecting={disconnecting === "google"}
            />
            <ConnectionCard
              title="Drive"
              subtitle={googleDriveConnected ? "Google Drive access granted" : "Not linked"}
              logo="drive"
              status={googleDriveConnected ? "on" : "off"}
              action={{ label: "Connect Google", href: googleConnected ? undefined : googleOAuthUrl }}
              onDisconnect={googleConnected ? handleGoogleDisconnect : undefined}
              disconnecting={disconnecting === "google"}
            />
          </>
        )}
      </div>

      {showTelegramLink && (
        <TelegramLinkModal onLinked={closeTelegramLink} onClose={closeTelegramLink} />
      )}
    </>
  );
}

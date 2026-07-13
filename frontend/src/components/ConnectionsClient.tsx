"use client";

import { useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { ConnectionCard } from "./ConnectionCard";
import { WhatsAppLinkModal } from "./WhatsAppLinkModal";
import { TelegramLinkModal } from "./TelegramLinkModal";
import { proxyFetcher } from "@/lib/swr-fetcher";
import { proxyFetch } from "@/lib/api";

interface WhatsAppBotStatus {
  connected: boolean;
  status: "qr" | "authenticated" | "disconnected" | "connecting" | "ready";
}

interface WhatsAppLinkStatus {
  linked: boolean;
  chatId: string | null;
}

interface TelegramWebhookInfo {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
}

interface TelegramLinkStatus {
  linked: boolean;
  chatId: string | null;
}

interface ConnectionsClientProps {
  googleConnected: boolean;
  googleCalendarConnected: boolean;
  googleDriveConnected: boolean;
  googleOAuthUrl: string;
}

export function ConnectionsClient({
  googleConnected,
  googleCalendarConnected,
  googleDriveConnected,
  googleOAuthUrl,
}: ConnectionsClientProps) {
  const [showWhatsAppLink, setShowWhatsAppLink] = useState(false);
  const [showTelegramLink, setShowTelegramLink] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const closeWhatsAppLink = useCallback(() => setShowWhatsAppLink(false), []);
  const closeTelegramLink = useCallback(() => setShowTelegramLink(false), []);

  const { data: whatsappBotStatus } = useSWR<WhatsAppBotStatus>(
    "/api/whatsapp/status",
    proxyFetcher,
    { refreshInterval: showWhatsAppLink || showTelegramLink ? 0 : 5000 }
  );

  const { data: whatsappLinkData } = useSWR<WhatsAppLinkStatus>(
    "/api/whatsapp/link-status",
    proxyFetcher,
    { refreshInterval: showWhatsAppLink || showTelegramLink ? 0 : 0 }
  );

  const { data: telegramInfo } = useSWR<TelegramWebhookInfo>(
    "/api/telegram/webhook-info",
    proxyFetcher,
    { refreshInterval: showWhatsAppLink || showTelegramLink ? 0 : 0 }
  );

  const { data: telegramLinkData } = useSWR<TelegramLinkStatus>(
    "/api/telegram/link-status",
    proxyFetcher,
    { refreshInterval: showWhatsAppLink || showTelegramLink ? 0 : 0 }
  );

  const telegramLinked = telegramLinkData?.linked ?? false;

  const whatsappBotReady = whatsappBotStatus?.connected ?? false;
  const whatsappLinked = whatsappLinkData?.linked ?? false;

  const whatsappCardStatus: "on" | "off" | "pending" = whatsappLinked
    ? "on"
    : whatsappBotStatus?.status === "connecting" || whatsappBotStatus?.status === "qr"
      ? "pending"
      : "off";

  const whatsappSubtitle = whatsappLinked
    ? "Linked"
    : whatsappBotReady
      ? "Bot online — link your account"
      : whatsappBotStatus?.status === "connecting"
        ? "Bot starting..."
        : whatsappBotStatus?.status === "qr"
          ? "Bot waiting for QR scan (admin)"
          : "Bot offline";

  const telegramCardStatus: "on" | "off" | "pending" = telegramLinked
    ? "on"
    : "pending";
  const telegramSubtitle = telegramLinked
    ? "Linked"
    : telegramInfo?.url
      ? `Bot active (${telegramInfo?.pending_update_count ?? 0} pending)`
      : "Not linked";

  async function handleGoogleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await proxyFetch("/api/auth/google/disconnect", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      mutate("/api/auth/google/status");
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleTelegramDisconnect() {
    setDisconnecting(true);
    try {
      const res = await proxyFetch("/api/telegram/unlink", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink");
      mutate("/api/telegram/link-status");
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleWhatsAppDisconnect() {
    setDisconnecting(true);
    try {
      const res = await proxyFetch("/api/whatsapp/unlink", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to unlink");
      mutate("/api/whatsapp/link-status");
    } catch {
      // ignore
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <ConnectionCard
          title="Calendar"
          subtitle={googleCalendarConnected ? "Connected" : "Not linked"}
          logo="calendar"
          status={googleCalendarConnected ? "on" : "off"}
          action={{ label: "Connect Google", href: googleConnected ? undefined : googleOAuthUrl }}
          onActionClick={googleConnected ? undefined : undefined}
          onDisconnect={googleConnected ? handleGoogleDisconnect : undefined}
        />
        <ConnectionCard
          title="Drive"
          subtitle={googleDriveConnected ? "Connected" : "Not linked"}
          logo="drive"
          status={googleDriveConnected ? "on" : "off"}
          action={{ label: "Connect Google", href: googleConnected ? undefined : googleOAuthUrl }}
          onActionClick={googleConnected ? undefined : undefined}
          onDisconnect={googleConnected ? handleGoogleDisconnect : undefined}
        />
        <ConnectionCard
          title="WhatsApp"
          subtitle={whatsappSubtitle}
          logo="whatsapp"
          status={whatsappCardStatus}
          action={{ label: "Link" }}
          onActionClick={whatsappLinked ? undefined : () => setShowWhatsAppLink(true)}
          onDisconnect={whatsappLinked ? handleWhatsAppDisconnect : undefined}
        />
        <ConnectionCard
          title="Telegram"
          subtitle={telegramSubtitle}
          logo="telegram"
          status={telegramCardStatus}
          action={{ label: "Link" }}
          onActionClick={telegramLinked ? undefined : () => setShowTelegramLink(true)}
          onDisconnect={telegramLinked ? handleTelegramDisconnect : undefined}
        />
      </div>

      {showWhatsAppLink && (
        <WhatsAppLinkModal
          onLinked={closeWhatsAppLink}
          onClose={closeWhatsAppLink}
        />
      )}

      {showTelegramLink && (
        <TelegramLinkModal
          onLinked={closeTelegramLink}
          onClose={closeTelegramLink}
        />
      )}
    </>
  );
}

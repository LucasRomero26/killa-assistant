import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { ConnectionsClient } from "@/components/ConnectionsClient";

const GOOGLE_OAUTH_URL = "/api/auth/google-redirect";

function mockFetchByUrl(status: {
  connected: boolean;
  status: string;
  whatsappLinked?: boolean;
  telegramLinked?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      let body: unknown = null;
      const u = decodeURIComponent(typeof url === "string" ? url : String(url));
      if (u.includes("/api/whatsapp/status")) {
        body = { connected: status.connected, status: status.status };
      } else if (u.includes("/api/whatsapp/link-status")) {
        body = { linked: status.whatsappLinked ?? false, chatId: status.whatsappLinked ? "555@c.us" : null };
      } else if (u.includes("/api/telegram/webhook-info")) {
        body = { url: "https://webhook.example.com", pending_update_count: 0 };
      } else if (u.includes("/api/telegram/link-status")) {
        body = { linked: status.telegramLinked ?? false, chatId: null };
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    })
  );
}

describe("ConnectionsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderWithSWR(ui: React.ReactElement) {
    return render(
      <SWRConfig value={{ provider: () => new Map() }}>
        {ui}
      </SWRConfig>
    );
  }

  const defaultProps = {
    googleConnected: false,
    googleCalendarConnected: false,
    googleDriveConnected: false,
    googleOAuthUrl: GOOGLE_OAUTH_URL,
  };

  it("should render all four connection cards", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected" });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Drive")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Telegram")).toBeInTheDocument();
  });

  it("should show Google Calendar as Connected when connected", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected" });

    renderWithSWR(
      <ConnectionsClient {...defaultProps} googleConnected={true} googleCalendarConnected={true} />
    );

    const connectedBadges = screen.getAllByText("Connected");
    expect(connectedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("should show WhatsApp as Bot offline when bot is disconnected and not linked", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected" });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Bot offline")).toBeInTheDocument();
    });
  });

  it("should show WhatsApp Link button when not linked", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected" });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      const linkButtons = screen.getAllByText("Link");
      expect(linkButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should show WhatsApp as Linked when user is linked", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected", whatsappLinked: true });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Linked")).toBeInTheDocument();
    });
  });

  it("should show Connect Google link when Google is not connected", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected" });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      const googleLinks = screen.getAllByText("Connect Google");
      expect(googleLinks.length).toBe(2);
      const firstLink = googleLinks[0].closest("a");
      expect(firstLink).toHaveAttribute("href", GOOGLE_OAUTH_URL);
    });
  });

  it("should show Disconnect button when WhatsApp is linked", async () => {
    mockFetchByUrl({ connected: false, status: "disconnected", whatsappLinked: true });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      const disconnectButtons = screen.getAllByText("Disconnect");
      expect(disconnectButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("should show Pending status when WhatsApp bot is connecting", async () => {
    mockFetchByUrl({ connected: false, status: "connecting" });

    renderWithSWR(<ConnectionsClient {...defaultProps} />);

    await waitFor(() => {
      const pendingBadges = screen.getAllByText("Pending");
      expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Bot starting...")).toBeInTheDocument();
    });
  });
});

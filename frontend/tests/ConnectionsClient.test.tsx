import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { ConnectionsClient } from "@/components/ConnectionsClient";

const GOOGLE_OAUTH_URL = "/api/auth/google";

function mockFetchByUrl(status: {
  googleConnected?: boolean;
  telegramLinked?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      let body: unknown = null;
      const u = decodeURIComponent(typeof url === "string" ? url : String(url));
      if (u.includes("/api/auth/google/status")) {
        const connected = status.googleConnected ?? false;
        body = {
          connected,
          calendar_connected: connected,
          drive_connected: connected,
          has_refresh_token: connected,
          expiry_date: null,
        };
      } else if (u.includes("/api/telegram/link-status")) {
        body = { linked: status.telegramLinked ?? false, chatId: status.telegramLinked ? "123" : null };
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

  it("should render Telegram, Calendar and Drive cards once statuses load", async () => {
    mockFetchByUrl({});

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      expect(screen.getByText("Telegram")).toBeInTheDocument();
      expect(screen.getByText("Calendar")).toBeInTheDocument();
      expect(screen.getByText("Drive")).toBeInTheDocument();
    });
    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
  });

  it("should only request google and telegram status", async () => {
    mockFetchByUrl({});

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      expect(screen.getByText("Telegram")).toBeInTheDocument();
    });

    const urls = vi.mocked(fetch).mock.calls.map(([u]) => decodeURIComponent(String(u)));
    expect(urls.some((u) => u.includes("/api/auth/google/status"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/telegram/link-status"))).toBe(true);
    expect(urls.some((u) => u.includes("whatsapp"))).toBe(false);
    expect(urls.some((u) => u.includes("webhook-info"))).toBe(false);
  });

  it("should show Google Calendar and Drive as Connected when connected", async () => {
    mockFetchByUrl({ googleConnected: true });

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      expect(screen.getAllByText("Connected").length).toBe(2);
    });
    expect(screen.getAllByText("Disconnect").length).toBe(2);
  });

  it("should show Connect Google links when Google is not connected", async () => {
    mockFetchByUrl({});

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      const googleLinks = screen.getAllByText("Connect Google");
      expect(googleLinks.length).toBe(2);
      expect(googleLinks[0].closest("a")).toHaveAttribute("href", GOOGLE_OAUTH_URL);
    });
  });

  it("should show Telegram as Pending with a Link button when not linked", async () => {
    mockFetchByUrl({});

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      expect(screen.getByText("Pending")).toBeInTheDocument();
      expect(screen.getByText("Link")).toBeInTheDocument();
    });
  });

  it("should show Telegram as Connected with a Disconnect button when linked", async () => {
    mockFetchByUrl({ telegramLinked: true });

    renderWithSWR(<ConnectionsClient googleOAuthUrl={GOOGLE_OAUTH_URL} />);

    await waitFor(() => {
      expect(screen.getByText("Linked to your account")).toBeInTheDocument();
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });
  });
});

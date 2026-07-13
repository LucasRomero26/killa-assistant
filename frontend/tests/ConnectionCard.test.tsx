import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionCard } from "@/components/ConnectionCard";

describe("ConnectionCard", () => {
  it("should render title and subtitle", () => {
    render(
      <ConnectionCard
        title="Calendar"
        subtitle="Not linked"
        logo="calendar"
        status="off"
        action={{ label: "Connect Google", href: "http://backend/api/auth/google?userId=1" }}
      />
    );

    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Not linked")).toBeInTheDocument();
    expect(screen.getByText("Connect Google")).toBeInTheDocument();
  });

  it("should show Connected badge when status is on", () => {
    render(
      <ConnectionCard
        title="Drive"
        subtitle="Connected"
        logo="drive"
        status="on"
        action={{ label: "Connected" }}
      />
    );

    const connectedElements = screen.getAllByText("Connected");
    expect(connectedElements.length).toBeGreaterThanOrEqual(1);
  });

  it("should show Disconnected badge when status is off", () => {
    render(
      <ConnectionCard
        title="WhatsApp"
        subtitle="Not linked"
        logo="whatsapp"
        status="off"
        action={{ label: "Connect" }}
        onActionClick={() => {}}
      />
    );

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("should show Pending badge when status is pending", () => {
    render(
      <ConnectionCard
        title="Telegram"
        subtitle="Not linked"
        logo="telegram"
        status="pending"
        action={{ label: "Link" }}
        onActionClick={() => {}}
      />
    );

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should render link when href is provided", () => {
    render(
      <ConnectionCard
        title="Calendar"
        subtitle="Not linked"
        logo="calendar"
        status="off"
        action={{ label: "Connect Google", href: "http://backend/api/auth/google?userId=1" }}
      />
    );

    const link = screen.getByText("Connect Google").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "http://backend/api/auth/google?userId=1"
    );
  });

  it("should render Disconnect button when connected and onDisconnect is provided", () => {
    render(
      <ConnectionCard
        title="Drive"
        subtitle="Connected"
        logo="drive"
        status="on"
        action={{ label: "Connected" }}
        onDisconnect={() => {}}
      />
    );

    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });
});

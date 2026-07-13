import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/Sidebar";

describe("Sidebar", () => {
  it("should render all 3 navigation items", () => {
    render(<Sidebar />);

    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("AI APIs")).toBeInTheDocument();
  });

  it("should not render Monitor", () => {
    render(<Sidebar />);

    expect(screen.queryByText("Monitor")).not.toBeInTheDocument();
  });

  it("should render the brand title", () => {
    render(<Sidebar />);
    const titles = screen.getAllByText("KillaAssistant");
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it("should mark Connections as active when pathname is /connections", () => {
    render(<Sidebar />);
    const connectionsLink = screen.getByText("Connections").closest("a");
    expect(connectionsLink).not.toBeNull();
    expect(connectionsLink).toHaveClass("bg-accent/10");
  });

  it("should have correct hrefs for navigation", () => {
    render(<Sidebar />);
    expect(screen.getByText("Behavior").closest("a")).toHaveAttribute(
      "href",
      "/behavior"
    );
    expect(screen.getByText("AI APIs").closest("a")).toHaveAttribute(
      "href",
      "/apis"
    );
  });
});

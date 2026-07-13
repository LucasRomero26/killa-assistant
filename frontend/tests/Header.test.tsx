import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/Header";

describe("Header", () => {
  it("should render the title", () => {
    render(<Header title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should render Logout button", () => {
    render(<Header title="T" />);
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("should not render notification and settings buttons", () => {
    render(<Header title="T" />);
    expect(screen.queryByLabelText("Notifications")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
  });
});

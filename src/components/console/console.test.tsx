import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PanelCard } from "./PanelCard";
import { StatusDot } from "./StatusDot";
import { List } from "./List";
import { EventLogPanel } from "./EventLogPanel";
import type { NetworkEvent } from "@/lib/t0/types";

describe("PanelCard", () => {
  it("renders step, title and children", () => {
    render(
      <PanelCard step="01" title="Hello">
        <p>body</p>
      </PanelCard>,
    );
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });
});

describe("StatusDot", () => {
  it.each([
    ["success", "#34c759"],
    ["confirmed", "#34c759"],
    ["failed", "#ff453a"],
    ["accepted", "#00d4ff"],
    ["rejected", "#ff9f0a"],
    ["pending", "#a1a1a6"],
    ["unknown", "#a1a1a6"],
  ])("status %s -> bg %s", (status, bg) => {
    render(<StatusDot status={status} />);
    const dot = screen.getByTestId(`status-${status}`);
    expect(dot.getAttribute("style") ?? "").toContain(bg);
  });
});

describe("List", () => {
  it("shows empty message when items is empty", () => {
    render(<List items={[]} render={(x: number) => <span>{x}</span>} />);
    expect(screen.getByText("Empty")).toBeTruthy();
  });

  it("renders each item via the render prop", () => {
    render(<List items={[1, 2, 3]} render={(x) => <span data-testid="item">{x}</span>} />);
    expect(screen.getAllByTestId("item")).toHaveLength(3);
  });

  it("uses custom empty message", () => {
    render(
      <List items={[]} emptyMessage="Nothing here" render={(x: number) => <span>{x}</span>} />,
    );
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("applies testId to container and empty branch", () => {
    const { rerender } = render(
      <List items={[]} testId="L" render={(x: number) => <span>{x}</span>} />,
    );
    expect(screen.getByTestId("L-empty")).toBeTruthy();
    rerender(<List items={[1]} testId="L" render={(x) => <span data-testid="item">{x}</span>} />);
    expect(screen.getByTestId("L")).toBeTruthy();
  });
});

describe("EventLogPanel", () => {
  const ev: NetworkEvent[] = [
    { type: "QuotePublished", quoteId: "q1", at: 1_700_000_000_000 },
    { type: "PaymentAccepted", paymentId: "p1", at: 1_700_000_006_000 },
  ];

  it("renders empty state when no events", () => {
    render(<EventLogPanel events={[]} />);
    expect(screen.getByText("No events yet.")).toBeTruthy();
    expect(screen.getByText(/Event Log · 0/)).toBeTruthy();
  });

  it("renders each event type", () => {
    render(<EventLogPanel events={ev} />);
    expect(screen.getByText("QuotePublished")).toBeTruthy();
    expect(screen.getByText("PaymentAccepted")).toBeTruthy();
    expect(screen.getByText(/Event Log · 2/)).toBeTruthy();
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReadinessCard } from "./ReadinessCard";

describe("ReadinessCard", () => {
  it("links to Settings when the AI key is missing", () => {
    render(<ReadinessCard aiReady={false} mic="granted" onRequestMic={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Cài đặt/ })).toHaveAttribute("href", "/settings");
  });

  it("asks for mic permission when promptable", () => {
    const onRequestMic = vi.fn();
    render(<ReadinessCard aiReady mic="prompt" onRequestMic={onRequestMic} />);
    fireEvent.click(screen.getByRole("button", { name: "Cho phép" }));
    expect(onRequestMic).toHaveBeenCalled();
  });

  it("explains a blocked or unsupported mic", () => {
    const { rerender } = render(<ReadinessCard aiReady mic="denied" onRequestMic={vi.fn()} />);
    expect(screen.getByText(/Micro bị chặn/)).toBeInTheDocument();
    rerender(<ReadinessCard aiReady mic="unsupported" onRequestMic={vi.fn()} />);
    expect(screen.getByText(/không hỗ trợ ghi âm/)).toBeInTheDocument();
  });

  it("shows both ready", () => {
    render(<ReadinessCard aiReady mic="granted" onRequestMic={vi.fn()} />);
    expect(screen.getByText("Đã có khóa AI")).toBeInTheDocument();
    expect(screen.getByText("Micro đã sẵn sàng")).toBeInTheDocument();
  });
});

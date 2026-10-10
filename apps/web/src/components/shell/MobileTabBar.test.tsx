import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileTabBar } from "./MobileTabBar";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

function at(pathname: string) {
  vi.mocked(usePathname).mockReturnValue(pathname);
}

beforeEach(() => at("/dashboard"));

describe("MobileTabBar", () => {
  it("renders the four tabs with their hrefs plus a Thêm button", () => {
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Tổng quan" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Tra từ" })).toHaveAttribute("href", "/lookup");
    expect(screen.getByRole("link", { name: "Từ vựng" })).toHaveAttribute("href", "/vocab-bank");
    expect(screen.getByRole("link", { name: "Ôn tập" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("button", { name: /Thêm/ })).toBeInTheDocument();
  });

  it("marks the current tab active, including nested routes", () => {
    at("/vocab-bank/whatever");
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: "Từ vựng" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Tra từ" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: /Thêm/ })).not.toHaveClass("active");
  });

  it("marks Thêm active when the route belongs to one of its seven areas", () => {
    at("/settings");
    render(<MobileTabBar />);
    expect(screen.getByRole("button", { name: /Thêm/ })).toHaveClass("active");
  });

  it("opens a dialog sheet listing the seven other areas", () => {
    render(<MobileTabBar />);
    const more = screen.getByRole("button", { name: /Thêm/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Các khu vực khác" });
    expect(dialog.querySelectorAll("a")).toHaveLength(7);
    expect(screen.getByRole("link", { name: /Hội thoại tiếng Anh/ })).toHaveAttribute("href", "/conversation");
    expect(screen.getByRole("link", { name: /Cài đặt/ })).toHaveAttribute("href", "/settings");
  });

  it("closes the sheet on backdrop tap and returns focus to Thêm", () => {
    render(<MobileTabBar />);
    const more = screen.getByRole("button", { name: /Thêm/ });
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("mtab-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(more);
  });

  it("closes the sheet on Escape", () => {
    render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet when an item is chosen", () => {
    render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    fireEvent.click(screen.getByRole("link", { name: /Đọc — tổng quan/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet when the route changes", () => {
    const { rerender } = render(<MobileTabBar />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    at("/reading");
    rerender(<MobileTabBar />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders nothing on live interview and conversation session pages", () => {
    for (const p of ["/interview/abc123", "/conversation/abc123"]) {
      at(p);
      const { container, unmount } = render(<MobileTabBar />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("still renders on the setup and report pages of those areas", () => {
    for (const p of ["/interview", "/conversation", "/interview/abc123/report", "/conversation/abc123/report"]) {
      at(p);
      const { unmount } = render(<MobileTabBar />);
      expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
      unmount();
    }
  });
});

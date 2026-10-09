import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("Sidebar", () => {
  it("renders all 11 nav items with the 7 group labels, and marks the current route active", () => {
    vi.mocked(usePathname).mockReturnValue("/vocab-bank");
    render(<Sidebar />);

    expect(screen.getByText("Đọc")).toBeInTheDocument();
    expect(screen.getByText("Quét từ")).toBeInTheDocument();
    expect(screen.getByText("Kiến thức")).toBeInTheDocument();
    expect(screen.getByText("Nghe")).toBeInTheDocument();
    expect(screen.getByText("Phỏng vấn")).toBeInTheDocument();
    expect(screen.getByText("Khác")).toBeInTheDocument();

    const active = screen.getByRole("link", { name: /Ngân hàng từ vựng/ });
    expect(active).toHaveClass("active");
    expect(active).toHaveAttribute("href", "/vocab-bank");

    const inactive = screen.getByRole("link", { name: /Tổng quan/ });
    expect(inactive).not.toHaveClass("active");
    expect(inactive).toHaveAttribute("href", "/dashboard");
  });

  it("renders the Kiến thức link with the correct href", () => {
    vi.mocked(usePathname).mockReturnValue("/vocab-bank");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Kiến thức/ })).toHaveAttribute("href", "/knowledge");
  });

  it("renders exactly 11 nav links (not the mockup's 12 demo entries)", () => {
    vi.mocked(usePathname).mockReturnValue("/vocab-bank");
    render(<Sidebar />);
    expect(screen.getAllByRole("link")).toHaveLength(11);
  });

  it("renders the Phỏng vấn tiếng Anh link with the correct href", () => {
    vi.mocked(usePathname).mockReturnValue("/vocab-bank");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Phỏng vấn tiếng Anh/ })).toHaveAttribute("href", "/interview");
  });

  it("renders the Word Radar link and marks it active on /word-radar", () => {
    vi.mocked(usePathname).mockReturnValue("/word-radar");
    render(<Sidebar />);

    const radar = screen.getByRole("link", { name: /Quét từ vựng/ });
    expect(radar).toHaveAttribute("href", "/word-radar");
    expect(radar).toHaveClass("active");

    const reading = screen.getByRole("link", { name: /Đọc — tổng quan/ });
    expect(reading).not.toHaveClass("active");
  });

  it("labels the practice nav item 'Ôn tập', not 'Luyện tập'", () => {
    vi.mocked(usePathname).mockReturnValue("/vocab-bank");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Ôn tập/ })).toHaveAttribute("href", "/practice");
    expect(screen.queryByText(/Luyện tập/)).not.toBeInTheDocument();
  });

  it("renders the Hội thoại tiếng Anh link and marks it active on /conversation/abc", () => {
    vi.mocked(usePathname).mockReturnValue("/conversation/abc");
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: /Hội thoại tiếng Anh/ });
    expect(link).toHaveAttribute("href", "/conversation");
    expect(link).toHaveClass("active");
  });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LevelPicker } from "./LevelPicker";

const SCALE = ["A2", "B1", "B2", "C1"] as const;

describe("LevelPicker", () => {
  it("shows Tất cả and Tối đa chips and marks the active one", () => {
    render(<LevelPicker scale={SCALE} level="B1" mode="max" onChange={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Trình độ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tối đa B1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports picks", () => {
    const onChange = vi.fn();
    render(<LevelPicker scale={SCALE} level="B1" mode="max" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Tối đa C1" }));
    expect(onChange).toHaveBeenLastCalledWith({ level: "C1", mode: "max" });
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(onChange).toHaveBeenLastCalledWith({ level: "B1", mode: "all" });
  });

  it("marks Tất cả when mode is all", () => {
    render(<LevelPicker scale={SCALE} level="B1" mode="all" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tối đa B1" })).toHaveAttribute("aria-pressed", "false");
  });
});

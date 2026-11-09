import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemorySwitch } from "./MemorySwitch";

describe("MemorySwitch", () => {
  it("shows the label and hint and reports changes", () => {
    const onChange = vi.fn();
    render(<MemorySwitch checked onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: /Dùng trí nhớ/ });
    expect(box).toBeChecked();
    expect(screen.getByText("AI dựa vào những gì đã học trước đó. Tắt vẫn ghi nhớ sau buổi.")).toBeInTheDocument();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("can be disabled", () => {
    render(<MemorySwitch checked={false} onChange={vi.fn()} disabled />);
    expect(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ })).toBeDisabled();
  });
});

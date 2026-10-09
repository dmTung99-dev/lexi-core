import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhraseSaveList } from "./PhraseSaveList";

const PHRASES = [
  { text: "I would like", meaning: "tôi muốn", example: "I would like some water." },
  { text: "freshly caught", meaning: "mới đánh bắt", example: "We ate freshly caught fish." },
];

describe("PhraseSaveList", () => {
  it("saves an unsaved phrase and shows saved ones as disabled", () => {
    const onSave = vi.fn();
    render(<PhraseSaveList phrases={PHRASES} saved={new Set(["freshly caught"])} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /I would like/ }));
    expect(onSave).toHaveBeenCalledWith(PHRASES[0]);
    expect(screen.getByRole("button", { name: /freshly caught ✓ đã lưu/ })).toBeDisabled();
  });
  it("renders nothing for an empty list", () => {
    const { container } = render(<PhraseSaveList phrases={[]} saved={new Set()} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

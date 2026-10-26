import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useScrollToEnd } from "./useScrollToEnd";

function Harness({ n, other }: { n: number; other?: string }) {
  const endRef = useScrollToEnd([n]);
  return (
    <div>
      <span>{other}</span>
      <div ref={endRef} data-testid="end" aria-hidden="true" />
    </div>
  );
}

describe("useScrollToEnd", () => {
  const scrollIntoView = vi.fn();
  const original = Element.prototype.scrollIntoView;

  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  it("scrolls instantly to the end on mount", () => {
    render(<Harness n={1} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
  });

  it("scrolls smoothly when a dependency changes", () => {
    const { rerender } = render(<Harness n={1} />);
    scrollIntoView.mockClear();
    rerender(<Harness n={2} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("does not scroll when the dependencies are unchanged", () => {
    const { rerender } = render(<Harness n={1} other="a" />);
    scrollIntoView.mockClear();
    rerender(<Harness n={1} other="b" />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("tolerates environments without scrollIntoView", () => {
    // @ts-expect-error simulate jsdom
    Element.prototype.scrollIntoView = undefined;
    expect(() => render(<Harness n={1} />)).not.toThrow();
  });
});

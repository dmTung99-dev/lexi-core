import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { renderHook, fireEvent, act } from "@testing-library/react";
import { useTextSelectionSpeak } from "./useTextSelectionSpeak";

function setup(text: string) {
  const container = document.createElement("p");
  const textNode = document.createTextNode(text);
  container.appendChild(textNode);
  document.body.appendChild(container);
  const ref = createRef<HTMLParagraphElement>();
  (ref as { current: HTMLParagraphElement | null }).current = container;
  return { container, textNode, ref };
}

function selectText(node: Text, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("useTextSelectionSpeak", () => {
  it("returns null before any selection is made", () => {
    const { ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));
    expect(result.current).toBeNull();
  });

  it("returns the selected text after a selection inside the container", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5); // "Hello"
    fireEvent.mouseUp(document);

    expect(result.current?.text).toBe("Hello");
  });

  it("returns null for a selection outside the container", () => {
    const { ref } = setup("Hello world");
    const outside = document.createElement("p");
    const outsideText = document.createTextNode("Somewhere else");
    outside.appendChild(outsideText);
    document.body.appendChild(outside);

    const { result } = renderHook(() => useTextSelectionSpeak(ref));
    selectText(outsideText, 0, 9);
    fireEvent.mouseUp(document);

    expect(result.current).toBeNull();
  });

  it("clears the selection once it collapses (e.g. a plain click elsewhere)", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5);
    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    window.getSelection()!.removeAllRanges();
    fireEvent.mouseUp(document);

    expect(result.current).toBeNull();
  });

  it("picks up a selection via selectionchange alone, without a mouseup", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5); // "Hello"
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(result.current?.text).toBe("Hello");
  });

  it("clears the selection when the page scrolls", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5);
    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    fireEvent.scroll(document);

    expect(result.current).toBeNull();
  });

  // Regression test: dragging a selection near a scrollable edge makes the
  // browser auto-scroll to keep extending it, firing a real `scroll` event
  // mid-drag — while the mouse button is still down, before mouseup. That
  // scroll must not kill an in-progress selection; only a scroll that
  // happens once the user is done selecting (no button held) should.
  it("does not clear the selection when a scroll fires mid-drag (mousedown still held)", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    fireEvent.mouseDown(document);
    selectText(textNode, 0, 5); // "Hello"
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current?.text).toBe("Hello");

    // Simulates the browser's own auto-scroll while the drag continues.
    fireEvent.scroll(document);
    expect(result.current?.text).toBe("Hello");

    // The drag keeps extending the selection after the auto-scroll.
    selectText(textNode, 0, 11); // "Hello world"
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current?.text).toBe("Hello world");

    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello world");

    // Once the drag is over, a later scroll dismisses normally.
    fireEvent.scroll(document);
    expect(result.current).toBeNull();
  });
});

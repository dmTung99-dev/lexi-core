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

  // Regression test: a scroll used to unconditionally clear the selection
  // (matching a too-literal reading of "disappears on... scroll"), which had
  // two real bugs: dragging a selection near a scrollable edge makes the
  // browser auto-scroll to keep extending it, firing a real `scroll` event
  // while the mouse is still down — the button would vanish mid-drag, out
  // from under a selection the user was still actively making; and scrolling
  // after finishing a selection left no way to bring the button back short of
  // reselecting. Scroll must instead *recompute* from the live selection —
  // safe unconditionally, since a Range's rect always reflects its current,
  // possibly-scrolled position.
  it("recomputes (not clears) the selection on scroll, live selection permitting", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    // Selection still in progress (mouse held down) when an auto-scroll fires.
    selectText(textNode, 0, 5); // "Hello"
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current?.text).toBe("Hello");

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

    // A scroll once the selection is finished still just recomputes — stays
    // visible rather than disappearing.
    fireEvent.scroll(document);
    expect(result.current?.text).toBe("Hello world");
  });

  it("scrolling after the selection has already collapsed correctly reports null", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5);
    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    window.getSelection()!.removeAllRanges();
    fireEvent.scroll(document);

    expect(result.current).toBeNull();
  });

  // Regression test: for a selection spanning more than one line,
  // Range.getBoundingClientRect() returns the union of every line's rect —
  // its `right` edge tracks whichever line is widest, not where the
  // selection (and the user's cursor) actually ends. That made the speak
  // button drift away from the cursor and eventually render off-screen as
  // a multi-line selection grew. The hook must anchor to the *last*
  // client rect (the line the selection ends on) instead.
  it("anchors the rect to the selection's last line, not the union bounding box", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const firstLineRect = new DOMRect(0, 0, 400, 20); // a wide first line
    const lastLineRect = new DOMRect(0, 20, 80, 20); // a narrower second line
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [firstLineRect, lastLineRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 11); // "Hello world"
      fireEvent.mouseUp(document);

      expect(result.current?.rect).toBe(lastLineRect);
      expect(result.current?.rect).not.toBe(firstLineRect);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  // Regression test: when a selection ends right where a line wraps, the
  // browser can report a trailing zero-width client rect for the collapsed
  // whitespace — positioned at the *start of the next line*, not the actual
  // end of the selected text. Anchoring to that (rather than the last
  // *visible* rect) drags the button one line below where it belongs, and
  // enough of these in a row can push it off-screen entirely.
  it("skips a trailing zero-width rect (line-wrap whitespace artifact) when anchoring", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const realLastLineRect = new DOMRect(0, 20, 80, 20);
    const wrapArtifactRect = new DOMRect(0, 40, 0, 20); // zero width — not real content
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [realLastLineRect, wrapArtifactRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 11); // "Hello world"
      fireEvent.mouseUp(document);

      expect(result.current?.rect).toBe(realLastLineRect);
      expect(result.current?.rect).not.toBe(wrapArtifactRect);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });
});

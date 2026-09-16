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

  // Regression test: a scroll used to unconditionally clear the selection,
  // which had two real bugs: dragging a selection near a scrollable edge
  // makes the browser auto-scroll to keep extending it, firing a real
  // `scroll` event while the mouse is still down — the button would vanish
  // mid-drag; and scrolling after finishing a selection left no way to
  // bring the button back short of reselecting. Scroll must instead
  // *recompute* from the live selection.
  it("recomputes (not clears) the selection on scroll, live selection permitting", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5); // "Hello", still mid-drag
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current?.text).toBe("Hello");

    fireEvent.scroll(document);
    expect(result.current?.text).toBe("Hello");

    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    // A scroll once the selection is finished still just recomputes — stays
    // visible rather than disappearing.
    fireEvent.scroll(document);
    expect(result.current?.text).toBe("Hello");
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

  // The core fix: on mouseup near the passage, the reported rect is the
  // actual mouse pointer position at that moment — not anything derived
  // from Range geometry, which turned out to have several real,
  // hard-to-predict quirks (union bounding boxes for multi-line
  // selections, zero-width trailing rects at line wraps). The pointer is
  // unambiguous for a release that's actually part of the selection drag.
  it("anchors to the actual mouse position on mouseup, when it's near the container", () => {
    const { textNode, ref, container } = setup("Hello world");
    container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 50);
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    // A deliberately "wrong" Range rect, to prove it's ignored once a real
    // pointer position is available.
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [new DOMRect(9999, 9999, 10, 10)] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 5); // "Hello"
      fireEvent.mouseUp(document, { clientX: 60, clientY: 20 }); // inside the container

      expect(result.current?.rect.left).toBe(60);
      expect(result.current?.rect.top).toBe(20);
      expect(result.current?.rect.right).toBe(60);
      expect(result.current?.rect.bottom).toBe(20);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  // Regression test: mouseup fires for *any* mouse release, not just ones
  // that adjust the selection — e.g. right-clicking to open the browser's
  // own DevTools while a selection is still active also fires one, at
  // wherever that click happened. Trusting that pointer position
  // unconditionally put the speak button far from the actual selection
  // (this exact scenario, reported live: a stray mouseup at x≈1130 on a
  // ~540px-wide passage card). A pointer far from the passage must fall
  // back to Range geometry instead of being trusted outright.
  it("falls back to Range geometry when mouseup happens far from the container (e.g. an unrelated click elsewhere)", () => {
    const { textNode, ref, container } = setup("Hello world");
    container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 50);
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const rangeRect = new DOMRect(10, 5, 40, 15);
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [rangeRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 5); // "Hello"
      fireEvent.mouseUp(document, { clientX: 1130, clientY: 211 }); // far outside the container

      expect(result.current?.text).toBe("Hello");
      expect(result.current?.rect).toBe(rangeRect);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  // selectionchange (fired without an originating mouse event — e.g. while
  // a drag is still in progress, before mouseup) has no pointer position
  // available, so it falls back to Range geometry: the last *visible*
  // client rect, skipping a trailing zero-width artifact (the browser can
  // report one for a line's collapsed trailing whitespace at a wrap point,
  // positioned at the start of the *next* line rather than the real end of
  // the selection).
  it("falls back to the last visible Range rect for selectionchange (no pointer available)", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const realRect = new DOMRect(0, 20, 80, 20);
    const wrapArtifactRect = new DOMRect(0, 40, 0, 20); // zero width — not real content
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [realRect, wrapArtifactRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 11); // "Hello world"
      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });

      expect(result.current?.rect).toBe(realRect);
      expect(result.current?.rect).not.toBe(wrapArtifactRect);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });
});

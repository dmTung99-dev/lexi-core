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

  // Regression test: browsers can fire one more `selectionchange` right
  // around `mouseup` for the very same gesture (the selection "settling"),
  // with no guaranteed ordering relative to mouseup itself. Letting that
  // freely recompute via Range geometry clobbered the mouseup's precise,
  // pointer-based position with a less precise one — reported live as
  // "released the mouse on 'old', but the icon showed up near 'system'".
  it("does not let a trailing selectionchange for the same gesture override the mouseup's precise position", () => {
    const { textNode, ref, container } = setup("Hello world");
    container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 50);
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    // Stands in for the Range-geometry quirks that produced a wrong
    // position in practice — if this were used, the test below would fail.
    const wrongRect = new DOMRect(150, 10, 10, 10);
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [wrongRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 5); // "Hello"
      fireEvent.mouseUp(document, { clientX: 60, clientY: 20 }); // inside the container
      expect(result.current?.rect.left).toBe(60);

      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });

      expect(result.current?.text).toBe("Hello");
      expect(result.current?.rect.left).toBe(60); // still the mouseup position, not wrongRect's 150
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  // Regression test: some browsers silently extend a selection released
  // mid-word out to the nearest whole word right after mouseup — reported
  // live as "released the mouse in the middle of 'off', the button showed
  // up several words further along the line". The settling
  // selectionchange's text ("Hello world", extended) differs from what
  // mouseup saw ("Hello wor", mid-word) — the exact-text-match guard alone
  // doesn't catch this, since the texts genuinely differ.
  it("keeps the mouseup's precise position when the very next selectionchange reports different (e.g. word-extended) text", () => {
    const { textNode, ref, container } = setup("Hello world");
    container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 50);
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const wrongRect = new DOMRect(150, 10, 10, 10);
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [wrongRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 9); // "Hello wor" — released mid-word
      fireEvent.mouseUp(document, { clientX: 60, clientY: 20 }); // inside the container
      expect(result.current?.text).toBe("Hello wor");
      expect(result.current?.rect.left).toBe(60);

      // The browser settles the selection out to the full word right after.
      selectText(textNode, 0, 11); // "Hello world"
      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });

      expect(result.current?.text).toBe("Hello world"); // text updates to the settled selection
      expect(result.current?.rect.left).toBe(60); // but position stays the precise mouseup one
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  it("only protects the one selectionchange right after mouseup — a later, genuinely new selection recomputes normally", () => {
    const { textNode, ref, container } = setup("Hello world");
    container.getBoundingClientRect = () => new DOMRect(0, 0, 200, 50);
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    const newRect = new DOMRect(30, 40, 10, 10);
    const originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [newRect] as unknown as DOMRectList;
    };

    try {
      selectText(textNode, 0, 5); // "Hello"
      fireEvent.mouseUp(document, { clientX: 60, clientY: 20 });
      expect(result.current?.rect.left).toBe(60);

      // First settling event — consumes the one-shot guard.
      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });
      expect(result.current?.rect.left).toBe(60);

      // A later, genuinely different selection (e.g. keyboard-extended) —
      // no longer protected, recomputes via Range geometry as normal.
      selectText(textNode, 0, 11); // "Hello world"
      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });

      expect(result.current?.text).toBe("Hello world");
      expect(result.current?.rect).toBe(newRect);
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
    }
  });

  // Dragging a selection near a scrollable edge makes the browser
  // auto-scroll to keep extending it, firing a real `scroll` event while
  // the mouse is still down (no mouseup yet for the current text) —
  // recompute rather than dismiss, so that auto-scroll doesn't hide the
  // button out from under a selection the user is still actively making.
  it("recomputes (does not dismiss) the selection on scroll while still mid-drag", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5); // "Hello", still mid-drag
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
  });

  // Once mouseup has already anchored a precise, fixed-viewport position,
  // a later scroll makes that point stale relative to the now-scrolled
  // page — dismiss rather than show a now-wrong position.
  it("dismisses on scroll once the gesture is finished and precisely anchored", () => {
    const { textNode, ref } = setup("Hello world");
    const { result } = renderHook(() => useTextSelectionSpeak(ref));

    selectText(textNode, 0, 5);
    fireEvent.mouseUp(document);
    expect(result.current?.text).toBe("Hello");

    fireEvent.scroll(document);
    expect(result.current).toBeNull();
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

  // Regression test: for a selection spanning more than one line,
  // Range.getBoundingClientRect() returns the union of every line's rect —
  // its `right` edge tracks whichever line is widest, not where the
  // selection actually ends. getClientRects()'s last entry is the line the
  // selection actually ends on, and a trailing zero-width rect (the
  // browser can report one for a line's collapsed trailing whitespace at a
  // wrap point) is skipped in favor of the last *visible* one.
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

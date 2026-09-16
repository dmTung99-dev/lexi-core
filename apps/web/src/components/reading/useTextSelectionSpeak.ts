import { useEffect, useRef, useState, type RefObject } from "react";

export interface TextSelectionSpeak {
  text: string;
  rect: DOMRect;
}

/**
 * Tracks the current browser text selection, reporting it only while it's
 * both non-empty and fully inside `containerRef`'s element. A plain click
 * anywhere (which collapses any prior selection — the browser's own default
 * behavior) naturally clears the result on the next mouseup, so no separate
 * "dismiss on click elsewhere" handling is needed. `selectionchange` is also
 * tracked so a selection made without a mouse (e.g. keyboard/shift-arrow, or
 * extending an existing selection) still surfaces the button. Scrolling
 * dismisses the button outright rather than recomputing its position, since
 * the underlying selection's on-screen rect would otherwise go stale — but
 * only once the drag is over: dragging a selection near a scrollable edge
 * makes the browser auto-scroll to keep extending it, firing a real `scroll`
 * event while the mouse is still down, and dismissing then would hide the
 * button out from under a selection the user is still actively making.
 *
 * The reported rect is anchored to the selection's actual end point, not
 * `Range.getBoundingClientRect()` — for a selection spanning more than one
 * line, that method returns the union of every line's rect, so its `right`
 * edge tracks whichever line is widest rather than where the selection
 * (and the user's cursor) currently ends. `getClientRects()` returns one
 * rect per line/fragment in the range; its last entry is the line the
 * selection actually ends on.
 */
export function useTextSelectionSpeak<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): TextSelectionSpeak | null {
  const [selection, setSelection] = useState<TextSelectionSpeak | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    function handleSelectionUpdate() {
      const container = containerRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const clientRects = range.getClientRects();
      const rect =
        clientRects.length > 0
          ? clientRects[clientRects.length - 1]
          : range.getBoundingClientRect();
      setSelection({ text, rect });
    }

    function handleMouseDown() {
      isDraggingRef.current = true;
    }

    function handleMouseUp() {
      isDraggingRef.current = false;
      handleSelectionUpdate();
    }

    function handleScroll() {
      if (isDraggingRef.current) return;
      setSelection(null);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionUpdate);
    document.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionUpdate);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [containerRef]);

  return selection;
}

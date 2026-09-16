import { useEffect, useState, type RefObject } from "react";

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
 * the underlying selection's on-screen rect would otherwise go stale.
 */
export function useTextSelectionSpeak<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): TextSelectionSpeak | null {
  const [selection, setSelection] = useState<TextSelectionSpeak | null>(null);

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
      setSelection(text ? { text, rect: range.getBoundingClientRect() } : null);
    }

    function handleScroll() {
      setSelection(null);
    }

    document.addEventListener("mouseup", handleSelectionUpdate);
    document.addEventListener("selectionchange", handleSelectionUpdate);
    document.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mouseup", handleSelectionUpdate);
      document.removeEventListener("selectionchange", handleSelectionUpdate);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [containerRef]);

  return selection;
}

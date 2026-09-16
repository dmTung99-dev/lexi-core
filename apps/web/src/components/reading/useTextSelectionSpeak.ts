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
 * extending an existing selection) still surfaces the button, and so the
 * button's position keeps up live while a drag is still in progress.
 *
 * Scrolling *recomputes* from the current live selection rather than
 * dismissing it — recomputing is always safe (a Range's rect reflects
 * wherever it is now, scrolled or not) and avoids two real bugs a
 * dismiss-on-scroll approach had: (1) dragging a selection near a
 * scrollable edge makes the browser auto-scroll to keep extending it,
 * firing a real `scroll` event while the mouse is still down — dismissing
 * then hid the button out from under a selection the user was still
 * actively making; (2) scrolling after finishing a selection would
 * otherwise leave no way to bring the button back without reselecting.
 *
 * The reported rect is anchored to the selection's actual end point, not
 * `Range.getBoundingClientRect()` — for a selection spanning more than one
 * line, that method returns the union of every line's rect, so its `right`
 * edge tracks whichever line is widest rather than where the selection
 * (and the user's cursor) currently ends. `getClientRects()` returns one
 * rect per line/fragment in the range; its last *non-empty* entry is the
 * line the selection actually ends on. A trailing zero-width/zero-height
 * entry is filtered out first — the browser can report one for the
 * collapsed trailing whitespace of a line that wraps, which visually
 * belongs to the *next* line and would otherwise drag the button one line
 * below the actual selection end.
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
      if (!text) {
        setSelection(null);
        return;
      }
      const rawRects = Array.from(range.getClientRects());
      const visibleRects = rawRects.filter((r) => r.width > 0.5 && r.height > 0.5);
      const candidates = visibleRects.length > 0 ? visibleRects : rawRects;
      const rect =
        candidates.length > 0
          ? candidates[candidates.length - 1]
          : range.getBoundingClientRect();
      setSelection({ text, rect });
    }

    document.addEventListener("mouseup", handleSelectionUpdate);
    document.addEventListener("selectionchange", handleSelectionUpdate);
    document.addEventListener("scroll", handleSelectionUpdate, { capture: true });
    return () => {
      document.removeEventListener("mouseup", handleSelectionUpdate);
      document.removeEventListener("selectionchange", handleSelectionUpdate);
      document.removeEventListener("scroll", handleSelectionUpdate, { capture: true });
    };
  }, [containerRef]);

  return selection;
}

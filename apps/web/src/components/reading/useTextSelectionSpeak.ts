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
 * tracked so a selection made without a mouse (e.g. keyboard/shift-arrow)
 * still surfaces the button.
 *
 * Scrolling *recomputes* from the current live selection rather than
 * dismissing it — recomputing is always safe and avoids two real bugs a
 * dismiss-on-scroll approach had: (1) dragging a selection near a
 * scrollable edge makes the browser auto-scroll to keep extending it,
 * firing a real `scroll` event while the mouse is still down — dismissing
 * then hid the button out from under a selection the user was still
 * actively making; (2) scrolling after finishing a selection would
 * otherwise leave no way to bring the button back without reselecting.
 *
 * Positioning: on `mouseup`, the reported rect is anchored to the actual
 * mouse pointer position (`clientX`/`clientY`) at that moment, not derived
 * from `Range` geometry — `Range.getBoundingClientRect()`/`getClientRects()`
 * turned out to have several real, hard-to-predict quirks in practice
 * (union bounding boxes for multi-line selections tracking the widest line
 * rather than the actual end; zero-width trailing rects for collapsed
 * line-wrap whitespace) that made the button land far from the visible
 * selection. But `mouseup` fires globally for *any* mouse release, not just
 * ones that adjust the selection — e.g. right-clicking to open the
 * browser's DevTools while a selection is still active also fires one, at
 * wherever that click happened, nowhere near the passage. The pointer is
 * only trusted when it's within (or just past the edge of) `containerRef`'s
 * own bounding box; otherwise this falls back to the same Range-based
 * last-visible-rect approach `selectionchange`/`scroll` already use (which
 * don't carry a pointer position at all — fired without an originating
 * mouse event, or not at all for a keyboard-made selection).
 */
const POINTER_TRUST_MARGIN = 40; // px of slack past the container's own edge

export function useTextSelectionSpeak<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): TextSelectionSpeak | null {
  const [selection, setSelection] = useState<TextSelectionSpeak | null>(null);

  useEffect(() => {
    function rectFromRange(range: Range): DOMRect {
      const rawRects = Array.from(range.getClientRects());
      const visibleRects = rawRects.filter((r) => r.width > 0.5 && r.height > 0.5);
      const candidates = visibleRects.length > 0 ? visibleRects : rawRects;
      return candidates.length > 0
        ? candidates[candidates.length - 1]
        : range.getBoundingClientRect();
    }

    function handleSelectionUpdate(pointer: { x: number; y: number } | null) {
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
      const rect = pointer ? new DOMRect(pointer.x, pointer.y, 0, 0) : rectFromRange(range);
      setSelection({ text, rect });
    }

    function isNearContainer(container: HTMLElement, x: number, y: number): boolean {
      const rect = container.getBoundingClientRect();
      return (
        x >= rect.left - POINTER_TRUST_MARGIN &&
        x <= rect.right + POINTER_TRUST_MARGIN &&
        y >= rect.top - POINTER_TRUST_MARGIN &&
        y <= rect.bottom + POINTER_TRUST_MARGIN
      );
    }

    function handleMouseUp(event: MouseEvent) {
      const container = containerRef.current;
      const pointer = { x: event.clientX, y: event.clientY };
      const trustPointer = container !== null && isNearContainer(container, pointer.x, pointer.y);
      handleSelectionUpdate(trustPointer ? pointer : null);
    }

    function handleSelectionChange() {
      handleSelectionUpdate(null);
    }

    function handleScroll() {
      handleSelectionUpdate(null);
    }

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [containerRef]);

  return selection;
}

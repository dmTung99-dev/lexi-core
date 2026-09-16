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
 * Positioning has two sources, deliberately not treated as equally precise:
 *
 * - On `mouseup`, the reported rect is anchored to the actual mouse pointer
 *   position (`clientX`/`clientY`) at that moment, not derived from `Range`
 *   geometry — `Range.getBoundingClientRect()`/`getClientRects()` turned out
 *   to have several real, hard-to-predict quirks in practice (union
 *   bounding boxes for multi-line selections tracking the widest line
 *   rather than the actual end; zero-width trailing rects for collapsed
 *   line-wrap whitespace). The pointer is only trusted when it's within (or
 *   just past the edge of) `containerRef`'s own bounding box — `mouseup`
 *   fires for *any* mouse release, not just ones that adjust the selection
 *   (e.g. right-clicking to open DevTools while a selection is still active
 *   also fires one, at wherever that click happened).
 * - `selectionchange`/`scroll` don't carry a pointer position at all (fired
 *   without an originating mouse event, or not at all for a keyboard-made
 *   selection), so they fall back to the Range-based last-visible-rect
 *   approach — good enough to track roughly *along* during an in-progress
 *   drag, but not trusted to override an already-precise mouseup result.
 *
 * That distinction matters because browsers can fire one more
 * `selectionchange` right around a `mouseup` for the same gesture (the
 * selection settling — some browsers also silently extend a selection
 * released mid-word out to the nearest whole word right after mouseup),
 * with no guaranteed ordering and not always the exact same text. Letting
 * it freely recompute would clobber a mouseup's precise pointer-based
 * position with a less precise Range-derived one for what is functionally
 * the same gesture. So the very next `selectionchange` after a trusted
 * mouseup is treated as that gesture settling: it updates the *text* (in
 * case it changed, e.g. word-extended) but keeps the mouseup's precise
 * *rect* rather than recomputing. Beyond that one settling event, a
 * `selectionchange`/`scroll` whose text still exactly matches the anchored
 * one is a no-op (selectionchange) or a dismiss (scroll specifically,
 * since the anchor is a fixed viewport point that scrolling has now made
 * stale, with no reliable way to reposition it without either Range
 * geometry's own quirks or tracking scroll deltas across whichever
 * ancestor happens to be the actual scroll container). A scroll that
 * happens *before* any mouseup for the current selection (still mid-drag)
 * still recomputes via Range geometry rather than dismissing — dragging a
 * selection near a scrollable edge makes the browser auto-scroll to keep
 * extending it, firing a real `scroll` event while the mouse is still
 * down, and dismissing then would hide the button out from under a
 * selection the user is still actively making.
 */
const POINTER_TRUST_MARGIN = 40; // px of slack past the container's own edge

export function useTextSelectionSpeak<T extends HTMLElement>(
  containerRef: RefObject<T | null>
): TextSelectionSpeak | null {
  const [selection, setSelection] = useState<TextSelectionSpeak | null>(null);

  useEffect(() => {
    // The most recent mouseup-anchored { text, rect } — not React state, so
    // it can be read/written freely inside these handlers without causing
    // extra renders. Cleared whenever the selection is empty/invalid, or
    // once a scroll makes it stale (see handleScroll).
    let pointerAnchor: { text: string; rect: DOMRect } | null = null;
    // True for exactly one selectionchange right after a trusted mouseup —
    // consumed (set back to false) the first time it's used. Handles the
    // browser settling the selection (e.g. extending a mid-word release
    // out to the whole word) with a *different* text than mouseup saw.
    let pendingSettle = false;

    function rectFromRange(range: Range): DOMRect {
      const rawRects = Array.from(range.getClientRects());
      const visibleRects = rawRects.filter((r) => r.width > 0.5 && r.height > 0.5);
      const candidates = visibleRects.length > 0 ? visibleRects : rawRects;
      return candidates.length > 0
        ? candidates[candidates.length - 1]
        : range.getBoundingClientRect();
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

    function currentSelectionText(): string | null {
      const container = containerRef.current;
      const sel = window.getSelection();
      if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return null;
      const text = sel.toString().trim();
      return text || null;
    }

    function handleMouseUp(event: MouseEvent) {
      const container = containerRef.current;
      const sel = window.getSelection();
      const text = currentSelectionText();
      if (!container || !sel || !text) {
        pointerAnchor = null;
        pendingSettle = false;
        setSelection(null);
        return;
      }
      const pointer = { x: event.clientX, y: event.clientY };
      if (isNearContainer(container, pointer.x, pointer.y)) {
        const result = { text, rect: new DOMRect(pointer.x, pointer.y, 0, 0) };
        pointerAnchor = result;
        pendingSettle = true;
        setSelection(result);
        return;
      }
      // A mouseup that isn't actually adjusting this selection (e.g. a
      // stray click elsewhere) — recompute from Range geometry instead of
      // trusting an unrelated pointer position.
      pointerAnchor = null;
      pendingSettle = false;
      setSelection({ text, rect: rectFromRange(sel.getRangeAt(0)) });
    }

    function handleSelectionChange() {
      const sel = window.getSelection();
      const text = currentSelectionText();
      if (!text || !sel) {
        pointerAnchor = null;
        pendingSettle = false;
        setSelection(null);
        return;
      }
      if (pendingSettle && pointerAnchor) {
        // The browser settling this exact gesture right after mouseup
        // (e.g. extending a mid-word release to the whole word) — the
        // text may differ from what mouseup saw, but the precise pointer
        // position is still the right one to keep.
        pendingSettle = false;
        const result = { text, rect: pointerAnchor.rect };
        pointerAnchor = result;
        setSelection(result);
        return;
      }
      // Same selection a trusted mouseup already anchored precisely — a
      // further trailing selectionchange for that same gesture must not
      // clobber it.
      if (pointerAnchor && pointerAnchor.text === text) {
        setSelection(pointerAnchor);
        return;
      }
      setSelection({ text, rect: rectFromRange(sel.getRangeAt(0)) });
    }

    function handleScroll() {
      const sel = window.getSelection();
      const text = currentSelectionText();
      if (!text || !sel) {
        pointerAnchor = null;
        pendingSettle = false;
        setSelection(null);
        return;
      }
      if (pointerAnchor && pointerAnchor.text === text) {
        // The gesture already finished and got a precise position — that
        // fixed-viewport point is now stale relative to the scrolled page.
        pointerAnchor = null;
        pendingSettle = false;
        setSelection(null);
        return;
      }
      // Still mid-drag (no matching mouseup yet) — recompute rather than
      // dismiss, so an auto-scroll while extending the selection doesn't
      // hide the button out from under it.
      setSelection({ text, rect: rectFromRange(sel.getRangeAt(0)) });
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

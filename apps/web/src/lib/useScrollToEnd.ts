import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Keeps the newest content of a scrolling thread in view. Put the returned ref
 * on an empty `<div aria-hidden="true" />` that is the LAST child of the thread;
 * whenever `deps` change it is scrolled into view (instantly on mount, smoothly
 * afterwards). `block: "nearest"` scrolls only the inner scroller and leaves the
 * document scroll alone. Pass only the values that mean "new content arrived" so unrelated
 * re-renders (translation toggles, hint expansion) do not move the scroll.
 */
export function useScrollToEnd(deps: ReadonlyArray<unknown>): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // jsdom has no scrollIntoView, hence the optional call.
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: firstRun.current ? "auto" : "smooth" });
    firstRun.current = false;
    // deps are supplied (and kept stable in length) by the caller
  }, deps);

  return ref;
}

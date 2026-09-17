// Mirrors functions/src/synthesizeSpeech.ts's 500-character server-side limit
// — a too-long selection still shows the speak button (so it doesn't just
// vanish with no explanation), but disabled with a tooltip, instead of
// letting the user click it into a guaranteed, unexplained ⚠️.
export const MAX_SELECTION_SPEAK_LENGTH = 500;

// The "cỡ chữ" (font size) setting applies CSS `zoom` to the whole app
// (`.app-frame.fs-small`/`.app-frame.fs-large`, bloom.css) — non-standard
// `zoom`, unlike `transform`, re-scales the effective CSS pixel unit for
// its entire subtree, including `position: fixed` descendants. Any raw
// `top`/`left` px value set on an element inside a zoomed ancestor gets
// re-multiplied by that ambient zoom when the browser actually paints it,
// so a naive true-viewport-pixel position (from mouse coordinates / Range
// geometry, both always reported in true, unzoomed pixels) lands
// increasingly far from the real cursor the larger that raw value is —
// exactly the "the more I select, the further off it drifts" symptom
// reported live. `getBoundingClientRect().width / offsetWidth` gives the
// cumulative ambient zoom factor directly, independent of how many nested
// zoomed ancestors produced it, so SelectionSpeakButton can divide its
// computed position by it to cancel the browser's own re-multiplication.
export function ambientZoomFactor(el: HTMLElement): number {
  const trueWidth = el.getBoundingClientRect().width;
  const layoutWidth = el.offsetWidth;
  return trueWidth > 0 && layoutWidth > 0 ? trueWidth / layoutWidth : 1;
}

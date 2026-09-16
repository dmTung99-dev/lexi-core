import "@testing-library/jest-dom/vitest";

// Mock Range.getBoundingClientRect for jsdom
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    const rect = this.commonAncestorContainer.parentElement?.getBoundingClientRect();
    return rect || new DOMRect(0, 0, 0, 0);
  };
}

// Mock Range.getClientRects for jsdom — jsdom has no real layout engine, so
// (like getBoundingClientRect above) this can only return a single
// approximate rect, not one-per-line. Individual tests override this on
// Range.prototype when they need to simulate a multi-line selection.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    const list = [this.getBoundingClientRect()] as unknown as DOMRectList;
    return list;
  };
}

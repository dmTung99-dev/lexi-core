import "@testing-library/jest-dom/vitest";

// Mock Range.getBoundingClientRect for jsdom
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    const rect = this.commonAncestorContainer.parentElement?.getBoundingClientRect();
    return rect || new DOMRect(0, 0, 0, 0);
  };
}

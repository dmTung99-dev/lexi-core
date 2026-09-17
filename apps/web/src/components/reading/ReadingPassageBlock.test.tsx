import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingPassageBlock } from "./ReadingPassageBlock";

describe("ReadingPassageBlock", () => {
  it("renders each formatted line as its own paragraph", () => {
    render(<ReadingPassageBlock text={"First line.\n\nSecond line."} />);
    expect(screen.getByText("First line.")).toBeInTheDocument();
    expect(screen.getByText("Second line.")).toBeInTheDocument();
  });

  it("strips markdown-style formatting via formatPassageLines", () => {
    render(<ReadingPassageBlock text="**Bold** heading" />);
    expect(screen.getByText("Bold heading")).toBeInTheDocument();
  });
});

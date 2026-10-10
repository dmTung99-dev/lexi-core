import { describe, expect, it } from "vitest";
import RootLayout, { metadata, viewport } from "./layout";

describe("RootLayout", () => {
  it("renders html/body wrapping the given children without throwing on the bloom.css import", () => {
    const element = RootLayout({ children: <p>child</p> });
    expect(element.type).toBe("html");
    expect(element.props.lang).toBe("vi");
    expect(element.props.children.type).toBe("body");
    expect(element.props.children.props.children).toEqual(<p>child</p>);
  });

  it("sets the app metadata", () => {
    expect(metadata.title).toBe("LexiCore");
    expect(metadata.description).toBe("Personal Vietnamese-first language-learning app");
  });

  it("exports a mobile viewport that covers the notch area", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
    expect(viewport.viewportFit).toBe("cover");
  });

  it("declares a web-app-capable iOS Home Screen launch", () => {
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "LexiCore" });
  });
});

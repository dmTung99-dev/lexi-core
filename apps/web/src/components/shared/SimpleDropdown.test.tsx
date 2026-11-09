import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimpleDropdown } from "./SimpleDropdown";

const OPTIONS = [
  { value: "", label: "Mọi trình độ" },
  { value: "a1", label: "Tối đa A1" },
  { value: "b1", label: "Tối đa B1" },
];

describe("SimpleDropdown", () => {
  it("shows the trigger closed by default", () => {
    render(
      <SimpleDropdown
        triggerLabel="Mọi trình độ"
        ariaLabel="Chọn trình độ"
        options={OPTIONS}
        value=""
        onChange={vi.fn()}
        active={false}
      />
    );
    expect(screen.getByRole("button", { name: "Mọi trình độ ▾" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click, lists every option, and marks the current value selected", () => {
    render(
      <SimpleDropdown
        triggerLabel="Tối đa A1"
        ariaLabel="Chọn trình độ"
        options={OPTIONS}
        value="a1"
        onChange={vi.fn()}
        active
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Tối đa A1 ▾" }));

    expect(screen.getByRole("listbox", { name: "Chọn trình độ" })).toBeInTheDocument();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Tối đa A1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Mọi trình độ" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange and closes the panel when an option is clicked", () => {
    const onChange = vi.fn();
    render(
      <SimpleDropdown
        triggerLabel="Mọi trình độ"
        ariaLabel="Chọn trình độ"
        options={OPTIONS}
        value=""
        onChange={onChange}
        active={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mọi trình độ ▾" }));
    fireEvent.click(screen.getByRole("option", { name: "Tối đa B1" }));

    expect(onChange).toHaveBeenCalledWith("b1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("highlights the trigger chip when active", () => {
    render(
      <SimpleDropdown
        triggerLabel="Tối đa A1"
        ariaLabel="Chọn trình độ"
        options={OPTIONS}
        value="a1"
        onChange={vi.fn()}
        active
      />
    );
    expect(screen.getByRole("button", { name: "Tối đa A1 ▾" })).toHaveClass("active");
  });
});

function mockMainBox(clientWidth: number, clientLeft = 0) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("main") ? clientWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientLeft", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("main") ? clientLeft : 0;
  });
}

function rect(left: number, right: number): DOMRect {
  return { left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe("SimpleDropdown placement", () => {
  afterEach(() => vi.restoreAllMocks());

  it("right-aligns the popover when there is not enough room on the right", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 1000) : rect(800, 900);
    });
    mockMainBox(985);
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).toHaveClass("align-end");
  });

  it("keeps left alignment when there is room", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 1000) : rect(100, 200);
    });
    mockMainBox(985);
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).not.toHaveClass("align-end");
  });

  it("ignores the container's vertical scrollbar when measuring the right edge", () => {
    // Trigger left 680 + 320 = 1000: fits against the 1000px border box, but not against the 985px client box.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 1000) : rect(680, 780);
    });
    mockMainBox(985);
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).toHaveClass("align-end");
  });

  it("keeps left alignment when right alignment would overflow on the left too", () => {
    // Container is only 300px wide: neither side fits the 320px popover, so stay left-aligned.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("main") ? rect(0, 300) : rect(200, 280);
    });
    mockMainBox(300);
    render(
      <div className="main">
        <SimpleDropdown triggerLabel="Tất cả" ariaLabel="Trình độ" options={OPTIONS} value="" onChange={vi.fn()} active={false} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Tất cả ▾" }));
    expect(screen.getByRole("listbox", { name: "Trình độ" })).not.toHaveClass("align-end");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatThread } from "./ChatThread";
import type { ConversationMessage } from "@/lib/conversationTypes";
import { clearRecordings, saveRecordings } from "@/lib/recordedAudioStore";

function renderThread(messages: ConversationMessage[], patch: Partial<Parameters<typeof ChatThread>[0]> = {}) {
  const h = { onReplay: vi.fn(), onTranslate: vi.fn(), onHint: vi.fn() };
  render(
    <ChatThread
      messages={messages}
      thinking={false}
      hintLoadingIndex={null}
      translations={{}}
      translatingIndex={null}
      canReplay
      {...h}
      {...patch}
    />
  );
  return h;
}

const BASE: ConversationMessage[] = [
  { role: "ai", text: "Where did you go?" },
  { role: "user", text: "I go to Da Nang" },
];

describe("ChatThread", () => {
  it("renders both roles and wires AI actions by message index", () => {
    const h = renderThread(BASE);
    fireEvent.click(screen.getByRole("button", { name: "Nghe lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Dịch sang tiếng Việt" }));
    expect(h.onReplay).toHaveBeenCalledWith(0);
    expect(h.onTranslate).toHaveBeenCalledWith(0);
    expect(screen.getByText("I go to Da Nang")).toBeInTheDocument();
  });

  it("shows 'Gợi ý sửa' for a user message without a hint and calls onHint", () => {
    const h = renderThread(BASE);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý sửa" }));
    expect(h.onHint).toHaveBeenCalledWith(1);
  });

  it("shows the cached hint (diff + note) instead of the button", () => {
    renderThread([BASE[0], { ...BASE[1], hint: { corrected: "I went to Da Nang", note: "Dùng quá khứ.", alternatives: ["I travelled to Da Nang"] } }]);
    expect(screen.queryByRole("button", { name: "Gợi ý sửa" })).not.toBeInTheDocument();
    expect(screen.getByText("went")).toBeInTheDocument();
    expect(screen.getByText("Dùng quá khứ.")).toBeInTheDocument();
    expect(screen.getByText("I travelled to Da Nang")).toBeInTheDocument();
  });

  it("shows a translation when present and the thinking indicator", () => {
    renderThread(BASE, { translations: { 0: "Bạn đã đi đâu?" }, thinking: true });
    expect(screen.getByText("Bạn đã đi đâu?")).toBeInTheDocument();
    expect(screen.getByText("AI đang soạn câu trả lời…")).toBeInTheDocument();
  });

  it("disables replay when canReplay is false", () => {
    renderThread(BASE, { canReplay: false });
    expect(screen.getByRole("button", { name: "Nghe lại" })).toBeDisabled();
  });

  it("shows 'Nghe lại giọng tôi' only on user messages that have a recording", () => {
    saveRecordings("conversation:s1:1", [new Blob(["a"])]);
    try {
      renderThread([...BASE, { role: "user", text: "Typed only" }], { recordingKeyFor: (i) => `conversation:s1:${i}` });
      expect(screen.getAllByRole("button", { name: "Nghe lại giọng tôi" })).toHaveLength(1);
    } finally {
      clearRecordings("");
    }
  });

  it("keeps the recording button next to an existing hint", () => {
    saveRecordings("conversation:s1:1", [new Blob(["a"])]);
    try {
      renderThread(
        [BASE[0], { role: "user", text: "I go to Da Nang", hint: { corrected: "I went to Da Nang", note: "Quá khứ.", alternatives: [] } }],
        { recordingKeyFor: (i) => `conversation:s1:${i}` }
      );
      expect(screen.getByRole("button", { name: "Nghe lại giọng tôi" })).toBeInTheDocument();
    } finally {
      clearRecordings("");
    }
  });

  it("renders no recording button without recordingKeyFor", () => {
    saveRecordings("conversation:s1:1", [new Blob(["a"])]);
    try {
      renderThread(BASE);
      expect(screen.queryByRole("button", { name: "Nghe lại giọng tôi" })).not.toBeInTheDocument();
    } finally {
      clearRecordings("");
    }
  });
});

describe("ChatThread auto-scroll", () => {
  const original = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  const props = {
    hintLoadingIndex: null,
    translations: {},
    translatingIndex: null,
    canReplay: true,
    onReplay: vi.fn(),
    onTranslate: vi.fn(),
    onHint: vi.fn(),
  };

  it("renders an aria-hidden sentinel as the last child and scrolls when a message is appended", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(<ChatThread {...props} messages={BASE.slice(0, 1)} thinking={false} />);
    const thread = container.querySelector(".cv-thread") as HTMLElement;
    const last = thread.lastElementChild as HTMLElement;
    expect(last.getAttribute("aria-hidden")).toBe("true");
    expect(last.textContent).toBe("");
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={BASE} thinking={false} />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(thread.lastElementChild);
  });

  it("scrolls when the thinking indicator appears, but not on an unrelated re-render", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(<ChatThread {...props} messages={BASE} thinking={false} />);
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={BASE} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<ChatThread {...props} messages={BASE} thinking />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((container.querySelector(".cv-thread") as HTMLElement).lastElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not scroll when an older message gets a translation or hint", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const msgs: ConversationMessage[] = [...BASE, { role: "ai", text: "Nice!" }];
    const { rerender } = render(<ChatThread {...props} messages={msgs} thinking={false} />);
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={msgs} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    const hinted = [msgs[0], { ...msgs[1], hint: { corrected: "I went", note: "n", alternatives: [] } }, msgs[2]];
    rerender(<ChatThread {...props} messages={hinted} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls when the last message gets a translation or a hint", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<ChatThread {...props} messages={BASE.slice(0, 1)} thinking={false} />);
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={BASE.slice(0, 1)} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    scrollIntoView.mockClear();
    const hinted = [BASE[0], { ...BASE[1], hint: { corrected: "I went", note: "n", alternatives: [] } }];
    rerender(<ChatThread {...props} messages={BASE} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={hinted} thinking={false} translations={{ 0: "Bạn đã đi đâu?" }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("renders the footer inside the thread before the sentinel, and scrolls when it appears", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container, rerender } = render(<ChatThread {...props} messages={BASE} thinking={false} />);
    scrollIntoView.mockClear();
    rerender(<ChatThread {...props} messages={BASE} thinking={false} footer={<div role="status">Kết thúc?</div>} />);
    const thread = container.querySelector(".cv-thread") as HTMLElement;
    const footer = screen.getByRole("status", { name: "" });
    expect(thread.contains(footer)).toBe(true);
    const kids = Array.from(thread.children);
    expect(kids.indexOf(footer)).toBe(kids.length - 2);
    expect(kids.at(-1)?.getAttribute("aria-hidden")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

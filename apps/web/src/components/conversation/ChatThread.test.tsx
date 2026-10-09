import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatThread } from "./ChatThread";
import type { ConversationMessage } from "@/lib/conversationTypes";

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
});

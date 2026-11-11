import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationPrepKitPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { getConversationPrep } from "@/lib/conversationPreps";
import { isPhraseSaved } from "@/lib/savePhraseToVocab";
import { useState } from "react";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";

vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/conversationPreps", () => ({ getConversationPrep: vi.fn() }));
vi.mock("@/lib/savePhraseToVocab", () => ({ isPhraseSaved: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: () => ({ settings: null }) }));
// The saver itself is covered by PhraseVocabSaver.test.tsx; here it only
// records what the page asks of it.
const SAVER = vi.hoisted(() => ({ opts: null as unknown, saveOne: vi.fn() }));
vi.mock("@/components/shared/PhraseVocabSaver", () => ({
  usePhraseVocabSaver: (opts: unknown) => {
    SAVER.opts = opts;
    const [saved, setSaved] = useState<Set<string>>(new Set());
    const markSaved = useState(() => (texts: string[]) => setSaved((p) => new Set([...p, ...texts])))[0];
    return {
      saved,
      markSaved,
      saveOne: async (item: { text: string }) => {
        SAVER.saveOne(item);
        markSaved([item.text]);
      },
      modal: null,
    };
  },
  PhraseSaveBar: () => null,
}));
const AUDIO = { speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const PREP: ConversationPrep = {
  id: "p1",
  createdAt: "2026-11-03T08:00:00.000Z",
  situation: "Tôi chuẩn bị báo cáo với khách hàng",
  level: "B1",
  title: "Báo cáo trễ tiến độ",
  persona: "A client.",
  goals: ["Chào"],
  dialogue: [
    { speaker: "partner", partnerRole: "Khách hàng", en: "How is it going?", vi: "Thế nào rồi?" },
    { speaker: "you", en: "I'd like to walk you through the plan.", vi: "" },
  ],
  patterns: [
    { pattern: "I'd like to walk you through ___", meaning: "Dẫn dắt.", example: "", why: [] },
  ],
  vocab: [
    { text: "behind schedule", meaning: "chậm tiến độ", example: "" },
    { text: "a heads-up", meaning: "lời báo trước", example: "" },
  ],
};

function renderPage() {
  return render(<ConversationPrepKitPage params={Promise.resolve({ id: "p1" })} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(getConversationPrep).mockResolvedValue(PREP);
  vi.mocked(isPhraseSaved).mockImplementation(async (_uid, text) => text === "behind schedule");
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ConversationPrepKitPage", () => {
  it("renders title, level, situation, the three sections and the role-play CTA", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Báo cáo trễ tiến độ" })).toBeInTheDocument();
    expect(screen.getByText("B1")).toBeInTheDocument();
    expect(screen.getByText(/Tôi chuẩn bị báo cáo với khách hàng/)).toBeInTheDocument();
    for (const name of ["Kịch bản mẫu", "Mẫu câu hay dùng", "Từ/cụm từ mới"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Luyện nhập vai tình huống này/ })).toHaveAttribute(
      "href",
      "/conversation?prep=p1"
    );
    expect(screen.getByRole("link", { name: "Mẫu câu" })).toHaveAttribute("href", "#prep-patterns");
  });

  it("marks already-saved words on load and saves a new one through the phrase saver", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Đã lưu")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Lưu a heads-up" }));
    await waitFor(() => expect(screen.getAllByText("Đã lưu")).toHaveLength(2));
    expect(SAVER.saveOne).toHaveBeenCalledWith(PREP.vocab[1]);
    expect(SAVER.opts).toMatchObject({ uid: "u1", level: "B1", note: "Từ Chuẩn bị tình huống" });
  });

  it("speaks a line through the conversation voice", async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Nghe câu này" }))[0]);
    expect(AUDIO.stop).toHaveBeenCalled();
    expect(AUDIO.speak).toHaveBeenCalledWith("How is it going?", expect.any(Function));
  });

  it("scrolls to and rings the pattern card when a highlight is tapped", async () => {
    const { container } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "I'd like to walk you through" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector("#prep-pattern-0")).toHaveClass("prep-pattern-ringed");
  });

  it("shows a load error with a retry that reloads the kit", async () => {
    vi.mocked(getConversationPrep).mockRejectedValueOnce(new Error("offline"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Không tải được bộ tài liệu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về Chuẩn bị tình huống" })).toHaveAttribute("href", "/conversation/prep");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Báo cáo trễ tiến độ" })).toBeInTheDocument();
    expect(getConversationPrep).toHaveBeenCalledTimes(2);
  });

  it("shows not-found for a missing kit", async () => {
    vi.mocked(getConversationPrep).mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByText("Không tìm thấy bộ tài liệu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về Chuẩn bị tình huống" })).toHaveAttribute("href", "/conversation/prep");
  });
});

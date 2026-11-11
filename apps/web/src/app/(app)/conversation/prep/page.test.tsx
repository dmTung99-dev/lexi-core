import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationPrepPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { createConversationPrep, deleteConversationPrep, listRecentConversationPreps } from "@/lib/conversationPreps";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";
import { deleteKitMemory, loadKitMemory, recordKitCoverage } from "@/lib/prepMemory";

const ROUTER = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: vi.fn() }));
vi.mock("@/lib/conversationPreps", () => ({
  createConversationPrep: vi.fn(),
  listRecentConversationPreps: vi.fn(),
  deleteConversationPrep: vi.fn(),
}));
vi.mock("@/lib/prepMemory", () => ({
  loadKitMemory: vi.fn(),
  recordKitCoverage: vi.fn(),
  deleteKitMemory: vi.fn(),
}));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const VALID = JSON.stringify({
  title: "Báo cáo",
  persona: "A client.",
  goals: ["Chào"],
  dialogue: [
    { speaker: "partner", en: "One", vi: "" },
    { speaker: "you", en: "Two", vi: "" },
    { speaker: "partner", en: "Three", vi: "" },
    { speaker: "you", en: "Four", vi: "" },
  ],
  patterns: [{ pattern: "Two ___", meaning: "m" }],
  vocab: [{ text: "two", meaning: "hai" }],
});

const RECENT = [
  { id: "p9", title: "Kỷ niệm Đà Lạt", level: "A2", createdAt: "2026-11-01T08:00:00.000Z" },
] as ConversationPrep[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({
    settings: DEFAULT_SETTINGS,
    loading: false,
    error: null,
    save: vi.fn().mockResolvedValue(undefined),
  } as never);
  vi.mocked(hasAiKey).mockReturnValue(true);
  vi.mocked(listRecentConversationPreps).mockResolvedValue(RECENT);
  vi.mocked(loadKitMemory).mockResolvedValue(undefined);
  vi.mocked(recordKitCoverage).mockResolvedValue();
  vi.mocked(deleteKitMemory).mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

function typeSituation(text: string) {
  fireEvent.change(screen.getByLabelText("Bạn sắp gặp tình huống gì?"), { target: { value: text } });
}

describe("ConversationPrepPage", () => {
  it("asks signed-out users to sign in", () => {
    vi.mocked(useAuthUser).mockReturnValue({ user: null, loading: false } as never);
    render(<ConversationPrepPage />);
    expect(screen.getByRole("button", { name: "Đăng nhập với Google" })).toBeInTheDocument();
  });

  it("disables Create when the situation is empty or there is no AI key", async () => {
    render(<ConversationPrepPage />);
    const create = screen.getByRole("button", { name: "Tạo kịch bản" });
    expect(create).toBeDisabled();
    typeSituation("   ");
    expect(create).toBeDisabled();
    typeSituation("Báo cáo task A");
    expect(create).toBeEnabled();
    vi.mocked(hasAiKey).mockReturnValue(false);
    typeSituation("Báo cáo task A.");
    expect(screen.getByRole("button", { name: "Tạo kịch bản" })).toBeDisabled();
    expect(screen.getByText(/Chưa có AI key/)).toBeInTheDocument();
  });

  it("fills the textarea from a suggestion chip and defaults the level to the latest kit", async () => {
    render(<ConversationPrepPage />);
    fireEvent.click(screen.getByRole("button", { name: "Xin nghỉ phép" }));
    expect(screen.getByLabelText("Bạn sắp gặp tình huống gì?")).toHaveValue(
      "Tôi muốn xin quản lý cho nghỉ phép ba ngày vào tuần sau."
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Tối đa A2" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("generates, saves and navigates to the kit", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    await screen.findByText("Kỷ niệm Đà Lạt");
    fireEvent.click(screen.getByRole("button", { name: "Tối đa B2" }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(screen.getByRole("button", { name: "Đang tạo…" })).toBeDisabled();
    expect(screen.getByLabelText("Bạn sắp gặp tình huống gì?")).toBeDisabled();
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("CEFR B2");
    expect(createConversationPrep).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ situation: "Báo cáo task A", level: "B2", levelMode: "max", title: "Báo cáo" })
    );
  });

  it("Tất cả picks a random level at Tạo and saves levelMode all", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ level: "A2", levelMode: "all" }));
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("Never go above CEFR A2.");
  });

  it("restores Tất cả from the latest kit", async () => {
    vi.mocked(listRecentConversationPreps).mockResolvedValueOnce([{ ...RECENT[0], levelMode: "all" }]);
    render(<ConversationPrepPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true"));
  });


  it("shows the unclear message and keeps the text", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce('{"error":"unclear"}');
    render(<ConversationPrepPage />);
    typeSituation("abc");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Hãy mô tả tình huống cụ thể hơn");
    expect(screen.getByLabelText("Bạn sắp gặp tình huống gì?")).toHaveValue("abc");
    expect(createConversationPrep).not.toHaveBeenCalled();
  });

  it("retries a failed save without calling the AI again", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("p2");
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không lưu được bộ tài liệu — thử lại.");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p2"));
    expect(callInterviewAi).toHaveBeenCalledTimes(1);
  });

  it("deletes a recent kit after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteConversationPrep).mockResolvedValueOnce();
    render(<ConversationPrepPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá Kỷ niệm Đà Lạt" }));
    await waitFor(() => expect(screen.queryByText("Kỷ niệm Đà Lạt")).not.toBeInTheDocument());
    expect(deleteConversationPrep).toHaveBeenCalledWith("u1", "p9");
  });

  it("loads the whole history (uid only) and a deleted kit leaves active search results", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteConversationPrep).mockResolvedValueOnce();
    vi.mocked(listRecentConversationPreps).mockResolvedValueOnce([
      ...RECENT,
      { id: "p8", title: "Lập trình game", level: "B1", situation: "", createdAt: "2026-10-30T08:00:00.000Z" } as ConversationPrep,
    ]);
    render(<ConversationPrepPage />);
    await screen.findByText("Lập trình game");
    expect(listRecentConversationPreps).toHaveBeenCalledWith("u1");
    fireEvent.change(screen.getByLabelText("Tìm bộ tài liệu"), { target: { value: "lap trinh" } });
    expect(screen.queryByText("Kỷ niệm Đà Lạt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xoá Lập trình game" }));
    await waitFor(() => expect(screen.queryByText("Lập trình game")).not.toBeInTheDocument());
    expect(screen.getByText("Không tìm thấy bộ tài liệu nào.")).toBeInTheDocument();
  });

  it("shows a delete error without offering a create retry", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteConversationPrep).mockRejectedValueOnce(new Error("offline"));
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(await screen.findByRole("button", { name: "Xoá Kỷ niệm Đà Lạt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không xoá được bộ tài liệu — thử lại.");
    expect(screen.getByText("Kỷ niệm Đà Lạt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(callInterviewAi).not.toHaveBeenCalled();
  });

  it("sends kit memory to the prompt, saves usedMemory and records coverage", async () => {
    vi.mocked(loadKitMemory).mockResolvedValueOnce({ patterns: ["I'd like to ___"], words: ["behind schedule"], targets: [], history: [] });
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(loadKitMemory).toHaveBeenCalledWith("u1");
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("Already taught in this learner's earlier kits");
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ usedMemory: true }));
    expect(recordKitCoverage).toHaveBeenCalledWith("u1", expect.objectContaining({ title: "Báo cáo" }));
  });

  it("with Dùng trí nhớ off: no memory read, usedMemory false, coverage still recorded", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Dùng trí nhớ/ }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(loadKitMemory).not.toHaveBeenCalled();
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).not.toContain("Already taught");
    expect(createConversationPrep).toHaveBeenCalledWith("u1", expect.objectContaining({ usedMemory: false }));
    expect(recordKitCoverage).toHaveBeenCalled();
  });

  it("does not record coverage when saving the kit fails", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockRejectedValueOnce(new Error("offline"));
    render(<ConversationPrepPage />);
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không lưu được bộ tài liệu");
    expect(recordKitCoverage).not.toHaveBeenCalled();
  });

  it("removes a deleted kit's memory", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteConversationPrep).mockResolvedValueOnce();
    render(<ConversationPrepPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Xoá Kỷ niệm Đà Lạt" }));
    await waitFor(() => expect(deleteKitMemory).toHaveBeenCalledWith("u1", "p9"));
  });

  it("links to the memory page", () => {
    render(<ConversationPrepPage />);
    expect(screen.getByRole("link", { name: /AI nhớ gì về bạn/ })).toHaveAttribute("href", "/conversation/memory");
  });
});

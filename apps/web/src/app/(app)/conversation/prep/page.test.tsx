import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationPrepPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { callInterviewAi, hasAiKey } from "@/lib/interviewAi";
import { createConversationPrep, deleteConversationPrep, listRecentConversationPreps } from "@/lib/conversationPreps";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";

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
  vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS } as never);
  vi.mocked(hasAiKey).mockReturnValue(true);
  vi.mocked(listRecentConversationPreps).mockResolvedValue(RECENT);
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
    await waitFor(() => expect(screen.getByRole("button", { name: "A2" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("generates, saves and navigates to the kit", async () => {
    vi.mocked(callInterviewAi).mockResolvedValueOnce(VALID);
    vi.mocked(createConversationPrep).mockResolvedValueOnce("p1");
    render(<ConversationPrepPage />);
    await screen.findByText("Kỷ niệm Đà Lạt");
    fireEvent.click(screen.getByRole("button", { name: "B2" }));
    typeSituation("Báo cáo task A");
    fireEvent.click(screen.getByRole("button", { name: "Tạo kịch bản" }));
    expect(screen.getByRole("button", { name: "Đang tạo…" })).toBeDisabled();
    expect(screen.getByLabelText("Bạn sắp gặp tình huống gì?")).toBeDisabled();
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/prep/p1"));
    expect(vi.mocked(callInterviewAi).mock.calls[0][1]).toContain("CEFR B2");
    expect(createConversationPrep).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ situation: "Báo cáo task A", level: "B2", title: "Báo cáo" })
    );
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
});

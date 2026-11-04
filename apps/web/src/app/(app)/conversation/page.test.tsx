import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationSetupPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { callInterviewAi } from "@/lib/interviewAi";
import { createConversationSession } from "@/lib/conversationSessions";
import { loadSessionSnapshot } from "@/lib/learnerMemoryGrading";
import { getConversationPrep } from "@/lib/conversationPreps";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";

const ROUTER = { push: vi.fn(), replace: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER, useSearchParams: () => searchParams }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/conversationSessions", () => ({
  createConversationSession: vi.fn(),
  listRecentConversationSessions: vi.fn().mockResolvedValue([]),
  listUnfinishedConversationSessions: vi.fn().mockResolvedValue([]),
  deleteConversationSession: vi.fn(),
}));
vi.mock("@/lib/learnerMemoryGrading", () => ({ loadSessionSnapshot: vi.fn() }));
vi.mock("@/lib/conversationPreps", () => ({ getConversationPrep: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
vi.mock("@/lib/micPermission", () => ({
  getMicPermission: vi.fn().mockResolvedValue("granted"),
  requestMicPermission: vi.fn().mockResolvedValue(true),
}));
const AUDIO = { speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const PREP = {
  id: "p1",
  title: "Báo cáo trễ tiến độ",
  level: "B2",
  persona: "A busy client who wants a clear status update.",
  goals: ["Chào hỏi", "Báo trễ", "Đưa mốc mới"],
} as ConversationPrep;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: DEFAULT_SETTINGS } as never);
});

describe("ConversationSetupPage", () => {
  it("links to the memory page", async () => {
    render(<ConversationSetupPage />);
    expect(await screen.findByRole("link", { name: /AI nhớ gì về bạn/ })).toHaveAttribute("href", "/conversation/memory");
  });

  it("links to Chuẩn bị tình huống", async () => {
    render(<ConversationSetupPage />);
    expect(await screen.findByRole("link", { name: /Chuẩn bị tình huống/ })).toHaveAttribute("href", "/conversation/prep");
  });

  it("prefills a role-play from ?prep= without the scenario call and stores prepId", async () => {
    searchParams = new URLSearchParams("prep=p1");
    vi.mocked(getConversationPrep).mockResolvedValueOnce(PREP);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    expect(await screen.findByDisplayValue(PREP.persona)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Đưa mốc mới")).toBeInTheDocument();
    expect(getConversationPrep).toHaveBeenCalledWith("u1", "p1");
    expect(callInterviewAi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu nhập vai" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    expect(createConversationSession).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        mode: "roleplay",
        topic: "Báo cáo trễ tiến độ",
        level: "B2",
        persona: PREP.persona,
        goals: PREP.goals,
        prepId: "p1",
      }),
      undefined
    );
  });

  it("snapshots learner memory onto the new session", async () => {
    const snap = { groupKey: "free", groupLabel: "Tự do", facts: [], targets: [] };
    vi.mocked(loadSessionSnapshot).mockResolvedValueOnce(snap);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    fireEvent.change(screen.getByPlaceholderText(/chuẩn bị họp/), { target: { value: "Football" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    expect(loadSessionSnapshot).toHaveBeenCalledWith("u1", expect.objectContaining({ topic: "Football" }));
    expect(createConversationSession).toHaveBeenCalledWith("u1", expect.anything(), snap);
  });

  it("still creates the session when the snapshot is unavailable", async () => {
    vi.mocked(loadSessionSnapshot).mockResolvedValueOnce(undefined);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    fireEvent.change(screen.getByPlaceholderText(/chuẩn bị họp/), { target: { value: "Football" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu trò chuyện" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    expect(createConversationSession).toHaveBeenCalledWith("u1", expect.anything(), undefined);
  });

  it("drops the stale prepId after picking a built-in preset", async () => {
    searchParams = new URLSearchParams("prep=p1");
    vi.mocked(getConversationPrep).mockResolvedValueOnce(PREP);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    await screen.findByDisplayValue(PREP.persona);
    fireEvent.click(screen.getByRole("button", { name: /Gọi món ở nhà hàng/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu nhập vai" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    const setup = vi.mocked(createConversationSession).mock.calls[0][1];
    expect(setup).toMatchObject({ presetId: "restaurant" });
    expect(setup).not.toHaveProperty("prepId");
  });

  it("drops the stale prepId after editing the description of a prefilled prep", async () => {
    searchParams = new URLSearchParams("prep=p1");
    vi.mocked(getConversationPrep).mockResolvedValueOnce(PREP);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    await screen.findByDisplayValue(PREP.persona);
    fireEvent.change(screen.getByDisplayValue(PREP.title), { target: { value: "Một tình huống khác" } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu nhập vai" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    const setup = vi.mocked(createConversationSession).mock.calls[0][1];
    expect(setup).toMatchObject({ topic: "Một tình huống khác" });
    expect(setup).not.toHaveProperty("prepId");
  });

  it("drops the stale prepId after re-picking the custom card", async () => {
    searchParams = new URLSearchParams("prep=p1");
    vi.mocked(getConversationPrep).mockResolvedValueOnce(PREP);
    vi.mocked(callInterviewAi).mockResolvedValueOnce('{"persona":"A landlord.","goals":["Chào","Hỏi giá","Chốt"]}');
    vi.mocked(createConversationSession).mockResolvedValueOnce("s1");
    render(<ConversationSetupPage />);
    await screen.findByDisplayValue(PREP.persona);
    fireEvent.click(screen.getByRole("button", { name: /Tự mô tả tình huống/ }));
    fireEvent.change(screen.getByLabelText(/Mô tả tình huống/), { target: { value: "Thuê nhà" } });
    fireEvent.click(screen.getByRole("button", { name: "Dựng tình huống" }));
    await screen.findByDisplayValue("A landlord.");
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu nhập vai" }));
    await waitFor(() => expect(ROUTER.push).toHaveBeenCalledWith("/conversation/s1"));
    const setup = vi.mocked(createConversationSession).mock.calls[0][1];
    expect(setup).toMatchObject({ topic: "Thuê nhà" });
    expect(setup).not.toHaveProperty("prepId");
  });

  it("ignores a bad ?prep= id", async () => {
    searchParams = new URLSearchParams("prep=nope");
    vi.mocked(getConversationPrep).mockResolvedValueOnce(null);
    vi.mocked(createConversationSession).mockResolvedValueOnce("s2");
    render(<ConversationSetupPage />);
    await waitFor(() => expect(getConversationPrep).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Bắt đầu trò chuyện" })).toBeInTheDocument();
  });
});

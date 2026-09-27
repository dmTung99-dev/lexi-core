import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewSetupPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { createInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { getCvProfile } from "@/lib/cvProfile";
import { warmUpSpeech } from "@/lib/warmUpSpeechClient";
import { getMicPermission } from "@/lib/micPermission";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({ createInterviewSession: vi.fn(), listRecentInterviewSessions: vi.fn() }));
vi.mock("@/lib/cvProfile", () => ({ getCvProfile: vi.fn(), saveCvProfile: vi.fn(), deleteCvProfile: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
vi.mock("@/lib/micPermission", () => ({ getMicPermission: vi.fn(), requestMicPermission: vi.fn() }));
vi.mock("@/lib/useInterviewAudio", () => ({
  useInterviewAudio: () => ({ speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const WITH_KEY: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};

function setup(settings: UserSettings = WITH_KEY) {
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings, loading: false, error: null, save: vi.fn() });
  render(<InterviewSetupPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCvProfile).mockResolvedValue({ fileName: "cv.pdf", text: "t", summary: "CV SUMMARY", topics: [], updatedAt: "x" });
  vi.mocked(listRecentInterviewSessions).mockResolvedValue([]);
  vi.mocked(getMicPermission).mockResolvedValue("granted");
  vi.mocked(createInterviewSession).mockResolvedValue("new-id");
});

describe("InterviewSetupPage", () => {
  it("warms up speech services on mount", async () => {
    setup();
    await waitFor(() => expect(warmUpSpeech).toHaveBeenCalled());
  });

  it("disables Start until a role is entered", async () => {
    setup();
    const start = screen.getByRole("button", { name: "Bắt đầu phỏng vấn" });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "Software Engineer" } });
    await waitFor(() => expect(start).toBeEnabled());
  });

  it("keeps Start disabled without an AI key", async () => {
    setup(DEFAULT_SETTINGS);
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "SE" } });
    expect(screen.getByRole("button", { name: "Bắt đầu phỏng vấn" })).toBeDisabled();
  });

  it("creates a session with the CV summary and navigates to it", async () => {
    setup();
    await screen.findByText("cv.pdf");
    fireEvent.change(screen.getByLabelText("Vị trí ứng tuyển"), { target: { value: "  Software Engineer " } });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu phỏng vấn" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/new-id"));
    expect(createInterviewSession).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ role: "Software Engineer", cvSummary: "CV SUMMARY", questionCount: 5 })
    );
  });

  it("asks signed-out users to sign in", () => {
    vi.mocked(useAuthUser).mockReturnValue({ user: null, loading: false } as never);
    vi.mocked(useSettingsContext).mockReturnValue({ settings: null, loading: false, error: null, save: vi.fn() });
    render(<InterviewSetupPage />);
    expect(screen.getByText("Đăng nhập với Google")).toBeInTheDocument();
  });
});

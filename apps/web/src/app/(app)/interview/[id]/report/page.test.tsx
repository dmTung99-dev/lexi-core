import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewReportPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { completeInterviewSession, getInterviewSession, listRecentInterviewSessions } from "@/lib/interviewSessions";
import { callInterviewAi } from "@/lib/interviewAi";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";
import type { InterviewReport, InterviewSession } from "@/lib/interviewTypes";

const replaceMock = vi.fn();
const ROUTER = { push: vi.fn(), replace: replaceMock };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({
  getInterviewSession: vi.fn(),
  listRecentInterviewSessions: vi.fn(),
  completeInterviewSession: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/vocabRecords", () => ({ getVocabRecordByHeadword: vi.fn(), saveVocabRecord: vi.fn() }));
const AUDIO = { speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};

const REPORT: InterviewReport = {
  overall: 7.2,
  criteria: { content: 8, structure: 6.5, grammar: 6, vocabulary: 7.5, fluency: 7 },
  criteriaNotes: { content: "Có ví dụ thật", structure: "Thiếu Result", grammar: "Sai thì quá khứ", vocabulary: "Ổn", fluency: "Ổn" },
  improvements: [{ title: "Thì quá khứ khi kể chuyện", detail: "disagree → disagreed" }],
  questions: [
    {
      mainIndex: 0,
      score: 6,
      corrected: "We disagreed about Redux.",
      strengths: "Cụ thể",
      gaps: "Thiếu kết quả",
      modelAnswer: "We disagreed about Redux. Rather than debate it, I proposed a prototype.",
      phrases: [{ text: "rather than debate it", meaning: "thay vì tranh cãi" }],
    },
  ],
};

function makeSession(patch: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    createdAt: "2026-09-27T00:00:00.000Z",
    status: "completed",
    setup: { role: "SE", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
    plan: [
      { en: "Conflict?", vi: "" },
      { en: "Q2", vi: "" },
      { en: "Q3", vi: "" },
      { en: "Q4", vi: "" },
      { en: "Q5", vi: "" },
    ],
    turns: [{ mainIndex: 0, kind: "main", question: "Conflict?", answer: "We disagree about Redux.", skipped: false, answerSeconds: 9 }],
    report: REPORT,
    reportError: false,
    ...patch,
  };
}

function renderPage(session: InterviewSession) {
  vi.mocked(getInterviewSession).mockResolvedValue(session);
  render(<InterviewReportPage params={Promise.resolve({ id: "s1" })} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: SETTINGS, loading: false, error: null, save: vi.fn() });
  vi.mocked(listRecentInterviewSessions).mockResolvedValue([]);
  vi.mocked(completeInterviewSession).mockResolvedValue(undefined);
  vi.mocked(getVocabRecordByHeadword).mockResolvedValue(null);
  vi.mocked(saveVocabRecord).mockResolvedValue("v1");
});

describe("InterviewReportPage", () => {
  it("shows scores, improvements, and the first answered question expanded", async () => {
    renderPage(makeSession());
    expect(await screen.findByText("7.2")).toBeInTheDocument();
    expect(screen.getByText("Thì quá khứ khi kể chuyện")).toBeInTheDocument();
    expect(screen.getByText(/Phát âm chưa được chấm/)).toBeInTheDocument();
    expect(screen.getByText("disagree").tagName).toBe("DEL");
  });

  it("shows the delta against the previous graded session", async () => {
    vi.mocked(listRecentInterviewSessions).mockResolvedValue([
      makeSession(),
      makeSession({ id: "old", createdAt: "2026-09-20T00:00:00.000Z", report: { ...REPORT, overall: 6.1 } }),
    ]);
    renderPage(makeSession());
    expect(await screen.findByText("+1.1 so với buổi trước")).toBeInTheDocument();
  });

  it("saves a phrase to the English vocab bank with its meaning", async () => {
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    await waitFor(() => expect(saveVocabRecord).toHaveBeenCalled());
    expect(vi.mocked(saveVocabRecord).mock.calls[0][1]).toMatchObject({
      headword: "Rather than debate it",
      inputType: "phrase",
      meaning: "thay vì tranh cãi",
      examples: ["Rather than debate it, I proposed a prototype."],
      targetLanguage: "english",
    });
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeDisabled();
  });

  it("ignores a second click on the same phrase while the first save is still in flight", async () => {
    // The SAME pending promise is returned on every call — if the in-flight
    // guard fails, both clicks await it and both proceed once it resolves.
    let resolveGet: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveGet = resolve;
    });
    vi.mocked(getVocabRecordByHeadword).mockReturnValue(pending as never);
    renderPage(makeSession());
    const phraseBtn = await screen.findByRole("button", { name: /rather than debate it/ });
    fireEvent.click(phraseBtn);
    fireEvent.click(phraseBtn);

    resolveGet(null);
    await waitFor(() => expect(saveVocabRecord).toHaveBeenCalled());
    expect(getVocabRecordByHeadword).toHaveBeenCalledTimes(1);
    expect(saveVocabRecord).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate an existing phrase", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValue({ id: "x" } as never);
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeInTheDocument();
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });

  it("shows an error when saving a phrase fails, without marking it saved", async () => {
    vi.mocked(saveVocabRecord).mockRejectedValue(new Error("network"));
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    expect(await screen.findByText("Không lưu được cụm từ — thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rather than debate it/ })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /đã lưu/ })).not.toBeInTheDocument();
  });

  it("re-grades a session whose grading failed", async () => {
    vi.mocked(callInterviewAi).mockResolvedValue(JSON.stringify(REPORT));
    renderPage(makeSession({ report: null, reportError: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Chấm lại" }));
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", expect.objectContaining({ overall: 7.2 })));
    expect(await screen.findByText("7.2")).toBeInTheDocument();
  });

  it("sends an in-progress session back to the session page", async () => {
    renderPage(makeSession({ status: "in_progress", report: null }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/interview/s1"));
  });
});

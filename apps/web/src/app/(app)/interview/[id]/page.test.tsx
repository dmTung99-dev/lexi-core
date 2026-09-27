import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewSessionPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import {
  completeInterviewSession,
  deleteInterviewSession,
  getInterviewSession,
  saveInterviewPlan,
  saveInterviewTurns,
} from "@/lib/interviewSessions";
import { callInterviewAi } from "@/lib/interviewAi";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";
import type { InterviewSession } from "@/lib/interviewTypes";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const ROUTER = { push: pushMock, replace: replaceMock };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/interviewSessions", () => ({
  getInterviewSession: vi.fn(),
  saveInterviewPlan: vi.fn(),
  saveInterviewTurns: vi.fn(),
  completeInterviewSession: vi.fn(),
  deleteInterviewSession: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/transcribeAudioClient", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
const AUDIO = {
  speak: vi.fn().mockResolvedValue(true),
  prefetch: vi.fn(),
  playPrefetched: vi.fn().mockResolvedValue(true),
  stop: vi.fn(),
};
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
const RECORDER = {
  recording: false,
  elapsed: 0,
  error: null,
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn().mockResolvedValue({ blob: new Blob(["a"]), seconds: 5 }),
  cancel: vi.fn(),
};
vi.mock("@/lib/useRecorder", () => ({ useRecorder: () => RECORDER }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};
const PLAN = ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"];

function makeSession(patch: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: "s1",
    createdAt: "2026-09-27T00:00:00.000Z",
    status: "in_progress",
    setup: { role: "SE", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
    plan: [],
    turns: [],
    report: null,
    reportError: false,
    ...patch,
  };
}

const REPORT_JSON = JSON.stringify({
  overall: 7,
  criteria: { content: 7, structure: 7, grammar: 7, vocabulary: 7, fluency: 7 },
  criteriaNotes: {},
  improvements: [],
  questions: [{ mainIndex: 0, score: 7, corrected: "a", strengths: "", gaps: "", modelAnswer: "", phrases: [] }],
});

let nextTurnReply = '{"action":"next","ack":"Thanks."}';

function renderPage(session: InterviewSession, options: { strict?: boolean } = {}) {
  vi.mocked(getInterviewSession).mockResolvedValue(session);
  const ui = <InterviewSessionPage params={Promise.resolve({ id: "s1" })} />;
  render(options.strict ? <StrictMode>{ui}</StrictMode> : ui);
}

beforeEach(() => {
  vi.clearAllMocks();
  AUDIO.speak.mockResolvedValue(true);
  AUDIO.playPrefetched.mockResolvedValue(true);
  RECORDER.start.mockResolvedValue(true);
  RECORDER.stop.mockResolvedValue({ blob: new Blob(["a"]), seconds: 5 });
  nextTurnReply = '{"action":"next","ack":"Thanks."}';
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: SETTINGS, loading: false, error: null, save: vi.fn() });
  vi.mocked(saveInterviewPlan).mockResolvedValue(undefined);
  vi.mocked(saveInterviewTurns).mockResolvedValue(undefined);
  vi.mocked(completeInterviewSession).mockResolvedValue(undefined);
  vi.mocked(deleteInterviewSession).mockResolvedValue(undefined);
  vi.mocked(transcribeAudio).mockResolvedValue("My answer");
  vi.mocked(callInterviewAi).mockImplementation(async (_s, prompt: string) => {
    if (prompt.includes("Write exactly")) return JSON.stringify({ questions: PLAN });
    if (prompt.includes("Decide ONE of")) return nextTurnReply;
    if (prompt.includes("expert English interview coach")) return REPORT_JSON;
    throw new Error("unexpected prompt");
  });
});

async function answerCurrentQuestion() {
  fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
  fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
  expect(await screen.findByLabelText(/Bản chép lời/)).toHaveValue("My answer");
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
}

describe("InterviewSessionPage", () => {
  it("generates and saves the plan, greets, then asks Q1", async () => {
    renderPage(makeSession());
    expect(await screen.findByText("Q1?")).toBeInTheDocument();
    expect(saveInterviewPlan).toHaveBeenCalledWith("u1", "s1", PLAN);
    expect(AUDIO.speak).toHaveBeenCalledWith(expect.stringContaining("Let's get started"));
    expect(AUDIO.playPrefetched).toHaveBeenCalledWith("main-0", "Q1?");
  });

  it("prefetches the next main question while waiting for an answer", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await screen.findByRole("button", { name: "Bắt đầu trả lời" });
    // The prefetch call is fired from the "idle" phase's passive effect, a
    // separate tick from the DOM commit findByRole observes — wait for it
    // instead of asserting immediately, so this isn't racy against effect
    // flushing.
    await waitFor(() => expect(AUDIO.prefetch).toHaveBeenCalledWith("main-1", "Q2?"));
  });

  it("runs a full turn: record, review, send, acknowledge, next question", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
    expect(saveInterviewTurns).toHaveBeenCalledWith("u1", "s1", [
      expect.objectContaining({ mainIndex: 0, kind: "main", question: "Q1?", answer: "My answer", answerSeconds: 5 }),
    ]);
    expect(AUDIO.speak).toHaveBeenCalledWith("Thanks.");
  });

  it("asks a follow-up when the AI decides to", async () => {
    nextTurnReply = '{"action":"follow_up","say":"Why did you choose that?"}';
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Why did you choose that?")).toBeInTheDocument();
    expect(screen.getByText("Câu hỏi thêm")).toBeInTheDocument();
  });

  it("moves on when nextTurn fails", async () => {
    nextTurnReply = "not json";
    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
  });

  it("keeps the recording and offers retry when STT fails", async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error("503"));
    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByLabelText(/Bản chép lời/)).toHaveValue("My answer");
    expect(transcribeAudio).toHaveBeenCalledTimes(2);
  });

  it("resumes an interrupted session at the next main question", async () => {
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    expect(await screen.findByText("Q2?")).toBeInTheDocument();
  });

  it("ending early grades answered turns and opens the report", async () => {
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    await screen.findByText("Q2?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/s1/report"));
    expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", expect.objectContaining({ overall: 7 }));
  });

  it("ending with nothing answered deletes the session", async () => {
    renderPage(makeSession({ plan: PLAN }));
    await screen.findByText("Q1?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview"));
    expect(deleteInterviewSession).toHaveBeenCalledWith("u1", "s1");
  });

  it("saves a null report when grading fails", async () => {
    vi.mocked(callInterviewAi).mockImplementation(async (_s, prompt: string) => {
      if (prompt.includes("expert English interview coach")) throw new Error("quota");
      return JSON.stringify({ questions: PLAN });
    });
    renderPage(makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }));
    await screen.findByText("Q2?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", null));
  });

  it("redirects a completed session to its report", async () => {
    renderPage(makeSession({ status: "completed", plan: PLAN }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/interview/s1/report"));
  });

  it("ignores a stale SPEECH_ENDED from a superseded speak call (skip then replay)", async () => {
    let resolveStale: (ok: boolean) => void = () => {};
    const stalePromise = new Promise<boolean>((resolve) => {
      resolveStale = resolve;
    });
    AUDIO.playPrefetched.mockImplementationOnce(() => stalePromise);
    AUDIO.playPrefetched.mockImplementation(() => new Promise<boolean>(() => {}));

    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bỏ qua, trả lời luôn" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nghe lại câu hỏi" }));

    await act(async () => {
      resolveStale(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Không phát được âm thanh/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bỏ qua, trả lời luôn" })).toBeInTheDocument();
  });

  it("never speaks a stale nextTurn ack after ending mid-decision", async () => {
    let resolveNextTurn: (raw: string) => void = () => {};
    const pendingNextTurn = new Promise<string>((resolve) => {
      resolveNextTurn = resolve;
    });
    vi.mocked(callInterviewAi).mockImplementation(async (_s, prompt: string) => {
      if (prompt.includes("Write exactly")) return JSON.stringify({ questions: PLAN });
      if (prompt.includes("Decide ONE of")) return pendingNextTurn;
      if (prompt.includes("expert English interview coach")) return REPORT_JSON;
      throw new Error("unexpected prompt");
    });

    renderPage(makeSession({ plan: PLAN }));
    await answerCurrentQuestion();

    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));

    await act(async () => {
      resolveNextTurn('{"action":"next","ack":"Late ack."}');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/s1/report"));
    expect(AUDIO.speak).not.toHaveBeenCalledWith("Late ack.");
  });

  it("disables Kết thúc buổi while transcribing so an in-flight answer can't be dropped", async () => {
    let resolveTranscribe: (text: string) => void = () => {};
    vi.mocked(transcribeAudio).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscribe = resolve;
        })
    );
    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));

    expect(await screen.findByRole("button", { name: "Kết thúc buổi" })).toBeDisabled();

    await act(async () => {
      resolveTranscribe("My answer");
      await Promise.resolve();
    });
  });

  it("ending from review saves the current draft as a turn before grading", async () => {
    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
    expect(await screen.findByLabelText(/Bản chép lời/)).toHaveValue("My answer");

    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));

    await waitFor(() =>
      expect(saveInterviewTurns).toHaveBeenCalledWith("u1", "s1", [
        expect.objectContaining({ mainIndex: 0, kind: "main", question: "Q1?", answer: "My answer" }),
      ])
    );
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalled());
  });

  it("still navigates to the report after StrictMode's simulated mount→unmount→remount", async () => {
    renderPage(
      makeSession({ plan: PLAN, turns: [{ mainIndex: 0, kind: "main", question: "Q1?", answer: "a", skipped: false, answerSeconds: 3 }] }),
      { strict: true }
    );
    await screen.findByText("Q2?");
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/interview/s1/report"));
  });

  it("releases the mic if startRecorder() resolves after Kết thúc buổi was clicked", async () => {
    let resolveStart: (ok: boolean) => void = () => {};
    RECORDER.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        })
    );
    renderPage(makeSession({ plan: PLAN }));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu trả lời" }));
    fireEvent.click(screen.getByRole("button", { name: "Kết thúc buổi" }));
    RECORDER.cancel.mockClear();

    await act(async () => {
      resolveStart(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(RECORDER.cancel).toHaveBeenCalled();
  });
});

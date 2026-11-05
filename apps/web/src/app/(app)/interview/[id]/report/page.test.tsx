import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearRecordings, saveRecordings } from "@/lib/recordedAudioStore";
import InterviewReportPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import {
  completeInterviewSession,
  getInterviewSession,
  listRecentInterviewSessions,
  markInterviewMemoryApplied,
} from "@/lib/interviewSessions";
import { getMistakeMemory, saveMistakeMemory } from "@/lib/learnerMemory";
import { callInterviewAi } from "@/lib/interviewAi";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { enrichPhrases } from "@/lib/phraseEnrich";
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
  markInterviewMemoryApplied: vi.fn(),
}));
vi.mock("@/lib/learnerMemory", () => ({
  getMistakeMemory: vi.fn(),
  getTopicMemory: vi.fn(),
  saveMistakeMemory: vi.fn(),
  saveTopicMemory: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/vocabRecords", () => ({ getVocabRecordByHeadword: vi.fn(), saveVocabRecord: vi.fn() }));
vi.mock("@/lib/phraseEnrich", () => ({ enrichPhrases: vi.fn() }));
vi.mock("@/lib/topics", () => ({ getTopics: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/savePhraseToVocab", () => ({ isPhraseSaved: vi.fn().mockResolvedValue(false), savePhraseToVocab: vi.fn() }));
vi.mock("@/components/shared/PronunciationButton", () => ({ PronunciationButton: () => null }));
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
  vi.mocked(markInterviewMemoryApplied).mockResolvedValue(undefined);
  vi.mocked(getMistakeMemory).mockResolvedValue({ items: [], updatedAt: "" });
  vi.mocked(saveMistakeMemory).mockResolvedValue(undefined);
});

describe("InterviewReportPage — own-voice replay", () => {
  afterEach(() => {
    clearRecordings("");
    vi.unstubAllGlobals();
  });

  it("offers one 'Nghe lại giọng tôi' per question, playing its main + follow-up recordings in turn order", async () => {
    const played: string[] = [];
    let player: { onended: (() => void) | null } | null = null;
    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        pause = vi.fn();
        play = () => {
          played.push(this.src);
          return Promise.resolve();
        };
        constructor() {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          player = this;
        }
      }
    );
    const urls = new Map<Blob, string>();
    URL.createObjectURL = vi.fn((b: Blob) => urls.get(b) ?? "blob:?") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const main = new Blob(["main"]);
    const follow = new Blob(["follow"]);
    const other = new Blob(["other"]);
    urls.set(main, "blob:main").set(follow, "blob:follow").set(other, "blob:other");
    saveRecordings("interview:s1:0", [main]);
    saveRecordings("interview:s1:1", [other]); // a different main question
    saveRecordings("interview:s1:2", [follow]);
    renderPage(
      makeSession({
        turns: [
          { mainIndex: 0, kind: "main", question: "Conflict?", answer: "We disagree about Redux.", skipped: false, answerSeconds: 9 },
          { mainIndex: 1, kind: "main", question: "Q2", answer: "Other.", skipped: false, answerSeconds: 4 },
          { mainIndex: 0, kind: "follow_up", question: "Why?", answer: "Because.", skipped: false, answerSeconds: 3 },
        ],
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nghe lại giọng tôi" }));
    expect(played).toEqual(["blob:main"]);
    act(() => player?.onended?.());
    expect(played).toEqual(["blob:main", "blob:follow"]);
  });

  it("shows no replay button when the recordings are gone (page reloaded)", async () => {
    renderPage(makeSession());
    expect(await screen.findByText("7.2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nghe lại giọng tôi" })).not.toBeInTheDocument();
  });
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

  it("looks a phrase up in full, then saves it to the English vocab bank from the edit modal", async () => {
    vi.mocked(enrichPhrases).mockImplementation(async (_s, items) =>
      items.map((it) => ({
        kind: "wordPhrase" as const, headword: it.text, inputType: "phrase" as const, ipa: "/ˈrɑːðər/",
        meaning: it.meaning, definition: "instead of", synonyms: ["instead of"], examples: [it.example],
        suggestedTopics: [], cefrLevel: "b2" as const,
      }))
    );
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    await waitFor(() =>
      expect(enrichPhrases).toHaveBeenCalledWith(expect.anything(), [
        { text: "rather than debate it", meaning: "thay vì tranh cãi", example: "Rather than debate it, I proposed a prototype." },
      ])
    );
    fireEvent.click(await screen.findByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saveVocabRecord).toHaveBeenCalled());
    expect(vi.mocked(saveVocabRecord).mock.calls[0][1]).toMatchObject({
      headword: "Rather than debate it",
      ipa: "/ˈrɑːðər/",
      definition: "instead of",
      cefrLevel: "b2",
      meaning: "thay vì tranh cãi",
      examples: ["Rather than debate it, I proposed a prototype."],
      personalNotes: "Từ luyện Phỏng vấn tiếng Anh",
      activeContext: "business",
      targetLanguage: "english",
    });
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeDisabled();
  });

  it("ignores a second click on the same phrase while the first lookup is still in flight", async () => {
    let resolveGet: (v: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveGet = resolve;
    });
    vi.mocked(getVocabRecordByHeadword).mockReturnValue(pending as never);
    renderPage(makeSession());
    const phraseBtn = await screen.findByRole("button", { name: /rather than debate it/ });
    fireEvent.click(phraseBtn);
    fireEvent.click(phraseBtn);
    resolveGet({ id: "x" });
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeInTheDocument();
    expect(getVocabRecordByHeadword).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate an existing phrase", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValue({ id: "x" } as never);
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    expect(await screen.findByRole("button", { name: /đã lưu/ })).toBeInTheDocument();
    expect(enrichPhrases).not.toHaveBeenCalled();
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });

  it("shows an error and offers a basic save when the lookup fails, without marking it saved", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValue(null);
    vi.mocked(enrichPhrases).mockRejectedValue(new Error("quota"));
    renderPage(makeSession());
    fireEvent.click(await screen.findByRole("button", { name: /rather than debate it/ }));
    expect(await screen.findByText(/Không tra được thông tin từ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu bản cơ bản" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /đã lưu/ })).not.toBeInTheDocument();
  });

  it("re-grades a session whose grading failed", async () => {
    vi.mocked(callInterviewAi).mockResolvedValue(JSON.stringify(REPORT));
    renderPage(makeSession({ report: null, reportError: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Chấm lại" }));
    await waitFor(() => expect(completeInterviewSession).toHaveBeenCalledWith("u1", "s1", expect.objectContaining({ overall: 7.2 })));
    expect(await screen.findByText("7.2")).toBeInTheDocument();
  });

  it("Chấm lại updates learner memory once for a session that never applied it", async () => {
    vi.mocked(callInterviewAi).mockResolvedValue(
      JSON.stringify({ ...REPORT, recurringMistakes: [{ pattern: "Quên quá khứ", rule: "r", examples: [{ said: "I go", better: "I went" }] }] })
    );
    renderPage(makeSession({ report: null, reportError: true }));
    const button = await screen.findByRole("button", { name: "Chấm lại" });
    fireEvent.click(button);
    expect(await screen.findByText("7.2")).toBeInTheDocument();
    await waitFor(() => expect(markInterviewMemoryApplied).toHaveBeenCalledWith("u1", "s1"));
    expect(saveMistakeMemory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveMistakeMemory).mock.calls[0][1]).toEqual([expect.objectContaining({ source: "interview" })]);
    expect(vi.mocked(saveMistakeMemory).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(completeInterviewSession).mock.invocationCallOrder[0]
    );
  });

  it("Chấm lại never touches memory on a session that already applied it", async () => {
    vi.mocked(callInterviewAi).mockResolvedValue(JSON.stringify(REPORT));
    renderPage(makeSession({ report: null, reportError: true, memoryApplied: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Chấm lại" }));
    expect(await screen.findByText("7.2")).toBeInTheDocument();
    expect(getMistakeMemory).not.toHaveBeenCalled();
    expect(saveMistakeMemory).not.toHaveBeenCalled();
    expect(markInterviewMemoryApplied).not.toHaveBeenCalled();
  });

  it("Chấm lại leaves memory untouched when the regrade fails", async () => {
    vi.mocked(callInterviewAi).mockRejectedValue(new Error("quota"));
    renderPage(makeSession({ report: null, reportError: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Chấm lại" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("quota");
    expect(saveMistakeMemory).not.toHaveBeenCalled();
    expect(markInterviewMemoryApplied).not.toHaveBeenCalled();
  });

  it("sends an in-progress session back to the session page", async () => {
    renderPage(makeSession({ status: "in_progress", report: null }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/interview/s1"));
  });
});

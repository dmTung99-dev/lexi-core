import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationSessionPage from "./page";
import { useAuthUser } from "@/lib/useAuthUser";
import { useSettingsContext } from "@/lib/SettingsContext";
import { getConversationSession, saveConversationProgress } from "@/lib/conversationSessions";
import { callInterviewAi } from "@/lib/interviewAi";
import { transcribeAudio } from "@/lib/transcribeAudioClient";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/settings";
import type { ConversationSession } from "@/lib/conversationTypes";
import { clearRecordings, getRecordings, hasRecordings } from "@/lib/recordedAudioStore";

const ROUTER = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));
vi.mock("@/lib/useAuthUser", () => ({ useAuthUser: vi.fn() }));
vi.mock("@/lib/SettingsContext", () => ({ useSettingsContext: vi.fn() }));
vi.mock("@/lib/conversationSessions", () => ({
  getConversationSession: vi.fn(),
  saveConversationProgress: vi.fn(),
  completeConversationSession: vi.fn(),
  deleteConversationSession: vi.fn(),
}));
vi.mock("@/lib/interviewAi", () => ({ callInterviewAi: vi.fn(), hasAiKey: () => true }));
vi.mock("@/lib/transcribeAudioClient", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/warmUpSpeechClient", () => ({ warmUpSpeech: vi.fn() }));
const AUDIO = { speak: vi.fn().mockResolvedValue(true), prefetch: vi.fn(), playPrefetched: vi.fn(), stop: vi.fn() };
vi.mock("@/lib/useInterviewAudio", () => ({ useInterviewAudio: () => AUDIO }));
const RECORDER = {
  recording: false,
  elapsed: 0,
  error: null,
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn(),
  cancel: vi.fn(),
};
vi.mock("@/lib/useRecorder", () => ({ useRecorder: () => RECORDER }));
vi.mock("@/components/SignInButton", () => ({ SignInButton: () => <button>Đăng nhập với Google</button> }));

const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: { ...DEFAULT_SETTINGS.providers, gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "c" } },
};

function makeSession(reviewTranscript: boolean): ConversationSession {
  return {
    id: "s1",
    createdAt: "2026-10-09T00:00:00.000Z",
    status: "in_progress",
    setup: { mode: "topic", topic: "Travel", level: "B1", voice: "female1", speakAloud: false, reviewTranscript, persona: null, goals: [] },
    summary: "",
    summarizedCount: 0,
    messages: [{ role: "ai", text: "Where did you go?" }],
    goalsDone: [],
    report: null,
    reportError: false,
  };
}

function renderPage(session: ConversationSession) {
  vi.mocked(getConversationSession).mockResolvedValue(session);
  return render(<ConversationSessionPage params={Promise.resolve({ id: "s1" })} />);
}

async function recordVoice(blob: Blob, transcript: string, startLabel = "Bắt đầu ghi âm") {
  RECORDER.stop.mockResolvedValueOnce({ blob, seconds: 3 });
  vi.mocked(transcribeAudio).mockResolvedValueOnce(transcript);
  fireEvent.click(await screen.findByRole("button", { name: startLabel }));
  fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRecordings("");
  RECORDER.start.mockResolvedValue(true);
  AUDIO.speak.mockResolvedValue(true);
  vi.mocked(useAuthUser).mockReturnValue({ user: { uid: "u1" }, loading: false } as never);
  vi.mocked(useSettingsContext).mockReturnValue({ settings: SETTINGS, loading: false, error: null, save: vi.fn() });
  vi.mocked(saveConversationProgress).mockResolvedValue(undefined);
  vi.mocked(callInterviewAi).mockResolvedValue('{"say":"Nice!","vi":"Hay!","goalsDone":[]}');
});

describe("ConversationSessionPage — STT prompt", () => {
  it("passes the topic and the last AI message as the STT prompt", async () => {
    renderPage(makeSession(true));
    await recordVoice(new Blob(["a"]), "I went to Hue");
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toHaveValue("I went to Hue");
    expect(transcribeAudio).toHaveBeenCalledWith(expect.any(Blob), {
      prompt: "Topic: Travel. Where did you go?",
    });
  });
});

describe("ConversationSessionPage — own-voice recordings", () => {
  it("keeps every kept voice segment of a message, dropping a re-recorded one", async () => {
    const a = new Blob(["a"]);
    const b = new Blob(["b"]);
    const c = new Blob(["c"]);
    renderPage(makeSession(true));
    await recordVoice(a, "I went to Hue");
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toHaveValue("I went to Hue");
    fireEvent.click(screen.getByRole("button", { name: "+ Nói thêm" }));
    await recordVoice(b, "with my famly");
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toHaveValue("with my famly");
    // Re-record: the "famly" take is discarded along with its transcript.
    await recordVoice(c, "with my family", "Thu lại");
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toHaveValue("with my family");
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));

    expect(await screen.findByText("Nice!")).toBeInTheDocument();
    expect(getRecordings("conversation:s1:1")).toEqual([a, c]);
    expect(screen.getAllByRole("button", { name: "Nghe lại giọng tôi" })).toHaveLength(1);
  });

  it("gives a typed-only message no recording", async () => {
    renderPage(makeSession(true));
    fireEvent.change(await screen.findByLabelText("Câu trả lời của bạn"), { target: { value: "I stayed home" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText("Nice!")).toBeInTheDocument();
    expect(hasRecordings("conversation:s1:1")).toBe(false);
    expect(screen.queryByRole("button", { name: "Nghe lại giọng tôi" })).not.toBeInTheDocument();
  });

  it("saves the recording when the transcript is sent straight away (review off)", async () => {
    const a = new Blob(["a"]);
    renderPage(makeSession(false));
    await recordVoice(a, "I went to Hue");
    expect(await screen.findByText("Nice!")).toBeInTheDocument();
    expect(getRecordings("conversation:s1:1")).toEqual([a]);
  });

  it("does not keep a recording whose transcript came back empty", async () => {
    renderPage(makeSession(true));
    await recordVoice(new Blob(["silence"]), "");
    await screen.findByRole("button", { name: "Bắt đầu ghi âm" });
    fireEvent.change(screen.getByLabelText("Câu trả lời của bạn"), { target: { value: "Typed instead" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    await waitFor(() => expect(screen.getByText("Nice!")).toBeInTheDocument());
    expect(hasRecordings("conversation:s1:1")).toBe(false);
  });
});

describe("ConversationSessionPage — listen back before sending", () => {
  const LISTEN = { name: "Nghe lại giọng tôi" };

  it("offers the voice in the transcript review step, before anything is sent", async () => {
    const a = new Blob(["a"]);
    renderPage(makeSession(true));
    expect(screen.queryByRole("button", LISTEN)).not.toBeInTheDocument();
    await recordVoice(a, "I went to Hue");
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toHaveValue("I went to Hue");
    expect(screen.getByRole("button", LISTEN)).toBeInTheDocument();
    // Nothing was sent or stored yet.
    expect(hasRecordings("conversation:s1:1")).toBe(false);
  });

  it("plays the pending takes in order (unsent blobs, not the store)", async () => {
    const a = new Blob(["a"]);
    const b = new Blob(["b"]);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:${created.length}`;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        play = () => Promise.resolve();
        pause = () => {};
      }
    );
    try {
      renderPage(makeSession(true));
      await recordVoice(a, "I went to Hue");
      await screen.findByLabelText("Câu trả lời của bạn");
      fireEvent.click(screen.getByRole("button", { name: "+ Nói thêm" }));
      await recordVoice(b, "with my family");
      await screen.findByLabelText("Câu trả lời của bạn");
      fireEvent.click(screen.getByRole("button", LISTEN));
      expect(created).toEqual([a, b]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps offering earlier voice segments after + Nói thêm (idle), and only those", async () => {
    renderPage(makeSession(true));
    await recordVoice(new Blob(["a"]), "I went to Hue");
    await screen.findByLabelText("Câu trả lời của bạn");
    fireEvent.click(screen.getByRole("button", { name: "+ Nói thêm" }));
    expect(await screen.findByRole("button", { name: "Bắt đầu ghi âm" })).toBeInTheDocument();
    expect(screen.getByRole("button", LISTEN)).toBeInTheDocument();
  });

  it("drops a re-recorded take from the offer: nothing left to hear after Thu lại is pending", async () => {
    renderPage(makeSession(true));
    await recordVoice(new Blob(["a"]), "I went to Hue");
    await screen.findByLabelText("Câu trả lời của bạn");
    fireEvent.click(screen.getByRole("button", { name: "Thu lại" }));
    // While recording the button is not shown.
    await screen.findByRole("button", { name: "Dừng ghi âm" });
    expect(screen.queryByRole("button", LISTEN)).not.toBeInTheDocument();
  });

  it("offers the kept recording when transcription failed, and never leaks it into the next message", async () => {
    renderPage(makeSession(true));
    RECORDER.stop.mockResolvedValueOnce({ blob: new Blob(["lost"]), seconds: 2 });
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error("stt down"));
    fireEvent.click(await screen.findByRole("button", { name: "Bắt đầu ghi âm" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dừng ghi âm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chép lời thất bại");
    expect(screen.getByRole("button", LISTEN)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gõ thay vì nói" }));
    expect(await screen.findByLabelText("Câu trả lời của bạn")).toBeInTheDocument();
    expect(screen.queryByRole("button", LISTEN)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Câu trả lời của bạn"), { target: { value: "Typed instead" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText("Nice!")).toBeInTheDocument();
    expect(hasRecordings("conversation:s1:1")).toBe(false);
    expect(screen.queryByRole("button", LISTEN)).not.toBeInTheDocument();
  });

  it("hides the composer button again once the message is sent", async () => {
    renderPage(makeSession(true));
    await recordVoice(new Blob(["a"]), "I went to Hue");
    await screen.findByLabelText("Câu trả lời của bạn");
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(await screen.findByText("Nice!")).toBeInTheDocument();
    // Only the thread's own replay button for the sent message remains.
    expect(screen.getAllByRole("button", LISTEN)).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { callInterviewAi, hasAiKey } from "./interviewAi";
import { InterviewAiError } from "./interviewPrompts";
import { generateContent } from "./generateContent";
import { DEFAULT_SETTINGS, type UserSettings } from "./settings";

vi.mock("./generateContent", () => ({ generateContent: vi.fn() }));

const WITH_KEY: UserSettings = {
  ...DEFAULT_SETTINGS,
  providers: {
    ...DEFAULT_SETTINGS.providers,
    gemini: { ...DEFAULT_SETTINGS.providers.gemini, apiKeyCiphertext: "cipher" },
  },
};

beforeEach(() => vi.clearAllMocks());

describe("interviewAi", () => {
  it("hasAiKey reflects the active provider's ciphertext", () => {
    expect(hasAiKey(null)).toBe(false);
    expect(hasAiKey(DEFAULT_SETTINGS)).toBe(false);
    expect(hasAiKey(WITH_KEY)).toBe(true);
  });

  it("calls generateContent with the active provider config", async () => {
    vi.mocked(generateContent).mockResolvedValue({ text: "out" });
    await expect(callInterviewAi(WITH_KEY, "p")).resolves.toBe("out");
    expect(generateContent).toHaveBeenCalledWith({
      provider: "gemini",
      model: WITH_KEY.providers.gemini.model,
      apiKeyCiphertext: "cipher",
      prompt: "p",
    });
  });

  it("throws InterviewAiError without a key", async () => {
    await expect(callInterviewAi(DEFAULT_SETTINGS, "p")).rejects.toBeInstanceOf(InterviewAiError);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

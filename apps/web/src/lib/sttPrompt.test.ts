import { describe, expect, it } from "vitest";
import {
  STT_PROMPT_MAX_CHARS,
  conversationSttPrompt,
  interviewSttPrompt,
  tailByCodePoints,
} from "./sttPrompt";
import type { ConversationSetup } from "./conversationTypes";

function setup(over: Partial<ConversationSetup> = {}): ConversationSetup {
  return {
    mode: "topic",
    topic: "Travel",
    level: "B1",
    voice: "female1",
    speakAloud: false,
    reviewTranscript: true,
    persona: null,
    goals: [],
    ...over,
  };
}

describe("conversationSttPrompt", () => {
  it("combines topic and the last AI message in topic mode", () => {
    expect(conversationSttPrompt(setup(), "Where did you go?")).toBe(
      "Topic: Travel. Where did you go?"
    );
  });

  it("adds the persona in role-play mode", () => {
    expect(
      conversationSttPrompt(
        setup({ mode: "roleplay", topic: "Ordering coffee", persona: "a barista" }),
        "What can I get you?"
      )
    ).toBe("Topic: Ordering coffee. Role-play: a barista. What can I get you?");
  });

  it("skips the persona when it is null or blank", () => {
    expect(conversationSttPrompt(setup({ mode: "roleplay", persona: "  " }), "Hi")).toBe(
      "Topic: Travel. Hi"
    );
  });

  it("handles an empty last AI message", () => {
    expect(conversationSttPrompt(setup(), "")).toBe("Topic: Travel.");
    expect(conversationSttPrompt(setup(), "   ")).toBe("Topic: Travel.");
  });

  it("handles an empty topic", () => {
    expect(conversationSttPrompt(setup({ topic: "  " }), "Hello there")).toBe("Hello there");
  });

  it("returns an empty string when there is nothing", () => {
    expect(conversationSttPrompt(setup({ topic: "" }), "")).toBe("");
  });

  it("trims and collapses whitespace", () => {
    expect(conversationSttPrompt(setup({ topic: "  Travel \n" }), "  Where\n did   you go? ")).toBe(
      "Topic: Travel. Where did you go?"
    );
  });

  it("caps at 400 chars, dropping the oldest context and keeping the question", () => {
    const question = "Q".repeat(380) + " the end?";
    const out = conversationSttPrompt(setup(), question);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("the end?")).toBe(true);
    expect(out.startsWith("Topic:")).toBe(false);
  });
});

describe("interviewSttPrompt", () => {
  it("builds role + question", () => {
    expect(interviewSttPrompt("Software Engineer", "Tell me about yourself.")).toBe(
      "Job interview for Software Engineer. Tell me about yourself."
    );
  });

  it("handles an empty question", () => {
    expect(interviewSttPrompt("Designer", "")).toBe("Job interview for Designer.");
  });

  it("handles an empty role", () => {
    expect(interviewSttPrompt("  ", "Why us?")).toBe("Why us?");
    expect(interviewSttPrompt("", "")).toBe("");
  });

  it("trims inputs", () => {
    expect(interviewSttPrompt("  QA  ", "  Why QA? ")).toBe("Job interview for QA. Why QA?");
  });

  it("caps at 400 chars keeping the tail", () => {
    const out = interviewSttPrompt("Engineer", "x".repeat(500) + " END");
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out.endsWith("x END")).toBe(true);
  });
});

describe("surrogate safety", () => {
  const hasLone = (s: string) => /\p{Surrogate}/u.test(s);

  it("tailByCodePoints never splits an emoji and keeps the tail", () => {
    const out = tailByCodePoints("a".repeat(10) + "😀".repeat(5), 3);
    expect(out).toBe("😀😀😀");
    expect(hasLone(out)).toBe(false);
  });

  it("tailByCodePoints also respects a UTF-16 unit cap", () => {
    const out = tailByCodePoints("😀".repeat(10), 10, 7);
    expect(out.length).toBeLessThanOrEqual(7);
    expect(out).toBe("😀😀😀");
  });

  it("interviewSttPrompt cut inside an emoji yields no lone surrogate", () => {
    for (let pad = 0; pad < 2; pad++) {
      const out = interviewSttPrompt("Dev", "x".repeat(pad) + "😀".repeat(300));
      expect(hasLone(out)).toBe(false);
      expect(out.endsWith("😀")).toBe(true);
      expect(Array.from(out).length).toBeLessThanOrEqual(STT_PROMPT_MAX_CHARS);
    }
  });
});

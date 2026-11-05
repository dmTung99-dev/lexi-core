import { describe, expect, it } from "vitest";
import { buildPhraseEnrichPrompt, parseEnrichedPhrases, refineVocabRecord } from "./phraseEnrich";
import { InterviewAiError } from "./interviewPrompts";
import type { VocabRecord } from "./vocabRecords";
import type { Topic } from "./topics";

const ITEMS = [
  { text: " behind schedule ", meaning: "chậm tiến độ", example: "We're behind schedule." },
  { text: "walk you through", meaning: "hướng dẫn từng bước", example: "" },
];

const TOPICS = [
  { id: "t-business", name: "Business" },
  { id: "t-other", name: "Other" },
] as Topic[];

function entry(patch: Record<string, unknown> = {}) {
  return {
    headword: "Behind Schedule!",
    ipa: "/bɪˈhaɪnd ˈʃedʒuːl/",
    meaning: "trễ so với kế hoạch",
    definition: "later than planned",
    synonyms: ["late", "delayed"],
    examples: ["The project is behind schedule.", "We're behind schedule."],
    suggestedTopics: ["Business"],
    cefrLevel: "B2",
    ...patch,
  };
}

describe("buildPhraseEnrichPrompt", () => {
  it("lists every phrase with its context and asks for one entry per phrase in order", () => {
    const p = buildPhraseEnrichPrompt(ITEMS);
    expect(p).toContain('1. "behind schedule"');
    expect(p).toContain("chậm tiến độ");
    expect(p).toContain("We're behind schedule.");
    expect(p).toContain('2. "walk you through"');
    expect(p).toContain('"entries"');
    expect(p).toContain("same order");
    expect(p).toContain("exactly as given");
    expect(p).toContain('"cefrLevel"');
    expect(p).toContain('"suggestedTopics"');
  });

  it("defaults to English and follows the vocab record's language when given", () => {
    expect(buildPhraseEnrichPrompt(ITEMS)).toContain("learn English");
    expect(buildPhraseEnrichPrompt(ITEMS, "korean")).toContain("learn 한국어");
  });
});

describe("parseEnrichedPhrases", () => {
  it("returns one full result per phrase, keeping the phrase text and its own example first", () => {
    const raw = JSON.stringify({ entries: [entry(), entry({ headword: "x", examples: [], cefrLevel: "c9" })] });
    const [a, b] = parseEnrichedPhrases(raw, ITEMS);
    expect(a).toEqual({
      kind: "wordPhrase",
      headword: "behind schedule",
      inputType: "phrase",
      ipa: "/bɪˈhaɪnd ˈʃedʒuːl/",
      meaning: "trễ so với kế hoạch",
      definition: "later than planned",
      synonyms: ["late", "delayed"],
      examples: ["We're behind schedule.", "The project is behind schedule."],
      suggestedTopics: ["Business"],
      cefrLevel: "b2",
    });
    expect(b.headword).toBe("walk you through");
    expect(b.examples).toEqual([]);
    expect(b.cefrLevel).toBeNull();
  });

  it("falls back to the phrase's own meaning and example when the AI leaves an entry out", () => {
    const [, b] = parseEnrichedPhrases(JSON.stringify({ entries: [entry()] }), [ITEMS[0], { ...ITEMS[1], example: "Let me walk you through it." }]);
    expect(b).toMatchObject({ headword: "walk you through", meaning: "hướng dẫn từng bước", ipa: "", examples: ["Let me walk you through it."] });
  });

  it("marks a single word as a word", () => {
    const [r] = parseEnrichedPhrases(JSON.stringify({ entries: [entry()] }), [{ text: "deadline", meaning: "hạn chót", example: "" }]);
    expect(r.inputType).toBe("word");
  });

  it("throws an InterviewAiError on invalid JSON or no entries", () => {
    expect(() => parseEnrichedPhrases("not json", ITEMS)).toThrow(InterviewAiError);
    expect(() => parseEnrichedPhrases(JSON.stringify({ entries: [] }), ITEMS)).toThrow(InterviewAiError);
  });
});

describe("refineVocabRecord", () => {
  const RECORD: VocabRecord = {
    id: "r1",
    headword: "Behind schedule",
    inputType: "phrase",
    ipa: "",
    meaning: "chậm tiến độ",
    examples: ["We're behind schedule."],
    personalNotes: "Từ luyện Hội thoại tiếng Anh",
    topicIds: [],
    targetLanguage: "english",
    cefrLevel: "b1",
    activeContext: "general",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    nextReviewAt: "2026-11-10T00:00:00.000Z",
    sm2Repetitions: 2,
    sm2EaseFactor: 2.36,
    sm2Interval: 6,
    definition: "",
    synonyms: [],
  };
  const [result] = parseEnrichedPhrases(JSON.stringify({ entries: [entry()] }), [ITEMS[0]]);

  it("replaces the dictionary fields and keeps id, review schedule, dates and notes", () => {
    const out = refineVocabRecord(RECORD, result, TOPICS);
    expect(out).toMatchObject({
      id: "r1",
      headword: "Behind schedule",
      ipa: "/bɪˈhaɪnd ˈʃedʒuːl/",
      meaning: "trễ so với kế hoạch",
      definition: "later than planned",
      synonyms: ["late", "delayed"],
      cefrLevel: "b2",
      personalNotes: "Từ luyện Hội thoại tiếng Anh",
      createdAt: RECORD.createdAt,
      nextReviewAt: RECORD.nextReviewAt,
      sm2Repetitions: 2,
      sm2EaseFactor: 2.36,
      sm2Interval: 6,
    });
  });

  it("keeps old examples first and appends new ones without duplicates", () => {
    expect(refineVocabRecord(RECORD, result, TOPICS).examples).toEqual(["We're behind schedule.", "The project is behind schedule."]);
  });

  it("uses suggested topics only when the record has none, and keeps the old CEFR level when the AI gives none", () => {
    expect(refineVocabRecord(RECORD, result, TOPICS).topicIds).toEqual(["t-business"]);
    expect(refineVocabRecord({ ...RECORD, topicIds: ["mine"] }, result, TOPICS).topicIds).toEqual(["mine"]);
    expect(refineVocabRecord(RECORD, { ...result, cefrLevel: null }, TOPICS).cefrLevel).toBe("b1");
  });
});

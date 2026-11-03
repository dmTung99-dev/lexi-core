import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVocabRecordByHeadword, saveVocabRecord } from "./vocabRecords";
import { isPhraseSaved, phraseHeadword, savePhraseToVocab } from "./savePhraseToVocab";

vi.mock("./vocabRecords", () => ({ getVocabRecordByHeadword: vi.fn(), saveVocabRecord: vi.fn() }));
vi.mock("./vocabDisplay", () => ({ capitalizeHeadword: (s: string) => s.charAt(0).toUpperCase() + s.slice(1) }));

const PHRASE = { text: " behind schedule ", meaning: "chậm tiến độ", example: "We're behind schedule." };

beforeEach(() => vi.clearAllMocks());

describe("savePhraseToVocab", () => {
  it("builds the headword by trimming and capitalizing", () => {
    expect(phraseHeadword(" behind schedule ")).toBe("Behind schedule");
  });

  it("creates an English phrase record with the given level and note", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValueOnce(null);
    await savePhraseToVocab("u1", PHRASE, { level: "B2", note: "Từ Chuẩn bị tình huống" });
    expect(getVocabRecordByHeadword).toHaveBeenCalledWith("u1", "Behind schedule", "english");
    expect(saveVocabRecord).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        headword: "Behind schedule",
        inputType: "phrase",
        meaning: "chậm tiến độ",
        examples: ["We're behind schedule."],
        personalNotes: "Từ Chuẩn bị tình huống",
        targetLanguage: "english",
        cefrLevel: "b2",
        nextReviewAt: null,
      })
    );
  });

  it("stores no example when the phrase has none", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValueOnce(null);
    await savePhraseToVocab("u1", { ...PHRASE, example: "" }, { level: "B1", note: "n" });
    expect(saveVocabRecord).toHaveBeenCalledWith("u1", expect.objectContaining({ examples: [] }));
  });

  it("skips the write when the headword already exists", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValueOnce({ id: "v1" } as never);
    await savePhraseToVocab("u1", PHRASE, { level: "B1", note: "n" });
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });

  it("reports whether a phrase is already saved", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValueOnce({ id: "v1" } as never);
    await expect(isPhraseSaved("u1", "behind schedule")).resolves.toBe(true);
    vi.mocked(getVocabRecordByHeadword).mockResolvedValueOnce(null);
    await expect(isPhraseSaved("u1", "x")).resolves.toBe(false);
  });
});

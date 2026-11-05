import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhraseSaveBar, usePhraseVocabSaver, type PhraseSaverOptions } from "./PhraseVocabSaver";
import { enrichPhrases, type PhraseSource } from "@/lib/phraseEnrich";
import { getVocabRecordByHeadword, saveVocabRecord } from "@/lib/vocabRecords";
import { getTopics } from "@/lib/topics";
import { savePhraseToVocab } from "@/lib/savePhraseToVocab";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { WordPhraseResult } from "@/lib/lookup";

vi.mock("@/lib/phraseEnrich", () => ({ enrichPhrases: vi.fn() }));
vi.mock("@/lib/vocabRecords", () => ({ getVocabRecordByHeadword: vi.fn(), saveVocabRecord: vi.fn() }));
vi.mock("@/lib/topics", () => ({ getTopics: vi.fn() }));
vi.mock("@/lib/savePhraseToVocab", () => ({ savePhraseToVocab: vi.fn() }));
vi.mock("@/components/shared/PronunciationButton", () => ({ PronunciationButton: () => null }));

const ITEMS: PhraseSource[] = [
  { text: "behind schedule", meaning: "chậm tiến độ", example: "We're behind schedule." },
  { text: "walk you through", meaning: "hướng dẫn", example: "" },
  { text: "on track", meaning: "đúng tiến độ", example: "" },
];

function result(text: string): WordPhraseResult {
  return {
    kind: "wordPhrase", headword: text, inputType: "phrase", ipa: "/x/", meaning: `nghĩa ${text}`,
    definition: "def", synonyms: ["s"], examples: ["ex"], suggestedTopics: ["Business"], cefrLevel: "b2",
  };
}

const OPTS: PhraseSaverOptions = { uid: "u1", settings: DEFAULT_SETTINGS, level: "B1", note: "Từ luyện Hội thoại tiếng Anh" };

function Harness({ items = ITEMS, opts = OPTS }: { items?: PhraseSource[]; opts?: PhraseSaverOptions }) {
  const saver = usePhraseVocabSaver(opts);
  return (
    <div>
      {items.map((it) => (
        <button key={it.text} onClick={() => void saver.saveOne(it)}>
          {saver.saved.has(it.text) ? `${it.text} đã lưu` : `lưu ${it.text}`}
        </button>
      ))}
      <PhraseSaveBar saver={saver} items={items} />
      {saver.modal}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTopics).mockResolvedValue([{ id: "t-business", name: "Business" }] as never);
  vi.mocked(getVocabRecordByHeadword).mockResolvedValue(null);
  vi.mocked(saveVocabRecord).mockResolvedValue("new-id");
  vi.mocked(enrichPhrases).mockImplementation(async (_s, items) => items.map((i) => result(i.text)));
});

describe("usePhraseVocabSaver — save one", () => {
  it("looks the phrase up, opens the edit modal with the full entry, and saves it with the note", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "lưu behind schedule" }));
    expect(await screen.findByDisplayValue("nghĩa behind schedule")).toBeInTheDocument();
    expect(enrichPhrases).toHaveBeenCalledWith(DEFAULT_SETTINGS, [ITEMS[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saveVocabRecord).toHaveBeenCalled());
    expect(saveVocabRecord).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        headword: "Behind schedule", ipa: "/x/", definition: "def", synonyms: ["s"], cefrLevel: "b2",
        topicIds: ["t-business"], personalNotes: "Từ luyện Hội thoại tiếng Anh", targetLanguage: "english", activeContext: "general",
      })
    );
    expect(await screen.findByRole("button", { name: "behind schedule đã lưu" })).toBeInTheDocument();
  });

  it("does not create a duplicate when the headword already exists", async () => {
    vi.mocked(getVocabRecordByHeadword).mockResolvedValue({ id: "old" } as never);
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "lưu behind schedule" }));
    expect(await screen.findByRole("button", { name: "behind schedule đã lưu" })).toBeInTheDocument();
    expect(enrichPhrases).not.toHaveBeenCalled();
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });

  it("on a lookup failure shows an error and offers a basic save", async () => {
    vi.mocked(enrichPhrases).mockRejectedValueOnce(new Error("quota"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "lưu behind schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tra được");
    fireEvent.click(screen.getByRole("button", { name: "Lưu bản cơ bản" }));
    await waitFor(() => expect(savePhraseToVocab).toHaveBeenCalledWith("u1", ITEMS[0], { level: "B1", note: "Từ luyện Hội thoại tiếng Anh" }));
    expect(await screen.findByRole("button", { name: "behind schedule đã lưu" })).toBeInTheDocument();
  });
});

describe("PhraseSaveBar — save all", () => {
  it("is hidden with fewer than 3 unsaved phrases", () => {
    render(<Harness items={ITEMS.slice(0, 2)} />);
    expect(screen.queryByRole("button", { name: /Lưu tất cả/ })).not.toBeInTheDocument();
  });

  it("looks every unsaved phrase up in one call and saves them all without a modal", async () => {
    vi.mocked(getVocabRecordByHeadword).mockImplementation(async (_u, h) => (h === "On track" ? ({ id: "x" } as never) : null));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Lưu tất cả (3)" }));
    expect(await screen.findByText("Đã lưu 2/3 từ (1 từ đã có sẵn).")).toBeInTheDocument();
    expect(enrichPhrases).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enrichPhrases).mock.calls[0][1]).toHaveLength(3);
    expect(saveVocabRecord).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "on track đã lưu" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a lookup failure for save all without saving anything", async () => {
    vi.mocked(enrichPhrases).mockRejectedValueOnce(new Error("quota"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Lưu tất cả (3)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tra được");
    expect(saveVocabRecord).not.toHaveBeenCalled();
  });
});

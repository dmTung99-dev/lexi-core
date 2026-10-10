import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CorrectionList } from "./CorrectionList";
import { RecurringMistakes } from "./RecurringMistakes";
import { clearRecordings, saveRecordings } from "@/lib/recordedAudioStore";

describe("CorrectionList", () => {
  it("renders the word diff and the Vietnamese note per correction", () => {
    render(<CorrectionList items={[{ messageIndex: 1, said: "I go to Da Nang", corrected: "I went to Da Nang", note: "Dùng quá khứ." }]} />);
    expect(screen.getByText("go")).toBeInTheDocument(); // removed word
    expect(screen.getByText("went")).toBeInTheDocument(); // added word
    expect(screen.getByText("Dùng quá khứ.")).toBeInTheDocument();
  });
  it("shows an empty state", () => {
    render(<CorrectionList items={[]} />);
    expect(screen.getByText("Không có câu nào cần sửa.")).toBeInTheDocument();
  });
  it("offers 'Nghe lại giọng tôi' for corrections whose message has a recording", () => {
    saveRecordings("conversation:s1:1", [new Blob(["a"])]);
    try {
      render(
        <CorrectionList
          items={[
            { messageIndex: 1, said: "I go", corrected: "I went", note: "" },
            { messageIndex: 3, said: "He go", corrected: "He went", note: "" },
          ]}
          recordingKeyFor={(i) => `conversation:s1:${i}`}
        />
      );
      expect(screen.getAllByRole("button", { name: "Nghe lại giọng tôi" })).toHaveLength(1);
    } finally {
      clearRecordings("");
    }
  });
});

describe("RecurringMistakes", () => {
  it("lists patterns with said → better examples, or renders nothing when empty", () => {
    const { container, rerender } = render(<RecurringMistakes items={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RecurringMistakes items={[{ pattern: "Quên chia quá khứ", examples: [{ said: "I go", better: "I went" }] }]} />);
    expect(screen.getByText("Quên chia quá khứ")).toBeInTheDocument();
    expect(screen.getByText("I go")).toBeInTheDocument();
    expect(screen.getByText("I went")).toBeInTheDocument();
  });
});

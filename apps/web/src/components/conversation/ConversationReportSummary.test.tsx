import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationReportSummary } from "./ConversationReportSummary";
import type { ConversationReport } from "@/lib/conversationTypes";

const REPORT: ConversationReport = {
  overall: 7.2,
  criteria: { grammar: 6.5, vocabulary: 7.5, fluency: 7, coherence: 8 },
  criteriaNotes: { grammar: "Chú ý thì quá khứ.", vocabulary: "", fluency: "", coherence: "" },
  recurringMistakes: [], corrections: [], phrases: [],
};

describe("ConversationReportSummary", () => {
  it("shows the overall score, each criterion and its note", () => {
    render(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.getByText("7.2")).toBeInTheDocument();
    expect(screen.getByText("Ngữ pháp")).toBeInTheDocument();
    expect(screen.getByText("6.5")).toBeInTheDocument();
    expect(screen.getByText("Chú ý thì quá khứ.")).toBeInTheDocument();
    expect(screen.getByText(/không chấm phát âm/i)).toBeInTheDocument();
  });
  it("shows the delta only when given, with its sign", () => {
    const { rerender } = render(<ConversationReportSummary report={REPORT} delta={0.4} />);
    expect(screen.getByText("+0.4 so với buổi trước")).toBeInTheDocument();
    rerender(<ConversationReportSummary report={REPORT} delta={-1} />);
    expect(screen.getByText("-1 so với buổi trước")).toBeInTheDocument();
    rerender(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.queryByText(/so với buổi trước/)).not.toBeInTheDocument();
  });
  it("shows the goal result only for role-play reports", () => {
    const { rerender } = render(<ConversationReportSummary report={REPORT} delta={null} />);
    expect(screen.queryByText("Kết quả mục tiêu")).not.toBeInTheDocument();
    rerender(<ConversationReportSummary report={{ ...REPORT, goalResult: { achieved: true, comment: "Đạt cả hai." } }} delta={null} />);
    expect(screen.getByText("Kết quả mục tiêu")).toBeInTheDocument();
    expect(screen.getByText("Đạt cả hai.")).toBeInTheDocument();
  });
});

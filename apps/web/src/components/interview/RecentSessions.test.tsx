import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentSessions } from "./RecentSessions";
import type { InterviewSession } from "@/lib/interviewTypes";

const SESSION: InterviewSession = {
  id: "s1",
  createdAt: "2026-09-25T10:00:00.000Z",
  status: "completed",
  setup: { role: "Software Engineer", level: "junior", type: "behavioral", questionCount: 5, voice: "male2", jd: "", cvSummary: null, reviewTranscript: true },
  plan: ["a", "b", "c", "d", "e"],
  turns: [],
  report: {
    overall: 7.2,
    criteria: { content: 7, structure: 7, grammar: 7, vocabulary: 7, fluency: 7 },
    criteriaNotes: { content: "", structure: "", grammar: "", vocabulary: "", fluency: "" },
    improvements: [],
    questions: [],
  },
  reportError: false,
};

describe("RecentSessions", () => {
  it("links each session to its report with its score", () => {
    render(<RecentSessions sessions={[SESSION]} />);
    const link = screen.getByRole("link", { name: /Software Engineer · Behavioral/ });
    expect(link).toHaveAttribute("href", "/interview/s1/report");
    expect(link).toHaveTextContent("7.2");
    expect(link).toHaveTextContent("25/09 · 5 câu");
  });

  it("shows a dash when a session has no report", () => {
    render(<RecentSessions sessions={[{ ...SESSION, report: null, reportError: true }]} />);
    expect(screen.getByRole("link")).toHaveTextContent("—");
  });

  it("shows an empty state", () => {
    render(<RecentSessions sessions={[]} />);
    expect(screen.getByText("Chưa có buổi nào.")).toBeInTheDocument();
  });
});

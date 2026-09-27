export type InterviewLevel = "intern" | "junior" | "mid" | "senior";
export type InterviewType = "behavioral" | "technical" | "hr" | "mixed";
export type InterviewVoice = "male1" | "male2" | "female1" | "female2";
export type QuestionCount = 5 | 8 | 10;

export const INTERVIEW_LEVELS: { id: InterviewLevel; label: string }[] = [
  { id: "intern", label: "Intern" },
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
];

export const INTERVIEW_TYPES: { id: InterviewType; label: string; sub: string }[] = [
  { id: "behavioral", label: "Behavioral", sub: "Kể tình huống thực tế, chấm theo STAR" },
  { id: "technical", label: "Technical", sub: "Giải thích kiến thức, dự án, thiết kế" },
  { id: "hr", label: "HR & văn hóa", sub: "Giới thiệu bản thân, mục tiêu, văn hóa" },
  { id: "mixed", label: "Hỗn hợp", sub: "Trộn cả ba như một vòng thật" },
];

export const QUESTION_COUNTS: QuestionCount[] = [5, 8, 10];

// Voice ids map to Piper models in services/tts-stt/app/tts.py.
export const INTERVIEW_VOICES: { id: InterviewVoice; label: string; sub: string }[] = [
  { id: "male2", label: "Nam 1", sub: "norman · trầm" },
  { id: "male1", label: "Nam 2", sub: "hfc_male · trẻ" },
  { id: "female1", label: "Nữ 1", sub: "lessac · rõ ràng" },
  { id: "female2", label: "Nữ 2", sub: "hfc_female · nhẹ" },
];

export interface InterviewSetup {
  role: string;
  level: InterviewLevel;
  type: InterviewType;
  questionCount: QuestionCount;
  voice: InterviewVoice;
  jd: string;
  cvSummary: string | null;
  reviewTranscript: boolean;
}

export interface InterviewTurn {
  mainIndex: number;
  kind: "main" | "follow_up";
  question: string;
  answer: string;
  skipped: boolean;
  answerSeconds: number;
}

export type CriterionKey = "content" | "structure" | "grammar" | "vocabulary" | "fluency";

export const CRITERIA: { key: CriterionKey; label: string }[] = [
  { key: "content", label: "Nội dung & ví dụ" },
  { key: "structure", label: "Cấu trúc (STAR)" },
  { key: "grammar", label: "Ngữ pháp" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "fluency", label: "Độ trôi chảy" },
];

export interface InterviewPhrase {
  text: string;     // English, verbatim from modelAnswer
  meaning: string;  // short Vietnamese meaning (saved as the vocab record's meaning)
}

export interface InterviewReportQuestion {
  mainIndex: number;
  score: number;
  corrected: string;
  strengths: string;
  gaps: string;
  modelAnswer: string;
  phrases: InterviewPhrase[];
}

export interface InterviewReport {
  overall: number;
  criteria: Record<CriterionKey, number>;
  criteriaNotes: Record<CriterionKey, string>;
  improvements: { title: string; detail: string }[];
  questions: InterviewReportQuestion[];
}

export interface InterviewSession {
  id: string;
  createdAt: string;
  status: "in_progress" | "completed";
  setup: InterviewSetup;
  plan: string[];
  turns: InterviewTurn[];
  report: InterviewReport | null;
  reportError: boolean;
}

export interface InterviewCvProfile {
  fileName: string;
  text: string;
  summary: string;
  topics: string[];
  updatedAt: string;
}

export const MAX_ANSWER_SECONDS = 180;
export const INTERVIEW_GREETING = "Hi, thanks for joining today. Let's get started.";
export const INTERVIEW_CLOSING =
  "That's all the questions I have. Thank you for your time — I'll put together your feedback now.";

/** The user's answer to a main question, joined across the main turn and its follow-up. */
export function combinedAnswer(turns: InterviewTurn[], mainIndex: number): string {
  return turns
    .filter((t) => t.mainIndex === mainIndex && !t.skipped)
    .map((t) => t.answer.trim())
    .filter((a) => a.length > 0)
    .join(" ");
}

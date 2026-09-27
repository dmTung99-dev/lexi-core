import type { ReactNode } from "react";
import {
  INTERVIEW_LEVELS,
  INTERVIEW_TYPES,
  INTERVIEW_VOICES,
  QUESTION_COUNTS,
  type InterviewSetup,
  type InterviewVoice,
} from "@/lib/interviewTypes";

export type SetupDraft = Omit<InterviewSetup, "cvSummary">;

export const DEFAULT_SETUP_DRAFT: SetupDraft = {
  role: "",
  level: "junior",
  type: "behavioral",
  questionCount: 5,
  voice: "male2",
  jd: "",
  reviewTranscript: true,
};

export interface SetupFormProps {
  value: SetupDraft;
  onChange(next: SetupDraft): void;
  onPreviewVoice(voice: InterviewVoice): void;
  cvSlot: ReactNode;
}

export function SetupForm({ value, onChange, onPreviewVoice, cvSlot }: SetupFormProps) {
  const set = <K extends keyof SetupDraft>(key: K, v: SetupDraft[K]) => onChange({ ...value, [key]: v });
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");

  return (
    <div className="iv-form">
      <div className="iv-form-row">
        <div className="iv-field iv-grow">
          <label htmlFor="iv-role" className="iv-label">Vị trí ứng tuyển</label>
          <input id="iv-role" className="iv-input" type="text" placeholder="VD: Software Engineer" value={value.role} onChange={(e) => set("role", e.target.value)} />
        </div>
        <div className="iv-field">
          <span className="iv-label">Cấp độ</span>
          <div className="iv-row">
            {INTERVIEW_LEVELS.map((l) => (
              <button key={l.id} type="button" className={chip(value.level === l.id)} aria-pressed={value.level === l.id} onClick={() => set("level", l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Loại phỏng vấn</span>
        <div className="iv-type-grid">
          {INTERVIEW_TYPES.map((t) => (
            <button key={t.id} type="button" className={value.type === t.id ? "iv-type-card active" : "iv-type-card"} aria-pressed={value.type === t.id} onClick={() => set("type", t.id)}>
              <strong>{t.label}</strong>
              <span className="iv-muted">{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Số câu hỏi</span>
        <div className="iv-row">
          {QUESTION_COUNTS.map((n) => (
            <button key={n} type="button" className={chip(value.questionCount === n)} aria-pressed={value.questionCount === n} onClick={() => set("questionCount", n)}>
              {`${n} câu`}
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Giọng người phỏng vấn</span>
        <div className="iv-voice-grid">
          {INTERVIEW_VOICES.map((v) => (
            <div key={v.id} className={value.voice === v.id ? "iv-voice active" : "iv-voice"}>
              <button type="button" className="iv-voice-pick" aria-pressed={value.voice === v.id} onClick={() => set("voice", v.id)}>
                <strong>{v.label}</strong>
                <span className="iv-muted">{v.sub}</span>
              </button>
              <button type="button" className="iv-icon-btn" aria-label="Nghe thử giọng" onClick={() => onPreviewVoice(v.id)}>▶</button>
            </div>
          ))}
        </div>
      </div>

      <div className="iv-docs">
        <div className="iv-field">
          <span className="iv-label">CV của bạn <span className="iv-muted">(không bắt buộc)</span></span>
          {cvSlot}
        </div>
        <div className="iv-field">
          <label htmlFor="iv-jd" className="iv-label">Mô tả công việc <span className="iv-muted">(không bắt buộc)</span></label>
          <textarea id="iv-jd" className="iv-input iv-jd" placeholder="Dán JD tiếng Anh vào đây…" value={value.jd} onChange={(e) => set("jd", e.target.value)} />
        </div>
      </div>

      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.reviewTranscript} onChange={(e) => set("reviewTranscript", e.target.checked)} />
        Xem lại bản chép lời trước khi gửi
      </label>
    </div>
  );
}

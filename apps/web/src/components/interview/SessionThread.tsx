import type { InterviewTurn } from "@/lib/interviewTypes";

export interface SessionThreadProps {
  turns: InterviewTurn[];
  question: string;
  kind: "main" | "follow_up";
  showQuestion: boolean;
  translation: string | null;
  translating: boolean;
  onReplay(): void;
  onTranslate(): void;
  replayDisabled: boolean;
}

export function SessionThread(props: SessionThreadProps) {
  return (
    <section className="iv-thread" aria-label="Hội thoại">
      {props.turns.map((t, i) => (
        <div key={i} className="iv-exchange">
          <div className="iv-bubble iv-bubble-ai">
            <span className="iv-avatar" aria-hidden="true">AI</span>
            <p>{t.question}</p>
          </div>
          <p className="iv-bubble iv-bubble-me">{t.skipped ? "(Đã bỏ qua)" : t.answer}</p>
        </div>
      ))}
      {props.showQuestion && (
        <div className="iv-bubble iv-bubble-ai">
          <span className="iv-avatar" aria-hidden="true">AI</span>
          <div className="iv-current">
            <span className="iv-current-label">{props.kind === "main" ? "Câu hỏi hiện tại" : "Câu hỏi thêm"}</span>
            <p className="iv-current-text">{props.question}</p>
            {props.translation && <p className="iv-muted">{props.translation}</p>}
            <div className="iv-row">
              <button type="button" className="btn-secondary" disabled={props.replayDisabled} onClick={props.onReplay}>Nghe lại</button>
              <button type="button" className="btn-secondary" disabled={props.translating} onClick={props.onTranslate}>Dịch sang tiếng Việt</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

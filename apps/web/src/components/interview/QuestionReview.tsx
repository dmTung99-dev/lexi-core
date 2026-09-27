import type { InterviewPhrase, InterviewReportQuestion } from "@/lib/interviewTypes";
import { WordDiff } from "./WordDiff";

export function sentenceContaining(text: string, phrase: string): string {
  const needle = phrase.toLowerCase();
  return text.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(needle))?.trim() ?? "";
}

export interface QuestionReviewProps {
  number: number;
  question: string;
  answer: string;
  skipped: boolean;
  item: InterviewReportQuestion | undefined;
  expanded: boolean;
  onToggle(): void;
  onPlayModel(text: string): void;
  savedPhrases: Set<string>;
  onSavePhrase(phrase: InterviewPhrase, example: string): void;
}

export function QuestionReview(props: QuestionReviewProps) {
  const { item } = props;
  return (
    <div className={props.expanded ? "iv-qr iv-qr-open" : "iv-qr"}>
      <button type="button" className="iv-qr-head" aria-expanded={props.expanded} onClick={props.onToggle}>
        <span className="iv-qr-num">{props.number}</span>
        <span className="iv-qr-question">{props.question}</span>
        <span className="iv-qr-score">{item ? item.score.toFixed(1) : "—"}</span>
      </button>
      {props.expanded && (
        <div className="iv-qr-body">
          {props.skipped ? (
            <p className="iv-muted">(Đã bỏ qua)</p>
          ) : (
            <div className="iv-field">
              <span className="iv-caps">Câu trả lời của bạn · đã sửa</span>
              {item ? <WordDiff before={props.answer} after={item.corrected} /> : <p>{props.answer}</p>}
            </div>
          )}
          {!item && !props.skipped && <p className="iv-muted">Chưa có nhận xét cho câu này.</p>}
          {item && (
            <>
              <div className="iv-feedback-grid">
                <p className="iv-good"><b>Làm tốt:</b> {item.strengths}</p>
                <p className="iv-gap"><b>Thiếu:</b> {item.gaps}</p>
              </div>
              <div className="iv-model">
                <div className="iv-row iv-model-head">
                  <span className="iv-caps">Câu trả lời gợi ý</span>
                  <button type="button" className="btn-secondary" onClick={() => props.onPlayModel(item.modelAnswer)}>Nghe câu gợi ý</button>
                </div>
                <p>{item.modelAnswer}</p>
              </div>
              {item.phrases.length > 0 && (
                <div className="iv-row">
                  <span className="iv-label">Từ nên dùng:</span>
                  {item.phrases.map((p) => {
                    const saved = props.savedPhrases.has(p.text);
                    return (
                      <button
                        key={p.text}
                        type="button"
                        className={saved ? "iv-phrase iv-phrase-saved" : "iv-phrase"}
                        disabled={saved}
                        title={p.meaning}
                        onClick={() => props.onSavePhrase(p, sentenceContaining(item.modelAnswer, p.text))}
                      >
                        {saved ? `${p.text} ✓ đã lưu` : `${p.text} ＋`}
                      </button>
                    );
                  })}
                  <span className="iv-muted">→ lưu vào Ngân hàng từ vựng</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

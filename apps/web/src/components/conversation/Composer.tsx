import { formatClock } from "@/components/interview/SessionDock";
import { canSend, type ConversationState } from "@/lib/conversationMachine";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";
import { SuggestPanel } from "./SuggestPanel";

export interface ComposerProps {
  state: ConversationState;
  elapsed: number;
  micError: boolean;
  suggestions: string[] | null;
  suggesting: boolean;
  openingError?: string;
  onEditDraft(text: string): void;
  onSend(): void;
  onAddSegment(): void;
  onStart(): void;
  onStop(): void;
  onRetryTranscribe(): void;
  onSuggest(): void;
  onPickSuggestion(text: string): void;
  onCloseSuggestions(): void;
  onRetryReply(): void;
  onRetryOpening(): void;
  onSkipSpeech(): void;
  onCancelRecording(): void;
  onDismissSttError(): void;
}

const NOTICE_TEXT = {
  empty_transcript: "Không nghe thấy gì — thử nói gần micro hơn.",
  tts_failed: "Không phát được âm thanh — đọc tin nhắn ở trên hoặc bấm Nghe lại.",
} as const;

export function Composer(props: ComposerProps) {
  const { state, elapsed } = props;
  const canCompose = state.phase === "idle" || state.phase === "review";
  const sendable = canSend(state);

  return (
    <footer className="iv-dock cv-composer">
      {state.phase === "warming" &&
        (state.notice === "opening_failed" ? (
          <div className="iv-dock-row">
            <p className="iv-error" role="alert">{props.openingError ?? "Không bắt đầu được cuộc trò chuyện."}</p>
            <button type="button" className="btn-primary" onClick={props.onRetryOpening}>Thử lại</button>
          </div>
        ) : (
          <div className="iv-dock-status" role="status">
            <strong>Đang chuẩn bị cuộc trò chuyện…</strong>
            <span className="iv-muted">Lần đầu trong ngày có thể mất 10–20 giây.</span>
          </div>
        ))}

      {state.phase === "aiSpeaking" && (
        <div className="iv-dock-row">
          <div className="iv-dock-status" role="status"><strong>AI đang nói…</strong></div>
          <button type="button" className="btn-secondary" onClick={props.onSkipSpeech}>{state.final ? "Bỏ qua" : "Bỏ qua, trả lời luôn"}</button>
        </div>
      )}

      {canCompose && (
        <div className="iv-dock-col">
          {state.notice && state.notice !== "opening_failed" && <p className="iv-warn">{NOTICE_TEXT[state.notice]}</p>}
          {props.micError && <p className="iv-error" role="alert">Không dùng được micro — bạn vẫn có thể gõ câu trả lời.</p>}
          {state.phase === "review" && (
            <p className="iv-muted">
              Bản chép lời — sửa chỗ máy nghe nhầm, <span className="iv-warn-text">đừng sửa lỗi ngữ pháp của chính bạn</span>.
            </p>
          )}
          {state.segments.length > 0 && (
            <ul className="cv-segments" aria-label="Các đoạn đã thêm">
              {state.segments.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {props.suggestions && (
            <SuggestPanel options={props.suggestions} onPick={props.onPickSuggestion} onClose={props.onCloseSuggestions} />
          )}
          <div className="iv-row">
            <button type="button" className="cv-chip-btn" disabled={props.suggesting} onClick={props.onSuggest}>
              {props.suggesting ? "Đang nghĩ…" : "Gợi ý cách nói"}
            </button>
            <span className="iv-muted">Xem vài câu mẫu để trả lời, không tính vào điểm</span>
          </div>
          <div className="cv-input-row">
            <textarea
              className="iv-input cv-input"
              rows={2}
              aria-label="Câu trả lời của bạn"
              placeholder="Nói hoặc gõ câu trả lời của bạn…"
              value={state.draft}
              onChange={(e) => props.onEditDraft(e.target.value)}
            />
            <button
              type="button"
              className="iv-mic"
              aria-label={state.phase === "review" ? "Thu lại" : "Bắt đầu ghi âm"}
              title={state.phase === "review" ? "Thu lại (bản chép lời hiện tại sẽ bị bỏ)" : "Bắt đầu ghi âm"}
              onClick={props.onStart}
            >
              🎤
            </button>
            <button type="button" className="btn-secondary" disabled={!state.draft.trim()} onClick={props.onAddSegment}>+ Nói thêm</button>
            <button type="button" className="btn-primary" disabled={!sendable} onClick={props.onSend}>Gửi</button>
          </div>
        </div>
      )}

      {state.phase === "recording" && (
        <div className="iv-dock-row">
          <div className="iv-clock">
            <strong>{formatClock(elapsed)}</strong>
            <span className="iv-muted">{`tối đa ${formatClock(MAX_ANSWER_SECONDS)}`}</span>
          </div>
          <div className="iv-mic-wrap">
            <button type="button" className="iv-mic iv-mic-rec" aria-label="Dừng ghi âm" onClick={props.onStop}>■</button>
            <span className="iv-rec-text">Đang nghe bạn nói… bấm để dừng</span>
          </div>
          <button type="button" className="btn-secondary" onClick={props.onCancelRecording}>Hủy ghi âm</button>
        </div>
      )}

      {state.phase === "transcribing" && <p className="iv-dock-status" role="status">Đang chép lời…</p>}

      {state.phase === "sttError" && (
        <div className="iv-dock-col">
          <p className="iv-error" role="alert">Chép lời thất bại. Bản ghi của bạn vẫn còn.</p>
          <div className="iv-dock-row">
            <button type="button" className="btn-primary" onClick={props.onRetryTranscribe}>Thử lại</button>
            <button type="button" className="btn-secondary" onClick={props.onStart}>Thu lại</button>
            <button type="button" className="btn-secondary" onClick={props.onDismissSttError}>Gõ thay vì nói</button>
          </div>
        </div>
      )}

      {state.phase === "aiThinking" && <p className="iv-dock-status" role="status">AI đang suy nghĩ…</p>}

      {state.phase === "replyError" && (
        <div className="iv-dock-row">
          <p className="iv-error" role="alert">AI chưa trả lời được. Tin nhắn của bạn đã được lưu.</p>
          <button type="button" className="btn-primary" onClick={props.onRetryReply}>Thử lại</button>
        </div>
      )}

      {state.phase === "grading" && <p className="iv-dock-status" role="status">Đang chấm bài…</p>}
    </footer>
  );
}

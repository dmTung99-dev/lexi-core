import type { InterviewState } from "@/lib/interviewMachine";
import { PlayMyVoiceButton } from "@/components/PlayMyVoiceButton";
import { MAX_ANSWER_SECONDS } from "@/lib/interviewTypes";

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface SessionDockProps {
  state: InterviewState;
  elapsed: number;
  micError: boolean;
  onStart(): void;
  onStop(): void;
  onSend(): void;
  onEditDraft(text: string): void;
  onRetryTranscribe(): void;
  onSkip(): void;
  onSkipSpeech(): void;
  onReplay(): void;
  onRetryPlan(): void;
  planError?: string;
  /** The not-yet-sent recording (review / STT-failed), for "Nghe lại giọng tôi". */
  recording?: Blob | null;
}

const NOTICE_TEXT = {
  empty_transcript: "Không nghe thấy gì — thử nói gần micro hơn.",
  tts_failed: "Không phát được âm thanh — đọc câu hỏi ở trên hoặc bấm Nghe lại.",
} as const;

export function SessionDock(props: SessionDockProps) {
  const { state, elapsed, micError } = props;
  const listenBlobs = props.recording ? [props.recording] : [];
  return (
    <footer className="iv-dock">
      {state.phase === "warming" &&
        (state.notice === "plan_failed" ? (
          <div className="iv-dock-row">
            <p className="iv-error" role="alert">{props.planError ?? "Không tạo được câu hỏi phỏng vấn."}</p>
            <button type="button" className="btn-primary" onClick={props.onRetryPlan}>Thử lại</button>
          </div>
        ) : (
          <div className="iv-dock-status" role="status">
            <strong>Đang chuẩn bị người phỏng vấn…</strong>
            <span className="iv-muted">Lần đầu trong ngày có thể mất 10–20 giây.</span>
          </div>
        ))}

      {state.phase === "speaking" && (
        <div className="iv-dock-row">
          <div className="iv-dock-status" role="status">
            <strong>Người phỏng vấn đang hỏi…</strong>
            <span className="iv-muted">Nghe xong thì bấm micro để trả lời.</span>
          </div>
          <button type="button" className="btn-secondary" onClick={props.onSkipSpeech}>Bỏ qua, trả lời luôn</button>
        </div>
      )}

      {state.phase === "idle" && (
        <div className="iv-dock-col">
          {state.notice && state.notice !== "plan_failed" && <p className="iv-warn">{NOTICE_TEXT[state.notice]}</p>}
          {micError && <p className="iv-error" role="alert">Không dùng được micro — kiểm tra quyền micro của trình duyệt.</p>}
          <div className="iv-dock-row">
            <button type="button" className="btn-secondary" onClick={props.onReplay}>Nghe lại câu hỏi</button>
            <div className="iv-mic-wrap">
              <button type="button" className="iv-mic" aria-label="Bắt đầu trả lời" onClick={props.onStart}>🎤</button>
              <span className="iv-muted">Bấm để trả lời</span>
            </div>
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
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
          <span className="iv-clock" aria-hidden="true" />
        </div>
      )}

      {state.phase === "transcribing" && <p className="iv-dock-status" role="status">Đang chép lời…</p>}

      {state.phase === "sttError" && (
        <div className="iv-dock-col">
          <p className="iv-error" role="alert">Chép lời thất bại. Bản ghi của bạn vẫn còn.</p>
          <div className="iv-dock-row">
            <button type="button" className="btn-primary" onClick={props.onRetryTranscribe}>Thử lại</button>
            <button type="button" className="btn-secondary" onClick={props.onStart}>Thu lại</button>
            <PlayMyVoiceButton blobs={listenBlobs} className="btn-secondary" />
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
          </div>
        </div>
      )}

      {state.phase === "review" && (
        <div className="iv-dock-review">
          <div className="iv-field iv-grow">
            <label htmlFor="iv-draft" className="iv-label">
              Bản chép lời — sửa chỗ máy nghe nhầm, <span className="iv-warn-text">đừng sửa lỗi ngữ pháp của chính bạn</span>
            </label>
            <textarea id="iv-draft" className="iv-input" rows={3} value={state.draft} onChange={(e) => props.onEditDraft(e.target.value)} />
          </div>
          <div className="iv-dock-actions">
            <button type="button" className="btn-primary" disabled={!state.draft.trim()} onClick={props.onSend}>Gửi câu trả lời</button>
            <button type="button" className="btn-secondary" onClick={props.onStart}>Thu lại</button>
            <PlayMyVoiceButton blobs={listenBlobs} className="btn-secondary" />
            <button type="button" className="btn-secondary" onClick={props.onSkip}>Bỏ qua câu này</button>
          </div>
        </div>
      )}

      {state.phase === "processing" && <p className="iv-dock-status" role="status">Người phỏng vấn đang suy nghĩ…</p>}
      {state.phase === "closing" && <p className="iv-dock-status" role="status">Người phỏng vấn đang kết thúc buổi…</p>}
      {state.phase === "grading" && <p className="iv-dock-status" role="status">Đang chấm bài…</p>}
    </footer>
  );
}

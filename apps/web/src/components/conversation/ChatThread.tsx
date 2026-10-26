import type { ReactNode } from "react";
import type { ConversationMessage } from "@/lib/conversationTypes";
import { PlayMyVoiceButton } from "@/components/PlayMyVoiceButton";
import { hasRecordings } from "@/lib/recordedAudioStore";
import { useScrollToEnd } from "@/lib/useScrollToEnd";
import { HintBubble } from "./HintBubble";

export interface ChatThreadProps {
  messages: ConversationMessage[];
  thinking: boolean;
  hintLoadingIndex: number | null;
  translations: Record<number, string>;
  translatingIndex: number | null;
  canReplay: boolean;
  onReplay(index: number): void;
  onTranslate(index: number): void;
  onHint(index: number): void;
  /** Recording key for a user message (by index); enables "Nghe lại giọng tôi". */
  recordingKeyFor?: (index: number) => string;
  /** Rendered inside the thread after the messages (wrap-up chip, errors) so it scrolls with the conversation. */
  footer?: ReactNode;
}

export function ChatThread(props: ChatThreadProps) {
  const last = props.messages.length - 1;
  // Only changes to the LAST item (or new content) move the scroll, so tapping an older message never yanks the view.
  const endRef = useScrollToEnd([
    props.messages.length,
    props.thinking,
    Boolean(props.footer),
    Boolean(props.translations[last]),
    Boolean(props.messages[last]?.hint),
  ]);
  // The key of a user message's recording, or null when it has none (typed).
  const recordingKey = (i: number): string | null => {
    const key = props.recordingKeyFor?.(i);
    return key !== undefined && hasRecordings(key) ? key : null;
  };
  return (
    <div className="cv-thread" aria-live="polite">
      {props.messages.map((m, i) =>
        m.role === "ai" ? (
          <div key={i} className="cv-row cv-row-ai">
            <span className="cv-avatar" aria-hidden="true">AI</span>
            <div className="cv-col">
              <p className="cv-bubble cv-bubble-ai">{m.text}</p>
              {props.translations[i] && <p className="cv-translation">{props.translations[i]}</p>}
              <div className="cv-actions">
                <button type="button" className="cv-link" disabled={!props.canReplay} onClick={() => props.onReplay(i)}>Nghe lại</button>
                <button type="button" className="cv-link" disabled={props.translatingIndex === i} onClick={() => props.onTranslate(i)}>Dịch sang tiếng Việt</button>
              </div>
            </div>
          </div>
        ) : (
          <div key={i} className="cv-row cv-row-me">
            <div className="cv-col cv-col-me">
              <p className="cv-bubble cv-bubble-me">{m.text}</p>
              {m.hint && <HintBubble original={m.text} hint={m.hint} />}
              {(!m.hint || recordingKey(i)) && (
                <div className="cv-actions cv-actions-me">
                  {recordingKey(i) && <PlayMyVoiceButton recordingKey={recordingKey(i) as string} />}
                  {!m.hint && (
                    <button type="button" className="cv-link" disabled={props.hintLoadingIndex === i} onClick={() => props.onHint(i)}>Gợi ý sửa</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      )}
      {props.thinking && <p className="iv-muted" role="status">AI đang soạn câu trả lời…</p>}
      {props.footer}
      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}

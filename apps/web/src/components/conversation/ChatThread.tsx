import type { ConversationMessage } from "@/lib/conversationTypes";
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
}

export function ChatThread(props: ChatThreadProps) {
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
              {m.hint ? (
                <HintBubble original={m.text} hint={m.hint} />
              ) : (
                <div className="cv-actions cv-actions-me">
                  <button type="button" className="cv-link" disabled={props.hintLoadingIndex === i} onClick={() => props.onHint(i)}>Gợi ý sửa</button>
                </div>
              )}
            </div>
          </div>
        )
      )}
      {props.thinking && <p className="iv-muted" role="status">AI đang soạn câu trả lời…</p>}
    </div>
  );
}

import type { ConversationPhrase } from "@/lib/conversationTypes";
import { Spinner } from "@/components/shared/Spinner";
import { SpeakerIcon } from "./SpeakerIcon";

export interface PrepVocabListProps {
  items: ConversationPhrase[];
  saved: Set<string>;
  /** Text of the phrase whose save (AI lookup) is in flight. */
  savingText?: string | null;
  /** True while any save runs — other Lưu buttons wait their turn. */
  saveDisabled?: boolean;
  onSave(item: ConversationPhrase): void;
  onSpeak(text: string, key: string): void;
  /** Key of the speaker button whose audio is still loading. */
  speakingKey?: string | null;
}

export function PrepVocabList({
  items,
  saved,
  savingText = null,
  saveDisabled = false,
  onSave,
  onSpeak,
  speakingKey = null,
}: PrepVocabListProps) {
  return (
    <ul className="prep-vocab">
      {items.map((item, i) => {
        const speaking = speakingKey === `vocab-${i}`;
        const saving = savingText === item.text;
        return (
          <li key={`${item.text}-${i}`} className="prep-vocab-row">
            <div className="prep-vocab-main">
              <span className="prep-vocab-text">{item.text}</span>
              <span className="prep-vocab-meaning">{item.meaning}</span>
              {item.example && <span className="prep-vocab-example">{item.example}</span>}
            </div>
            <button
              type="button"
              className="prep-icon-btn"
              aria-label={`Nghe ${item.text}`}
              aria-busy={speaking}
              onClick={() => onSpeak(item.text, `vocab-${i}`)}
            >
              {speaking ? <Spinner /> : <SpeakerIcon />}
            </button>
            {saved.has(item.text) ? (
              <span className="prep-saved">Đã lưu</span>
            ) : (
              <button
                type="button"
                className="prep-save-btn"
                aria-label={`Lưu ${item.text}`}
                aria-busy={saving}
                disabled={saveDisabled}
                onClick={() => onSave(item)}
              >
                {saving && <Spinner inline />}
                Lưu
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

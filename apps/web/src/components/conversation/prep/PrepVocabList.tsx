import type { ConversationPhrase } from "@/lib/conversationTypes";
import { SpeakerIcon } from "./SpeakerIcon";

export interface PrepVocabListProps {
  items: ConversationPhrase[];
  saved: Set<string>;
  onSave(item: ConversationPhrase): void;
  onSpeak(text: string): void;
}

export function PrepVocabList({ items, saved, onSave, onSpeak }: PrepVocabListProps) {
  return (
    <ul className="prep-vocab">
      {items.map((item, i) => (
        <li key={`${item.text}-${i}`} className="prep-vocab-row">
          <div className="prep-vocab-main">
            <span className="prep-vocab-text">{item.text}</span>
            <span className="prep-vocab-meaning">{item.meaning}</span>
            {item.example && <span className="prep-vocab-example">{item.example}</span>}
          </div>
          <button type="button" className="prep-icon-btn" aria-label={`Nghe ${item.text}`} onClick={() => onSpeak(item.text)}>
            <SpeakerIcon />
          </button>
          {saved.has(item.text) ? (
            <span className="prep-saved">Đã lưu</span>
          ) : (
            <button type="button" className="prep-save-btn" aria-label={`Lưu ${item.text}`} onClick={() => onSave(item)}>
              Lưu
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

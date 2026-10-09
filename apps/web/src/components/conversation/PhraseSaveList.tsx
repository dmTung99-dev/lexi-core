import type { ConversationPhrase } from "@/lib/conversationTypes";

export interface PhraseSaveListProps {
  phrases: ConversationPhrase[];
  saved: Set<string>;
  onSave(phrase: ConversationPhrase): void;
}

export function PhraseSaveList({ phrases, saved, onSave }: PhraseSaveListProps) {
  if (phrases.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Cụm nên học">
      <h3 className="iv-card-title">Cụm nên học</h3>
      <div className="iv-row">
        {phrases.map((p) => {
          const isSaved = saved.has(p.text);
          return (
            <button
              key={p.text}
              type="button"
              className={isSaved ? "iv-phrase iv-phrase-saved" : "iv-phrase"}
              disabled={isSaved}
              title={p.meaning}
              onClick={() => onSave(p)}
            >
              {isSaved ? `${p.text} ✓ đã lưu` : `${p.text} ＋`}
            </button>
          );
        })}
      </div>
      <p className="iv-muted">→ lưu vào Ngân hàng từ vựng</p>
    </section>
  );
}

import type { ConversationPhrase } from "@/lib/conversationTypes";
import { Spinner } from "@/components/shared/Spinner";

export interface PhraseSaveListProps {
  phrases: ConversationPhrase[];
  saved: Set<string>;
  /** Text of the phrase whose save is in flight. */
  savingText?: string | null;
  /** True while any save runs. */
  saveDisabled?: boolean;
  onSave(phrase: ConversationPhrase): void;
}

export function PhraseSaveList({ phrases, saved, savingText = null, saveDisabled = false, onSave }: PhraseSaveListProps) {
  if (phrases.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Cụm nên học">
      <h3 className="iv-card-title">Cụm nên học</h3>
      <div className="iv-row">
        {phrases.map((p, i) => {
          const isSaved = saved.has(p.text);
          const isSaving = savingText === p.text;
          return (
            <button
              key={`${p.text}-${i}`}
              type="button"
              className={isSaved ? "iv-phrase iv-phrase-saved" : "iv-phrase"}
              disabled={isSaved || saveDisabled}
              aria-busy={isSaving}
              title={p.meaning}
              onClick={() => onSave(p)}
            >
              {isSaving && <Spinner inline />}
              {isSaved ? `${p.text} ✓ đã lưu` : `${p.text} ＋`}
            </button>
          );
        })}
      </div>
      <p className="iv-muted">→ lưu vào Ngân hàng từ vựng</p>
    </section>
  );
}

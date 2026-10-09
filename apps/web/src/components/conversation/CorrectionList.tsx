import type { ConversationCorrection } from "@/lib/conversationTypes";
import { WordDiff } from "@/components/interview/WordDiff";

export function CorrectionList({ items }: { items: ConversationCorrection[] }) {
  return (
    <section className="iv-card" aria-label="Câu đáng sửa">
      <h3 className="iv-card-title">Câu đáng sửa nhất</h3>
      {items.length === 0 && <p className="iv-muted">Không có câu nào cần sửa.</p>}
      {items.map((c) => (
        <div key={c.messageIndex} className="cv-hint">
          <WordDiff before={c.said} after={c.corrected} />
          {c.note && <p className="iv-muted">{c.note}</p>}
        </div>
      ))}
    </section>
  );
}

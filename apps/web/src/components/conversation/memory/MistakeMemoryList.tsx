import type { TrackedMistake } from "@/lib/learnerMemoryTypes";
import { mistakeStatus } from "@/lib/learnerMemoryMerge";
import { shortDate } from "@/components/interview/UnfinishedSessions";

export function MistakeMemoryList({ items, onDelete }: { items: TrackedMistake[]; onDelete: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card memory-section" aria-label="Lỗi hay mắc">
      <h3 className="iv-card-title">Lỗi hay mắc</h3>
      {items.map((m) => {
        const known = mistakeStatus(m) === "known";
        return (
          <div key={m.id} className="iv-recent-row memory-row">
            <span className="iv-recent-main memory-main">
              <span className="iv-recent-title">{m.pattern}</span>
              <span className="iv-muted">{m.rule}</span>
              <span className="memory-example">{`${m.example.said} → ${m.example.better}`}</span>
              <span className="memory-meta">
                <span className={known ? "vb-chip active" : "vb-chip"}>{known ? "Đã quen" : "Đang luyện"}</span>
                <span className="iv-muted">{`Nhắc lại: ${shortDate(m.nextReviewAt)}`}</span>
              </span>
            </span>
            <button
              type="button"
              className="btn-secondary memory-delete"
              aria-label={`Xoá lỗi ${m.pattern}`}
              onClick={() => {
                if (window.confirm("Xoá lỗi này khỏi bộ nhớ? AI sẽ không nhắc lại nữa.")) onDelete(m.id);
              }}
            >
              Xoá
            </button>
          </div>
        );
      })}
    </section>
  );
}

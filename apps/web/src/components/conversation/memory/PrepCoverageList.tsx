import type { CoveredItem, PrepCoverage } from "@/lib/learnerMemoryTypes";

function Rows({ items, kind, onDelete }: { items: CoveredItem[]; kind: "patterns" | "words"; onDelete(kind: "patterns" | "words", text: string): void }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.text} className="iv-recent-row memory-row">
          <span className="iv-recent-main memory-main">
            <span>{item.text}</span>
          </span>
          <button
            type="button"
            className="btn-secondary memory-delete"
            aria-label={`Xoá: ${item.text}`}
            onClick={() => {
              if (window.confirm("Xoá mục này? Bộ tài liệu sau có thể dạy lại nó.")) onDelete(kind, item.text);
            }}
          >
            Xoá
          </button>
        </div>
      ))}
    </>
  );
}

export function PrepCoverageList({ coverage, onDelete }: { coverage: PrepCoverage; onDelete(kind: "patterns" | "words", text: string): void }) {
  if (coverage.patterns.length === 0 && coverage.words.length === 0) return null;
  return (
    <section className="iv-card memory-section" aria-label="Chuẩn bị tình huống — đã học">
      <h3 className="iv-card-title">Chuẩn bị tình huống — đã học</h3>
      {coverage.patterns.length > 0 && (
        <div className="memory-group">
          <h4 className="memory-group-title">Mẫu câu đã học</h4>
          <Rows items={coverage.patterns} kind="patterns" onDelete={onDelete} />
        </div>
      )}
      {coverage.words.length > 0 && (
        <div className="memory-group">
          <h4 className="memory-group-title">Từ đã học</h4>
          <Rows items={coverage.words} kind="words" onDelete={onDelete} />
        </div>
      )}
    </section>
  );
}

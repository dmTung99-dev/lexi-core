"use client";

interface KnowledgeTagFilterModalProps {
  allTags: string[];
  selectedTags: Set<string>;
  onToggle: (tag: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function KnowledgeTagFilterModal({
  allTags,
  selectedTags,
  onToggle,
  onClearAll,
  onClose,
}: KnowledgeTagFilterModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Lọc theo thẻ" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <h3>Lọc theo thẻ</h3>
            {selectedTags.size > 0 && (
              <button type="button" className="link-btn" onClick={onClearAll}>
                Bỏ chọn hết
              </button>
            )}
          </div>
          <button className="closex" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="chip-row">
            {allTags.map((tag) => (
              <button
                type="button"
                key={tag}
                className={`vb-chip${selectedTags.has(tag) ? " active" : ""}`}
                onClick={() => onToggle(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="save-btn" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { TopicMemory } from "@/lib/learnerMemoryTypes";

export function TopicMemoryList({
  groups,
  onDeleteFact,
  onDeleteGroup,
  title = "Nội dung đã kể",
  groupHref,
}: {
  groups: TopicMemory[];
  title?: string;
  groupHref?: (key: string) => string | null;
  onDeleteFact: (key: string, factId: string) => void;
  onDeleteGroup: (key: string) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section className="iv-card memory-section" aria-label={title}>
      <h3 className="iv-card-title">{title}</h3>
      {groups.map((g) => (
        <div key={g.key} className="memory-group">
          <div className="iv-row memory-group-head">
            <h4 className="memory-group-title">
              {groupHref?.(g.key) ? <Link href={groupHref(g.key) as string}>{g.label}</Link> : g.label}
            </h4>
            <button
              type="button"
              className="btn-secondary memory-delete"
              aria-label={`Xoá cả nhóm ${g.label}`}
              onClick={() => {
                if (window.confirm(`Xoá toàn bộ nội dung đã kể về "${g.label}"?`)) onDeleteGroup(g.key);
              }}
            >
              Xoá nhóm
            </button>
          </div>
          {g.facts.map((f) => (
            <div key={f.id} className="iv-recent-row memory-row">
              <span className="iv-recent-main memory-main">
                <span>{f.fact}</span>
                {f.asked.length > 0 && <span className="iv-muted">{`AI đã hỏi: ${f.asked.join(", ")}`}</span>}
              </span>
              <button
                type="button"
                className="btn-secondary memory-delete"
                aria-label={`Xoá: ${f.fact}`}
                onClick={() => {
                  if (window.confirm("Xoá điều này khỏi bộ nhớ?")) onDeleteFact(g.key, f.id);
                }}
              >
                Xoá
              </button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

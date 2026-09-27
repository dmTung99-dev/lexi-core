import type { InterviewReport } from "@/lib/interviewTypes";

export function ImprovementList({ items }: { items: InterviewReport["improvements"] }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card" aria-label="Cần cải thiện">
      <h3 className="iv-card-title">{`${items.length} điều nên sửa trước buổi sau`}</h3>
      <div className="iv-improve-grid">
        {items.map((it) => (
          <div key={it.title} className="iv-improve">
            <strong>{it.title}</strong>
            <span className="iv-muted">{it.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

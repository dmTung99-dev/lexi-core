import Link from "next/link";
import type { ConversationPrep } from "@/lib/conversationPrepTypes";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RecentPreps({ preps, onDelete }: { preps: ConversationPrep[]; onDelete(id: string): void }) {
  return (
    <section className="iv-card" aria-label="Gần đây">
      <h3 className="iv-card-title">Gần đây</h3>
      {preps.length === 0 && <p className="iv-muted">Chưa có bộ tài liệu nào.</p>}
      {preps.map((p) => (
        <div key={p.id} className="prep-recent-row">
          <Link href={`/conversation/prep/${p.id}`} className="prep-recent-link">
            <span className="iv-recent-title">{p.title}</span>
            <span className="iv-muted">{`${p.level} · ${shortDate(p.createdAt)}`}</span>
          </Link>
          <button
            type="button"
            className="prep-delete-btn"
            aria-label={`Xoá ${p.title}`}
            onClick={() => {
              if (window.confirm("Xoá bộ tài liệu này?")) onDelete(p.id);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
          </button>
        </div>
      ))}
    </section>
  );
}

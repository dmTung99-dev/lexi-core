import Link from "next/link";

export interface UnfinishedItem {
  id: string;
  title: string;
  detail: string;
  href: string;
}

/** "Đang dở": sessions left mid-way, shared by the Interview and Conversation
 * setup pages. Renders nothing when there are none. */
export function UnfinishedSessions({ items, onDiscard }: { items: UnfinishedItem[]; onDiscard: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="iv-card iv-unfinished" aria-label="Đang dở">
      <h3 className="iv-card-title">Đang dở</h3>
      {items.map((item) => (
        <div key={item.id} className="iv-recent-row">
          <span className="iv-recent-main">
            <span className="iv-recent-title">{item.title}</span>
            <span className="iv-muted">{item.detail}</span>
          </span>
          <span className="iv-unfinished-actions">
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Bỏ ${item.title}`}
              onClick={() => {
                if (window.confirm("Bỏ buổi này? Những gì đã làm sẽ bị xoá.")) onDiscard(item.id);
              }}
            >
              Bỏ
            </button>
            <Link href={item.href} className="btn-primary" aria-label={`Tiếp tục ${item.title}`}>
              Tiếp tục
            </Link>
          </span>
        </div>
      ))}
    </section>
  );
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

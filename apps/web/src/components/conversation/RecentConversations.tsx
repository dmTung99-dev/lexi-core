import Link from "next/link";
import type { ConversationSession } from "@/lib/conversationTypes";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RecentConversations({ sessions }: { sessions: ConversationSession[] }) {
  return (
    <section className="iv-card" aria-label="Gần đây">
      <h3 className="iv-card-title">Gần đây</h3>
      {sessions.length === 0 && <p className="iv-muted">Chưa có buổi nào.</p>}
      {sessions.map((s) => (
        <Link key={s.id} href={`/conversation/${s.id}/report`} className="iv-recent-row">
          <span className="iv-recent-main">
            <span className="iv-recent-title">{`${s.setup.topic} · ${s.setup.level}`}</span>
            <span className="iv-muted">{`${shortDate(s.createdAt)} · ${s.setup.mode === "roleplay" ? "Nhập vai" : "Chủ đề tự do"}`}</span>
          </span>
          <span className="iv-recent-score">{s.report ? s.report.overall.toFixed(1) : "—"}</span>
        </Link>
      ))}
    </section>
  );
}

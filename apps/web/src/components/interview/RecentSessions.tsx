import Link from "next/link";
import { INTERVIEW_TYPES, type InterviewSession } from "@/lib/interviewTypes";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RecentSessions({ sessions }: { sessions: InterviewSession[] }) {
  return (
    <section className="iv-card" aria-label="Buổi gần đây">
      <h3 className="iv-card-title">Buổi gần đây</h3>
      {sessions.length === 0 && <p className="iv-muted">Chưa có buổi nào.</p>}
      {sessions.map((s) => {
        const typeLabel = INTERVIEW_TYPES.find((t) => t.id === s.setup.type)?.label ?? s.setup.type;
        return (
          <Link key={s.id} href={`/interview/${s.id}/report`} className="iv-recent-row">
            <span className="iv-recent-main">
              <span className="iv-recent-title">{`${s.setup.role} · ${typeLabel}`}</span>
              <span className="iv-muted">{`${shortDate(s.createdAt)} · ${s.plan.length} câu`}</span>
            </span>
            <span className="iv-recent-score">{s.report ? s.report.overall.toFixed(1) : "—"}</span>
          </Link>
        );
      })}
    </section>
  );
}

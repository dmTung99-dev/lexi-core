import { CRITERIA, type InterviewReport } from "@/lib/interviewTypes";

function tone(score: number): string {
  return score >= 7 ? "good" : score >= 6 ? "mid" : "low";
}

export function ScoreSummary({ report, delta }: { report: InterviewReport; delta: number | null }) {
  return (
    <section className="iv-score" aria-label="Tổng quan điểm">
      <div className="iv-card iv-score-total">
        <span className="iv-label">Điểm tổng</span>
        <span className={`iv-score-big iv-tone-${tone(report.overall)}`}>{report.overall.toFixed(1)}</span>
        <span className="iv-muted">/ 10</span>
        {delta !== null && (
          <span className="iv-delta">{`${delta >= 0 ? "+" : ""}${delta.toFixed(1)} so với buổi trước`}</span>
        )}
      </div>
      <div className="iv-card iv-score-criteria">
        <span className="iv-label">Theo tiêu chí</span>
        <div className="iv-criteria-grid">
          {CRITERIA.map(({ key, label }) => (
            <div key={key} className="iv-criterion">
              <div className="iv-row iv-criterion-head">
                <span>{label}</span>
                <strong>{report.criteria[key].toFixed(1)}</strong>
              </div>
              <div className="iv-bar"><div className={`iv-bar-fill iv-tone-bg-${tone(report.criteria[key])}`} style={{ width: `${report.criteria[key] * 10}%` }} /></div>
              <span className="iv-muted">{report.criteriaNotes[key]}</span>
            </div>
          ))}
        </div>
        <p className="iv-muted iv-pron-note">Phát âm chưa được chấm — hệ thống hiện chỉ chấm dựa trên bản chép lời.</p>
      </div>
    </section>
  );
}

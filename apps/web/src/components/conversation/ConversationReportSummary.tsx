import { CONVERSATION_CRITERIA, type ConversationReport } from "@/lib/conversationTypes";

export function ConversationReportSummary({ report, delta }: { report: ConversationReport; delta: number | null }) {
  return (
    <section className="iv-card cv-summary" aria-label="Điểm tổng">
      <div className="cv-overall">
        <span className="iv-caps">Điểm tổng</span>
        <strong className="cv-overall-score">{report.overall.toFixed(1)}</strong>
        {delta !== null && <span className="iv-muted">{`${delta > 0 ? "+" : ""}${delta} so với buổi trước`}</span>}
      </div>
      <div className="cv-criteria">
        {CONVERSATION_CRITERIA.map(({ key, label }) => (
          <div key={key} className="cv-criterion">
            <div className="iv-row cv-criterion-head">
              <span>{label}</span>
              <strong>{report.criteria[key].toFixed(1)}</strong>
            </div>
            <div className="cv-bar" aria-hidden="true"><span style={{ width: `${report.criteria[key] * 10}%` }} /></div>
            {report.criteriaNotes[key] && <p className="iv-muted">{report.criteriaNotes[key]}</p>}
          </div>
        ))}
      </div>
      {report.goalResult && (
        <div className="cv-goal-result">
          <span className="iv-caps">Kết quả mục tiêu</span>
          <strong>{report.goalResult.achieved ? "Đạt mục tiêu" : "Chưa đạt mục tiêu"}</strong>
          <p>{report.goalResult.comment}</p>
        </div>
      )}
      <p className="iv-muted">Không chấm phát âm: hệ thống chỉ nhận lại chữ bạn nói, không nghe được cách phát âm.</p>
    </section>
  );
}

export type InterviewerTone = "neutral" | "speaking" | "listening" | "thinking";

export function InterviewerCard({ statusText, tone }: { statusText: string; tone: InterviewerTone }) {
  return (
    <section className="iv-card iv-interviewer" aria-label="Người phỏng vấn">
      <span className="iv-avatar iv-avatar-lg" aria-hidden="true">AI</span>
      <div>
        <strong>Người phỏng vấn</strong>
        <p className={`iv-status iv-status-${tone}`}>{statusText}</p>
      </div>
    </section>
  );
}

export interface GoalChecklistProps {
  persona: string | null;
  goals: string[];
  goalsDone: number[];
}

export function GoalChecklist({ persona, goals, goalsDone }: GoalChecklistProps) {
  const done = goals.filter((_, i) => goalsDone.includes(i)).length;
  const pct = goals.length === 0 ? 0 : Math.round((done / goals.length) * 100);
  return (
    <section className="iv-card" aria-label="Mục tiêu">
      <h3 className="iv-card-title">Mục tiêu của bạn</h3>
      <ul className="cv-goals">
        {goals.map((g, i) => (
          <li key={i}>
            <span className={goalsDone.includes(i) ? "cv-goal-dot done" : "cv-goal-dot"} aria-hidden="true">{goalsDone.includes(i) ? "✓" : ""}</span>
            <span className={goalsDone.includes(i) ? "cv-goal-done" : undefined}>{g}</span>
          </li>
        ))}
      </ul>
      <div className="cv-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <p className="iv-muted">{`${done}/${goals.length} hoàn thành`}</p>
      {persona && (
        <>
          <h4 className="cv-persona-title">AI đóng vai</h4>
          <p className="iv-muted">{persona}</p>
        </>
      )}
    </section>
  );
}

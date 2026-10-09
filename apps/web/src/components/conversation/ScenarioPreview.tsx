export interface ScenarioPreviewProps {
  persona: string;
  goals: string[];
  onPersonaChange(persona: string): void;
  onGoalChange(index: number, goal: string): void;
}

export function ScenarioPreview({ persona, goals, onPersonaChange, onGoalChange }: ScenarioPreviewProps) {
  return (
    <section className="iv-card cv-preview" aria-label="Vai và mục tiêu">
      <h3 className="iv-card-title">AI dựng sẵn cho tình huống này (sửa được)</h3>
      <div className="iv-field">
        <label htmlFor="cv-persona" className="iv-label">AI đóng vai</label>
        <input id="cv-persona" className="iv-input" type="text" value={persona} onChange={(e) => onPersonaChange(e.target.value)} />
      </div>
      <div className="iv-field">
        <span className="iv-label">Mục tiêu của bạn</span>
        {goals.map((g, i) => (
          <input key={i} className="iv-input" type="text" aria-label={`Mục tiêu ${i + 1}`} value={g} onChange={(e) => onGoalChange(i, e.target.value)} />
        ))}
      </div>
    </section>
  );
}

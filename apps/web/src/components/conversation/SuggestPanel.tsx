export interface SuggestPanelProps {
  options: string[];
  onPick(text: string): void;
  onClose(): void;
}

export function SuggestPanel({ options, onPick, onClose }: SuggestPanelProps) {
  return (
    <div className="cv-suggest">
      <div className="iv-row">
        <span className="iv-caps">Bạn có thể nói</span>
        <button type="button" className="cv-link" onClick={onClose}>Đóng gợi ý</button>
      </div>
      {options.map((o, i) => (
        <button key={i} type="button" className="cv-suggest-option" onClick={() => onPick(o)}>{o}</button>
      ))}
    </div>
  );
}

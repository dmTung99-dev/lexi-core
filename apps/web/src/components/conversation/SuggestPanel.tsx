import { useState } from "react";
import type { ConversationSuggestion } from "@/lib/conversationTypes";
import { WhyList } from "./WhyList";

export interface SuggestPanelProps {
  options: ConversationSuggestion[];
  onPick(text: string): void;
  onClose(): void;
}

export function SuggestPanel({ options, onPick, onClose }: SuggestPanelProps) {
  // Closed by default so the learner can work out the "why" before peeking.
  const [open, setOpen] = useState<number[]>([]);
  return (
    <div className="cv-suggest">
      <div className="iv-row">
        <span className="iv-caps">Bạn có thể nói</span>
        <button type="button" className="cv-link" onClick={onClose}>Đóng gợi ý</button>
      </div>
      {options.map((o, i) => (
        <div key={i} className="cv-suggest-item">
          <button type="button" className="cv-suggest-option" onClick={() => onPick(o.text)}>{o.text}</button>
          {o.why.length > 0 && (
            <>
              <button
                type="button"
                className="cv-link cv-why-toggle"
                aria-expanded={open.includes(i)}
                onClick={() => setOpen((cur) => (cur.includes(i) ? cur.filter((n) => n !== i) : [...cur, i]))}
              >
                {open.includes(i) ? "Ẩn giải thích" : "Tại sao?"}
              </button>
              {open.includes(i) && <WhyList points={o.why} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

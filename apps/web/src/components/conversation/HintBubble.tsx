import type { ConversationHint } from "@/lib/conversationTypes";
import { WordDiff } from "@/components/interview/WordDiff";

export function HintBubble({ original, hint }: { original: string; hint: ConversationHint }) {
  return (
    <div className="cv-hint">
      <span className="iv-caps">Gợi ý sửa</span>
      <WordDiff before={original} after={hint.corrected} />
      <p className="iv-muted">{hint.note}</p>
      {hint.alternatives.length > 0 && (
        <ul className="cv-alts">
          {hint.alternatives.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

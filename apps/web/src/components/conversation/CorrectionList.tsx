import type { ConversationCorrection } from "@/lib/conversationTypes";
import { WordDiff } from "@/components/interview/WordDiff";
import { PlayMyVoiceButton } from "@/components/PlayMyVoiceButton";
import { hasRecordings } from "@/lib/recordedAudioStore";

export function CorrectionList({
  items,
  recordingKeyFor,
}: {
  items: ConversationCorrection[];
  /** Recording key for a user message index; enables "Nghe lại giọng tôi". */
  recordingKeyFor?: (messageIndex: number) => string;
}) {
  return (
    <section className="iv-card" aria-label="Câu đáng sửa">
      <h3 className="iv-card-title">Câu đáng sửa nhất</h3>
      {items.length === 0 && <p className="iv-muted">Không có câu nào cần sửa.</p>}
      {items.map((c, i) => (
        <div key={`${c.messageIndex}-${i}`} className="cv-hint">
          <WordDiff before={c.said} after={c.corrected} />
          {c.note && <p className="iv-muted">{c.note}</p>}
          {recordingKeyFor && hasRecordings(recordingKeyFor(c.messageIndex)) && (
            <div className="cv-actions">
              <PlayMyVoiceButton recordingKey={recordingKeyFor(c.messageIndex)} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

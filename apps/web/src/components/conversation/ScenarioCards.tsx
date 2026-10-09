import { ROLEPLAY_PRESETS, TOPIC_CARDS, type RoleplayPreset, type TopicCard } from "@/lib/conversationScenarios";
import type { ConversationMode } from "@/lib/conversationTypes";

export const CUSTOM_PRESET_ID = "custom";

export interface ScenarioCardsProps {
  mode: ConversationMode;
  selectedId: string | null;
  onPickTopic(card: TopicCard): void;
  onPickPreset(preset: RoleplayPreset): void;
  onPickCustom(): void;
}

export function ScenarioCards({ mode, selectedId, onPickTopic, onPickPreset, onPickCustom }: ScenarioCardsProps) {
  const cls = (id: string) => (selectedId === id ? "cv-pick active" : "cv-pick");
  return (
    <div className="cv-picks">
      {mode === "topic" &&
        TOPIC_CARDS.map((c) => (
          <button key={c.id} type="button" className={cls(c.id)} aria-pressed={selectedId === c.id} onClick={() => onPickTopic(c)}>
            <strong>{c.title}</strong>
            <span className="iv-muted">{c.sub}</span>
          </button>
        ))}
      {mode === "roleplay" && (
        <>
          {ROLEPLAY_PRESETS.map((p) => (
            <button key={p.id} type="button" className={cls(p.id)} aria-pressed={selectedId === p.id} onClick={() => onPickPreset(p)}>
              <strong>{p.title}</strong>
              <span className="iv-muted">{p.sub}</span>
            </button>
          ))}
          <button type="button" className={`${cls(CUSTOM_PRESET_ID)} cv-pick-custom`} aria-pressed={selectedId === CUSTOM_PRESET_ID} onClick={onPickCustom}>
            <strong>＋ Tự mô tả tình huống</strong>
            <span className="iv-muted">AI dựng vai và mục tiêu</span>
          </button>
        </>
      )}
    </div>
  );
}

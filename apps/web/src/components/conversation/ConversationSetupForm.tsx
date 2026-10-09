import { CONVERSATION_LEVELS, type ConversationMode, type ConversationSetup } from "@/lib/conversationTypes";
import type { RoleplayPreset, TopicCard } from "@/lib/conversationScenarios";
import { INTERVIEW_VOICES, type InterviewVoice } from "@/lib/interviewTypes";
import { ModeTabs } from "./ModeTabs";
import { CUSTOM_PRESET_ID, ScenarioCards } from "./ScenarioCards";
import { ScenarioPreview } from "./ScenarioPreview";

export interface ConversationDraft {
  mode: ConversationMode;
  /** Topic text, or the role-play scenario title / custom description. */
  topic: string;
  /** Selected card/preset id, CUSTOM_PRESET_ID for a custom role-play, or null. */
  presetId: string | null;
  persona: string;
  goals: string[];
  level: ConversationSetup["level"];
  voice: InterviewVoice;
  speakAloud: boolean;
  reviewTranscript: boolean;
}

export const DEFAULT_CONVERSATION_DRAFT: ConversationDraft = {
  mode: "topic",
  topic: "",
  presetId: null,
  persona: "",
  goals: [],
  level: "B1",
  voice: "female1",
  speakAloud: true,
  reviewTranscript: true,
};

export function isDraftReady(d: ConversationDraft): boolean {
  if (!d.topic.trim()) return false;
  return d.mode === "topic" || (d.persona.trim().length > 0 && d.goals.some((g) => g.trim().length > 0));
}

export function draftToSetup(d: ConversationDraft): ConversationSetup {
  const roleplay = d.mode === "roleplay";
  return {
    mode: d.mode,
    topic: d.topic.trim(),
    level: d.level,
    voice: d.voice,
    speakAloud: d.speakAloud,
    reviewTranscript: d.reviewTranscript,
    persona: roleplay ? d.persona.trim() : null,
    goals: roleplay ? d.goals.map((g) => g.trim()).filter((g) => g.length > 0) : [],
  };
}

export interface ConversationSetupFormProps {
  value: ConversationDraft;
  onChange(next: ConversationDraft): void;
  onPreviewVoice(voice: InterviewVoice): void;
  onBuildScenario(): void;
  building: boolean;
  buildError: string | null;
}

export function ConversationSetupForm(props: ConversationSetupFormProps) {
  const { value, onChange } = props;
  const set = <K extends keyof ConversationDraft>(key: K, v: ConversationDraft[K]) => onChange({ ...value, [key]: v });
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");
  const isCustom = value.mode === "roleplay" && value.presetId === CUSTOM_PRESET_ID;
  const showPreview = value.mode === "roleplay" && (value.persona.length > 0 || value.goals.length > 0);

  const pickTopic = (c: TopicCard) => onChange({ ...value, presetId: c.id, topic: c.topic });
  const pickPreset = (p: RoleplayPreset) =>
    onChange({ ...value, presetId: p.id, topic: p.title, persona: p.persona, goals: [...p.goals] });
  const pickCustom = () => onChange({ ...value, presetId: CUSTOM_PRESET_ID, topic: "", persona: "", goals: [] });

  return (
    <div className="iv-form">
      <ModeTabs
        mode={value.mode}
        onChange={(mode) => onChange({ ...value, mode, presetId: null, topic: "", persona: "", goals: [] })}
      />

      <div className="iv-field">
        <span className="iv-label">{value.mode === "topic" ? "Gợi ý chủ đề" : "Chọn một tình huống"}</span>
        <ScenarioCards
          mode={value.mode}
          selectedId={value.presetId}
          onPickTopic={pickTopic}
          onPickPreset={pickPreset}
          onPickCustom={pickCustom}
        />
      </div>

      {value.mode === "topic" && (
        <div className="iv-field">
          <label htmlFor="cv-topic" className="iv-label">Hoặc tự nhập chủ đề của bạn</label>
          <input
            id="cv-topic"
            className="iv-input"
            type="text"
            placeholder="Ví dụ: chuẩn bị họp với đối tác Nhật…"
            value={value.presetId ? "" : value.topic}
            onChange={(e) => onChange({ ...value, presetId: null, topic: e.target.value })}
          />
        </div>
      )}

      {isCustom && (
        <div className="iv-field">
          <label htmlFor="cv-describe" className="iv-label">Mô tả tình huống bạn muốn luyện</label>
          <textarea
            id="cv-describe"
            className="iv-input"
            rows={3}
            placeholder="Ví dụ: thuê căn hộ và thương lượng tiền cọc với chủ nhà"
            value={value.topic}
            onChange={(e) => set("topic", e.target.value)}
          />
          <div className="iv-row">
            <button type="button" className="btn-secondary" disabled={props.building || !value.topic.trim()} onClick={props.onBuildScenario}>
              Dựng tình huống
            </button>
            {props.building && <span className="iv-muted">Đang dựng…</span>}
          </div>
          {props.buildError && <p className="iv-error" role="alert">{props.buildError}</p>}
        </div>
      )}

      {showPreview && (
        <ScenarioPreview
          persona={value.persona}
          goals={value.goals}
          onPersonaChange={(persona) => set("persona", persona)}
          onGoalChange={(i, g) => set("goals", value.goals.map((x, idx) => (idx === i ? g : x)))}
        />
      )}

      <div className="iv-field">
        <span className="iv-label">Trình độ</span>
        <div className="iv-row">
          {CONVERSATION_LEVELS.map((l) => (
            <button key={l} type="button" className={chip(value.level === l)} aria-pressed={value.level === l} onClick={() => set("level", l)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="iv-field">
        <span className="iv-label">Giọng AI</span>
        <div className="iv-voice-grid">
          {INTERVIEW_VOICES.map((v) => (
            <div key={v.id} className={value.voice === v.id ? "iv-voice active" : "iv-voice"}>
              <button type="button" className="iv-voice-pick" aria-pressed={value.voice === v.id} onClick={() => set("voice", v.id)}>
                <strong>{v.label}</strong>
                <span className="iv-muted">{v.sub}</span>
              </button>
              <button type="button" className="iv-icon-btn" aria-label="Nghe thử giọng" onClick={() => props.onPreviewVoice(v.id)}>▶</button>
            </div>
          ))}
        </div>
      </div>

      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.speakAloud} onChange={(e) => set("speakAloud", e.target.checked)} />
        AI đọc to câu trả lời
      </label>
      <label className="iv-row iv-checkbox">
        <input type="checkbox" checked={value.reviewTranscript} onChange={(e) => set("reviewTranscript", e.target.checked)} />
        Xem lại bản chép lời trước khi gửi
      </label>
    </div>
  );
}

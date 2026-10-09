import type { ConversationMode } from "@/lib/conversationTypes";

const TABS: { id: ConversationMode; label: string }[] = [
  { id: "topic", label: "Chủ đề tự do" },
  { id: "roleplay", label: "Tình huống nhập vai" },
];

export function ModeTabs({ mode, onChange }: { mode: ConversationMode; onChange(mode: ConversationMode): void }) {
  return (
    <div className="cv-tabs" role="group" aria-label="Chế độ">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={mode === t.id ? "cv-tab active" : "cv-tab"} aria-pressed={mode === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

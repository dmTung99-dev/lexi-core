import type { LevelMode } from "@/lib/levelChoice";

export interface LevelPickerProps<T extends string> {
  scale: readonly T[];
  level: T;
  mode: LevelMode;
  onChange(next: { level: T; mode: LevelMode }): void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function LevelPicker<T extends string>({ scale, level, mode, onChange, disabled, ariaLabel }: LevelPickerProps<T>) {
  const chip = (active: boolean) => (active ? "vb-chip active" : "vb-chip");
  return (
    <div className="iv-row" role="group" aria-label={ariaLabel ?? "Trình độ"}>
      <button type="button" className={chip(mode === "all")} aria-pressed={mode === "all"} disabled={disabled} onClick={() => onChange({ level, mode: "all" })}>
        Tất cả
      </button>
      {scale.map((l) => {
        const active = mode === "max" && level === l;
        return (
          <button key={l} type="button" className={chip(active)} aria-pressed={active} disabled={disabled} onClick={() => onChange({ level: l, mode: "max" })}>
            {`Tối đa ${l.toUpperCase()}`}
          </button>
        );
      })}
    </div>
  );
}
